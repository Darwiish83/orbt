import "server-only";
import { z } from "zod";

/**
 * Server-side environment validation. The app should fail fast on misconfig.
 * Phase 1 validates only what exists now; DB/Auth/Storage vars are added
 * (and made required) in their phases. Secrets are never exposed to the client.
 */
const serverSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  DATABASE_URL: z.string().url().refine((u) => u.startsWith("postgres"), {
    message: "DATABASE_URL must be a PostgreSQL connection string",
  }),
});

export type ServerEnv = z.infer<typeof serverSchema>;

function loadEnv(): ServerEnv {
  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    // Do not print values — only which keys failed.
    const issues = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Invalid environment configuration. Check: ${issues}`);
  }
  return parsed.data;
}

export const env: ServerEnv = loadEnv();
