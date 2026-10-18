import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { loadAuthzUser, type AuthzUser } from "@/modules/authz/core";
import { createCustomer } from "@/modules/customers/service";
import {
  getDocumentForDownload,
  listDocuments,
  softDeleteDocument,
  uploadDocument,
} from "@/modules/documents/service";
import { generateStorageKey, localStorage } from "@/modules/documents/storage";
import { createSignedToken, verifySignedToken } from "@/modules/documents/signing";
import { sniffContentType, validateUpload } from "@/modules/documents/validation";
import { assertTestDatabase, prisma, resetDb } from "./helpers";

beforeAll(() => assertTestDatabase());
beforeEach(() => resetDb());
afterAll(() => prisma.$disconnect());

let seq = 0;
const uniq = () => `${Date.now()}-${seq++}`;

async function superAdmin(): Promise<AuthzUser> {
  const role = await prisma.role.create({ data: { key: "super_admin", name: "Super Admin" } });
  const user = await prisma.user.create({ data: { email: `${uniq()}@orbit.so`, status: "ACTIVE" } });
  await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
  return (await loadAuthzUser(prisma, user.id))!;
}

async function staff(perms: string[]): Promise<AuthzUser> {
  const role = await prisma.role.create({ data: { key: `role-${uniq()}`, name: "role" } });
  for (const p of perms) {
    const permission = await prisma.permission.upsert({ where: { key: p }, create: { key: p }, update: {} });
    await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } });
  }
  const user = await prisma.user.create({ data: { email: `${uniq()}@orbit.so`, status: "ACTIVE" } });
  await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
  return (await loadAuthzUser(prisma, user.id))!;
}

async function customerPrincipal(customerId: string): Promise<AuthzUser> {
  const user = await prisma.user.create({ data: { email: `${uniq()}@cust.so`, status: "ACTIVE", customerId } });
  return (await loadAuthzUser(prisma, user.id))!;
}

const PDF = Buffer.from("%PDF-1.4\nhello orbit\n", "latin1");
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]);

describe("upload validation", () => {
  it("accepts a real PDF and detects its type", () => {
    expect(sniffContentType(PDF)).toBe("application/pdf");
    expect(validateUpload(PDF, "application/pdf").contentType).toBe("application/pdf");
  });

  it("rejects a type that disagrees with the bytes", () => {
    expect(() => validateUpload(PDF, "image/png")).toThrow(/does not match/i);
  });

  it("rejects unrecognized content", () => {
    expect(() => validateUpload(Buffer.from("just text, not a document"), "")).toThrow(/unsupported|unrecognized/i);
  });

  it("rejects an oversized file", () => {
    const big = Buffer.alloc(10 * 1024 * 1024 + 1);
    big.set(PDF, 0);
    expect(() => validateUpload(big, "application/pdf")).toThrow(/limit/i);
  });
});

describe("storage safety", () => {
  it("generates sharded random keys and round-trips bytes", async () => {
    const key = generateStorageKey();
    expect(key).toMatch(/^[0-9a-f]{2}\/[0-9a-f]{2}\/[0-9a-f]{32}$/);
    const stored = await localStorage.put(PDF);
    expect(await localStorage.get(stored)).toEqual(PDF);
  });

  it("refuses a traversal key", async () => {
    await expect(localStorage.get("../../../../etc/passwd")).rejects.toThrow(/invalid storage key/i);
  });
});

describe("document upload & download authorization", () => {
  it("lets staff with documents:write upload and documents:read download", async () => {
    const admin = await superAdmin();
    const c = await createCustomer(prisma, admin, { name: "Acme" });
    const uploader = await staff(["documents:write"]);
    const reader = await staff(["documents:read"]);

    const doc = await uploadDocument(prisma, uploader, {
      buffer: PDF,
      filename: "invoice.pdf",
      declaredType: "application/pdf",
      kind: "INVOICE",
      customerId: c.id,
    });
    expect(doc.storageKey).not.toContain("invoice.pdf"); // key is random, not the filename

    const dl = await getDocumentForDownload(prisma, reader, doc.id);
    expect(dl?.buffer).toEqual(PDF);
  });

  it("denies staff without documents permission", async () => {
    const admin = await superAdmin();
    const c = await createCustomer(prisma, admin, { name: "Acme" });
    const doc = await uploadDocument(prisma, admin, {
      buffer: PNG,
      filename: "id.png",
      declaredType: "image/png",
      kind: "IDENTITY",
      customerId: c.id,
    });
    const weak = await staff(["customers:read"]);
    await expect(getDocumentForDownload(prisma, weak, doc.id)).rejects.toThrow();
  });

  it("scopes customers to their own documents (IDOR)", async () => {
    const admin = await superAdmin();
    const a = await createCustomer(prisma, admin, { name: "A" });
    const b = await createCustomer(prisma, admin, { name: "B" });
    const docA = await uploadDocument(prisma, admin, {
      buffer: PDF,
      filename: "a.pdf",
      declaredType: "application/pdf",
      kind: "OTHER",
      customerId: a.id,
    });

    const custA = await customerPrincipal(a.id);
    const custB = await customerPrincipal(b.id);

    await expect(getDocumentForDownload(prisma, custA, docA.id)).resolves.toBeTruthy();
    await expect(getDocumentForDownload(prisma, custB, docA.id)).rejects.toThrow(/denied/i);

    // A customer upload is forced to their own account.
    const ownUpload = await uploadDocument(prisma, custA, {
      buffer: PDF,
      filename: "mine.pdf",
      declaredType: "application/pdf",
      kind: "OTHER",
      customerId: b.id, // attempt to mis-assign — ignored
    });
    expect(ownUpload.customerId).toBe(a.id);

    expect((await listDocuments(prisma, custB, {})).total).toBe(0);
    expect((await listDocuments(prisma, custA, {})).total).toBe(2);
  });

  it("does not serve a soft-deleted document", async () => {
    const admin = await superAdmin();
    const c = await createCustomer(prisma, admin, { name: "Acme" });
    const doc = await uploadDocument(prisma, admin, {
      buffer: PDF,
      filename: "x.pdf",
      declaredType: "application/pdf",
      kind: "OTHER",
      customerId: c.id,
    });
    await softDeleteDocument(prisma, admin, doc.id);
    expect(await getDocumentForDownload(prisma, admin, doc.id)).toBeNull();
  });
});

describe("signed download tokens", () => {
  it("verifies a fresh token and rejects tampering/expiry/mismatch", () => {
    const token = createSignedToken("doc-123");
    expect(verifySignedToken("doc-123", token)).toBe(true);
    expect(verifySignedToken("doc-999", token)).toBe(false); // bound to the id
    expect(verifySignedToken("doc-123", token + "ff")).toBe(false); // tampered
    expect(verifySignedToken("doc-123", createSignedToken("doc-123", -1000))).toBe(false); // expired
  });
});
