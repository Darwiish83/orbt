import { z } from "zod";

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

const intInRange = (min: number, max: number) =>
  z
    .string()
    .regex(/^\d+$/, "must be a whole number")
    .refine((v) => Number(v) >= min && Number(v) <= max, `must be between ${min} and ${max}`);

export const serverSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    APP_URL: z.string().url().default("http://localhost:3000"),
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
      if (!val.APP_URL.startsWith("https://")) {
        issue("APP_URL", "APP_URL must be HTTPS in production");
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
    throw new Error(`Invalid environment configuration — ${issues}`);
  }
  return parsed.data;
}
