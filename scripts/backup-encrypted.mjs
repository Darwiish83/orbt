#!/usr/bin/env node
/**
 * Encrypted backup of one OrbitCargo database (H4).
 *
 * Windows dev PC (Docker):
 *   BACKUP_DIR=C:/OrbitCargo-Backups BACKUP_AGE_RECIPIENTS_FILE=<orbitcargo-backup.pub> \
 *   node scripts/backup-encrypted.mjs
 * Ubuntu VPS (native PostgreSQL, peer authentication as the postgres OS user):
 *   sudo -u postgres env BACKUP_PG_MODE=host BACKUP_DIR=/var/backups/orbitcargo \
 *     BACKUP_AGE_RECIPIENTS_FILE=/etc/orbitcargo/backup.pub node scripts/backup-encrypted.mjs
 *
 * Settings (environment; none of them is secret):
 *   BACKUP_DIR                  where <db>-<UTC time>.dump.age + .manifest.json go
 *                               (refused inside OneDrive or inside the project)
 *   BACKUP_AGE_RECIPIENTS(_FILE) age public keys (age1...); never a private key —
 *                               the server never holds anything that can decrypt
 *   BACKUP_PG_MODE              docker (default) or host
 *   BACKUP_DATABASE             default orbitcargo
 *   BACKUP_DOCKER_CONTAINER     Docker mode: default orbitcargo-postgres
 *   BACKUP_DB_USER              default orbit_app (Docker) / postgres (host); connects
 *                               over the local socket, so no password is needed
 *   BACKUP_AGE_JS               age-encryption module, if not installed in the project
 *
 * Steps: lock → pg_dump streamed straight into age encryption and into the
 * .partial file (plaintext is never written to disk, nor held whole in memory;
 * on the way it is hashed and its table of contents read by pg_restore --list)
 * → every public table has data → fingerprint (counts and hashes) → fsync,
 * rename → manifest the same way → last-run.json. Any failure exits non-zero,
 * removes the .partial file, leaves no final file, and is recorded in last-run.json.
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { closeSync, createWriteStream, existsSync, fsyncSync, mkdirSync, openSync, renameSync, rmSync, statSync, writeFileSync, writeSync } from "node:fs";
import { join, resolve } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { assertSafeBackupDir, fingerprint, loadAge, pgCommand, pgTarget, query, readRecipients } from "./lib/backup-common.mjs";

const DIR = process.env.BACKUP_DIR;
const DB = process.env.BACKUP_DATABASE || "orbitcargo";
let TARGET; // container name, or null in host mode (set in main)
let USER;

function writeAtomically(path, bytes) {
  const partial = `${path}.partial`;
  const fd = openSync(partial, "wx", 0o600);
  try {
    writeSync(fd, bytes);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(partial, path);
}

function recordRun(result) {
  try {
    writeFileSync(join(DIR, "last-run.json"), JSON.stringify({ ...result, at: new Date().toISOString() }, null, 2) + "\n");
  } catch {
    /* the exit code still reports the outcome */
  }
}

/** Start a PostgreSQL client tool (Docker or host) with piped stdio; collect stdout/stderr. */
function startPg(args, stdin = "ignore") {
  const c = pgCommand(TARGET, args);
  const child = spawn(c.cmd, c.argv, { env: c.env, stdio: [stdin, "pipe", "pipe"] });
  const out = [];
  const err = [];
  child.stderr.on("data", (d) => err.push(d));
  const done = new Promise((resolveDone, reject) => {
    child.on("error", (e) => reject(new Error(`${args[0]} could not start: ${e.message}`)));
    child.on("close", (code) => resolveDone({ code, stderr: Buffer.concat(err).toString("utf8") }));
  });
  return { child, out, done };
}
const firstLine = (s, code) => (s.split(/\r?\n/).find(Boolean) || `exit ${code}`).slice(0, 200);

/**
 * pg_dump → (sha256, pg_restore --list) → age → <partial>. Returns what the
 * manifest needs about the plaintext and the ciphertext.
 */
async function dumpEncrypted(age, recipients, partial) {
  const dump = startPg(["pg_dump", "-U", USER, "-d", DB, "--format=custom", "--no-owner"]);
  dump.child.stdout.on("error", () => {});
  const toc = startPg(["pg_restore", "--list"], "pipe");
  toc.child.stdout.on("data", (d) => toc.out.push(d));
  let tocOpen = true;
  toc.child.stdin.on("error", () => {
    tocOpen = false; // pg_restore --list may stop reading once it has the table of contents
  });
  toc.child.stdin.on("close", () => {
    tocOpen = false;
  });

  const plainHash = createHash("sha256");
  let plainBytes = 0;
  let magic = Buffer.alloc(0);
  const tee = new Transform({
    transform(chunk, _enc, cb) {
      plainHash.update(chunk);
      plainBytes += chunk.length;
      if (magic.length < 5) magic = Buffer.concat([magic, chunk]).subarray(0, 5);
      if (!tocOpen || toc.child.stdin.write(chunk)) return cb(null, chunk);
      // Respect pg_restore's pace so nothing piles up in memory.
      const resume = () => {
        toc.child.stdin.off("drain", resume);
        toc.child.stdin.off("close", resume);
        cb(null, chunk);
      };
      toc.child.stdin.on("drain", resume);
      toc.child.stdin.on("close", resume);
    },
    flush(cb) {
      if (tocOpen) toc.child.stdin.end();
      cb();
    },
  });
  dump.child.stdout.pipe(tee);

  const enc = new age.Encrypter();
  for (const r of recipients) enc.addRecipient(r);
  const encrypted = await enc.encrypt(Readable.toWeb(tee));

  const cipherHash = createHash("sha256");
  let cipherBytes = 0;
  let head = Buffer.alloc(0);
  const counter = new Transform({
    transform(chunk, _enc, cb) {
      cipherHash.update(chunk);
      cipherBytes += chunk.length;
      if (head.length < 4096) head = Buffer.concat([head, chunk]).subarray(0, 4096);
      cb(null, chunk);
    },
  });
  await pipeline(Readable.fromWeb(encrypted), counter, createWriteStream(partial, { flags: "wx", mode: 0o600 }));

  const d = await dump.done;
  if (d.code !== 0) throw new Error(`pg_dump failed: ${firstLine(d.stderr, d.code)}`);
  const t = await toc.done;
  if (t.code !== 0) throw new Error(`pg_restore --list failed: ${firstLine(t.stderr, t.code)}`);
  if (magic.toString("latin1") !== "PGDMP") throw new Error("pg_dump output is not a custom-format dump");

  const fd = openSync(partial, "r+");
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  const withData = Buffer.concat(toc.out)
    .toString("utf8")
    .split(/\r?\n/)
    .map((l) => /\bTABLE DATA public (\S+) /.exec(l)?.[1])
    .filter(Boolean)
    .sort();
  return { plainBytes, plainSha256: plainHash.digest("hex"), cipherBytes, cipherSha256: cipherHash.digest("hex"), head, withData };
}

async function main() {
  if (!DIR) throw new Error("set BACKUP_DIR");
  assertSafeBackupDir(DIR);
  TARGET = pgTarget();
  USER = process.env.BACKUP_DB_USER || (TARGET ? "orbit_app" : "postgres");
  if (!/^[A-Za-z0-9_]+$/.test(DB) || (TARGET && !/^[A-Za-z0-9_.-]+$/.test(TARGET)) || !/^[A-Za-z0-9_]+$/.test(USER)) {
    throw new Error("unexpected characters in BACKUP_DATABASE / BACKUP_DOCKER_CONTAINER / BACKUP_DB_USER");
  }
  const recipients = readRecipients();
  const age = await loadAge();
  mkdirSync(DIR, { recursive: true });

  const lock = join(DIR, ".backup.lock");
  let lockFd;
  try {
    lockFd = openSync(lock, "wx");
  } catch {
    const age_ = existsSync(lock) ? Math.round((Date.now() - statSync(lock).mtimeMs) / 60000) : 0;
    throw new Error(`another backup is running (or a stale lock from ${age_} min ago: remove ${lock} after checking)`);
  }
  writeSync(lockFd, `${process.pid} ${new Date().toISOString()}\n`);
  closeSync(lockFd);

  let partial;
  try {
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z"); // 20261108T101500Z
    const name = `${DB}-${stamp}`;
    const finalPath = resolve(DIR, `${name}.dump.age`);
    if (existsSync(finalPath)) throw new Error(`${finalPath} already exists`);
    partial = `${finalPath}.partial`;

    // 1. Dump → encrypt → .partial, in one stream.
    const tables = query(TARGET, USER, DB, "select string_agg(tablename, ',' order by tablename) from pg_tables where schemaname = 'public'").split(",").filter(Boolean);
    const r = await dumpEncrypted(age, recipients, partial);

    // 2. Check the dump: every public table has a data entry, stored files included.
    const missing = tables.filter((t) => !r.withData.includes(t));
    if (missing.length) throw new Error(`dump is missing data for ${missing.length} table(s): ${missing.join(", ")}`);
    if (!r.withData.includes("StoredFile")) throw new Error("dump has no StoredFile data (documents and images)");

    // 3. Check the ciphertext.
    const header = r.head.toString("latin1");
    if (!header.startsWith("age-encryption.org/v1\n")) throw new Error("encrypted output has no age header");
    const stanzas = (header.match(/^-> X25519 /gm) || []).length;
    if (stanzas !== recipients.length) throw new Error(`expected ${recipients.length} recipient stanza(s), found ${stanzas}`);
    if (r.head.includes(Buffer.from("PGDMP"))) throw new Error("ciphertext contains plaintext");

    // 4. Facts for the manifest (counts and hashes only).
    const migrationHead = query(TARGET, USER, DB, "select max(migration_name) from _prisma_migrations where finished_at is not null");
    const serverVersion = query(TARGET, USER, DB, "show server_version");
    const fp = fingerprint(TARGET, USER, DB);

    // 5. Publish the encrypted file, then its manifest.
    renameSync(partial, finalPath);
    partial = null;
    const manifest = {
      format: "orbitcargo-backup/1",
      createdAt: new Date().toISOString(),
      database: DB,
      source: TARGET ? { kind: "docker", container: TARGET, user: USER, postgres: serverVersion } : { kind: "host", user: USER, postgres: serverVersion },
      dump: { tool: "pg_dump --format=custom --no-owner", bytes: r.plainBytes, sha256: r.plainSha256 },
      encrypted: { file: `${name}.dump.age`, bytes: r.cipherBytes, sha256: r.cipherSha256, tool: "age v1 format, X25519 recipients", recipients },
      checks: { publicTables: tables.length, tablesWithData: r.withData.length, storedFileData: true },
      migrationHead,
      fingerprint: fp,
      note: "fingerprint taken right after the dump; equal to the dump unless writes happened in between",
    };
    writeAtomically(resolve(DIR, `${name}.manifest.json`), Buffer.from(JSON.stringify(manifest, null, 2) + "\n"));

    recordRun({ status: "success", file: `${name}.dump.age`, encryptedSha256: manifest.encrypted.sha256 });
    console.log(`backup written: ${finalPath}`);
    console.log(`  mode ${TARGET ? `docker (${TARGET})` : "host"}, user ${USER}, database ${DB}`);
    console.log(`  dump ${r.plainBytes} bytes, sha256 ${r.plainSha256.slice(0, 16)}…  |  encrypted ${r.cipherBytes} bytes, sha256 ${r.cipherSha256.slice(0, 16)}…`);
    console.log(`  tables ${tables.length}/${tables.length} with data, migration ${migrationHead}, recipients ${recipients.length}`);
  } finally {
    if (partial) rmSync(partial, { force: true }); // never leave a half-written file behind
    rmSync(lock, { force: true });
  }
}

main().catch((e) => {
  const message = e instanceof Error ? e.message : String(e);
  if (DIR) recordRun({ status: "failure", error: message });
  console.error(`BACKUP FAILED: ${message}`);
  process.exit(1);
});
