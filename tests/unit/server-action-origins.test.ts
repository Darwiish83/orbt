// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { serverActionAllowedOrigins } from "@/lib/serverActionOrigins.mjs";

/** Security finding M2: production Server Actions accept the app's own origin only. */
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

const configFor = async (nodeEnv: string) => {
  vi.resetModules();
  vi.stubEnv("NODE_ENV", nodeEnv);
  // @ts-expect-error -- next.config.mjs is plain JavaScript without type declarations
  const mod = await import("../../next.config.mjs");
  return mod.default as { experimental: { serverActions: { allowedOrigins: string[]; bodySizeLimit: string } } };
};

describe("Server Action allowed origins", () => {
  it("production allows no extra origin (same-origin only)", () => {
    expect(serverActionAllowedOrigins("production")).toEqual([]);
  });

  it("development keeps the local dev server and Cloudflare quick tunnels", () => {
    expect(serverActionAllowedOrigins("development")).toEqual(["localhost:3100", "*.trycloudflare.com"]);
    expect(serverActionAllowedOrigins("test")).toContain("*.trycloudflare.com");
  });

  it("next.config.mjs built for production carries no trycloudflare or other extra origin", async () => {
    const cfg = await configFor("production");
    expect(cfg.experimental.serverActions.allowedOrigins).toEqual([]);
    expect(JSON.stringify(cfg)).not.toContain("trycloudflare");
    expect(cfg.experimental.serverActions.bodySizeLimit).toBe("3mb"); // unchanged
  });

  it("next.config.mjs in development still allows the tunnel for sharing a local build", async () => {
    const cfg = await configFor("development");
    expect(cfg.experimental.serverActions.allowedOrigins).toContain("*.trycloudflare.com");
  });
});
