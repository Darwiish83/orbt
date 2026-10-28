import type { Prisma, PrismaClient, ShipmentDocPart } from "@prisma/client";
import { AuthorizationError, ValidationError } from "@/lib/errors";
import { displayShipmentCode } from "@/modules/authz/adminScope";
import { allowedCountries, requirePermission, requireScope, type AuthzUser } from "@/modules/authz/core";
import { uploadDocument } from "./service";

/**
 * Admin → Documents (spec B12 / §13). A document belongs to a customer
 * ("Upload Customer" — it then shows in that customer's app) or to a shipment
 * ("Upload Shipment", staff only). Files stay in private storage and are
 * downloaded through the authorized route.
 */

export interface AdminDocumentsFilters {
  year: number;
  country: string;
  from?: string;
  to?: string;
  mode?: "AIR" | "SEA";
  shipmentId?: string;
  customerId?: string;
  q?: string;
  page?: number;
}

export async function listAdminDocuments(db: PrismaClient, actor: AuthzUser, f: AdminDocumentsFilters) {
  requirePermission(actor, "documents:read");
  requireScope(actor, { country: f.country, businessYear: f.year });
  const start = f.from && /^\d{4}-\d{2}-\d{2}$/.test(f.from) ? new Date(`${f.from}T00:00:00Z`) : new Date(Date.UTC(f.year, 0, 1));
  const end = f.to && /^\d{4}-\d{2}-\d{2}$/.test(f.to) ? new Date(`${f.to}T23:59:59Z`) : new Date(Date.UTC(f.year, 11, 31, 23, 59, 59));
  const q = f.q?.trim();
  const where: Prisma.DocumentWhereInput = {
    deletedAt: null,
    createdAt: { gte: start, lte: end },
    // Shipment documents follow the shipment's country; customer documents are shared.
    // (requireScope above guarantees the actor may see f.country.)
    OR: [{ shipmentId: null }, { shipment: { originCountry: f.country } }],
    ...(f.mode ? { shipment: { mode: f.mode, originCountry: f.country } } : {}),
    ...(f.shipmentId ? { shipmentId: f.shipmentId } : {}),
    ...(f.customerId ? { customerId: f.customerId } : {}),
    ...(q
      ? {
          AND: [
            {
              OR: [
                { filename: { contains: q, mode: "insensitive" } },
                { reference: { contains: q, mode: "insensitive" } },
                { customer: { name: { contains: q, mode: "insensitive" } } },
                { customer: { ref: { contains: q, mode: "insensitive" } } },
              ],
            },
          ],
        }
      : {}),
  };
  const page = Math.max(1, f.page ?? 1);
  const [items, total, customers, shipments] = await Promise.all([
    db.document.findMany({ where, include: { customer: { select: { ref: true, name: true } }, shipment: { select: { code: true, mode: true } } }, orderBy: { createdAt: "desc" }, skip: (page - 1) * 30, take: 30 }),
    db.document.count({ where }),
    db.document.count({ where: { ...where, customerId: { not: null } } }),
    db.document.count({ where: { ...where, shipmentId: { not: null } } }),
  ]);
  return {
    total,
    page,
    stats: { total, customers, shipments },
    items: items.map((d) => ({
      id: d.id,
      reference: d.reference,
      filename: d.filename ?? "document",
      kind: d.kind,
      part: d.shipmentPart,
      size: d.size,
      contentType: d.contentType,
      customer: d.customer ? `${d.customer.ref} — ${d.customer.name}` : null,
      shipment: d.shipment ? `${displayShipmentCode(d.shipment.code)} · ${d.shipment.mode === "AIR" ? "Air" : "Sea"}` : null,
      createdAt: d.createdAt.toISOString(),
    })),
  };
}

export interface AdminUploadInput {
  target: "customer" | "shipment";
  customerId?: string;
  shipmentId?: string;
  reference?: string;
  filename?: string;
  /** "Upload Shipment": which paper it is — air: origin or transit AWB; container: one document. */
  part?: ShipmentDocPart;
  file: { buffer: Buffer; name: string; type: string };
}

/** The papers a shipment has, by mode (owner 2026-10-25). */
export const SHIPMENT_PARTS: Record<"AIR" | "SEA", ShipmentDocPart[]> = { AIR: ["ORIGIN_AWB", "TRANSIT_AWB"], SEA: ["CONTAINER"] };

export async function uploadAdminDocument(db: PrismaClient, actor: AuthzUser, input: AdminUploadInput) {
  requirePermission(actor, "documents:write");
  if (input.target === "customer") {
    if (!input.customerId) throw new ValidationError("Choose the customer");
    const customer = await db.customer.findUnique({ where: { id: input.customerId } });
    if (!customer) throw new ValidationError("Customer not found");
    // Same country scope as the Customers list: staff file papers only for their countries' customers.
    const countries = allowedCountries(actor);
    if (countries !== null && customer.country !== null && !countries.includes(customer.country)) {
      throw new AuthorizationError("Customer outside your scope");
    }
  } else {
    if (!input.shipmentId) throw new ValidationError("Choose the shipment");
    const sh = await db.shipment.findUnique({ where: { id: input.shipmentId } });
    if (!sh) throw new ValidationError("Shipment not found");
    requireScope(actor, { country: sh.originCountry, businessYear: sh.businessYear });
    if (!input.part || !SHIPMENT_PARTS[sh.mode === "AIR" ? "AIR" : "SEA"].includes(input.part)) throw new ValidationError(sh.mode === "AIR" ? "Choose origin AWB or transit AWB" : "Choose the container document");
  }
  const name = input.filename?.trim() || input.file.name;
  const doc = await uploadDocument(db, actor, {
    buffer: input.file.buffer,
    filename: name,
    declaredType: input.file.type,
    // Every upload here is a packing list / cargo document (owner 2026-10-27).
    kind: "CARGO_DOC",
    customerId: input.target === "customer" ? input.customerId : undefined,
    shipmentId: input.shipmentId || undefined,
  });
  const reference = input.reference?.trim().slice(0, 80) || null;
  const part = input.target === "shipment" ? input.part! : null;
  if (reference || part) await db.document.update({ where: { id: doc.id }, data: { reference, shipmentPart: part } });
  return doc;
}
