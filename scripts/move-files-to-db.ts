/**
 * Copy files from the old folder storage into the database (ADR-030).
 *
 *   npx tsx --env-file=.env scripts/move-files-to-db.ts           # check only, changes nothing
 *   npx tsx --env-file=.env scripts/move-files-to-db.ts --apply   # copy
 *
 * For every Document.storageKey and Notification.imageKey that has no
 * StoredFile row yet, reads the file from DOCUMENTS_DIR (default
 * storage/documents), checks it against the document's recorded SHA-256 when
 * there is one, and inserts it. Safe to run again: files already in the
 * database are skipped. Nothing on disk is deleted — keep the folder until the
 * app has been checked, then remove it yourself.
 *
 * Runs as the app's own role (DATABASE_URL = orbit_runtime): it may add files,
 * never change or delete them.
 */
import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { diskReader } from "../src/modules/documents/storage";

export interface MoveReport {
  total: number;
  alreadyInDb: number;
  moved: number;
  missingOnDisk: string[];
  checksumMismatch: string[];
}

const sha256 = (b: Buffer) => createHash("sha256").update(b).digest("hex");

export async function moveFilesToDb(db: PrismaClient, opts: { apply: boolean; dir?: string }): Promise<MoveReport> {
  const disk = diskReader(opts.dir);
  const docs = await db.document.findMany({ select: { id: true, storageKey: true, checksum: true } });
  const images = await db.notification.findMany({ where: { imageKey: { not: null } }, select: { id: true, imageKey: true } });
  const wanted = new Map<string, { label: string; checksum: string | null }>();
  for (const d of docs) wanted.set(d.storageKey, { label: `Document ${d.id}`, checksum: d.checksum });
  for (const n of images) if (n.imageKey) wanted.set(n.imageKey, { label: `Notification image ${n.id}`, checksum: null });

  const present = new Set(
    (await db.storedFile.findMany({ where: { key: { in: [...wanted.keys()] } }, select: { key: true } })).map((f) => f.key),
  );
  const report: MoveReport = { total: wanted.size, alreadyInDb: present.size, moved: 0, missingOnDisk: [], checksumMismatch: [] };

  for (const [key, info] of wanted) {
    if (present.has(key)) continue;
    let buffer: Buffer;
    try {
      buffer = await disk.get(key);
    } catch {
      report.missingOnDisk.push(info.label);
      continue;
    }
    const hash = sha256(buffer);
    if (info.checksum && info.checksum !== hash) {
      report.checksumMismatch.push(info.label);
      continue;
    }
    if (opts.apply) {
      await db.storedFile.createMany({ data: [{ key, data: new Uint8Array(buffer), size: buffer.length, sha256: hash }], skipDuplicates: true });
    }
    report.moved++;
  }
  return report;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const db = new PrismaClient();
  try {
    const r = await moveFilesToDb(db, { apply });
    console.log(`${apply ? "Moved" : "Would move"} ${r.moved} of ${r.total} files (${r.alreadyInDb} already in the database).`);
    if (r.missingOnDisk.length) console.log(`Not found on disk (${r.missingOnDisk.length}): ${r.missingOnDisk.join(", ")}`);
    if (r.checksumMismatch.length) console.log(`Changed since upload, NOT moved (${r.checksumMismatch.length}): ${r.checksumMismatch.join(", ")}`);
    if (!apply) console.log("Nothing was changed. Run again with --apply to copy.");
    if (r.missingOnDisk.length || r.checksumMismatch.length) process.exitCode = 2;
  } finally {
    await db.$disconnect();
  }
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/move-files-to-db.ts")) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
