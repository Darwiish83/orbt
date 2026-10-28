import { Prisma, PrismaClient } from "@prisma/client";

/**
 * Database clients (ADR-029).
 *
 *  - `prisma` connects as `orbit_runtime` (DATABASE_URL): the app's staff side
 *    and background work. Least privilege: no DDL, no TRUNCATE, no deleting
 *    financial history; triggers guard the rest.
 *  - `withCustomerDb(customerId, fn)` runs `fn` on a connection as
 *    `orbit_portal` (PORTAL_DATABASE_URL) inside one transaction whose
 *    `app.customer_id` is the signed-in customer. Row-Level Security then
 *    returns only that customer's rows — even if a query forgets a filter.
 *    Without the setting the portal role sees nothing (fail closed).
 *
 * Cached on globalThis in non-production to avoid exhausting connections
 * during dev hot-reload.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient; portal?: PrismaClient };
const log: Prisma.LogLevel[] = process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"];

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ log });

/** The customer connection itself (for the production boot check only). */
export function portalDb(): PrismaClient {
  return portalClient();
}

function portalClient(): PrismaClient {
  if (globalForPrisma.portal) return globalForPrisma.portal;
  const url = process.env.PORTAL_DATABASE_URL;
  if (!url) throw new Error("PORTAL_DATABASE_URL is not configured (run scripts/db-setup-roles.ts)");
  const client = new PrismaClient({ log, datasources: { db: { url } } });
  globalForPrisma.portal = client;
  return client;
}

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

/**
 * Run customer-facing database work under the customer's own identity. The
 * callback receives a transaction client; services typed for PrismaClient
 * accept it (they only use model queries, not nested `$transaction`).
 */
export async function withCustomerDb<T>(customerId: string, fn: (db: PrismaClient) => Promise<T>): Promise<T> {
  if (!customerId) throw new Error("withCustomerDb needs a customer id");
  return portalClient().$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.customer_id', ${customerId}, true)`;
      return fn(tx as unknown as PrismaClient);
    },
    { timeout: 15_000 },
  );
}
