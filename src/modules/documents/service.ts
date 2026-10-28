import { createHash } from "node:crypto";
import type { Document, DocumentKind, Prisma, PrismaClient } from "@prisma/client";
import { AuthorizationError, ValidationError } from "@/lib/errors";
import { buildPage, normalizePage, type Page, type PageParams } from "@/lib/pagination";
import { logAudit } from "@/modules/audit/log";
import { isCustomerPrincipal, requirePermission, requireScope, type AuthzUser } from "@/modules/authz/core";
import { inTransaction } from "@/db/tx";
import { dbStorage, type Storage } from "./storage";
import { sanitizeFilename, validateUpload } from "./validation";

export interface UploadDocumentInput {
  buffer: Buffer;
  filename: string;
  declaredType: string;
  kind: DocumentKind;
  customerId?: string;
  shipmentId?: string;
}

/**
 * Object-level access for a document. A customer principal may only touch
 * documents owned by their own customer; staff must hold the given permission.
 */
export function assertDocumentAccess(
  actor: AuthzUser,
  doc: Pick<Document, "customerId">,
  staffPermission: "documents:read" | "documents:write" | "documents:manage",
): void {
  if (isCustomerPrincipal(actor)) {
    if (!doc.customerId || doc.customerId !== actor.customerId) {
      throw new AuthorizationError("Document access denied");
    }
    return;
  }
  requirePermission(actor, staffPermission);
}

/** Staff: a shipment's papers follow the shipment's country (as in the
 * Documents list); a customer's own papers are shared across countries. */
async function assertStaffDocumentScope(db: PrismaClient, actor: AuthzUser, doc: Pick<Document, "shipmentId">): Promise<void> {
  if (isCustomerPrincipal(actor) || !doc.shipmentId) return;
  const sh = await db.shipment.findUnique({ where: { id: doc.shipmentId }, select: { originCountry: true, businessYear: true } });
  if (sh) requireScope(actor, { country: sh.originCountry, businessYear: sh.businessYear });
}

export async function uploadDocument(
  db: PrismaClient,
  actor: AuthzUser,
  input: UploadDocumentInput,
  storage?: Storage,
): Promise<Document> {
  // A customer uploads only to their own account; staff need documents:write.
  let customerId = input.customerId;
  if (isCustomerPrincipal(actor)) {
    customerId = actor.customerId ?? undefined;
  } else {
    requirePermission(actor, "documents:write");
  }

  const { contentType, size } = validateUpload(input.buffer, input.declaredType);
  const checksum = createHash("sha256").update(input.buffer).digest("hex");

  // File and record are saved together: if either fails, neither is kept.
  return inTransaction(db, async (tx) => {
    const storageKey = await (storage ?? dbStorage(tx)).put(input.buffer);
    const doc = await tx.document.create({
      data: {
        kind: input.kind,
        storageKey,
        filename: sanitizeFilename(input.filename),
        contentType,
        size,
        checksum,
        customerId,
        shipmentId: input.shipmentId,
        uploadedByUserId: actor.id,
      },
    });
    await logAudit(tx, {
      actorUserId: actor.id,
      action: "document.upload",
      entityType: "Document",
      entityId: doc.id,
      metadata: { kind: input.kind, size, contentType },
    });
    return doc;
  });
}

/** Load a document for download, enforcing object-level access and returning
 * both metadata and bytes. Soft-deleted documents are not downloadable. */
export async function getDocumentForDownload(
  db: PrismaClient,
  actor: AuthzUser,
  id: string,
  storage?: Storage,
): Promise<{ document: Document; buffer: Buffer } | null> {
  const document = await db.document.findUnique({ where: { id } });
  if (!document || document.deletedAt) return null;
  assertDocumentAccess(actor, document, "documents:read");
  await assertStaffDocumentScope(db, actor, document);
  const buffer = await (storage ?? dbStorage(db)).get(document.storageKey);
  await logAudit(db, {
    actorUserId: actor.id,
    action: "document.download",
    entityType: "Document",
    entityId: id,
  });
  return { document, buffer };
}

/** Load a document for a token-authorized download (no session). The caller
 * has already verified a valid signed token bound to this id. */
export async function getDocumentByToken(
  db: PrismaClient,
  id: string,
  storage?: Storage,
): Promise<{ document: Document; buffer: Buffer } | null> {
  const document = await db.document.findUnique({ where: { id } });
  if (!document || document.deletedAt) return null;
  const buffer = await (storage ?? dbStorage(db)).get(document.storageKey);
  return { document, buffer };
}

export interface ListDocumentsFilters extends PageParams {
  customerId?: string;
  shipmentId?: string;
}

export async function listDocuments(
  db: PrismaClient,
  actor: AuthzUser,
  filters: ListDocumentsFilters = {},
): Promise<Page<Document>> {
  const { page, pageSize, skip, take } = normalizePage(filters);
  const where: Prisma.DocumentWhereInput = { deletedAt: null };

  if (isCustomerPrincipal(actor)) {
    where.customerId = actor.customerId ?? "__none__";
  } else {
    requirePermission(actor, "documents:read");
    if (filters.customerId) where.customerId = filters.customerId;
    if (filters.shipmentId) where.shipmentId = filters.shipmentId;
  }

  const [items, total] = await Promise.all([
    db.document.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
    db.document.count({ where }),
  ]);
  return buildPage(items, total, page, pageSize);
}

export async function softDeleteDocument(db: PrismaClient, actor: AuthzUser, id: string): Promise<void> {
  requirePermission(actor, "documents:manage");
  const doc = await db.document.findUnique({ where: { id } });
  if (!doc || doc.deletedAt) throw new ValidationError("Document not found");
  await assertStaffDocumentScope(db, actor, doc);
  await db.document.update({ where: { id }, data: { deletedAt: new Date() } });
  await logAudit(db, { actorUserId: actor.id, action: "document.delete", entityType: "Document", entityId: id });
}
