import { Prisma, type Customer, type PrismaClient } from "@prisma/client";
import { AuthorizationError, ValidationError } from "@/lib/errors";
import { parseSomaliPhone, PHONE_REQUIRED, PHONE_TAKEN } from "./phone";
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
  /** Required for new customers (spec A1). */
  company?: string;
  phone?: string;
  email?: string;
  /** Free text, e.g. "Mogadishu, Bakara". */
  location?: string;
  /** "What do you buy?" — free text. */
  cargoCategory?: string;
  country?: string;
}

/**
 * The customer's phone, validated (owner rule: mandatory, 9 digits after +252).
 * Returns the canonical stored form and the duplicate-check key.
 */
export function requireSomaliPhone(phone: string | null | undefined): { phone: string; key: string } {
  const parsed = parseSomaliPhone(phone);
  if (!parsed) throw new ValidationError(PHONE_REQUIRED);
  return parsed;
}

/** Duplicate-check key for a valid phone, else null (used to match, never to store). */
export function somaliPhoneKey(phone: string | null | undefined): string | null {
  return parseSomaliPhone(phone)?.key ?? null;
}

/** Throws a clear ValidationError if the email or phone already belongs to another customer. */
export async function assertUniqueContact(db: Prisma.TransactionClient | PrismaClient, email: string | null, phoneKey: string | null, exceptId?: string) {
  const not = exceptId ? { id: { not: exceptId } } : {};
  if (email && (await db.customer.findFirst({ where: { email, ...not }, select: { id: true } }))) {
    throw new ValidationError("A customer with this email already exists");
  }
  if (phoneKey && (await db.customer.findFirst({ where: { phoneKey, ...not }, select: { id: true } }))) {
    throw new ValidationError(PHONE_TAKEN);
  }
}

function isUniqueViolation(e: unknown, field: string): boolean {
  return (
    e instanceof Prisma.PrismaClientKnownRequestError &&
    e.code === "P2002" &&
    JSON.stringify(e.meta?.target ?? "").includes(field)
  );
}

/** Staff country scope for customers: their countries plus unassigned customers. */
export function customerScopeWhere(actor: AuthzUser): Prisma.CustomerWhereInput {
  const countries = allowedCountries(actor);
  return countries === null ? {} : { OR: [{ country: { in: countries } }, { country: null }] };
}

/** A staff member may only touch customers inside their country scope, and may
 * only give a customer one of their own countries. */
async function assertCustomerInScope(db: PrismaClient, actor: AuthzUser, id: string, newCountry?: string | null) {
  if (isCustomerPrincipal(actor)) return;
  if (!(await db.customer.findFirst({ where: { id, ...customerScopeWhere(actor) }, select: { id: true } }))) {
    throw new ValidationError("Customer not found");
  }
  assertCountryAllowed(actor, newCountry);
}

function assertCountryAllowed(actor: AuthzUser, country: string | null | undefined) {
  const countries = allowedCountries(actor);
  if (country && countries !== null && !countries.includes(country)) throw new AuthorizationError("Country outside your scope");
}

export async function createCustomer(
  db: PrismaClient,
  actor: AuthzUser,
  input: CreateCustomerInput,
): Promise<Customer> {
  requirePermission(actor, "customers:write");
  assertCountryAllowed(actor, input.country);
  const name = input.name?.trim();
  const company = input.company?.trim();
  if (!name) throw new ValidationError("Full name is required");
  if (!company) throw new ValidationError("Company is required");
  const email = input.email?.trim().toLowerCase() || null;
  const { phone, key: phoneKey } = requireSomaliPhone(input.phone);
  await assertUniqueContact(db, email, phoneKey);

  // Retry only on the rare concurrent ref collision; email/phone races surface as errors.
  for (let attempt = 0; attempt < 5; attempt++) {
    const ref = await nextCustomerRef(db);
    try {
      const customer = await db.customer.create({
        data: {
          ref,
          name,
          company,
          phone,
          phoneKey,
          email,
          location: input.location?.trim() || null,
          cargoCategory: input.cargoCategory?.trim() || null,
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
      if (isUniqueViolation(e, "email")) throw new ValidationError("A customer with this email already exists");
      if (isUniqueViolation(e, "phoneKey")) throw new ValidationError(PHONE_TAKEN);
      if (attempt === 4 || !isUniqueViolation(e, "ref")) throw e;
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
  if (isCustomerPrincipal(actor)) return db.customer.findUnique({ where: { id } });
  return db.customer.findFirst({ where: { id, ...customerScopeWhere(actor) } });
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
  const where: Prisma.CustomerWhereInput = {};
  const and: Prisma.CustomerWhereInput[] = [];

  if (isCustomerPrincipal(actor)) {
    // A customer principal only ever sees their own record.
    where.id = actor.customerId ?? "__none__";
  } else {
    requirePermission(actor, "customers:read");
    const countries = allowedCountries(actor);
    if (countries !== null) {
      // AND-ed with the search below — a search must never widen the actor's scope.
      and.push({ OR: [{ country: { in: countries } }, { country: null }] });
    }
  }

  if (filters.country) where.country = filters.country;
  if (filters.status) where.status = filters.status;
  if (filters.query) {
    and.push({
      OR: [
        { name: { contains: filters.query, mode: "insensitive" } },
        { ref: { contains: filters.query, mode: "insensitive" } },
        { company: { contains: filters.query, mode: "insensitive" } },
      ],
    });
  }
  if (and.length) where.AND = and;

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
  await assertCustomerInScope(db, actor, id, data.country);
  if (data.company !== undefined && !data.company.trim()) throw new ValidationError("Company is required");
  const email = data.email === undefined ? undefined : data.email.trim().toLowerCase() || null;
  // A phone sent with an edit must be valid; it can't be cleared (mandatory).
  const ph = data.phone === undefined ? undefined : requireSomaliPhone(data.phone);
  const phoneKey = ph?.key;
  await assertUniqueContact(db, email ?? null, phoneKey ?? null, id);
  const customer = await db.customer.update({
    where: { id },
    data: {
      name: data.name?.trim(),
      company: data.company?.trim(),
      phone: ph?.phone,
      phoneKey,
      email,
      location: data.location?.trim(),
      cargoCategory: data.cargoCategory?.trim(),
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
