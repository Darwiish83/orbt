import type { Prisma, PrismaClient } from "@prisma/client";
import { ValidationError } from "@/lib/errors";

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * The first business year whose data is in the system (owner 2026-10-25).
 * Years before it only have an opening balance typed in Accounting; years
 * from it on are carried automatically when the year is closed.
 */
export const SYSTEM_START_YEAR = 2026;

/** Only periods that were not reopened count. */
const live = { reopenedAt: null };

/** True when the date falls in a closed period of the country (spec §11). */
export async function isClosed(db: Db, country: string, date: Date): Promise<boolean> {
  return !!(await db.periodClose.findFirst({ where: { country, fromDate: { lte: date }, toDate: { gte: date }, ...live } }));
}

/**
 * True when the country's business year is closed (owner 2026-10-25). A closed
 * year cannot change at all, whatever the date: W-48 of 2026 finished in
 * January 2027 still belongs to 2026.
 */
export async function isYearClosed(db: Db, country: string, year: number): Promise<boolean> {
  return !!(await db.periodClose.findFirst({ where: { country, year, period: "YEAR", ...live } }));
}

/** Refuse any change dated inside a closed period (Finance and Accounting). */
export async function assertOpen(db: Db, country: string, date: Date) {
  if (await isClosed(db, country, date)) throw new ValidationError("This period is closed and cannot be changed");
}

/** Refuse any change to a closed business year. */
export async function assertYearOpen(db: Db, country: string, year: number) {
  if (await isYearClosed(db, country, year)) throw new ValidationError("This year is closed and cannot be changed");
}

/** Both checks: the record's business year and its date. */
export async function assertOpenFor(db: Db, country: string, at: { year: number; date: Date }) {
  await assertYearOpen(db, country, at.year);
  await assertOpen(db, country, at.date);
}
