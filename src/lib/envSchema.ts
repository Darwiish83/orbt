import { z } from "zod";
import { ConfigError } from "./configError";

/**
 * Rules for the server environment (validated at boot by src/lib/env.ts).
 * Kept free of "server-only" so the rules can be unit-tested. Production is
 * strict; development and tests only check values that are actually set, so
 * they run without real credentials (tests inject or mock email).
 */

const HOSTNAME = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/** The address inside `Name <addr@domain>` or a bare `addr@domain`; null if neither. */
export function senderAddress(from: string): string | null {
  const trimmed = from.trim();
  const m = /^[^<>]*<([^<>\s]+)>$/.exec(trimmed);
  const addr = (m ? m[1]! : trimmed).toLowerCase();
  return z.string().email().safeParse(addr).success ? addr : null;
}

/** This machine's own names: never a public address. */
function isLoopbackHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  return (
    h === "localhost" ||
    h.endsWith(".localhost") ||
    /^127(\.\d{1,3}){3}$/.test(h) ||
    h === "0.0.0.0" ||
    h === "::" ||
    h === "::1" ||
    /^::ffff:(127\.|7f)/.test(h)
  );
}

/**
 * A public HTTPS URL for production: parsed, https, no credentials, not this
 * machine's own address. Returns the URL, or null with the reason recorded.
 */
function publicHttpsUrl(value: string | undefined, key: string, issue: (path: string, message: string) => void): URL | null {
  if (!value) {
    issue(key, `${key} (the public HTTPS address) is required in production`);
    return null;
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    issue(key, `${key} must be a valid URL`);
    return null;
  }
  if (url.protocol !== "https:") issue(key, `${key} must be HTTPS in production`);
  else if (url.username || url.password) issue(key, `${key} must not contain credentials`);
  else if (isLoopbackHost(url.hostname)) issue(key, `${key} must be the public address, not localhost`);
  else return url;
  return null;
}

const intInRange = (min: number, max: number) =>
  z
    .string()
    .regex(/^\d+$/, "must be a whole number")
    .refine((v) => Number(v) >= min && Number(v) <= max, `must be between ${min} and ${max}`);

export const serverSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    // Development default only: production has no default (checked below).
    APP_URL: z.string().url().optional(),
    // Auth.js's public origin. Behind the reverse proxy it is what sign-in redirects
    // are built from; without it they point at the server's own address.
    AUTH_URL: z.string().url().optional(),
    DATABASE_URL: z
      .string()
      .url()
      .refine((u) => u.startsWith("postgres"), { message: "DATABASE_URL must be a PostgreSQL connection string" }),
    // Customer pages' connection (orbit_portal, Row-Level Security; ADR-029).
    PORTAL_DATABASE_URL: z.string().optional(),
    AUTH_SECRET: z.string().min(16).optional(),
    // Email (Resend). EMAIL_DOMAIN is the domain verified in Resend; EMAIL_FROM must send from it.
    RESEND_API_KEY: z.string().optional(),
    EMAIL_FROM: z.string().optional(),
    EMAIL_DOMAIN: z.string().optional(),
    // Reverse proxies in front of the app whose X-Forwarded-For entry is trusted (0 = none).
    TRUSTED_PROXY_HOPS: intInRange(0, 5).optional(),
    OTP_EMAIL_HOURLY_CAP: intInRange(1, 100_000).optional(),
    OTP_IP_MAX_PER_15MIN: intInRange(1, 10_000).optional(),
  })
  .superRefine((val, ctx) => {
    const issue = (path: string, message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });

    // Whatever the environment: a configured sender must be valid and on the configured domain.
    const domain = val.EMAIL_DOMAIN?.trim().toLowerCase();
    if (domain !== undefined && !HOSTNAME.test(domain)) issue("EMAIL_DOMAIN", "EMAIL_DOMAIN must be a domain name like mail.example.com");
    if (val.EMAIL_FROM !== undefined) {
      const addr = senderAddress(val.EMAIL_FROM);
      if (!addr) issue("EMAIL_FROM", "EMAIL_FROM must be an email address, optionally as Name <address>");
      else if (domain && addr.split("@")[1] !== domain) issue("EMAIL_FROM", "EMAIL_FROM must send from EMAIL_DOMAIN");
    }

    if (val.NODE_ENV === "production") {
      if (!val.AUTH_SECRET || val.AUTH_SECRET.length < 32) {
        issue("AUTH_SECRET", "AUTH_SECRET (>= 32 chars) is required in production");
      }
      if (!val.PORTAL_DATABASE_URL?.startsWith("postgres")) {
        issue("PORTAL_DATABASE_URL", "PORTAL_DATABASE_URL (orbit_portal) is required in production");
      }
      const appUrl = publicHttpsUrl(val.APP_URL, "APP_URL", issue);
      const authUrl = publicHttpsUrl(val.AUTH_URL, "AUTH_URL", issue);
      if (authUrl && authUrl.href !== `${authUrl.origin}/`) {
        // Auth.js would take any path as its API base path and break sign-in.
        issue("AUTH_URL", "AUTH_URL must be the bare origin, e.g. https://example.com (no path, query or fragment)");
      } else if (appUrl && authUrl && appUrl.origin !== authUrl.origin) {
        issue("AUTH_URL", "AUTH_URL must have the same origin as APP_URL");
      }
      if (!val.RESEND_API_KEY || !/^re_[A-Za-z0-9_-]{16,}$/.test(val.RESEND_API_KEY)) {
        issue("RESEND_API_KEY", "RESEND_API_KEY (a Resend key) is required in production");
      }
      if (!domain) issue("EMAIL_DOMAIN", "EMAIL_DOMAIN (the domain verified in Resend) is required in production");
      if (!val.EMAIL_FROM) issue("EMAIL_FROM", "EMAIL_FROM is required in production");
      if (!val.TRUSTED_PROXY_HOPS || Number(val.TRUSTED_PROXY_HOPS) < 1) {
        issue("TRUSTED_PROXY_HOPS", "TRUSTED_PROXY_HOPS (>= 1, the reverse proxies in front of the app) is required in production");
      }
    }
  });

export type ServerEnv = z.infer<typeof serverSchema>;

/** Validate; on failure the message names the keys and rules only, never a value. */
export function parseServerEnv(raw: Record<string, string | undefined>): ServerEnv {
  const parsed = serverSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new ConfigError(`Invalid environment configuration — ${issues}`);
  }
  return parsed.data;
}
