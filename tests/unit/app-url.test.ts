import { describe, expect, it } from "vitest";
import { passwordResetUrl, trustedAppOrigin } from "@/lib/appUrl";

describe("trusted app origin (security finding H1)", () => {
  it("is APP_URL's origin, without any path, query or trailing slash", () => {
    expect(trustedAppOrigin("https://orbit.example.so/some/path?x=1", "production")).toBe("https://orbit.example.so");
    expect(trustedAppOrigin("  https://orbit.example.so/  ", "production")).toBe("https://orbit.example.so");
  });

  it("production refuses a missing, invalid, non-HTTPS or credentialed APP_URL", () => {
    expect(() => trustedAppOrigin(undefined, "production")).toThrow(/not configured/);
    expect(() => trustedAppOrigin("", "production")).toThrow(/not configured/);
    expect(() => trustedAppOrigin("orbit.example.so", "production")).toThrow(/not a valid URL/);
    expect(() => trustedAppOrigin("http://orbit.example.so", "production")).toThrow(/HTTPS/);
    expect(() => trustedAppOrigin("javascript:alert(1)", "production")).toThrow(/HTTPS/);
    expect(() => trustedAppOrigin("https://user:pw@orbit.example.so", "production")).toThrow(/credentials/);
  });

  it("development allows http and falls back to the env.ts default", () => {
    expect(trustedAppOrigin("http://localhost:3500", "development")).toBe("http://localhost:3500");
    expect(trustedAppOrigin(undefined, "development")).toBe("http://localhost:3000");
    expect(() => trustedAppOrigin("ftp://orbit.example.so", "development")).toThrow();
  });

  it("builds the reset link on that origin and encodes the token", () => {
    expect(passwordResetUrl("a+b/c=", "https://orbit.example.so", "production")).toBe("https://orbit.example.so/reset-password?token=a%2Bb%2Fc%3D");
  });
});
