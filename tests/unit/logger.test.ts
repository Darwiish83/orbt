import { describe, expect, it } from "vitest";
import { redact } from "@/lib/logger";

describe("logger redaction", () => {
  it("redacts sensitive keys at any depth", () => {
    const input = {
      email: "a@orbit.so",
      password: "hunter2",
      passwordHash: "$argon2id$abc",
      nested: { token: "secret-token", keep: "ok", apiKey: "xyz" },
      list: [{ secret: "s" }, { fine: 1 }],
    };
    const out = redact(input) as Record<string, unknown>;
    expect(out.email).toBe("a@orbit.so");
    expect(out.password).toBe("[REDACTED]");
    expect(out.passwordHash).toBe("[REDACTED]");
    expect((out.nested as Record<string, unknown>).token).toBe("[REDACTED]");
    expect((out.nested as Record<string, unknown>).keep).toBe("ok");
    expect((out.nested as Record<string, unknown>).apiKey).toBe("[REDACTED]");
    expect((out.list as Record<string, unknown>[])[0]!.secret).toBe("[REDACTED]");
    expect((out.list as Record<string, unknown>[])[1]!.fine).toBe(1);
  });

  it("passes through primitives untouched", () => {
    expect(redact("plain")).toBe("plain");
    expect(redact(42)).toBe(42);
    expect(redact(null)).toBe(null);
  });
});
