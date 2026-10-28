import { createHash, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { PrismaClient } from "@prisma/client";

/**
 * Private file storage behind a small interface so callers never care where
 * bytes live. Since ADR-030 files are kept in PostgreSQL (`StoredFile`), so a
 * database backup or a move to another server carries every document and
 * announcement image. Storage keys are app-generated random — never user
 * filenames — and access is always server-mediated and authorized.
 */
export interface Storage {
  put(buffer: Buffer): Promise<string>; // returns a storage key
  get(key: string): Promise<Buffer>;
}

export function generateStorageKey(): string {
  // 32 hex chars, sharded like the old folder layout (same keys, no rename).
  const id = randomBytes(16).toString("hex");
  return `${id.slice(0, 2)}/${id.slice(2, 4)}/${id}`;
}

const sha256 = (b: Buffer) => createHash("sha256").update(b).digest("hex");

/**
 * Files in the database, on the caller's connection: the app's (orbit_runtime)
 * or a customer's (orbit_portal, Row-Level Security). Writing in the same
 * transaction as the Document / Notification row means a failed save leaves no
 * stray file. The database refuses a wrong size or hash and any change or
 * delete; reads re-check the hash, so altered bytes are never served.
 */
export function dbStorage(db: PrismaClient): Storage {
  return {
    async put(buffer: Buffer): Promise<string> {
      const key = generateStorageKey();
      // createMany: no RETURNING, so the write doesn't need read access back.
      await db.storedFile.createMany({ data: [{ key, data: new Uint8Array(buffer), size: buffer.length, sha256: sha256(buffer) }] });
      return key;
    },
    async get(key: string): Promise<Buffer> {
      const row = await db.storedFile.findUnique({ where: { key } });
      if (!row) throw new Error("Stored file not found");
      const buffer = Buffer.from(row.data);
      if (sha256(buffer) !== row.sha256) throw new Error("Stored file failed its integrity check");
      return buffer;
    },
  };
}

/**
 * The old folder storage (before ADR-030), read-only. Used only by
 * `scripts/move-files-to-db.ts` to copy existing files into the database.
 */
export function diskReader(dir = process.env.DOCUMENTS_DIR || path.join(process.cwd(), "storage", "documents")) {
  const root = path.resolve(dir);
  return {
    async get(key: string): Promise<Buffer> {
      const full = path.resolve(root, key);
      // Defense in depth: the resolved path must stay within the storage root.
      if (full !== root && !full.startsWith(root + path.sep)) throw new Error("Invalid storage key");
      return readFile(full);
    },
  };
}
