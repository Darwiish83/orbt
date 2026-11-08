#!/usr/bin/env node
/**
 * Restore drill (H4 step 2): restore an encrypted backup into a brand-new
 * scratch database and prove it is complete. Never touches another database.
 *
 *   BACKUP_AGE_IDENTITY_FILE=<path to orbitcargo-backup.key> \
 *   node scripts/backup-restore-drill.mjs <path to .dump.age> [--compare-live]
 *
 * 1. Check the encrypted file against its manifest; decrypt in memory only.
 * 2. Create orbitcargo_drill_<UTC time> (refuses the real databases, any name
 *    not of that form, or one that already exists).
 * 3. Prepare it like scripts/restore-db.sh (CONNECT for the three roles, schema
 *    CREATE for orbit_owner), then pg_restore as orbit_owner with protective
 *    triggers paused for that session, --single-transaction --exit-on-error.
 *    The dump goes in on stdin: no plaintext file anywhere.
 * 4. Verify: table count, scripts/db-fingerprint.sql vs the manifest (row counts,
 *    stored-file hashes, triggers, policies, RLS, grants, ownership), migration
 *    history. With --compare-live also against the source database as it is now:
 *    per-table full-content hashes, sequences, trigger / policy / function
 *    definitions, RLS flags, migration rows.
 * 5. All passed → drop the scratch database and confirm it is gone. Any failure
 *    → keep it for inspection and exit 1.
 *
 * A JSON report (no data, counts and hashes only) goes to BACKUP_DIR when set.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fingerprint, inContainer, loadAge, query, sha256 } from "./lib/backup-common.mjs";

const file = process.argv[2];
const compareLive = process.argv.includes("--compare-live");
// --keep: leave the scratch database in place after a passing drill (only for
// chained tests, e.g. backing up a disposable copy); it is dropped by hand.
const keep = process.argv.includes("--keep");
const CONTAINER = process.env.BACKUP_DOCKER_CONTAINER || "orbitcargo-postgres";
const ADMIN = process.env.BACKUP_DB_USER || "orbit_app";
const BLOCKED = new Set(["orbitcargo", "orbitcargo_test", "orbitcargo_e2e", "postgres", "template0", "template1"]);
const DRILL_NAME = /^orbitcargo_drill_\d{8}_\d{6}$/;

const report = { file: file && basename(file), startedAt: new Date().toISOString(), checks: [], drillDatabase: null, dropped: false };
const check = (name, ok, detail) => {
  report.checks.push({ name, ok, ...(detail === undefined ? {} : { detail }) });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail === undefined ? "" : `  (${detail})`}`);
  return ok;
};
const lines = (db, sql) => query(CONTAINER, ADMIN, db, sql).split(/\r?\n/).filter(Boolean);

// Per-table full-content hash, plus definitions that a restore must reproduce.
const TABLE_HASHES = `
DO $$ DECLARE r record; m text; c bigint; BEGIN
  CREATE TEMP TABLE h(t text, n bigint, m text);
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY 1 LOOP
    EXECUTE format('SELECT count(*), coalesce(md5(string_agg(x::text, E''\\n'' ORDER BY x::text)), ''empty'') FROM public.%I x', r.tablename) INTO c, m;
    INSERT INTO h VALUES (r.tablename, c, m);
  END LOOP; END $$;
SELECT t || '|' || n || '|' || m FROM h ORDER BY t;`;
const DEFINITIONS = {
  sequences: "select sequencename || '|' || coalesce(last_value::text, 'null') from pg_sequences where schemaname = 'public' order by 1",
  triggers: "select c.relname || '|' || t.tgname || '|' || md5(pg_get_triggerdef(t.oid)) || '|' || t.tgenabled::text from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and not t.tgisinternal order by 1",
  policies: "select tablename || '|' || policyname || '|' || md5(coalesce(qual, '') || '#' || coalesce(with_check, '') || '#' || array_to_string(roles, ',') || '#' || cmd) from pg_policies where schemaname = 'public' order by 1",
  functions: "select p.proname || '|' || md5(pg_get_functiondef(p.oid)) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' order by 1",
  rls: "select relname || '|' || relrowsecurity || '|' || relforcerowsecurity from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' order by 1",
  tableGrants: "select table_name || '|' || grantee || '|' || privilege_type from information_schema.role_table_grants where table_schema = 'public' and grantee like 'orbit_%' order by 1",
  owners: "select tablename || '|' || tableowner from pg_tables where schemaname = 'public' order by 1",
  migrations: "select migration_name || '|' || checksum || '|' || (finished_at is not null) || '|' || (rolled_back_at is null) from _prisma_migrations order by 1",
};
const snapshot = (db) => {
  const s = { tables: inContainer(CONTAINER, ["psql", "-U", ADMIN, "-d", db, "-qAt", "-v", "ON_ERROR_STOP=1"], Buffer.from(TABLE_HASHES)).toString("utf8").split(/\r?\n/).filter(Boolean) };
  for (const [k, sql] of Object.entries(DEFINITIONS)) s[k] = lines(db, sql);
  return s;
};
const digest = (arr) => sha256(arr.join("\n")).slice(0, 16);

// The source database as it was before the restore (only with --compare-live).
let liveBefore = null;

async function main() {
  if (!file || !file.endsWith(".dump.age")) throw new Error("usage: node scripts/backup-restore-drill.mjs <file.dump.age> [--compare-live]");
  const identityFile = process.env.BACKUP_AGE_IDENTITY_FILE;
  if (!identityFile) throw new Error("set BACKUP_AGE_IDENTITY_FILE");
  const manifest = JSON.parse(readFileSync(join(dirname(file), basename(file).replace(/\.dump\.age$/, ".manifest.json")), "utf8"));
  const source = manifest.database;

  // 1. Encrypted file → plaintext dump, in memory.
  const cipher = readFileSync(file);
  if (!check("encrypted file matches its manifest", sha256(cipher) === manifest.encrypted.sha256 && cipher.length === manifest.encrypted.bytes)) return;
  const age = await loadAge();
  const dec = new age.Decrypter();
  for (const id of readFileSync(identityFile, "utf8").split(/\r?\n/).filter((l) => /^AGE-SECRET-KEY-/.test(l))) dec.addIdentity(id);
  const plain = Buffer.from(await dec.decrypt(new Uint8Array(cipher.buffer, cipher.byteOffset, cipher.byteLength)));
  try {
    if (!check("decrypted dump matches its manifest (sha256)", sha256(plain) === manifest.dump.sha256, `${plain.length} bytes`)) return;

    if (compareLive) liveBefore = { fp: fingerprint(CONTAINER, ADMIN, source), snap: snapshot(source) };

    // 2. The scratch database. Name rules are checked before anything is created.
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "_").slice(0, 15);
    const drill = `orbitcargo_drill_${stamp}`;
    if (!DRILL_NAME.test(drill) || BLOCKED.has(drill)) throw new Error(`refusing database name ${drill}`);
    if (lines("postgres", `select 1 from pg_database where datname = '${drill}'`).length) throw new Error(`${drill} already exists`);
    inContainer(CONTAINER, ["createdb", "-U", ADMIN, drill]);
    report.drillDatabase = drill;
    console.log(`created scratch database ${drill}`);

    // 3. Prepare like restore-db.sh, then restore as orbit_owner.
    query(CONTAINER, ADMIN, drill, `GRANT CONNECT ON DATABASE "${drill}" TO orbit_owner, orbit_runtime, orbit_portal`);
    query(CONTAINER, ADMIN, drill, "GRANT USAGE, CREATE ON SCHEMA public TO orbit_owner");
    query(CONTAINER, "orbit_owner", drill, "ALTER DEFAULT PRIVILEGES FOR ROLE orbit_owner IN SCHEMA public REVOKE ALL ON TABLES FROM orbit_runtime");
    if (!DRILL_NAME.test(drill) || BLOCKED.has(drill)) throw new Error("refusing to restore outside the scratch database");
    inContainer(
      CONTAINER,
      ["pg_restore", "-U", "orbit_owner", "-d", drill, "--clean", "--if-exists", "--no-owner", "--single-transaction", "--exit-on-error"],
      plain,
      { PGOPTIONS: "-c session_replication_role=replica" },
    );
    check("pg_restore completed (single transaction, exit-on-error)", true);
  } finally {
    plain.fill(0);
  }

  // 4. Verify against the manifest.
  const drill = report.drillDatabase;
  const tables = Number(query(CONTAINER, ADMIN, drill, "select count(*) from pg_tables where schemaname = 'public'"));
  check(`all tables restored`, tables === manifest.checks.publicTables, `${tables}/${manifest.checks.publicTables}`);
  const fp = fingerprint(CONTAINER, ADMIN, drill);
  report.fingerprint = fp;
  for (const want of manifest.fingerprint) {
    const key = want.split("|")[0];
    const got = fp.find((l) => l.startsWith(`${key}|`));
    check(`fingerprint ${key} matches the manifest`, got === want, got);
  }
  const fileCheck = fp.find((l) => l.startsWith("files|")) ?? "";
  check("every stored document/image matches its SHA-256", fileCheck.endsWith("|t"), fileCheck);
  const head = query(CONTAINER, ADMIN, drill, "select max(migration_name) from _prisma_migrations where finished_at is not null");
  check("migration history head matches the manifest", head === manifest.migrationHead, head);

  // 4b. Against the source database as it is now.
  if (liveBefore) {
    const live = liveBefore;
    const restored = snapshot(drill);
    const diffTables = restored.tables.filter((l, i) => l !== live.snap.tables[i]).map((l) => l.split("|")[0]);
    check(`full content: per-table hashes identical to ${source}`, restored.tables.length === live.snap.tables.length && diffTables.length === 0, `${restored.tables.length} tables, digest ${digest(restored.tables)}${diffTables.length ? `; differ: ${diffTables.join(",")}` : ""}`);
    for (const k of Object.keys(DEFINITIONS)) {
      check(`${k} identical to ${source}`, JSON.stringify(restored[k]) === JSON.stringify(live.snap[k]), `${restored[k].length} item(s), digest ${digest(restored[k])}`);
    }
    const liveAfter = { fp: fingerprint(CONTAINER, ADMIN, source), snap: snapshot(source) };
    check(`${source} itself unchanged by the drill`, JSON.stringify(liveAfter) === JSON.stringify(live));
  }
}

main()
  .catch((e) => {
    check("drill ran to completion", false, e instanceof Error ? e.message.slice(0, 300) : String(e));
  })
  .finally(() => {
    const ok = report.checks.length > 0 && report.checks.every((c) => c.ok);
    const drill = report.drillDatabase;
    if (ok && drill && keep) {
      report.kept = true;
      console.log(`KEPT scratch database ${drill} (--keep): drop it when done`);
    } else if (ok && drill && DRILL_NAME.test(drill) && !BLOCKED.has(drill)) {
      inContainer(CONTAINER, ["dropdb", "-U", ADMIN, drill]);
      report.dropped = lines("postgres", `select 1 from pg_database where datname = '${drill}'`).length === 0;
      console.log(`scratch database ${drill} dropped: ${report.dropped}`);
    } else if (drill) {
      console.log(`KEPT scratch database ${drill} for inspection (a check failed)`);
    }
    report.finishedAt = new Date().toISOString();
    report.result = ok && (!drill || report.dropped || report.kept) ? "passed" : "failed";
    if (process.env.BACKUP_DIR && report.drillDatabase) {
      writeFileSync(join(process.env.BACKUP_DIR, `${report.drillDatabase}.drill.json`), JSON.stringify(report, null, 2) + "\n");
    }
    console.log(report.result === "passed" ? "DRILL PASSED" : "DRILL FAILED");
    process.exit(report.result === "passed" ? 0 : 1);
  });
