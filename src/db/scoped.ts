import type { PrismaClient } from "@prisma/client";
import type { AuthzUser } from "@/modules/authz/core";
import { prisma, withCustomerDb } from "./client";

/**
 * The right database connection for this signed-in user (ADR-029): customers
 * always go through the portal role + Row-Level Security; staff use the
 * runtime role. Use this for every read or write a customer can reach.
 */
export function withUserDb<T>(user: AuthzUser, fn: (db: PrismaClient) => Promise<T>): Promise<T> {
  return user.customerId ? withCustomerDb(user.customerId, fn) : fn(prisma);
}
