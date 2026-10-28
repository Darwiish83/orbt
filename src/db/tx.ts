import type { PrismaClient } from "@prisma/client";

/**
 * Run `fn` in one transaction. A transaction client (e.g. the customer
 * connection from `withCustomerDb`) has no `$transaction`: it is already
 * inside one, so `fn` simply runs on it.
 */
export async function inTransaction<T>(db: PrismaClient, fn: (tx: PrismaClient) => Promise<T>): Promise<T> {
  if (typeof (db as { $transaction?: unknown }).$transaction !== "function") return fn(db);
  return db.$transaction((tx) => fn(tx as unknown as PrismaClient));
}
