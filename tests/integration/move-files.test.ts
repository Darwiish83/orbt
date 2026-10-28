import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { dbStorage, generateStorageKey } from "@/modules/documents/storage";
import { moveFilesToDb } from "../../scripts/move-files-to-db";
import { assertTestDatabase, prisma, resetDb } from "./helpers";

/** Moving the old folder files into the database (ADR-030). */
let dir = "";
beforeAll(async () => {
  assertTestDatabase();
  dir = await mkdtemp(path.join(tmpdir(), "orbit-move-"));
});
beforeEach(() => resetDb());
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
  await prisma.$disconnect();
});

const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");
async function onDisk(bytes: Buffer): Promise<string> {
  const key = generateStorageKey();
  await mkdir(path.dirname(path.join(dir, key)), { recursive: true });
  await writeFile(path.join(dir, key), bytes);
  return key;
}

describe("move-files-to-db", () => {
  it("checks first, then copies each file once, refusing changed or missing ones", async () => {
    const good = Buffer.from("%PDF-1.4 good", "latin1");
    const img = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01]);
    const tampered = Buffer.from("%PDF-1.4 changed later", "latin1");
    const goodKey = await onDisk(good);
    const imgKey = await onDisk(img);
    const tamperedKey = await onDisk(tampered);
    const doc = (key: string, checksum: string | null) =>
      prisma.document.create({ data: { kind: "OTHER", storageKey: key, contentType: "application/pdf", size: 1, checksum } });
    await doc(goodKey, sha(good));
    await doc(tamperedKey, sha(Buffer.from("original bytes")));
    await doc(generateStorageKey(), null); // file lost on disk
    await prisma.notification.create({ data: { audience: "ALL", title: "t", message: "m", imageKey: imgKey, imageType: "image/png" } });

    const dry = await moveFilesToDb(prisma, { apply: false, dir });
    expect(dry).toMatchObject({ total: 4, alreadyInDb: 0, moved: 2 });
    expect(dry.missingOnDisk).toHaveLength(1);
    expect(dry.checksumMismatch).toHaveLength(1);
    expect(await prisma.storedFile.count()).toBe(0); // the check changes nothing

    const run = await moveFilesToDb(prisma, { apply: true, dir });
    expect(run.moved).toBe(2);
    expect(await dbStorage(prisma).get(goodKey)).toEqual(good);
    expect(await dbStorage(prisma).get(imgKey)).toEqual(img);
    await expect(dbStorage(prisma).get(tamperedKey)).rejects.toThrow(/not found/i);

    const again = await moveFilesToDb(prisma, { apply: true, dir });
    expect(again).toMatchObject({ alreadyInDb: 2, moved: 0 });
    expect(await prisma.storedFile.count()).toBe(2);
  });
});
