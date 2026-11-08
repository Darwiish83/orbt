// @vitest-environment node
import { describe, expect, it } from "vitest";
import { clientIp, trustedProxyHops } from "@/modules/auth/loginGuard";

const h = (init: Record<string, string>) => new Headers(init);

describe("clientIp: only our trusted proxy's address counts", () => {
  it("with no trusted proxy (default), ignores every client-supplied header", () => {
    expect(clientIp(h({ "x-forwarded-for": "203.0.113.9" }), 0)).toBeNull();
    expect(clientIp(h({ "x-real-ip": "198.51.100.4" }), 0)).toBeNull();
    expect(clientIp(h({}), 0)).toBeNull();
    expect(clientIp(undefined, 1)).toBeNull();
  });

  it("with one proxy, takes the rightmost entry (the one the proxy wrote)", () => {
    expect(clientIp(h({ "x-forwarded-for": "198.51.100.20" }), 1)).toBe("198.51.100.20");
    // A client that sends its own X-Forwarded-For only adds entries on the left.
    expect(clientIp(h({ "x-forwarded-for": "6.6.6.6, 198.51.100.20" }), 1)).toBe("198.51.100.20");
    expect(clientIp(h({ "x-forwarded-for": "1.1.1.1, 2.2.2.2, 3.3.3.3, 198.51.100.20" }), 1)).toBe("198.51.100.20");
    expect(clientIp(h({ "x-forwarded-for": "2001:db8::1" }), 1)).toBe("2001:db8::1");
  });

  it("with two proxies, takes the second entry from the right", () => {
    expect(clientIp(h({ "x-forwarded-for": "6.6.6.6, 198.51.100.20, 10.0.0.2" }), 2)).toBe("198.51.100.20");
    expect(clientIp(h({ "x-forwarded-for": "10.0.0.2" }), 2)).toBeNull(); // fewer entries than proxies
  });

  it("never trusts X-Real-IP, and rejects anything that isn't an IP address", () => {
    expect(clientIp(h({ "x-real-ip": "198.51.100.4" }), 1)).toBeNull();
    for (const bad of ["not-an-ip", "198.51.100.20; drop table", "999.1.1.1", "", " , "]) {
      expect(clientIp(h({ "x-forwarded-for": bad }), 1)).toBeNull();
    }
  });

  it("reads TRUSTED_PROXY_HOPS strictly (anything odd means no trusted proxy)", () => {
    expect(trustedProxyHops(undefined)).toBe(0);
    expect(trustedProxyHops("1")).toBe(1);
    expect(trustedProxyHops("2")).toBe(2);
    for (const bad of ["-1", "1.5", "abc", "99"]) expect(trustedProxyHops(bad)).toBe(0);
  });
});
