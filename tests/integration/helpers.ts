import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();

/** Truncate every table (except Prisma's migration ledger) between tests. */
export async function resetDb(): Promise<void> {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `;
  if (tables.length === 0) return;
  const list = tables.map((t) => `"${t.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

/** Guard: integration tests must never run against a non-test database. */
export function assertTestDatabase(): void {
  const url = process.env.DATABASE_URL ?? "";
  if (!/orbitcargo_test/.test(url)) {
    throw new Error(`Refusing to run integration tests: DATABASE_URL is not the test DB (${url})`);
  }
}
