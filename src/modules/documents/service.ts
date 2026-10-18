import { createHash } from "node:crypto";
import type { Document, DocumentKind, Prisma, PrismaClient } from "@prisma/client";
import { AuthorizationError } from "@/lib/errors";
import { buildPage, normalizePage, type Page, type PageParams } from "@/lib/pagination";
import { logAudit } from "@/modules/audit/log";
import { isCustomerPrincipal, requirePermission, type AuthzUser } from "@/modules/authz/core";
import { localStorage, type Storage } from "./storage";
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

export async function uploadDocument(
  db: PrismaClient,
  actor: AuthzUser,
  input: UploadDocumentInput,
  storage: Storage = localStorage,
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

  // Store first (random key — never the user filename), then record metadata.
  const storageKey = await storage.put(input.buffer);

  const doc = await db.document.create({
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
  await logAudit(db, {
    actorUserId: actor.id,
    action: "document.upload",
    entityType: "Document",
    entityId: doc.id,
    metadata: { kind: input.kind, size, contentType },
  });
  return doc;
}

/** Load a document for download, enforcing object-level access and returning
 * both metadata and bytes. Soft-deleted documents are not downloadable. */
export async function getDocumentForDownload(
  db: PrismaClient,
  actor: AuthzUser,
  id: string,
  storage: Storage = localStorage,
): Promise<{ document: Document; buffer: Buffer } | null> {
  const document = await db.document.findUnique({ where: { id } });
  if (!document || document.deletedAt) return null;
  assertDocumentAccess(actor, document, "documents:read");
  const buffer = await storage.get(document.storageKey);
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
  storage: Storage = localStorage,
): Promise<{ document: Document; buffer: Buffer } | null> {
  const document = await db.document.findUnique({ where: { id } });
  if (!document || document.deletedAt) return null;
  const buffer = await storage.get(document.storageKey);
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
  await db.document.update({ where: { id }, data: { deletedAt: new Date() } });
  await logAudit(db, { actorUserId: actor.id, action: "document.delete", entityType: "Document", entityId: id });
}
