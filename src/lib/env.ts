import "server-only";
import { parseServerEnv, type ServerEnv } from "./envSchema";

/**
 * Server-side environment validation — fail fast on misconfiguration.
 * The rules live in ./envSchema.ts; production enforces the strict ones (real
 * AUTH_SECRET, HTTPS APP_URL, Resend key + verified sender, trusted proxy).
 * Secrets are never exposed to the client (no NEXT_PUBLIC_*).
 */
export type { ServerEnv };

export const env: ServerEnv = parseServerEnv(process.env);
