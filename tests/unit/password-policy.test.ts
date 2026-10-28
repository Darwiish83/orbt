import { describe, expect, it } from "vitest";
import { assertStrongPassword } from "@/modules/auth/passwordPolicy";

describe("password policy (ADR-028)", () => {
  it("accepts a long password with letters and numbers", () => {
    expect(() => assertStrongPassword("Harbour7Lamp2", "Harbour7Lamp2")).not.toThrow();
  });

  it("rejects short, letters-only, numbers-only and over-long passwords", () => {
    expect(() => assertStrongPassword("Abc12345", undefined)).toThrow(/at least 10/i);
    expect(() => assertStrongPassword("onlyletterspassword", undefined)).toThrow(/letters and numbers/i);
    expect(() => assertStrongPassword("12345678901234", undefined)).toThrow(/letters and numbers/i);
    expect(() => assertStrongPassword("a1".repeat(70), undefined)).toThrow(/too long/i);
  });

  it("rejects a mismatched confirmation", () => {
    expect(() => assertStrongPassword("Harbour7Lamp2", "Harbour7Lamp3")).toThrow(/do not match/i);
  });

  it("rejects passwords built from the person's email or ID", () => {
    expect(() => assertStrongPassword("amina2026xyz", undefined, { email: "amina@shop.so" })).toThrow(/email or ID/i);
    expect(() => assertStrongPassword("Emp003Secure", undefined, { id: "EMP-003" })).toThrow(/email or ID/i);
    expect(() => assertStrongPassword("Or3001Strong", undefined, { id: "OR-3001" })).toThrow(/email or ID/i);
  });

  it("rejects well-known passwords even with digits added", () => {
    for (const p of ["Password123", "Qwerty12345", "Somalia2026", "Mogadishu123", "1234567890a", "OrbitCargo26", "Bismillah786"]) {
      expect(() => assertStrongPassword(p, undefined), p).toThrow(/too common/i);
    }
  });
});
