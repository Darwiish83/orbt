import type { Prisma, PrismaClient } from "@prisma/client";
import { ValidationError } from "@/lib/errors";

type Db = PrismaClient | Prisma.TransactionClient;

/** Owner spec §0 — banks shown with their logos (account numbers as given). */
export const BANKS = [
  { name: "Salaam Bank", accountNumber: "37215407", logo: "/banks/salaam.png", isCash: false, sortOrder: 1 },
  { name: "Dahabshiil Bank", accountNumber: "365258411", logo: "/banks/dahabshiil.png", isCash: false, sortOrder: 2 },
  { name: "Premier Bank", accountNumber: "25687140", logo: "/banks/premier.png", isCash: false, sortOrder: 3 },
  { name: "Cash", accountNumber: null, logo: null, isCash: true, sortOrder: 4 },
] as const;

/** Starting origin countries (more are added in Settings). Destination is Somalia. */
export const COUNTRIES = [
  { name: "Turkey", iso2: "tr", isOrigin: true },
  { name: "India", iso2: "in", isOrigin: true },
  { name: "Somalia", iso2: "so", isOrigin: false },
] as const;

export const DEFAULT_YEAR = 2026;

/** Fixed destination for every shipment (spec §0). */
export const DESTINATION = { country: "Somalia", city: "Mogadishu", code: "MGQ" } as const;

/** Idempotently insert the reference rows. Never overwrites admin edits. */
export async function seedReferenceData(db: PrismaClient): Promise<void> {
  for (const b of BANKS) {
    await db.bank.upsert({ where: { name: b.name }, create: { ...b }, update: {} });
  }
  for (const c of COUNTRIES) {
    await db.country.upsert({ where: { iso2: c.iso2 }, create: { ...c }, update: {} });
  }
  const anyCurrent = await db.businessYear.findFirst({ where: { isCurrent: true } });
  await db.businessYear.upsert({
    where: { year: DEFAULT_YEAR },
    create: { year: DEFAULT_YEAR, isCurrent: !anyCurrent },
    update: {},
  });
}

/** Canonical name of an active origin country, or a ValidationError. */
export async function requireOriginCountry(db: Db, name: string): Promise<string> {
  const country = await db.country.findFirst({
    where: { name: { equals: name.trim(), mode: "insensitive" }, active: true, isOrigin: true },
  });
  if (!country) throw new ValidationError(`Unknown or inactive origin country: ${name}`);
  return country.name;
}

/** The year must exist in Settings → Years. */
export async function requireBusinessYear(db: Db, year: number): Promise<number> {
  const found = await db.businessYear.findUnique({ where: { year } });
  if (!found) throw new ValidationError(`Business year ${year} has not been created`);
  return year;
}
