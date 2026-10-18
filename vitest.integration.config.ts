import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/** Minimal .env.test loader (no dotenv dependency). */
function loadEnv(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  let raw = "";
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    throw new Error(`${path} not found — integration tests need a test database (see docs/DATABASE.md)`);
  }
  for (const line of raw.split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    const key = m?.[1];
    const value = m?.[2];
    if (key !== undefined && value !== undefined) {
      out[key] = value.replace(/^["']|["']$/g, "");
    }
  }
  return out;
}

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    env: loadEnv(".env.test"),
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Single fork: integration tests share one DB and truncate between tests.
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
  },
});
