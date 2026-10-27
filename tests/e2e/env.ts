import { existsSync, readFileSync } from "node:fs";

/**
 * E2E secrets live outside the code: locally in `.env.test` (git-ignored,
 * random per machine), in CI as per-run random values (see ci.yml). Only
 * `E2E_*` keys are read, so the integration-test DATABASE_URL in `.env.test`
 * never leaks into the dev server.
 */
export function loadE2EEnv(): void {
  if (!existsSync(".env.test")) return;
  for (const line of readFileSync(".env.test", "utf8").split(/\r?\n/)) {
    const m = /^(E2E_[A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && process.env[m[1]!] === undefined) process.env[m[1]!] = m[2]!.replace(/^["']|["']$/g, "");
  }
}

/** A required E2E value; fails loudly with a pointer to the docs. */
export function e2eEnv(name: string): string {
  loadE2EEnv();
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set — add it to .env.test (see docs/security/SECRETS_AND_ACCOUNTS.md)`);
  return v;
}
