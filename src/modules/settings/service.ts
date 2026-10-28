import type { Prisma, PrismaClient } from "@prisma/client";
import { assertStrongPassword } from "@/modules/auth/passwordPolicy";
import { COMPANY } from "@/config/company";
import { ValidationError } from "@/lib/errors";
import { logAudit } from "@/modules/audit/log";
import { setPassword } from "@/modules/auth/accounts";
import { assertNotRateLimited, recordAttempt } from "@/modules/auth/rateLimit";
import { verifyPassword } from "@/modules/auth/password";
import { requirePermission, type AuthzUser } from "@/modules/authz/core";
import { isoOf } from "@/ui/kit/countries";

/**
 * Settings (spec B15 / revised prompt §16), shared by every country. Values
 * live in the database; the company profile feeds invoices and receipts.
 */

export const SETTING_DEFAULTS = {
  company: {
    name: COMPANY.name,
    email: "info@orbitcargo.so",
    phone: COMPANY.phones.join(" · "),
    address: COMPANY.addressLines.join(", "),
    supportEmail: "support@orbitcargo.so",
    supportPhone: COMPANY.phones[1] ?? COMPANY.phone,
  },
  general: { currency: "USD", timezone: "Africa/Mogadishu" },
  notifications: { email: true, shipment: true, payment: true, document: false, announcements: true },
} as const;

export type SettingSection = keyof typeof SETTING_DEFAULTS;
type Values<S extends SettingSection> = { [K in keyof (typeof SETTING_DEFAULTS)[S]]: (typeof SETTING_DEFAULTS)[S][K] extends boolean ? boolean : string };

export async function getSettings(db: PrismaClient) {
  const rows = await db.appSetting.findMany();
  const get = <S extends SettingSection>(s: S): Values<S> => ({ ...SETTING_DEFAULTS[s], ...((rows.find((r) => r.key === s)?.value ?? {}) as object) }) as Values<S>;
  return { company: get("company"), general: get("general"), notifications: get("notifications") };
}

const TEXT_MAX = 160;
const CURRENCIES = ["USD", "SOS"];
const TIMEZONES = ["Africa/Mogadishu", "Asia/Dubai", "Asia/Shanghai", "Europe/Istanbul", "Asia/Kolkata"];

export async function saveSettings(db: PrismaClient, actor: AuthzUser, section: SettingSection, values: Record<string, unknown>) {
  requirePermission(actor, "settings:write");
  const defaults = SETTING_DEFAULTS[section] as Record<string, unknown>;
  const clean: Record<string, string | boolean> = {};
  for (const [k, d] of Object.entries(defaults)) {
    const v = values[k];
    if (typeof d === "boolean") {
      if (typeof v !== "boolean") throw new ValidationError("Check the highlighted fields.");
      clean[k] = v;
    } else {
      if (typeof v !== "string" || v.trim().length > TEXT_MAX) throw new ValidationError("Check the highlighted fields.");
      clean[k] = v.trim();
    }
  }
  if (section === "company" && !String(clean.name)) throw new ValidationError("Company name is required");
  if (section === "general" && (!CURRENCIES.includes(String(clean.currency)) || !TIMEZONES.includes(String(clean.timezone)))) {
    throw new ValidationError("Check the highlighted fields.");
  }
  await db.appSetting.upsert({
    where: { key: section },
    create: { key: section, value: clean as Prisma.InputJsonValue, updatedByUserId: actor.id },
    update: { value: clean as Prisma.InputJsonValue, updatedByUserId: actor.id },
  });
  await logAudit(db, { actorUserId: actor.id, action: "settings.update", entityType: "AppSetting", entityId: section });
}

export const SETTING_OPTIONS = { currencies: CURRENCIES, timezones: TIMEZONES };

// ------------------------------------------------------------------ years

export async function listYears(db: PrismaClient) {
  const [years, counts, customers] = await Promise.all([
    db.businessYear.findMany({ orderBy: { year: "desc" } }),
    db.shipment.groupBy({ by: ["businessYear"], _count: { _all: true } }),
    db.customer.findMany({ select: { createdAt: true } }),
  ]);
  return years.map((y) => ({
    year: y.year,
    isCurrent: y.isCurrent,
    shipments: counts.find((c) => c.businessYear === y.year)?._count._all ?? 0,
    customers: customers.filter((c) => c.createdAt.getUTCFullYear() === y.year).length,
  }));
}

/** Create new year: starts empty; existing data stays in its own year. */
export async function createYear(db: PrismaClient, actor: AuthzUser, year: number) {
  requirePermission(actor, "settings:write");
  if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new ValidationError("Enter a year between 2000 and 2100");
  if (await db.businessYear.findUnique({ where: { year } })) throw new ValidationError("This year already exists");
  await db.businessYear.create({ data: { year, isCurrent: false } });
  await logAudit(db, { actorUserId: actor.id, action: "year.create", entityType: "BusinessYear", entityId: String(year) });
}

/** The default year for everyone (each user can still switch in the top bar). */
export async function setCurrentYear(db: PrismaClient, actor: AuthzUser, year: number) {
  requirePermission(actor, "settings:write");
  if (!(await db.businessYear.findUnique({ where: { year } }))) throw new ValidationError("This year does not exist");
  await db.$transaction(async (tx) => {
    await tx.businessYear.updateMany({ where: { isCurrent: true }, data: { isCurrent: false } });
    await tx.businessYear.update({ where: { year }, data: { isCurrent: true } });
    await logAudit(tx, { actorUserId: actor.id, action: "year.current", entityType: "BusinessYear", entityId: String(year) });
  });
}

// ------------------------------------------------------------------ countries

export async function listCountries(db: PrismaClient) {
  const [countries, counts] = await Promise.all([
    db.country.findMany({ where: { isOrigin: true, active: true }, orderBy: { createdAt: "asc" } }),
    db.shipment.groupBy({ by: ["originCountry"], _count: { _all: true } }),
  ]);
  return countries.map((c) => ({ id: c.id, name: c.name, iso2: c.iso2, shipments: counts.find((x) => x.originCountry === c.name)?._count._all ?? 0 }));
}

/** Add an origin country from the world list (any spelling); the flag comes
 * from its ISO code. A removed country is re-activated. */
export async function addCountry(db: PrismaClient, actor: AuthzUser, input: string) {
  requirePermission(actor, "settings:write");
  const iso2 = isoOf(input);
  if (!iso2 || iso2 === "so") throw new ValidationError("Country not found");
  let name = input.trim();
  try {
    name = new Intl.DisplayNames(["en"], { type: "region" }).of(iso2.toUpperCase()) ?? name;
  } catch {
    /* keep the typed name */
  }
  if (iso2 === "tr") name = "Turkey";
  const existing = await db.country.findFirst({ where: { OR: [{ iso2 }, { name: { equals: name, mode: "insensitive" } }] } });
  if (existing?.active && existing.isOrigin) throw new ValidationError("Country already exists");
  const c = existing
    ? await db.country.update({ where: { id: existing.id }, data: { active: true, isOrigin: true } })
    : await db.country.create({ data: { name, iso2, isOrigin: true, active: true } });
  await logAudit(db, { actorUserId: actor.id, action: "country.add", entityType: "Country", entityId: c.id, metadata: { name: c.name } });
  return c;
}

/** Remove a country that has no shipments (it is deactivated, not deleted). */
export async function removeCountry(db: PrismaClient, actor: AuthzUser, countryId: string) {
  requirePermission(actor, "settings:write");
  const c = await db.country.findUnique({ where: { id: countryId } });
  if (!c) throw new ValidationError("Country not found");
  if (await db.shipment.count({ where: { originCountry: c.name } })) throw new ValidationError("Has shipments — cannot remove");
  if ((await db.country.count({ where: { isOrigin: true, active: true } })) <= 1) throw new ValidationError("Keep at least one country");
  await db.country.update({ where: { id: countryId }, data: { active: false } });
  await logAudit(db, { actorUserId: actor.id, action: "country.remove", entityType: "Country", entityId: countryId, metadata: { name: c.name } });
}

// ------------------------------------------------------------------ security

/** Change your own password (Security section). */
export async function changeOwnPassword(db: PrismaClient, actor: AuthzUser, current: string, next: string, confirm: string) {
  const user = await db.user.findUnique({ where: { id: actor.id }, include: { employee: { select: { code: true } } } });
  assertStrongPassword(next, confirm, { email: user?.email, id: user?.employee?.code });
  if (next === current) throw new ValidationError("Choose a password different from the current one");
  // Someone holding an open session can't guess the current password: 5 wrong
  // tries in 15 minutes and the form stops for a while.
  const key = `user:${actor.id}`;
  await assertNotRateLimited(db, key, "password_change");
  if (!user?.passwordHash || !(await verifyPassword(user.passwordHash, current))) {
    await recordAttempt(db, { identifier: key, kind: "password_change", success: false });
    throw new ValidationError("Current password is wrong");
  }
  await setPassword(db, actor.id, next);
  await logAudit(db, { actorUserId: actor.id, action: "auth.password_change", entityType: "User", entityId: actor.id });
}
