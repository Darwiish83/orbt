import { Prisma } from "@prisma/client";
import { ValidationError } from "@/lib/errors";
import { dec, sum } from "@/modules/finance/money";

/**
 * MIX boxes (design LineForm): an air shipment has numbered mixed boxes
 * (MIX 1, MIX 2 …) shared by several customers. A customer line says which
 * boxes its goods are in and the KG in each; the same box may hold the
 * customer's goods more than once ("Add again"), so a line stores parts.
 * The line's mixCount / mixKg are derived from the parts on the server.
 */
export interface MixPart {
  box: number;
  kg: string;
}

const MAX_BOX = 999;

/** Reads the stored JSON; anything malformed is ignored (never trusted). */
export function readMixParts(json: Prisma.JsonValue | null | undefined): MixPart[] {
  if (!Array.isArray(json)) return [];
  return json.flatMap((p) => {
    if (!p || typeof p !== "object" || Array.isArray(p)) return [];
    const box = Number((p as Record<string, unknown>).box);
    const kg = String((p as Record<string, unknown>).kg ?? "");
    return Number.isInteger(box) && box >= 1 && /^\d+(\.\d+)?$/.test(kg) ? [{ box, kg }] : [];
  });
}

/** Validates the parts typed in the form and derives the line's MIX count and KG. */
export function normalizeMixParts(parts: { box: number; kg: string | number }[]) {
  const clean = parts.map((p) => {
    if (!Number.isInteger(p.box) || p.box < 1 || p.box > MAX_BOX) throw new ValidationError("Choose a MIX box");
    const raw = String(p.kg).trim();
    if (!raw) throw new ValidationError("Enter the KG for each MIX");
    let kg: Prisma.Decimal;
    try {
      kg = dec(raw);
    } catch {
      throw new ValidationError("Enter the KG for each MIX");
    }
    if (!kg.isFinite() || kg.lte(0)) throw new ValidationError("Enter the KG for each MIX");
    return { box: p.box, kg: kg.toDecimalPlaces(3).toString() };
  });
  clean.sort((a, b) => a.box - b.box);
  return {
    parts: clean,
    mixCount: clean.length,
    mixKg: clean.length ? sum(clean.map((p) => dec(p.kg))).toDecimalPlaces(3) : null,
  };
}

/**
 * Packages of a set of lines: every customer's boxes plus each MIX box once
 * (a shared box is one package however many customers are in it). Older
 * lines saved before numbered boxes count their MIX count as before.
 */
export function packagesOf(lines: { packages: number | null; mixCount: number | null; mixParts: Prisma.JsonValue | null }[]) {
  const boxes = new Set<number>();
  let n = 0;
  for (const l of lines) {
    n += l.packages ?? 0;
    const parts = readMixParts(l.mixParts);
    if (parts.length) parts.forEach((p) => boxes.add(p.box));
    else n += l.mixCount ?? 0;
  }
  return n + boxes.size;
}
