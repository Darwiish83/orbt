// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { ConfigError } from "@/lib/configError";
import { runStartupChecks, startupFailureMessage } from "@/lib/startup";

class Exited extends Error {}
const exitSpy = () =>
  vi.fn((code: number): never => {
    throw new Exited(String(code));
  });

describe("runStartupChecks", () => {
  it("production: a failed check logs one line and exits with code 1", async () => {
    const exit = exitSpy();
    const log = vi.fn();
    const checkDatabaseRoles = vi.fn(async () => {});
    await expect(
      runStartupChecks("production", { validateEnv: () => { throw new ConfigError("AUTH_URL: required"); }, checkDatabaseRoles }, exit, log),
    ).rejects.toBeInstanceOf(Exited);
    expect(exit).toHaveBeenCalledWith(1);
    expect(log).toHaveBeenCalledWith("[startup] OrbitCargo refused to start: AUTH_URL: required");
    expect(checkDatabaseRoles).not.toHaveBeenCalled();
  });

  it("production: a failed role check exits with code 1", async () => {
    const exit = exitSpy();
    await expect(
      runStartupChecks("production", { validateEnv: () => ({}), checkDatabaseRoles: async () => { throw new ConfigError("DATABASE_URL connection is a superuser"); } }, exit, vi.fn()),
    ).rejects.toBeInstanceOf(Exited);
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("production: passing checks neither log nor exit", async () => {
    const exit = exitSpy();
    const log = vi.fn();
    await runStartupChecks("production", { validateEnv: () => ({}), checkDatabaseRoles: async () => {} }, exit, log);
    expect(exit).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });

  it("development and test: the error is thrown as before, no exit, no role check", async () => {
    for (const env of ["development", "test", undefined]) {
      const exit = exitSpy();
      const checkDatabaseRoles = vi.fn(async () => {});
      await expect(
        runStartupChecks(env, { validateEnv: () => { throw new ConfigError("EMAIL_FROM: bad"); }, checkDatabaseRoles }, exit, vi.fn()),
      ).rejects.toBeInstanceOf(ConfigError);
      expect(exit).not.toHaveBeenCalled();
      expect(checkDatabaseRoles).not.toHaveBeenCalled();
    }
  });
});

describe("startupFailureMessage", () => {
  it("shows a configuration error's rule", () => {
    expect(startupFailureMessage(new ConfigError("AUTH_URL must be HTTPS in production"))).toContain("AUTH_URL must be HTTPS in production");
  });

  it("withholds an unexpected error's message, which may hold connection details", () => {
    const err = Object.assign(new Error("Can't reach postgresql://orbit_runtime:hunter2@db.internal:5432/orbitcargo"), {
      name: "PrismaClientInitializationError",
      errorCode: "P1001",
    });
    const line = startupFailureMessage(err);
    expect(line).toContain("PrismaClientInitializationError P1001");
    expect(line).not.toContain("hunter2");
    expect(line).not.toContain("postgresql://");
    expect(line).not.toContain("db.internal");
  });

  it("ignores a code that is not a plain identifier", () => {
    expect(startupFailureMessage({ name: "Error", code: "x y://secret@host" })).not.toContain("secret");
    expect(startupFailureMessage(null)).toContain("(Error)");
  });
});
