#!/usr/bin/env node
/**
 * Verify an encrypted backup against its manifest, without restoring it (H4).
 *
 *   BACKUP_AGE_IDENTITY_FILE=<path to orbitcargo-backup.key> \
 *   node scripts/backup-verify.mjs <path to .dump.age>
 *
 * Checks: the encrypted file's size and SHA-256 match the manifest; it decrypts
 * with the identity (in memory only); the decrypted dump's size and SHA-256
 * match; pg_restore --list (inside the container, nothing restored) shows data
 * for the same tables the manifest recorded. Prints counts and hashes only.
 * Exit 0 = verified, 1 = a check failed.
 */
import { readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { dumpTableData, loadAge, sha256 } from "./lib/backup-common.mjs";

const file = process.argv[2];
const identityFile = process.env.BACKUP_AGE_IDENTITY_FILE;
const CONTAINER = process.env.BACKUP_DOCKER_CONTAINER || "orbitcargo-postgres";

const results = [];
const check = (name, ok) => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  return ok;
};

async function main() {
  if (!file || !file.endsWith(".dump.age")) throw new Error("usage: node scripts/backup-verify.mjs <file.dump.age>");
  if (!identityFile) throw new Error("set BACKUP_AGE_IDENTITY_FILE");
  const manifest = JSON.parse(readFileSync(join(dirname(file), basename(file).replace(/\.dump\.age$/, ".manifest.json")), "utf8"));

  const cipher = readFileSync(file);
  check(`encrypted file matches manifest (${cipher.length} bytes, sha256 ${sha256(cipher).slice(0, 16)}…)`, cipher.length === manifest.encrypted.bytes && sha256(cipher) === manifest.encrypted.sha256);
  check("age header present, plaintext not visible", cipher.subarray(0, 22).toString("latin1") === "age-encryption.org/v1\n" && !cipher.includes(Buffer.from("PGDMP")));

  const identities = readFileSync(identityFile, "utf8").split(/\r?\n/).filter((l) => /^AGE-SECRET-KEY-/.test(l));
  if (!identities.length) throw new Error("no AGE-SECRET-KEY line in the identity file");
  const age = await loadAge();
  const dec = new age.Decrypter();
  for (const id of identities) dec.addIdentity(id);

  let plain;
  try {
    plain = Buffer.from(await dec.decrypt(new Uint8Array(cipher.buffer, cipher.byteOffset, cipher.byteLength)));
    check("decrypts with the identity", true);
    check(`decrypted dump matches manifest (${plain.length} bytes, sha256 ${sha256(plain).slice(0, 16)}…)`, plain.length === manifest.dump.bytes && sha256(plain) === manifest.dump.sha256);
    check("decrypted bytes are a PostgreSQL custom-format dump", plain.subarray(0, 5).toString("latin1") === "PGDMP");
    const withData = dumpTableData(CONTAINER, plain);
    check(`pg_restore --list: ${withData.length} tables with data (manifest: ${manifest.checks.tablesWithData})`, withData.length === manifest.checks.tablesWithData);
    check("stored files (StoredFile) included", withData.includes("StoredFile"));
  } finally {
    if (plain) plain.fill(0);
  }
  console.log(`migration in backup: ${manifest.migrationHead}; recipients: ${manifest.encrypted.recipients.length}; created ${manifest.createdAt}`);
}

main()
  .then(() => {
    const ok = results.length > 0 && results.every(Boolean);
    console.log(ok ? "VERIFIED" : "VERIFICATION FAILED");
    process.exit(ok ? 0 : 1);
  })
  .catch((e) => {
    console.error(`VERIFICATION FAILED: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  });
