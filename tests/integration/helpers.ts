import { PrismaClient } from "@prisma/client";
import { seedReferenceData } from "@/modules/reference/data";

export const prisma = new PrismaClient();

let deleteSql: string | null = null;

/** DELETE statements for every table (except Prisma's migration ledger),
 * children before parents. DELETE is used instead of TRUNCATE: TRUNCATE
 * creates and fsyncs new data files for every table, which takes close to a
 * minute per reset on some Windows machines; the tables here are tiny. */
async function buildDeleteSql(): Promise<string> {
  const tables = (
    await prisma.$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`
  ).map((t) => t.tablename);
  const fks = await prisma.$queryRaw<{ child: string; parent: string }[]>`
    SELECT conrelid::regclass::text AS child, confrelid::regclass::text AS parent
    FROM pg_constraint WHERE contype = 'f' AND conrelid <> confrelid`;
  const strip = (s: string) => s.replace(/^public\./, "").replace(/"/g, "");
  const children = new Map<string, Set<string>>(tables.map((t) => [t, new Set()]));
  for (const fk of fks) children.get(strip(fk.parent))?.add(strip(fk.child));
  const order: string[] = [];
  const seen = new Set<string>();
  const visit = (t: string) => {
    if (seen.has(t)) return;
    seen.add(t);
    for (const c of children.get(t) ?? []) visit(c);
    order.push(t); // after all of its children
  };
  for (const t of tables) visit(t);
  return order.map((t) => `DELETE FROM "${t}";`).join("\n");
}

/** Empty every table between tests, then restore the reference rows (banks,
 * countries, business year) the services require. */
export async function resetDb(): Promise<void> {
  deleteSql ??= await buildDeleteSql();
  if (deleteSql) {
    await prisma.$transaction(deleteSql.split("\n").map((sql) => prisma.$executeRawUnsafe(sql)));
  }
  await seedReferenceData(prisma);
}

/** Guard: integration tests must never run against a non-test database. */
export function assertTestDatabase(): void {
  const url = process.env.DATABASE_URL ?? "";
  if (!/orbitcargo_test/.test(url)) {
    throw new Error(`Refusing to run integration tests: DATABASE_URL is not the test DB (${url})`);
  }
}
