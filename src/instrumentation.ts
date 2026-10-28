/**
 * Runs once at server startup (Next.js instrumentation). Validates the
 * environment and, in production, the database roles, so the process fails
 * fast on misconfiguration rather than at the first request. Only runs in the
 * Node.js runtime.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("@/lib/env");
    if (process.env.NODE_ENV === "production") {
      // Refuse to start on an over-privileged database role (ADR-029).
      const { prisma, portalDb } = await import("@/db/client");
      const { assertLeastPrivilege } = await import("@/db/roleCheck");
      await assertLeastPrivilege(prisma, "DATABASE_URL");
      await assertLeastPrivilege(portalDb(), "PORTAL_DATABASE_URL");
    }
  }
}
