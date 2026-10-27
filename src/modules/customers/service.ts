import { Prisma, type Customer, type PrismaClient } from "@prisma/client";
import { ValidationError } from "@/lib/errors";
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

/** Fewer digits than this is only a prefix (e.g. the form's "+252 61"), not a phone number. */
const MIN_PHONE_DIGITS = 7;

/** The phone as entered, or null when it is empty or only a prefix. */
export function cleanPhone(phone: string | null | undefined): string | null {
  const trimmed = (phone ?? "").trim();
  return trimmed.replace(/\D/g, "").length >= MIN_PHONE_DIGITS ? trimmed : null;
}

/** Digits-only phone key used to reject duplicates; null for an empty or prefix-only phone. */
export function phoneKeyOf(phone: string | null | undefined): string | null {
  const digits = (cleanPhone(phone) ?? "").replace(/\D/g, "");
  return digits.length ? digits : null;
}

/**
 * Phone key for numbers entered after the app's fixed "+252" prefix: a local
 * number (61 555 0100 or 0615550100) gets the 252 country code.
 */
export function somaliPhoneKey(phone: string | null | undefined): string | null {
  let digits = (phone ?? "").replace(/\D/g, "");
  if (!digits) return null;
  if (!digits.startsWith("252")) digits = "252" + digits.replace(/^0+/, "");
  return digits;
}

/** Throws a clear ValidationError if the email or phone already belongs to another customer. */
export async function assertUniqueContact(db: Prisma.TransactionClient | PrismaClient, email: string | null, phoneKey: string | null, exceptId?: string) {
  const not = exceptId ? { id: { not: exceptId } } : {};
  if (email && (await db.customer.findFirst({ where: { email, ...not }, select: { id: true } }))) {
    throw new ValidationError("A customer with this email already exists");
  }
  if (phoneKey && (await db.customer.findFirst({ where: { phoneKey, ...not }, select: { id: true } }))) {
    throw new ValidationError("A customer with this phone number already exists");
  }
}

function isUniqueViolation(e: unknown, field: string): boolean {
  return (
    e instanceof Prisma.PrismaClientKnownRequestError &&
    e.code === "P2002" &&
    JSON.stringify(e.meta?.target ?? "").includes(field)
  );
}

export async function createCustomer(
  db: PrismaClient,
  actor: AuthzUser,
  input: CreateCustomerInput,
): Promise<Customer> {
  requirePermission(actor, "customers:write");
  const name = input.name?.trim();
  const company = input.company?.trim();
  if (!name) throw new ValidationError("Full name is required");
  if (!company) throw new ValidationError("Company is required");
  const email = input.email?.trim().toLowerCase() || null;
  const phoneKey = phoneKeyOf(input.phone);
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
          phone: cleanPhone(input.phone),
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
      if (isUniqueViolation(e, "phoneKey")) throw new ValidationError("A customer with this phone number already exists");
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
  if (data.company !== undefined && !data.company.trim()) throw new ValidationError("Company is required");
  const email = data.email === undefined ? undefined : data.email.trim().toLowerCase() || null;
  const phoneKey = data.phone === undefined ? undefined : phoneKeyOf(data.phone);
  await assertUniqueContact(db, email ?? null, phoneKey ?? null, id);
  const customer = await db.customer.update({
    where: { id },
    data: {
      name: data.name?.trim(),
      company: data.company?.trim(),
      phone: data.phone === undefined ? undefined : cleanPhone(data.phone),
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
