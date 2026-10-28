import type { PrismaClient } from "@prisma/client";

/**
 * Production boot guard (ADR-029/030): the app must never run as a database
 * superuser, a role that skips Row-Level Security, or the owner of the tables
 * (who could switch the protective triggers off). A server configured with the
 * admin or migration URL by mistake refuses to start instead of running
 * without the database's own checks. Reports role facts only, never URLs.
 */
export async function assertLeastPrivilege(db: PrismaClient, label: string): Promise<void> {
  const rows = await db.$queryRaw<{ rolsuper: boolean; rolbypassrls: boolean; owned: number }[]>`
    SELECT r.rolsuper, r.rolbypassrls,
           (SELECT count(*) FROM pg_tables WHERE schemaname = 'public' AND tableowner = current_user)::int AS owned
    FROM pg_roles r WHERE r.rolname = current_user`;
  const me = rows[0];
  if (!me) throw new Error(`${label}: could not read the database role`);
  const problems = [
    me.rolsuper && "is a superuser",
    me.rolbypassrls && "bypasses Row-Level Security",
    me.owned > 0 && `owns ${me.owned} tables`,
  ].filter(Boolean);
  if (problems.length) {
    throw new Error(`${label} connection ${problems.join(", ")}: use the least-privilege role (scripts/db-setup-roles.ts)`);
  }
}
