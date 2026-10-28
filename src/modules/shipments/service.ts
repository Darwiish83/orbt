import type { Prisma, PrismaClient, Shipment, ShipmentMode, ShipmentStatus } from "@prisma/client";
import { assertYearOpen } from "@/modules/accounting/periods";
import { AuthorizationError, ValidationError } from "@/lib/errors";
import { buildPage, normalizePage, type Page, type PageParams } from "@/lib/pagination";
import { logAudit } from "@/modules/audit/log";
import {
  allowedCountries,
  isCustomerPrincipal,
  requirePermission,
  requireScope,
  type AuthzUser,
} from "@/modules/authz/core";
import { DESTINATION, requireBusinessYear, requireOriginCountry } from "@/modules/reference/data";
import { lineMeasure } from "@/modules/finance/charges";
import { normalizeMixParts } from "./mix";
import { assertPricing } from "./pricing";
import { generateTrackingNumber, nextShipmentCode } from "./identifiers";
import { canTransition, publicStatusLabel } from "./stateMachine";

export interface CreateShipmentInput {
  mode: ShipmentMode;
  originCountry: string;
  /** Origin Code (city), e.g. Istanbul / Mumbai. */
  originCity?: string;
  /** Destination defaults to Mogadishu, Somalia (MGQ). */
  destCountry?: string;
  destCity?: string;
  destCode?: string;
  businessYear: number;
  shipDate?: Date;
  arrivalDate?: Date;
  /** Air waybill (plain text). */
  awbNumber?: string;
}

export async function createShipment(
  db: PrismaClient,
  actor: AuthzUser,
  input: CreateShipmentInput,
): Promise<Shipment> {
  requirePermission(actor, "shipments:write");
  // Only Air (W-n) and Sea/Container (C-n) shipments are created (owner decision Q2).
  if (input.mode === "ROAD") throw new ValidationError("Road shipments are not offered");
  const originCountry = await requireOriginCountry(db, input.originCountry);
  await requireBusinessYear(db, input.businessYear);
  requireScope(actor, { country: originCountry, businessYear: input.businessYear });
  await assertYearOpen(db, originCountry, input.businessYear);

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = await nextShipmentCode(db, input.mode, originCountry, input.businessYear);
    try {
      const shipment = await db.shipment.create({
        data: {
          code,
          mode: input.mode,
          originCountry,
          originCity: input.originCity,
          destCountry: input.destCountry ?? DESTINATION.country,
          destCity: input.destCity ?? DESTINATION.city,
          destCode: input.destCode ?? DESTINATION.code,
          shipDate: input.shipDate,
          arrivalDate: input.arrivalDate,
          businessYear: input.businessYear,
          createdByUserId: actor.id,
          ...(input.mode === "AIR" && { airDetail: { create: { awbNumber: input.awbNumber } } }),
        },
      });
      await logAudit(db, {
        actorUserId: actor.id,
        action: "shipment.create",
        entityType: "Shipment",
        entityId: shipment.id,
        metadata: { code, mode: input.mode },
      });
      return shipment;
    } catch (e) {
      if (attempt === 4) throw e;
    }
  }
  throw new Error("unreachable");
}

/** Load a shipment, enforcing access: a customer principal may only read a
 * shipment that carries one of their lines; staff need shipments:read + scope. */
export async function getShipmentForActor(db: PrismaClient, actor: AuthzUser, id: string) {
  const shipment = await db.shipment.findUnique({
    where: { id },
    include: { lines: true, events: { orderBy: { occurredAt: "asc" } }, airDetail: true, seaDetail: true, roadDetail: true },
  });
  if (!shipment) return null;

  if (isCustomerPrincipal(actor)) {
    const owns = shipment.lines.some((l) => l.customerId === actor.customerId);
    if (!owns) throw new AuthorizationError("Cross-customer access denied");
    return shipment;
  }

  requirePermission(actor, "shipments:read");
  requireScope(actor, { country: shipment.originCountry, businessYear: shipment.businessYear });
  return shipment;
}

export interface ListShipmentsFilters extends PageParams {
  status?: ShipmentStatus;
  mode?: ShipmentMode;
  country?: string;
  businessYear?: number;
}

export async function listShipments(
  db: PrismaClient,
  actor: AuthzUser,
  filters: ListShipmentsFilters = {},
): Promise<Page<Shipment>> {
  const { page, pageSize, skip, take } = normalizePage(filters);
  const where: Prisma.ShipmentWhereInput = {};

  if (isCustomerPrincipal(actor)) {
    where.lines = { some: { customerId: actor.customerId ?? "__none__" } };
  } else {
    requirePermission(actor, "shipments:read");
    const countries = allowedCountries(actor);
    if (countries !== null) where.originCountry = { in: countries };
  }

  if (filters.status) where.status = filters.status;
  if (filters.mode) where.mode = filters.mode;
  if (filters.country) {
    // A requested country narrows the staff scope; it must never widen it.
    if (!isCustomerPrincipal(actor)) requireScope(actor, { country: filters.country });
    where.originCountry = filters.country;
  }
  if (filters.businessYear) where.businessYear = filters.businessYear;

  const [items, total] = await Promise.all([
    db.shipment.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
    db.shipment.count({ where }),
  ]);
  return buildPage(items, total, page, pageSize);
}

/**
 * Change a shipment's status. Authorized (shipments:status) and scoped;
 * validates the transition against the state machine; records who/when via an
 * append-only ShipmentEvent, idempotent on idempotencyKey. Status + timestamps
 * + event are written in one transaction.
 */
export async function changeShipmentStatus(
  db: PrismaClient,
  actor: AuthzUser,
  shipmentId: string,
  toStatus: ShipmentStatus,
  opts: { note?: string; idempotencyKey?: string; notifyCustomers?: boolean } = {},
): Promise<Shipment> {
  requirePermission(actor, "shipments:status");

  const shipment = await db.shipment.findUnique({ where: { id: shipmentId } });
  if (!shipment) throw new ValidationError("Shipment not found");
  requireScope(actor, { country: shipment.originCountry, businessYear: shipment.businessYear });
  // A closed year is closed for everything, status included (ADR-031).
  await assertYearOpen(db, shipment.originCountry, shipment.businessYear);

  // Idempotency: an event already recorded under this key is a no-op.
  if (opts.idempotencyKey) {
    const existing = await db.shipmentEvent.findUnique({ where: { idempotencyKey: opts.idempotencyKey } });
    if (existing) return shipment;
  }

  if (!canTransition(shipment.mode, shipment.status, toStatus)) {
    throw new ValidationError(`Illegal transition: ${shipment.status} → ${toStatus}`);
  }

  const timestampPatch: Prisma.ShipmentUpdateInput = {};
  if (toStatus === "DEPARTED" && !shipment.departedAt) timestampPatch.departedAt = new Date();
  if (toStatus === "ARRIVED" && !shipment.arrivedAt) timestampPatch.arrivedAt = new Date();

  return db.$transaction(async (tx) => {
    const updated = await tx.shipment.update({
      where: { id: shipmentId },
      data: { status: toStatus, ...timestampPatch },
    });
    await tx.shipmentEvent.create({
      data: {
        shipmentId,
        type: "STATUS_CHANGE",
        status: toStatus,
        note: opts.note,
        actorUserId: actor.id,
        idempotencyKey: opts.idempotencyKey,
      },
    });
    // Spec §8: one change updates every customer in the shipment and tells them.
    let notified = 0;
    if (opts.notifyCustomers) {
      // Only customers whose cargo is priced know about the shipment yet (ADR-036).
      const customers = await tx.shipmentLine.findMany({ where: { shipmentId, rate: { not: null } }, distinct: ["customerId"], select: { customerId: true } });
      const code = shipment.publicCode; // customers know it by its SH- code (ADR-034)
      await tx.notification.createMany({
        data: customers.map((c) => ({
          audience: "CUSTOMER" as const,
          type: "status",
          customerId: c.customerId,
          title: "Shipment status updated",
          message: `${code}: ${publicStatusLabel(toStatus)}`,
          status: "SENT" as const,
          sentAt: new Date(),
          createdByUserId: actor.id,
        })),
      });
      notified = customers.length;
    }
    await logAudit(tx, {
      actorUserId: actor.id,
      action: "shipment.status_change",
      entityType: "Shipment",
      entityId: shipmentId,
      metadata: { from: shipment.status, to: toStatus, notified },
    });
    return updated;
  });
}

export async function assignTrackingNumber(
  db: PrismaClient,
  actor: AuthzUser,
  shipmentId: string,
): Promise<string> {
  requirePermission(actor, "shipments:write");
  const shipment = await db.shipment.findUnique({ where: { id: shipmentId } });
  if (!shipment) throw new ValidationError("Shipment not found");
  requireScope(actor, { country: shipment.originCountry, businessYear: shipment.businessYear });
  if (shipment.trackingNumber) return shipment.trackingNumber;

  const trackingNumber = await generateTrackingNumber(db, shipment.businessYear);
  await db.shipment.update({ where: { id: shipmentId }, data: { trackingNumber } });
  await logAudit(db, {
    actorUserId: actor.id,
    action: "shipment.tracking_assigned",
    entityType: "Shipment",
    entityId: shipmentId,
  });
  return trackingNumber;
}

type Amount = number | string;

export interface ShipmentLineInput {
  customerId: string;
  description?: string;
  packages?: number;
  chargeableWeightKg?: Amount;
  volumeCbm?: Amount;
  mixCount?: number;
  mixKg?: Amount;
  /** Numbered MIX boxes (Air). When given, mixCount and mixKg are derived from them. */
  mixParts?: { box: number; kg: Amount }[];
  rate?: Amount;
  qualityRate?: Amount;
  brandPcs?: number;
  brandRate?: Amount;
  fatura?: Amount;
  delivery?: Amount;
  other?: Amount;
  discount?: Amount;
  note?: string;
}

/** Derives the line's MIX count and KG from its numbered boxes, when given. */
export function withMix<T extends Partial<ShipmentLineInput>>(input: T): T {
  if (!input.mixParts) return input;
  const m = normalizeMixParts(input.mixParts.map((p) => ({ box: p.box, kg: String(p.kg) })));
  return { ...input, mixParts: m.parts, mixCount: m.mixCount || undefined, mixKg: m.mixKg?.toString() };
}

/**
 * Add a customer's cargo to a shipment. A customer may be added several times
 * (entries stack and are summed). Measure (KG + MIX KG for Air, CBM for Sea)
 * is computed server-side; validation rejects negative values. The shipment
 * stays At Origin Store until Operations changes it.
 */
export async function addShipmentLine(db: PrismaClient, actor: AuthzUser, shipmentId: string, input: ShipmentLineInput) {
  requirePermission(actor, "shipments:write");
  // The data team adds the cargo; the rates are pricing staff's (ADR-036).
  assertPricing(actor, input);
  const shipment = await db.shipment.findUnique({ where: { id: shipmentId } });
  if (!shipment) throw new ValidationError("Shipment not found");
  requireScope(actor, { country: shipment.originCountry, businessYear: shipment.businessYear });
  await assertYearOpen(db, shipment.originCountry, shipment.businessYear);
  if (shipment.mode === "AIR" && input.volumeCbm != null) throw new ValidationError("Air lines are measured in KG");
  if (shipment.mode === "SEA" && (input.chargeableWeightKg != null || input.mixKg != null || input.mixParts?.length)) {
    throw new ValidationError("Sea lines are measured in CBM");
  }
  input = withMix(input);
  for (const [k, v] of Object.entries({ packages: input.packages, mixCount: input.mixCount, brandPcs: input.brandPcs })) {
    if (v != null && (!Number.isInteger(v) || v < 0)) throw new ValidationError(`${k} must be a whole number ≥ 0`);
  }
  lineMeasure(shipment.mode, input); // throws on negative measures

  const customer = await db.customer.findUnique({ where: { id: input.customerId }, select: { id: true } });
  if (!customer) throw new ValidationError("Customer not found");

  const line = await db.shipmentLine.create({
    data: {
      shipmentId,
      customerId: input.customerId,
      description: input.description,
      packages: input.packages,
      chargeableWeightKg: input.chargeableWeightKg,
      volumeCbm: input.volumeCbm,
      mixCount: input.mixCount,
      mixKg: input.mixKg,
      mixParts: input.mixParts ? (input.mixParts as Prisma.InputJsonValue) : undefined,
      rate: input.rate,
      qualityRate: input.qualityRate,
      brandPcs: input.brandPcs,
      brandRate: input.brandRate,
      fatura: input.fatura,
      delivery: input.delivery,
      other: input.other,
      discount: input.discount,
      note: input.note,
    },
  });
  await logAudit(db, {
    actorUserId: actor.id,
    action: "shipment.line_add",
    entityType: "Shipment",
    entityId: shipmentId,
    metadata: { lineId: line.id, customerId: input.customerId },
  });
  return line;
}
