import { randomBytes } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Private document storage behind a small interface so the backend can be
 * swapped (local FS now → S3/compatible later) without touching callers.
 * Files live OUTSIDE the web root; access is always server-mediated and
 * authorized. Storage keys are app-generated random — never user filenames —
 * so there is no path traversal and no reliance on filename obscurity.
 */
export interface Storage {
  put(buffer: Buffer): Promise<string>; // returns a storage key
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

function baseDir(): string {
  return process.env.DOCUMENTS_DIR || path.join(process.cwd(), "storage", "documents");
}

export function generateStorageKey(): string {
  // 32 hex chars, sharded into two dirs to avoid huge flat directories.
  const id = randomBytes(16).toString("hex");
  return `${id.slice(0, 2)}/${id.slice(2, 4)}/${id}`;
}

function resolveSafe(key: string): string {
  const root = path.resolve(baseDir());
  const full = path.resolve(root, key);
  // Defense in depth: the resolved path must stay within the storage root.
  if (full !== root && !full.startsWith(root + path.sep)) {
    throw new Error("Invalid storage key");
  }
  return full;
}

export const localStorage: Storage = {
  async put(buffer: Buffer): Promise<string> {
    const key = generateStorageKey();
    const full = resolveSafe(key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, buffer);
    return key;
  },
  async get(key: string): Promise<Buffer> {
    return readFile(resolveSafe(key));
  },
  async delete(key: string): Promise<void> {
    await unlink(resolveSafe(key)).catch(() => undefined);
  },
};
