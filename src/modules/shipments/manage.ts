import type { Prisma, PrismaClient, Shipment, ShipmentLine } from "@prisma/client";
import { ValidationError } from "@/lib/errors";
import { logAudit } from "@/modules/audit/log";
import { displayShipmentCode } from "@/modules/authz/adminScope";
import { requirePermission, requireScope, type AuthzUser } from "@/modules/authz/core";
import { lineMeasure, lineTotal } from "@/modules/finance/charges";
import { dec, round2, sum } from "@/modules/finance/money";
import { publicStatusLabel, transitionsFor } from "./stateMachine";
import type { ShipmentLineInput } from "./service";

/**
 * Admin → Shipments (spec B6 / revised prompt §7): list with totals, shipment
 * detail with the customer list, edits. Scoped to the shipment's origin
 * country + business year. Status is NOT changed here (Operations only).
 */

const s = (v: Prisma.Decimal | null | undefined) => (v == null ? "0" : v.toString());

async function scoped(db: PrismaClient | Prisma.TransactionClient, actor: AuthzUser, shipmentId: string, permission: Parameters<typeof requirePermission>[1]) {
  requirePermission(actor, permission);
  const sh = await db.shipment.findUnique({ where: { id: shipmentId }, include: { airDetail: true, seaDetail: true } });
  if (!sh) throw new ValidationError("Shipment not found");
  requireScope(actor, { country: sh.originCountry, businessYear: sh.businessYear });
  return sh;
}

/** The amount a customer owes for a shipment: the live invoice total when
 * invoiced, otherwise the line charges (ADR-013). */
function amountFor(mode: Shipment["mode"], lines: ShipmentLine[], invoiceTotal: Prisma.Decimal | undefined) {
  return invoiceTotal ?? round2(sum(lines.map((l) => lineTotal(mode, l))));
}

export interface AdminShipmentRow {
  id: string;
  code: string;
  mode: "AIR" | "SEA";
  shipDate: string | null;
  arrivalDate: string | null;
  originCountry: string;
  originCity: string | null;
  destCountry: string | null;
  destCity: string | null;
  status: Shipment["status"];
  awb: string | null;
  customers: number;
  packages: number;
  measure: string;
  amount: string;
}

export async function listAdminShipments(
  db: PrismaClient,
  actor: AuthzUser,
  scope: { country: string; year: number },
  filters: { mode: "AIR" | "SEA"; q?: string },
) {
  requirePermission(actor, "shipments:read");
  requireScope(actor, { country: scope.country, businessYear: scope.year });
  const q = filters.q?.trim();
  const shipments = await db.shipment.findMany({
    where: {
      originCountry: scope.country,
      businessYear: scope.year,
      mode: filters.mode,
      ...(q
        ? {
            OR: [
              { code: { contains: q, mode: "insensitive" } },
              { originCity: { contains: q, mode: "insensitive" } },
              { airDetail: { awbNumber: { contains: q, mode: "insensitive" } } },
              { seaDetail: { blNumber: { contains: q, mode: "insensitive" } } },
            ],
          }
        : {}),
    },
    include: { lines: true, airDetail: true, seaDetail: true, invoices: { where: { status: { not: "VOID" } } } },
    take: 500,
  });
  const seq = (code: string) => parseInt(displayShipmentCode(code).replace(/^\D+-/, ""), 10) || 0;
  const rows: AdminShipmentRow[] = shipments
    .sort((a, b) => seq(a.code) - seq(b.code))
    .map((sh) => {
      const byCustomer = new Map<string, ShipmentLine[]>();
      for (const l of sh.lines) byCustomer.set(l.customerId, [...(byCustomer.get(l.customerId) ?? []), l]);
      const amount = sum(
        [...byCustomer.entries()].map(([cid, ls]) => amountFor(sh.mode, ls, sh.invoices.find((i) => i.customerId === cid)?.total)),
      );
      return {
        id: sh.id,
        code: displayShipmentCode(sh.code),
        mode: sh.mode as "AIR" | "SEA",
        shipDate: sh.shipDate?.toISOString() ?? null,
        arrivalDate: sh.arrivalDate?.toISOString() ?? null,
        originCountry: sh.originCountry,
        originCity: sh.originCity,
        destCountry: sh.destCountry,
        destCity: sh.destCity,
        status: sh.status,
        awb: sh.mode === "AIR" ? (sh.airDetail?.awbNumber ?? null) : (sh.seaDetail?.blNumber ?? null),
        customers: byCustomer.size,
        packages: sh.lines.reduce((n, l) => n + (l.packages ?? 0) + (l.mixCount ?? 0), 0),
        measure: sum(sh.lines.map((l) => lineMeasure(sh.mode, l))).toString(),
        amount: round2(amount).toString(),
      };
    });
  const add = (k: "measure" | "amount") => round2(sum(rows.map((r) => dec(r[k])))).toString();
  return {
    rows,
    totals: {
      shipments: rows.length,
      packages: rows.reduce((n, r) => n + r.packages, 0),
      measure: add("measure"),
      amount: add("amount"),
    },
  };
}

export interface ShipmentLineRow {
  id: string;
  customerId: string;
  customerRef: string;
  customerName: string;
  packages: number;
  boxMeasure: string;
  mixCount: number;
  mixMeasure: string;
  measure: string;
  rate: string;
  qualityRate: string;
  brandPcs: number;
  brandRate: string;
  fatura: string;
  delivery: string;
  amount: string;
  notifiedAt: string | null;
  invoiced: boolean;
}

export async function getAdminShipment(db: PrismaClient, actor: AuthzUser, shipmentId: string) {
  const sh = await scoped(db, actor, shipmentId, "shipments:read");
  const [lines, invoices] = await Promise.all([
    db.shipmentLine.findMany({ where: { shipmentId }, include: { customer: true }, orderBy: { createdAt: "asc" } }),
    db.invoice.findMany({ where: { shipmentId, status: { not: "VOID" } } }),
  ]);
  const air = sh.mode === "AIR";
  const rows: ShipmentLineRow[] = lines.map((l) => ({
    id: l.id,
    customerId: l.customerId,
    customerRef: l.customer.ref,
    customerName: l.customer.name,
    packages: l.packages ?? 0,
    boxMeasure: s(air ? l.chargeableWeightKg : l.volumeCbm),
    mixCount: l.mixCount ?? 0,
    mixMeasure: s(l.mixKg),
    measure: lineMeasure(sh.mode, l).toString(),
    rate: s(l.rate),
    qualityRate: s(l.qualityRate),
    brandPcs: l.brandPcs ?? 0,
    brandRate: s(l.brandRate),
    fatura: s(l.fatura),
    delivery: s(l.delivery),
    amount: lineTotal(sh.mode, l).toString(),
    notifiedAt: l.notifiedAt?.toISOString() ?? null,
    invoiced: invoices.some((i) => i.customerId === l.customerId),
  }));
  const totalMeasure = sum(lines.map((l) => lineMeasure(sh.mode, l)));
  const awbKg = sh.airDetail?.awbKg ?? null;
  const byCustomer = new Map<string, ShipmentLine[]>();
  for (const l of lines) byCustomer.set(l.customerId, [...(byCustomer.get(l.customerId) ?? []), l]);
  const totalAmount = sum([...byCustomer.entries()].map(([cid, ls]) => amountFor(sh.mode, ls, invoices.find((i) => i.customerId === cid)?.total)));
  return {
    shipment: {
      id: sh.id,
      code: displayShipmentCode(sh.code),
      mode: sh.mode as "AIR" | "SEA",
      status: sh.status,
      originCountry: sh.originCountry,
      originCity: sh.originCity,
      destCountry: sh.destCountry,
      destCity: sh.destCity,
      destCode: sh.destCode,
      shipDate: sh.shipDate?.toISOString().slice(0, 10) ?? null,
      arrivalDate: sh.arrivalDate?.toISOString().slice(0, 10) ?? null,
      awb: (air ? sh.airDetail?.awbNumber : sh.seaDetail?.blNumber) ?? null,
      businessYear: sh.businessYear,
    },
    lines: rows,
    totals: {
      customers: byCustomer.size,
      packages: lines.reduce((n, l) => n + (l.packages ?? 0) + (l.mixCount ?? 0), 0),
      measure: totalMeasure.toString(),
      awbKg: awbKg ? awbKg.toString() : null,
      // Total KG − AWB KG (Air): green at 0, red otherwise.
      difference: awbKg ? totalMeasure.minus(awbKg).toString() : null,
      amount: round2(totalAmount).toString(),
    },
  };
}

export interface UpdateShipmentInput {
  shipDate?: Date | null;
  arrivalDate?: Date | null;
  originCity?: string | null;
  destCity?: string | null;
  destCode?: string | null;
  awb?: string | null;
}

/** Edit Shipment. Mode, country and year are fixed once created (they define
 * the W-n / C-n number); status is changed in Operations. */
export async function updateShipment(db: PrismaClient, actor: AuthzUser, shipmentId: string, input: UpdateShipmentInput) {
  const sh = await scoped(db, actor, shipmentId, "shipments:write");
  if (input.shipDate && input.arrivalDate && input.arrivalDate < input.shipDate) {
    throw new ValidationError("Arrival cannot be before the shipment date");
  }
  const clean = (v: string | null | undefined) => (v === undefined ? undefined : v?.trim().slice(0, 120) || null);
  const updated = await db.$transaction(async (tx) => {
    const u = await tx.shipment.update({
      where: { id: shipmentId },
      data: {
        shipDate: input.shipDate,
        arrivalDate: input.arrivalDate,
        originCity: clean(input.originCity),
        destCity: clean(input.destCity),
        destCode: clean(input.destCode),
      },
    });
    if (input.awb !== undefined) {
      const awb = clean(input.awb);
      if (sh.mode === "AIR") await tx.airDetail.upsert({ where: { shipmentId }, create: { shipmentId, awbNumber: awb }, update: { awbNumber: awb } });
      else await tx.seaDetail.upsert({ where: { shipmentId }, create: { shipmentId, blNumber: awb }, update: { blNumber: awb } });
    }
    await logAudit(tx, { actorUserId: actor.id, action: "shipment.update", entityType: "Shipment", entityId: shipmentId });
    return u;
  });
  return updated;
}

/** AWB KG (Air): the airline's weight, typed in on the shipment detail. */
export async function setAwbKg(db: PrismaClient, actor: AuthzUser, shipmentId: string, awbKg: string | null) {
  const sh = await scoped(db, actor, shipmentId, "shipments:write");
  if (sh.mode !== "AIR") throw new ValidationError("AWB KG applies to air shipments");
  const v = awbKg === null || awbKg === "" ? null : dec(awbKg);
  if (v && v.isNegative()) throw new ValidationError("AWB KG cannot be negative");
  await db.airDetail.upsert({ where: { shipmentId }, create: { shipmentId, awbKg: v }, update: { awbKg: v } });
  await logAudit(db, { actorUserId: actor.id, action: "shipment.awb_kg", entityType: "Shipment", entityId: shipmentId, metadata: { awbKg: v?.toString() ?? null } });
}

/**
 * Delete Shipment — only an empty shipment still At Origin Store (one created
 * by mistake). Anything with customers, invoices or movement history is kept.
 */
export async function deleteShipment(db: PrismaClient, actor: AuthzUser, shipmentId: string) {
  const sh = await scoped(db, actor, shipmentId, "shipments:manage");
  const [lines, invoices, events] = await Promise.all([
    db.shipmentLine.count({ where: { shipmentId } }),
    db.invoice.count({ where: { shipmentId } }),
    db.shipmentEvent.count({ where: { shipmentId } }),
  ]);
  if (lines > 0) throw new ValidationError("Remove the shipment's customers first");
  if (invoices > 0 || events > 0 || sh.status !== "AT_ORIGIN_STORE") {
    throw new ValidationError("This shipment has history and cannot be deleted");
  }
  await db.$transaction(async (tx) => {
    await tx.shipment.delete({ where: { id: shipmentId } });
    await logAudit(tx, {
      actorUserId: actor.id,
      action: "shipment.delete",
      entityType: "Shipment",
      entityId: shipmentId,
      metadata: { code: sh.code, mode: sh.mode, country: sh.originCountry, year: sh.businessYear },
    });
  });
}

function checkLine(mode: Shipment["mode"], input: Partial<ShipmentLineInput>) {
  if (mode === "AIR" && input.volumeCbm != null) throw new ValidationError("Air lines are measured in KG");
  if (mode === "SEA" && (input.chargeableWeightKg != null || input.mixKg != null)) throw new ValidationError("Sea lines are measured in CBM");
  for (const v of [input.packages, input.mixCount, input.brandPcs]) {
    if (v != null && (!Number.isInteger(v) || v < 0)) throw new ValidationError("Counts must be whole numbers");
  }
  lineTotal(mode, input); // throws on negative values
}

/** Edit a customer's cargo line. The invoice's Actual measure follows it. */
export async function updateShipmentLine(db: PrismaClient, actor: AuthzUser, lineId: string, input: Omit<ShipmentLineInput, "customerId">) {
  const line = await db.shipmentLine.findUnique({ where: { id: lineId } });
  if (!line) throw new ValidationError("Line not found");
  const sh = await scoped(db, actor, line.shipmentId, "shipments:write");
  checkLine(sh.mode, input);
  return db.$transaction(async (tx) => {
    const updated = await tx.shipmentLine.update({
      where: { id: lineId },
      data: {
        packages: input.packages ?? null,
        chargeableWeightKg: input.chargeableWeightKg ?? null,
        volumeCbm: input.volumeCbm ?? null,
        mixCount: input.mixCount ?? null,
        mixKg: input.mixKg ?? null,
        rate: input.rate ?? null,
        qualityRate: input.qualityRate ?? null,
        brandPcs: input.brandPcs ?? null,
        brandRate: input.brandRate ?? null,
        fatura: input.fatura ?? null,
        delivery: input.delivery ?? null,
        other: input.other ?? null,
        discount: input.discount ?? null,
        note: input.note ?? null,
      },
    });
    const all = await tx.shipmentLine.findMany({ where: { shipmentId: line.shipmentId, customerId: line.customerId } });
    await tx.invoice.updateMany({
      where: { shipmentId: line.shipmentId, customerId: line.customerId, status: { not: "VOID" } },
      data: { actualMeasure: sum(all.map((l) => lineMeasure(sh.mode, l))) },
    });
    await logAudit(tx, { actorUserId: actor.id, action: "shipment.line_update", entityType: "Shipment", entityId: line.shipmentId, metadata: { lineId } });
    return updated;
  });
}

/** Remove a cargo line. A customer who already has an invoice for the
 * shipment keeps at least one line (delete the invoice first). */
export async function deleteShipmentLine(db: PrismaClient, actor: AuthzUser, lineId: string) {
  const line = await db.shipmentLine.findUnique({ where: { id: lineId } });
  if (!line) throw new ValidationError("Line not found");
  await scoped(db, actor, line.shipmentId, "shipments:write");
  const [others, invoiced] = await Promise.all([
    db.shipmentLine.count({ where: { shipmentId: line.shipmentId, customerId: line.customerId, id: { not: lineId } } }),
    db.invoice.count({ where: { shipmentId: line.shipmentId, customerId: line.customerId, status: { not: "VOID" } } }),
  ]);
  if (invoiced && others === 0) throw new ValidationError("This customer is invoiced; delete the invoice in Finance first");
  await db.$transaction(async (tx) => {
    await tx.shipmentLine.delete({ where: { id: lineId } });
    await logAudit(tx, {
      actorUserId: actor.id,
      action: "shipment.line_delete",
      entityType: "Shipment",
      entityId: line.shipmentId,
      metadata: { lineId, customerId: line.customerId, packages: line.packages, kg: line.chargeableWeightKg?.toString(), cbm: line.volumeCbm?.toString() },
    });
  });
}

/** "Notification" on a customer row: tells the customer their cargo is in the
 * shipment and its current status. */
export async function notifyShipmentLine(db: PrismaClient, actor: AuthzUser, lineId: string) {
  const line = await db.shipmentLine.findUnique({ where: { id: lineId } });
  if (!line) throw new ValidationError("Line not found");
  const sh = await scoped(db, actor, line.shipmentId, "shipments:write");
  const code = displayShipmentCode(sh.code);
  await db.$transaction(async (tx) => {
    await tx.notification.create({
      data: {
        audience: "CUSTOMER",
        type: "shipment",
        customerId: line.customerId,
        title: "Shipment update",
        message: `Your cargo is in ${code} (${sh.mode === "AIR" ? "Air" : "Sea"}, ${sh.originCountry} → Mogadishu). Status: ${publicStatusLabel(sh.status)}.`,
        status: "SENT",
        sentAt: new Date(),
        createdByUserId: actor.id,
      },
    });
    await tx.shipmentLine.updateMany({ where: { shipmentId: sh.id, customerId: line.customerId }, data: { notifiedAt: new Date() } });
    await logAudit(tx, { actorUserId: actor.id, action: "shipment.notify", entityType: "Shipment", entityId: sh.id, metadata: { customerId: line.customerId } });
  });
}

/** Customer picker: type a name or reference (spec §7). */
export async function searchCustomers(db: PrismaClient, actor: AuthzUser, q: string) {
  requirePermission(actor, "customers:read");
  const term = q.trim();
  const customers = await db.customer.findMany({
    where: {
      status: "ACTIVE",
      ...(term
        ? {
            OR: [
              { ref: { contains: term, mode: "insensitive" } },
              { name: { contains: term, mode: "insensitive" } },
              { company: { contains: term, mode: "insensitive" } },
              { phone: { contains: term } },
            ],
          }
        : {}),
    },
    orderBy: { ref: "asc" },
    take: 20,
    select: { id: true, ref: true, name: true, company: true },
  });
  return customers;
}

export interface OperationsRow {
  id: string;
  code: string;
  mode: "AIR" | "SEA";
  status: Shipment["status"];
  originCountry: string;
  originCity: string | null;
  destCountry: string | null;
  destCity: string | null;
  customers: string[];
  packages: number;
  /** Statuses this shipment may move to next (state machine, ADR-017). */
  next: Shipment["status"][];
}

/** Operations (spec §8): every shipment of the country + year, with the
 * customers on it and the statuses it may move to. */
export async function listOperations(
  db: PrismaClient,
  actor: AuthzUser,
  scope: { country: string; year: number },
  filters: { mode?: "AIR" | "SEA"; status?: Shipment["status"]; q?: string } = {},
) {
  requirePermission(actor, "operations:read");
  requireScope(actor, { country: scope.country, businessYear: scope.year });
  const all = await db.shipment.findMany({
    where: { originCountry: scope.country, businessYear: scope.year, mode: { in: ["AIR", "SEA"] } },
    include: { lines: { include: { customer: { select: { name: true } } } }, airDetail: true, seaDetail: true },
    take: 1000,
  });
  const q = filters.q?.trim().toLowerCase();
  const seq = (code: string) => parseInt(displayShipmentCode(code).replace(/^\D+-/, ""), 10) || 0;
  const rows: OperationsRow[] = all
    .filter((sh) => (!filters.mode || sh.mode === filters.mode) && (!filters.status || sh.status === filters.status))
    .filter((sh) => !q || [sh.code, sh.originCity ?? "", sh.destCity ?? "", sh.airDetail?.awbNumber ?? "", sh.seaDetail?.blNumber ?? ""].join(" ").toLowerCase().includes(q))
    .sort((a, b) => (a.mode === b.mode ? seq(a.code) - seq(b.code) : a.mode === "AIR" ? -1 : 1))
    .map((sh) => ({
      id: sh.id,
      code: displayShipmentCode(sh.code),
      mode: sh.mode as "AIR" | "SEA",
      status: sh.status,
      originCountry: sh.originCountry,
      originCity: sh.originCity,
      destCountry: sh.destCountry,
      destCity: sh.destCity,
      customers: [...new Set(sh.lines.map((l) => l.customer.name))],
      packages: sh.lines.reduce((n, l) => n + (l.packages ?? 0) + (l.mixCount ?? 0), 0),
      next: transitionsFor(sh.mode)[sh.status],
    }));
  return {
    rows,
    stats: {
      total: all.length,
      air: all.filter((x) => x.mode === "AIR").length,
      sea: all.filter((x) => x.mode === "SEA").length,
      packages: all.reduce((n, sh) => n + sh.lines.reduce((m, l) => m + (l.packages ?? 0) + (l.mixCount ?? 0), 0), 0),
    },
  };
}
