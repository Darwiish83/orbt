// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseServerEnv, senderAddress } from "@/lib/envSchema";

const KEY = "re_TestOnlyNotARealKey_1234567890";
const prod = {
  NODE_ENV: "production",
  APP_URL: "https://orbitcargo.org",
  DATABASE_URL: "postgresql://orbit_runtime:x@localhost:5432/orbitcargo",
  PORTAL_DATABASE_URL: "postgresql://orbit_portal:x@localhost:5432/orbitcargo",
  AUTH_SECRET: "a".repeat(40),
  RESEND_API_KEY: KEY,
  EMAIL_DOMAIN: "mail.orbitcargo.org",
  EMAIL_FROM: "OrbitCargo <noreply@mail.orbitcargo.org>",
  TRUSTED_PROXY_HOPS: "1",
};
const without = (k: keyof typeof prod) => {
  const { [k]: _, ...rest } = prod;
  return rest;
};
const failsOn = (raw: Record<string, string | undefined>, key: string) => {
  let message = "";
  try {
    parseServerEnv(raw);
  } catch (e) {
    message = (e as Error).message;
  }
  expect(message).toContain(key);
  return message;
};

describe("production email configuration", () => {
  it("accepts a complete production configuration", () => {
    expect(() => parseServerEnv(prod)).not.toThrow();
    expect(() => parseServerEnv({ ...prod, EMAIL_FROM: "noreply@mail.orbitcargo.org" })).not.toThrow();
  });

  it("requires RESEND_API_KEY, EMAIL_DOMAIN, EMAIL_FROM and a trusted proxy", () => {
    failsOn(without("RESEND_API_KEY"), "RESEND_API_KEY");
    failsOn(without("EMAIL_DOMAIN"), "EMAIL_DOMAIN");
    failsOn(without("EMAIL_FROM"), "EMAIL_FROM");
    failsOn(without("TRUSTED_PROXY_HOPS"), "TRUSTED_PROXY_HOPS");
    failsOn({ ...prod, TRUSTED_PROXY_HOPS: "0" }, "TRUSTED_PROXY_HOPS");
    failsOn({ ...prod, RESEND_API_KEY: "not-a-resend-key" }, "RESEND_API_KEY");
  });

  it("has no fallback sender: the shared Resend sender or any other domain is refused", () => {
    failsOn({ ...prod, EMAIL_FROM: "OrbitCargo <onboarding@resend.dev>" }, "EMAIL_FROM");
    failsOn({ ...prod, EMAIL_FROM: "OrbitCargo <noreply@orbitcargo.org>" }, "EMAIL_FROM"); // parent domain isn't the verified one
    failsOn({ ...prod, EMAIL_FROM: "OrbitCargo <noreply@mail.orbitcargo.org.evil.test>" }, "EMAIL_FROM");
  });

  it("rejects a malformed sender or domain", () => {
    for (const bad of ["OrbitCargo", "OrbitCargo <>", "<noreply@>", "noreply@@mail.orbitcargo.org", "OrbitCargo <a b@mail.orbitcargo.org>"]) {
      failsOn({ ...prod, EMAIL_FROM: bad }, "EMAIL_FROM");
    }
    failsOn({ ...prod, EMAIL_DOMAIN: "not a domain" }, "EMAIL_DOMAIN");
  });

  it("never puts a value in the error message", () => {
    const message = failsOn({ ...prod, EMAIL_FROM: "x@resend.dev", TRUSTED_PROXY_HOPS: "0" }, "EMAIL_FROM");
    expect(message).not.toContain(KEY);
    expect(message).not.toContain("x@resend.dev");
    expect(message).not.toContain(prod.AUTH_SECRET);
  });

  it("keeps development and tests free of real credentials", () => {
    const base = { DATABASE_URL: "postgresql://u:p@localhost:5433/orbitcargo_test" };
    expect(() => parseServerEnv({ ...base, NODE_ENV: "development" })).not.toThrow();
    expect(() => parseServerEnv({ ...base, NODE_ENV: "test" })).not.toThrow();
    // A sender that is configured must still match a configured domain.
    failsOn({ ...base, NODE_ENV: "development", EMAIL_DOMAIN: "mail.orbitcargo.org", EMAIL_FROM: "a@other.test" }, "EMAIL_FROM");
  });

  it("validates the optional limits", () => {
    failsOn({ ...prod, OTP_EMAIL_HOURLY_CAP: "0" }, "OTP_EMAIL_HOURLY_CAP");
    failsOn({ ...prod, OTP_EMAIL_HOURLY_CAP: "lots" }, "OTP_EMAIL_HOURLY_CAP");
    failsOn({ ...prod, OTP_IP_MAX_PER_15MIN: "-3" }, "OTP_IP_MAX_PER_15MIN");
    expect(() => parseServerEnv({ ...prod, OTP_EMAIL_HOURLY_CAP: "200", OTP_IP_MAX_PER_15MIN: "20" })).not.toThrow();
  });
});

describe("senderAddress", () => {
  it("extracts the address from either form", () => {
    expect(senderAddress("OrbitCargo <NoReply@Mail.OrbitCargo.org>")).toBe("noreply@mail.orbitcargo.org");
    expect(senderAddress("noreply@mail.orbitcargo.org")).toBe("noreply@mail.orbitcargo.org");
    expect(senderAddress("OrbitCargo")).toBeNull();
  });
});
