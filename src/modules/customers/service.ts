import type { Customer, PrismaClient } from "@prisma/client";
import { buildPage, normalizePage, type Page, type PageParams } from "@/lib/pagination";
import { logAudit } from "@/modules/audit/log";
import {
  allowedCountries,
  assertCustomerAccess,
  isCustomerPrincipal,
  requirePermission,
  type AuthzUser,
} from "@/modules/authz/core";
import { nextCustomerRef } from "./ref";

export interface CreateCustomerInput {
  name: string;
  phone?: string;
  email?: string;
  country?: string;
}

export async function createCustomer(
  db: PrismaClient,
  actor: AuthzUser,
  input: CreateCustomerInput,
): Promise<Customer> {
  requirePermission(actor, "customers:write");

  // Retry on the rare concurrent ref collision.
  for (let attempt = 0; attempt < 5; attempt++) {
    const ref = await nextCustomerRef(db);
    try {
      const customer = await db.customer.create({
        data: {
          ref,
          name: input.name,
          phone: input.phone,
          email: input.email?.toLowerCase(),
          country: input.country,
          createdByUserId: actor.id,
        },
      });
      await logAudit(db, {
        actorUserId: actor.id,
        action: "customer.create",
        entityType: "Customer",
        entityId: customer.id,
        metadata: { ref },
      });
      return customer;
    } catch (e) {
      if (attempt === 4) throw e;
    }
  }
  throw new Error("unreachable");
}

export async function getCustomer(
  db: PrismaClient,
  actor: AuthzUser,
  id: string,
): Promise<Customer | null> {
  assertCustomerAccess(actor, id, "customers:read");
  return db.customer.findUnique({ where: { id } });
}

export interface ListCustomersFilters extends PageParams {
  query?: string;
  country?: string;
  status?: Customer["status"];
}

export async function listCustomers(
  db: PrismaClient,
  actor: AuthzUser,
  filters: ListCustomersFilters = {},
): Promise<Page<Customer>> {
  const { page, pageSize, skip, take } = normalizePage(filters);

  // Build a server-side where clause scoped to the actor.
  const where: NonNullable<Parameters<typeof db.customer.findMany>[0]>["where"] = {};

  if (isCustomerPrincipal(actor)) {
    // A customer principal only ever sees their own record.
    where.id = actor.customerId ?? "__none__";
  } else {
    requirePermission(actor, "customers:read");
    const countries = allowedCountries(actor);
    if (countries !== null) {
      where.OR = [{ country: { in: countries } }, { country: null }];
    }
  }

  if (filters.country) where.country = filters.country;
  if (filters.status) where.status = filters.status;
  if (filters.query) {
    where.OR = [
      { name: { contains: filters.query, mode: "insensitive" } },
      { ref: { contains: filters.query, mode: "insensitive" } },
    ];
  }

  const [items, total] = await Promise.all([
    db.customer.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
    db.customer.count({ where }),
  ]);
  return buildPage(items, total, page, pageSize);
}

export async function updateCustomer(
  db: PrismaClient,
  actor: AuthzUser,
  id: string,
  data: Partial<CreateCustomerInput>,
): Promise<Customer> {
  assertCustomerAccess(actor, id, "customers:write");
  const customer = await db.customer.update({
    where: { id },
    data: {
      name: data.name,
      phone: data.phone,
      email: data.email?.toLowerCase(),
      country: data.country,
    },
  });
  await logAudit(db, {
    actorUserId: actor.id,
    action: "customer.update",
    entityType: "Customer",
    entityId: id,
  });
  return customer;
}
