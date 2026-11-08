// Shared helpers for the encrypted backup scripts (H4). No secrets pass through
// command-line arguments: pg_dump / pg_restore / psql connect over PostgreSQL's
// local socket — inside the database container (Docker mode) or on the server
// itself (host mode, e.g. `sudo -u postgres` with peer authentication) — and
// dump bytes travel on stdin/stdout only.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DEFAULT_AGE_JS = "C:/OrbitCargo-Recovery/tools/age-js/age.mjs";

export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

/**
 * The age implementation: the project's own `age-encryption` dependency if one is
 * installed, otherwise the copy named by BACKUP_AGE_JS (a module re-exporting
 * `age-encryption`, kept outside the repository).
 */
export async function loadAge() {
  try {
    return await import("age-encryption");
  } catch {
    const path = process.env.BACKUP_AGE_JS || DEFAULT_AGE_JS;
    if (!existsSync(path)) throw new Error(`age-encryption not found (set BACKUP_AGE_JS; tried ${path})`);
    return import(pathToFileURL(path).href);
  }
}

/**
 * How to run a PostgreSQL client tool: inside `container` (Docker mode), or
 * directly on this machine when `container` is null (host mode). `env` sets
 * non-secret variables for that command (e.g. PGOPTIONS).
 */
export function pgCommand(container, args, env = {}) {
  if (!container) return { cmd: args[0], argv: args.slice(1), env: { ...process.env, ...env } };
  const envArgs = Object.entries(env).flatMap(([k, v]) => ["-e", `${k}=${v}`]);
  return { cmd: "docker", argv: ["exec", "-i", ...envArgs, container, ...args], env: process.env };
}

/** The container to use, or null for host mode (BACKUP_PG_MODE=host). */
export function pgTarget() {
  const mode = process.env.BACKUP_PG_MODE || "docker";
  if (mode === "host") return null;
  if (mode !== "docker") throw new Error("BACKUP_PG_MODE must be docker or host");
  return process.env.BACKUP_DOCKER_CONTAINER || "orbitcargo-postgres";
}

/**
 * Run a PostgreSQL client command (see pgCommand). Throws with stderr's first line only.
 * The name is historical: `container` null runs on this machine (host mode).
 */
export function inContainer(container, args, input, env = {}) {
  const c = pgCommand(container, args, env);
  const r = spawnSync(c.cmd, c.argv, { input, env: c.env, maxBuffer: 1024 * 1024 * 1024 });
  if (r.error) throw new Error(`${container ? "docker exec" : args[0]} failed: ${r.error.message}`);
  if (r.status !== 0) {
    const first = String(r.stderr || "").split(/\r?\n/).find(Boolean) || `exit ${r.status}`;
    throw new Error(`${args[0]} failed: ${first.slice(0, 200)}`);
  }
  return r.stdout;
}

/** Tables with data in a custom-format dump, read with pg_restore --list (no restore). */
export function dumpTableData(container, dumpBytes) {
  const toc = inContainer(container, ["pg_restore", "--list"], dumpBytes).toString("utf8");
  return toc
    .split(/\r?\n/)
    .map((l) => /\bTABLE DATA public (\S+) /.exec(l)?.[1])
    .filter(Boolean)
    .sort();
}

/** Counts and hashes only (scripts/db-fingerprint.sql); never row data. */
export function fingerprint(container, user, database) {
  const sql = readFileSync(resolve(PROJECT_ROOT, "scripts/db-fingerprint.sql"));
  return inContainer(container, ["psql", "-U", user, "-d", database, "-qAt", "-v", "ON_ERROR_STOP=1"], sql)
    .toString("utf8")
    .split(/\r?\n/)
    .filter(Boolean);
}

export function query(container, user, database, sql) {
  return inContainer(container, ["psql", "-U", user, "-d", database, "-qAt", "-v", "ON_ERROR_STOP=1", "-c", sql]).toString("utf8").trim();
}

/** age recipients (public keys) from BACKUP_AGE_RECIPIENTS and/or BACKUP_AGE_RECIPIENTS_FILE. */
export function readRecipients() {
  const raw = [process.env.BACKUP_AGE_RECIPIENTS || ""];
  if (process.env.BACKUP_AGE_RECIPIENTS_FILE) raw.push(readFileSync(process.env.BACKUP_AGE_RECIPIENTS_FILE, "utf8"));
  const items = raw
    .join("\n")
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith("#"));
  if (items.some((s) => /^AGE-SECRET-KEY-/i.test(s))) {
    throw new Error("a private key was given as a recipient: only public keys (age1...) belong on the backup machine");
  }
  const bad = items.filter((s) => !/^age1[0-9a-z]{20,}$/.test(s));
  if (bad.length) throw new Error(`not an age public key: ${bad.length} value(s)`);
  if (!items.length) throw new Error("no age recipient: set BACKUP_AGE_RECIPIENTS or BACKUP_AGE_RECIPIENTS_FILE");
  return [...new Set(items)];
}

/** Refuse a backup folder that is synced to a cloud drive or sits inside the repository. */
export function assertSafeBackupDir(dir) {
  const full = resolve(dir).replace(/\\/g, "/").toLowerCase();
  if (full.includes("/onedrive")) throw new Error("BACKUP_DIR is inside OneDrive: backups must not sync to a cloud drive unencrypted or uncontrolled");
  if (full.startsWith(PROJECT_ROOT.replace(/\\/g, "/").toLowerCase() + "/")) throw new Error("BACKUP_DIR is inside the project folder");
}
