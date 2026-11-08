// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseServerEnv, senderAddress } from "@/lib/envSchema";

const KEY = "re_TestOnlyNotARealKey_1234567890";
const prod = {
  NODE_ENV: "production",
  APP_URL: "https://orbitcargo.org",
  AUTH_URL: "https://orbitcargo.org",
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

describe("production public URLs (APP_URL, AUTH_URL)", () => {
  it("accepts matching public HTTPS origins", () => {
    expect(() => parseServerEnv({ ...prod, AUTH_URL: "https://orbitcargo.org/" })).not.toThrow();
    expect(() => parseServerEnv({ ...prod, APP_URL: "https://orbitcargo.org:8443", AUTH_URL: "https://orbitcargo.org:8443" })).not.toThrow();
  });

  it("requires AUTH_URL and APP_URL: no fallback to localhost", () => {
    failsOn(without("AUTH_URL"), "AUTH_URL");
    failsOn(without("APP_URL"), "APP_URL");
    failsOn({ ...prod, AUTH_URL: "" }, "AUTH_URL");
  });

  it("refuses an invalid or non-HTTPS URL", () => {
    for (const bad of ["orbitcargo.org", "not a url", "http://orbitcargo.org", "ftp://orbitcargo.org"]) {
      failsOn({ ...prod, AUTH_URL: bad }, "AUTH_URL");
      failsOn({ ...prod, APP_URL: bad }, "APP_URL");
    }
  });

  it("refuses this machine's own address", () => {
    for (const local of [
      "https://localhost",
      "https://localhost:3000",
      "https://LOCALHOST.",
      "https://app.localhost",
      "https://127.0.0.1",
      "https://127.1.2.3:3000",
      "https://[::1]:3000",
      "https://0.0.0.0",
      "https://[::ffff:127.0.0.1]",
    ]) {
      failsOn({ ...prod, APP_URL: local, AUTH_URL: local }, "localhost");
    }
  });

  it("refuses an AUTH_URL whose origin differs from APP_URL", () => {
    for (const other of ["https://www.orbitcargo.org", "https://orbitcargo.org:8443", "https://orbitcargo.org.evil.test", "https://evil.test"]) {
      failsOn({ ...prod, AUTH_URL: other }, "AUTH_URL must have the same origin as APP_URL");
    }
  });

  it("refuses a path, query, fragment or credentials in AUTH_URL", () => {
    for (const bad of ["https://orbitcargo.org/login", "https://orbitcargo.org/?x=1", "https://orbitcargo.org/#a"]) {
      failsOn({ ...prod, AUTH_URL: bad }, "bare origin");
    }
    failsOn({ ...prod, AUTH_URL: "https://user:pw@orbitcargo.org" }, "credentials");
    failsOn({ ...prod, APP_URL: "https://user:pw@orbitcargo.org" }, "credentials");
  });

  it("names the rule, never the value", () => {
    const message = failsOn({ ...prod, AUTH_URL: "https://user:SecretPw123@orbitcargo.org" }, "AUTH_URL");
    expect(message).not.toContain("SecretPw123");
  });

  it("leaves development and tests unchanged", () => {
    const base = { DATABASE_URL: "postgresql://u:p@localhost:5433/orbitcargo_test" };
    for (const NODE_ENV of ["development", "test"]) {
      expect(() => parseServerEnv({ ...base, NODE_ENV })).not.toThrow();
      expect(() => parseServerEnv({ ...base, NODE_ENV, APP_URL: "http://localhost:3000", AUTH_URL: "http://localhost:3000" })).not.toThrow();
    }
  });
});

describe("senderAddress", () => {
  it("extracts the address from either form", () => {
    expect(senderAddress("OrbitCargo <NoReply@Mail.OrbitCargo.org>")).toBe("noreply@mail.orbitcargo.org");
    expect(senderAddress("noreply@mail.orbitcargo.org")).toBe("noreply@mail.orbitcargo.org");
    expect(senderAddress("OrbitCargo")).toBeNull();
  });
});
