/**
 * Least-privilege database roles (ADR-029). Run once per database server, as
 * the server's admin (superuser) — locally the Docker bootstrap user.
 *
 *   npx tsx scripts/db-setup-roles.ts            # configure + write the env files
 *   npx tsx scripts/db-setup-roles.ts --rotate   # also issue new passwords
 *
 * Creates three login roles with random passwords (never printed):
 *   orbit_owner   — owns every table; used ONLY to run migrations
 *   orbit_runtime — the app (staff side + background work): rows only, no DDL,
 *                   no TRUNCATE, no deleting financial history (see migration)
 *   orbit_portal  — customer requests: Row-Level Security limits it to the
 *                   signed-in customer's own rows
 * and makes orbit_owner the owner of every object in each database.
 *
 * Env files written (git-ignored):
 *   .env       DATABASE_ADMIN_URL (kept from the old DATABASE_URL), DATABASE_URL
 *              (runtime), MIGRATION_DATABASE_URL (owner), PORTAL_DATABASE_URL (portal)
 *   .env.test  the same for the integration-test DB, plus E2E_DATABASE_URL,
 *              E2E_MIGRATION_DATABASE_URL, E2E_PORTAL_DATABASE_URL for the E2E DB
 */
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

const ROLES = ["orbit_owner", "orbit_runtime", "orbit_portal"] as const;
type Role = (typeof ROLES)[number];
const KEY: Record<Role, string> = { orbit_owner: "MIGRATION_DATABASE_URL", orbit_runtime: "DATABASE_URL", orbit_portal: "PORTAL_DATABASE_URL" };

function readEnv(path: string): Map<string, string> {
  const m = new Map<string, string>();
  if (!existsSync(path)) return m;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const r = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (r) m.set(r[1]!, r[2]!.replace(/^["']|["']$/g, ""));
  }
  return m;
}

/** Set or replace KEY="value" lines, keeping everything else (and comments) intact. */
function writeEnv(path: string, values: Record<string, string>) {
  let text = existsSync(path) ? readFileSync(path, "utf8") : "";
  for (const [k, v] of Object.entries(values)) {
    const line = `${k}="${v}"`;
    const re = new RegExp(`^${k}=.*$`, "m");
    text = re.test(text) ? text.replace(re, line) : text.replace(/\s*$/, "\n") + line + "\n";
  }
  writeFileSync(path, text);
}

function withCreds(base: string, user: string, password: string, db?: string): string {
  const u = new URL(base);
  u.username = user;
  u.password = encodeURIComponent(password);
  if (db) u.pathname = `/${db}`;
  return u.toString();
}

const dbName = (url: string) => new URL(url).pathname.replace(/^\//, "");
const pwOf = (url: string | undefined) => (url ? decodeURIComponent(new URL(url).password) : undefined);
const userOf = (url: string | undefined) => (url ? new URL(url).username : undefined);

async function main() {
  const rotate = process.argv.includes("--rotate");
  const env = readEnv(".env");
  const envTest = readEnv(".env.test");

  // Admin connection: explicit DATABASE_ADMIN_URL, or the current DATABASE_URL
  // if it still points at the admin (first run).
  const adminUrl = env.get("DATABASE_ADMIN_URL") ?? env.get("DATABASE_URL");
  if (!adminUrl) throw new Error("No DATABASE_ADMIN_URL / DATABASE_URL in .env");
  if (ROLES.includes(userOf(adminUrl) as Role)) throw new Error("DATABASE_ADMIN_URL must be the server admin, not an orbit_* role");

  const admin = new PrismaClient({ datasources: { db: { url: adminUrl } } });
  const me = await admin.$queryRaw<{ rolsuper: boolean }[]>`SELECT rolsuper FROM pg_roles WHERE rolname = current_user`;
  if (!me[0]?.rolsuper) throw new Error("The admin connection must be a superuser");

  // Passwords: reuse what the env files already hold, unless rotating.
  const known: Partial<Record<Role, string>> = {};
  for (const r of ROLES) {
    const fromEnv = pwOf(userOf(env.get(KEY[r])) === r ? env.get(KEY[r]) : undefined);
    known[r] = !rotate && fromEnv ? fromEnv : randomBytes(24).toString("base64url");
  }

  for (const r of ROLES) {
    const exists = (await admin.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM pg_roles WHERE rolname = ${r}`)[0]!.n > 0;
    const attrs = r === "orbit_owner" ? "LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS INHERIT" : "LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOINHERIT";
    // Identifiers are fixed constants; the password is passed as a literal via format().
    await admin.$executeRawUnsafe(
      `DO $$ BEGIN EXECUTE format('${exists ? "ALTER" : "CREATE"} ROLE ${r} ${attrs} PASSWORD %L', '${known[r]!.replace(/'/g, "''")}'); END $$`,
    );
  }

  // The owner may switch triggers off for its own session (session_replication_role):
  // integration tests use it to empty tables between tests. It grants nothing new —
  // the owner can already ALTER/DROP its triggers — and the app never connects as owner.
  await admin.$executeRawUnsafe(`GRANT SET ON PARAMETER session_replication_role TO orbit_owner`);

  // Databases to configure: dev, integration tests, E2E (those that are configured).
  const dbs = [
    { file: ".env", url: adminUrl, prefix: "" },
    ...(envTest.get("DATABASE_URL") ? [{ file: ".env.test", url: envTest.get("DATABASE_URL")!, prefix: "" }] : []),
    ...(envTest.get("E2E_DATABASE_URL") ? [{ file: ".env.test", url: envTest.get("E2E_DATABASE_URL")!, prefix: "E2E_" }] : []),
  ];

  for (const d of dbs) {
    const name = dbName(d.url);
    const db = new PrismaClient({ datasources: { db: { url: withCreds(adminUrl, userOf(adminUrl)!, pwOf(adminUrl)!, name) } } });
    await db.$executeRawUnsafe(`GRANT CONNECT ON DATABASE "${name.replace(/"/g, "")}" TO orbit_owner, orbit_runtime, orbit_portal`);
    await db.$executeRawUnsafe(`GRANT USAGE, CREATE ON SCHEMA public TO orbit_owner`);
    // orbit_owner owns every object, so migrations (run as owner) can change them.
    await db.$executeRawUnsafe(`
      DO $$ DECLARE r record; BEGIN
        FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
          EXECUTE format('ALTER TABLE public.%I OWNER TO orbit_owner', r.tablename); END LOOP;
        FOR r IN SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema = 'public' LOOP
          EXECUTE format('ALTER SEQUENCE public.%I OWNER TO orbit_owner', r.sequence_name); END LOOP;
        FOR r IN SELECT t.typname FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE n.nspname = 'public' AND t.typtype = 'e' LOOP
          EXECUTE format('ALTER TYPE public.%I OWNER TO orbit_owner', r.typname); END LOOP;
        FOR r IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'public' LOOP
          EXECUTE format('ALTER FUNCTION %s OWNER TO orbit_owner', r.sig); END LOOP;
      END $$`);
    await db.$executeRawUnsafe(
      `ALTER DEFAULT PRIVILEGES FOR ROLE orbit_owner IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO orbit_runtime`,
    );
    await db.$disconnect();

    const urls: Record<string, string> = {};
    for (const r of ROLES) urls[`${d.prefix}${KEY[r]}`] = withCreds(d.url, r, known[r]!, name);
    if (d.file === ".env" && !env.get("DATABASE_ADMIN_URL")) urls.DATABASE_ADMIN_URL = adminUrl;
    writeEnv(d.file, urls);
    console.log(`configured ${name} → ${d.file} (${Object.keys(urls).join(", ")})`);
  }
  await admin.$disconnect();
  console.log("Roles ready: orbit_owner (migrations), orbit_runtime (app), orbit_portal (customers). Passwords are in the env files only.");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
