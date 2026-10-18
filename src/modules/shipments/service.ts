import type { Prisma, PrismaClient, Shipment, ShipmentMode, ShipmentStatus } from "@prisma/client";
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
import { generateTrackingNumber, nextShipmentCode } from "./identifiers";
import { canTransition } from "./stateMachine";

export interface CreateShipmentInput {
  mode: ShipmentMode;
  originCountry: string;
  originCity?: string;
  destCountry?: string;
  destCity?: string;
  businessYear: number;
}

export async function createShipment(
  db: PrismaClient,
  actor: AuthzUser,
  input: CreateShipmentInput,
): Promise<Shipment> {
  requirePermission(actor, "shipments:write");
  requireScope(actor, { country: input.originCountry, businessYear: input.businessYear });

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = await nextShipmentCode(db, input.mode, input.originCountry, input.businessYear);
    try {
      const shipment = await db.shipment.create({
        data: {
          code,
          mode: input.mode,
          originCountry: input.originCountry,
          originCity: input.originCity,
          destCountry: input.destCountry,
          destCity: input.destCity,
          businessYear: input.businessYear,
          createdByUserId: actor.id,
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
  if (filters.country) where.originCountry = filters.country;
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
  opts: { note?: string; idempotencyKey?: string } = {},
): Promise<Shipment> {
  requirePermission(actor, "shipments:status");

  const shipment = await db.shipment.findUnique({ where: { id: shipmentId } });
  if (!shipment) throw new ValidationError("Shipment not found");
  requireScope(actor, { country: shipment.originCountry, businessYear: shipment.businessYear });

  // Idempotency: an event already recorded under this key is a no-op.
  if (opts.idempotencyKey) {
    const existing = await db.shipmentEvent.findUnique({ where: { idempotencyKey: opts.idempotencyKey } });
    if (existing) return shipment;
  }

  if (!canTransition(shipment.status, toStatus)) {
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
    await logAudit(tx, {
      actorUserId: actor.id,
      action: "shipment.status_change",
      entityType: "Shipment",
      entityId: shipmentId,
      metadata: { from: shipment.status, to: toStatus },
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

export async function addShipmentLine(
  db: PrismaClient,
  actor: AuthzUser,
  shipmentId: string,
  input: { customerId: string; description?: string; packages?: number; chargeableWeightKg?: number; volumeCbm?: number },
) {
  requirePermission(actor, "shipments:write");
  const shipment = await db.shipment.findUnique({ where: { id: shipmentId } });
  if (!shipment) throw new ValidationError("Shipment not found");
  requireScope(actor, { country: shipment.originCountry, businessYear: shipment.businessYear });

  return db.shipmentLine.create({
    data: {
      shipmentId,
      customerId: input.customerId,
      description: input.description,
      packages: input.packages,
      chargeableWeightKg: input.chargeableWeightKg,
      volumeCbm: input.volumeCbm,
    },
  });
}
