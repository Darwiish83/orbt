/**
 * Runs once at server startup (Next.js instrumentation). Validates the
 * environment and, in production, the database roles. In production a failed
 * check stops the process with exit code 1 (src/lib/startup.ts) instead of
 * leaving it running and answering every request with an error. Only runs in
 * the Node.js runtime.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { runStartupChecks } = await import("@/lib/startup");
  await runStartupChecks(process.env.NODE_ENV, {
    validateEnv: () => import("@/lib/env"),
    // Refuse to start on an over-privileged database role (ADR-029).
    checkDatabaseRoles: async () => {
      const { prisma, portalDb } = await import("@/db/client");
      const { assertLeastPrivilege } = await import("@/db/roleCheck");
      await assertLeastPrivilege(prisma, "DATABASE_URL");
      await assertLeastPrivilege(portalDb(), "PORTAL_DATABASE_URL");
    },
  });
}
