import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The real startup hook (src/instrumentation.ts) in a child process, once per
 * configuration: a production process with an invalid configuration or an
 * over-privileged database role must exit with code 1 (not keep running and
 * answer every request with 500), print no secret, and a valid one must start.
 * Uses the test database (.env.test) only; nothing is written to it.
 */
const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const CHILD = fileURLToPath(new URL("./fixtures/startup-child.ts", import.meta.url));
const SERVER_ONLY = new URL("./fixtures/server-only.mjs", import.meta.url).href;

const runtimeUrl = process.env.DATABASE_URL!;
const portalUrl = process.env.PORTAL_DATABASE_URL!;
const ownerUrl = process.env.MIGRATION_DATABASE_URL!;
for (const u of [runtimeUrl, portalUrl, ownerUrl]) {
  if (new URL(u).pathname !== "/orbitcargo_test") throw new Error("startup.test.ts runs against orbitcargo_test only");
}

const AUTH_SECRET = "StartupTestSecret_" + "x".repeat(40);
const RESEND_API_KEY = "re_StartupTestOnlyNotARealKey_42";
const prod: Record<string, string> = {
  NODE_ENV: "production",
  NEXT_RUNTIME: "nodejs",
  DATABASE_URL: runtimeUrl,
  PORTAL_DATABASE_URL: portalUrl,
  AUTH_SECRET,
  APP_URL: "https://orbitcargo.test",
  AUTH_URL: "https://orbitcargo.test",
  RESEND_API_KEY,
  EMAIL_DOMAIN: "mail.orbitcargo.org",
  EMAIL_FROM: "OrbitCargo <noreply@mail.orbitcargo.org>",
  TRUSTED_PROXY_HOPS: "1",
};
const without = (key: string) => Object.fromEntries(Object.entries(prod).filter(([k]) => k !== key));

/** Every value that must never appear in the output. */
const secrets = [AUTH_SECRET, RESEND_API_KEY, ...[runtimeUrl, portalUrl, ownerUrl].flatMap((u) => [u, decodeURIComponent(new URL(u).password)])];

function start(env: Record<string, string>) {
  const r = spawnSync(process.execPath, ["--import", "tsx", "--import", SERVER_ONLY, CHILD], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 60_000,
    // Only what the case sets: nothing is inherited from this process's (test) environment.
    // (Every case sets NODE_ENV; the project's ProcessEnv type cannot see that through the spread.)
    env: { PATH: process.env.PATH ?? "", SystemRoot: process.env.SystemRoot ?? "", ...env } as unknown as NodeJS.ProcessEnv,
  });
  const output = `${r.stdout}\n${r.stderr}`;
  for (const s of secrets) expect(output, "a secret value was printed").not.toContain(s);
  expect(output).not.toMatch(/postgres(ql)?:\/\//);
  return { code: r.status, output };
}

function expectRefused(env: Record<string, string>, rule: string | RegExp) {
  const { code, output } = start(env);
  expect(code, output).toBe(1);
  expect(output).toContain("[startup] OrbitCargo refused to start");
  expect(output).toMatch(rule);
  expect(output).not.toContain("STARTUP_OK");
  return output;
}

describe("production startup fails fast (exit code 1)", () => {
  it("starts with a valid production configuration", () => {
    const { code, output } = start(prod);
    expect(code, output).toBe(0);
    expect(output).toContain("STARTUP_OK");
    expect(output).not.toContain("[startup]");
  });

  it("refuses a missing AUTH_URL", () => {
    expectRefused(without("AUTH_URL"), /AUTH_URL.*required in production/);
  });

  it("refuses an invalid or plain-HTTP AUTH_URL", () => {
    expectRefused({ ...prod, AUTH_URL: "orbitcargo.test" }, /AUTH_URL/);
    expectRefused({ ...prod, AUTH_URL: "http://orbitcargo.test" }, /AUTH_URL must be HTTPS/);
    expectRefused({ ...prod, AUTH_URL: "https://localhost:3000", APP_URL: "https://localhost:3000" }, /not localhost/);
  });

  it("refuses an AUTH_URL that does not match APP_URL", () => {
    expectRefused({ ...prod, AUTH_URL: "https://www.orbitcargo.test" }, /AUTH_URL must have the same origin as APP_URL/);
  });

  it("refuses a missing EMAIL_DOMAIN or RESEND_API_KEY", () => {
    expectRefused(without("EMAIL_DOMAIN"), /EMAIL_DOMAIN/);
    expectRefused(without("RESEND_API_KEY"), /RESEND_API_KEY/);
  });

  it("refuses an over-privileged database role", () => {
    expectRefused({ ...prod, DATABASE_URL: ownerUrl }, /DATABASE_URL connection owns \d+ tables/);
    expectRefused({ ...prod, PORTAL_DATABASE_URL: ownerUrl }, /PORTAL_DATABASE_URL connection owns \d+ tables/);
  });

  it("also stops on an unexpected startup error, without its connection details", () => {
    const unreachable = new URL(runtimeUrl);
    unreachable.port = "1";
    const output = expectRefused({ ...prod, DATABASE_URL: unreachable.toString() }, /startup checks could not complete/);
    expect(output).not.toContain(unreachable.toString());
  });
});

describe("development and test keep their behaviour", () => {
  const dev = { NEXT_RUNTIME: "nodejs", DATABASE_URL: runtimeUrl };

  it("development and test start without production settings", () => {
    for (const NODE_ENV of ["development", "test"]) {
      const { code, output } = start({ ...dev, NODE_ENV });
      expect(code, output).toBe(0);
      expect(output).toContain("STARTUP_OK");
    }
  });

  it("an invalid development setting is thrown to Next.js, not a process exit", () => {
    const { code, output } = start({ ...dev, NODE_ENV: "development", EMAIL_DOMAIN: "mail.orbitcargo.org", EMAIL_FROM: "a@other.test" });
    expect(code, output).toBe(3);
    expect(output).toContain("STARTUP_THREW ConfigError");
    expect(output).not.toContain("[startup]");
  });
});
