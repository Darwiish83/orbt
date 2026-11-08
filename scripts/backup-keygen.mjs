#!/usr/bin/env node
// Create the age key pair for encrypted backups (H4). Run once, on the owner's
// computer, never on the server:
//
//   node scripts/backup-keygen.mjs <folder>
//
// Writes <folder>/orbitcargo-backup.key (the PRIVATE key, age-keygen format,
// usable with `age -d -i`) and <folder>/orbitcargo-backup.pub (the public key,
// "age1..."). Refuses to overwrite either. Prints only the public key.
// Afterwards: copy the .key file into the password manager and onto an offline
// USB stick; the server only ever gets the .pub value.
import { chmodSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadAge } from "./lib/backup-common.mjs";

const folder = process.argv[2];
if (!folder) {
  console.error("usage: node scripts/backup-keygen.mjs <folder>");
  process.exit(2);
}
const keyFile = join(folder, "orbitcargo-backup.key");
const pubFile = join(folder, "orbitcargo-backup.pub");
if (existsSync(keyFile) || existsSync(pubFile)) {
  console.error(`refusing to overwrite an existing key in ${folder}`);
  process.exit(1);
}

const age = await loadAge();
// X25519 on purpose: every age version (e.g. Ubuntu's apt package) can decrypt it.
const identity = await age.generateX25519Identity();
const recipient = await age.identityToRecipient(identity);

mkdirSync(folder, { recursive: true });
const created = new Date().toISOString();
writeFileSync(keyFile, `# created: ${created}\n# public key: ${recipient}\n${identity}\n`, { flag: "wx", mode: 0o600 });
writeFileSync(pubFile, `${recipient}\n`, { flag: "wx", mode: 0o644 });
try {
  chmodSync(keyFile, 0o600); // POSIX; on Windows the folder's ACL applies
} catch {
  /* ignore */
}
console.log(`public key: ${recipient}`);
console.log(`private key written to ${keyFile} (not printed)`);
