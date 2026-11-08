// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Regression for W3: a failed code email must never put the code in a log, in
 * any environment. The real sendOtpEmail() and sendEmail() run; only the Resend
 * client is replaced, so nothing leaves the machine.
 */
const provider = vi.hoisted(() => ({
  mode: "error" as "error" | "throw" | "ok",
  sent: [] as { html: string; text?: string }[],
}));
vi.mock("resend", () => ({
  Resend: class {
    emails = {
      send: async (m: { html: string; text?: string }) => {
        provider.sent.push(m);
        if (provider.mode === "throw") throw new Error("network down");
        if (provider.mode === "error") return { data: null, error: { name: "validation_error", message: "The provider refused this address" } };
        return { data: { id: "test-id" }, error: null };
      },
    };
  },
}));

const CODE = "482913";
const KEY = "re_TestOnlyNotARealKey_1234567890";
let output: string[] = [];

async function sendWith(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v as string);
  const { sendOtpEmail } = await import("@/lib/otpEmail");
  return sendOtpEmail("someone@example.test", CODE, "CUSTOMER_ACCESS");
}
const logged = () => output.join("\n");

beforeEach(() => {
  output = [];
  provider.sent = [];
  for (const level of ["log", "info", "warn", "error", "debug"] as const) {
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
      output.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
    });
  }
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("a failed code email never logs the code", () => {
  for (const nodeEnv of ["development", "test", "production"]) {
    for (const mode of ["error", "throw"] as const) {
      it(`${nodeEnv}: provider ${mode === "error" ? "refuses" : "throws"}`, async () => {
        provider.mode = mode;
        await sendWith({ NODE_ENV: nodeEnv, RESEND_API_KEY: KEY, EMAIL_FROM: "OrbitCargo <noreply@mail.orbitcargo.org>" });
        expect(provider.sent).toHaveLength(1); // it really tried to send
        expect(logged()).not.toBe(""); // and the failure was logged...
        expect(logged()).not.toContain(CODE); // ...without the code
        expect(logged()).not.toContain(KEY);
        expect(logged()).not.toContain("devCode");
      });
    }
  }

  it("development without any provider: nothing sent, code not logged", async () => {
    await sendWith({ NODE_ENV: "development", RESEND_API_KEY: "", EMAIL_FROM: "" });
    expect(provider.sent).toHaveLength(0);
    expect(logged()).not.toContain(CODE);
  });

  it("production without a provider or sender: refuses loudly, still no code in logs", async () => {
    await expect(sendWith({ NODE_ENV: "production", RESEND_API_KEY: "", EMAIL_FROM: "OrbitCargo <noreply@mail.orbitcargo.org>" })).rejects.toThrow(/not configured/);
    await expect(sendWith({ NODE_ENV: "production", RESEND_API_KEY: KEY, EMAIL_FROM: "" })).rejects.toThrow(/not configured/);
    expect(provider.sent).toHaveLength(0); // no fallback sender in production
    expect(logged()).not.toContain(CODE);
  });

  it("a successful send carries the code in the email itself only", async () => {
    provider.mode = "ok";
    await sendWith({ NODE_ENV: "production", RESEND_API_KEY: KEY, EMAIL_FROM: "OrbitCargo <noreply@mail.orbitcargo.org>" });
    expect(provider.sent[0]!.html).toContain(CODE);
    expect(logged()).not.toContain(CODE);
  });
});

describe("logger redaction", () => {
  it("redacts code-like keys at any depth", async () => {
    const { redact } = await import("@/lib/logger");
    expect(redact({ code: CODE, devCode: CODE, otp: CODE, nested: { otpCode: CODE }, to: "x@y.test" })).toEqual({
      code: "[REDACTED]",
      devCode: "[REDACTED]",
      otp: "[REDACTED]",
      nested: { otpCode: "[REDACTED]" },
      to: "x@y.test",
    });
  });
});
