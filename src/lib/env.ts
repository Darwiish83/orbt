import "server-only";
import { z } from "zod";

/**
 * Server-side environment validation — fail fast on misconfiguration.
 * Production enforces the stricter rules (real AUTH_SECRET, HTTPS APP_URL).
 * Secrets are never exposed to the client (no NEXT_PUBLIC_*).
 */
const serverSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    APP_URL: z.string().url().default("http://localhost:3000"),
    DATABASE_URL: z
      .string()
      .url()
      .refine((u) => u.startsWith("postgres"), { message: "DATABASE_URL must be a PostgreSQL connection string" }),
    AUTH_SECRET: z.string().min(16).optional(),
    DOCUMENTS_DIR: z.string().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.NODE_ENV === "production") {
      if (!val.AUTH_SECRET || val.AUTH_SECRET.length < 32) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["AUTH_SECRET"], message: "AUTH_SECRET (>= 32 chars) is required in production" });
      }
      if (!val.APP_URL.startsWith("https://")) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["APP_URL"], message: "APP_URL must be HTTPS in production" });
      }
    }
  });

export type ServerEnv = z.infer<typeof serverSchema>;

function loadEnv(): ServerEnv {
  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    // Only report which keys failed — never their values.
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment configuration — ${issues}`);
  }
  return parsed.data;
}

export const env: ServerEnv = loadEnv();
