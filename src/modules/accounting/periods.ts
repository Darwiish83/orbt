import type { Prisma, PrismaClient } from "@prisma/client";
import { ValidationError } from "@/lib/errors";

type Db = PrismaClient | Prisma.TransactionClient;

/** True when the date falls in a closed period of the country (spec §11). */
export async function isClosed(db: Db, country: string, date: Date): Promise<boolean> {
  return !!(await db.periodClose.findFirst({ where: { country, fromDate: { lte: date }, toDate: { gte: date } } }));
}

/** Refuse any change dated inside a closed period (Finance and Accounting). */
export async function assertOpen(db: Db, country: string, date: Date) {
  if (await isClosed(db, country, date)) throw new ValidationError("This period is closed and cannot be changed");
}
