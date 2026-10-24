import type { PrismaClient } from "@prisma/client";
import { AuthorizationError } from "@/lib/errors";
import { hasScope, type AuthzUser } from "./core";

/**
 * The Year + Country the admin top bar is set to (spec §1: every record belongs
 * to one year; Shipments, Operations, Finance, Accounting and Transfer are split
 * by country). The browser only *requests* a year/country; this resolves it
 * against Settings (BusinessYear, active origin Country) and the actor's own
 * role scopes, falling back to the current year and the first allowed country.
 */
export interface AdminScope {
  year: number;
  country: string;
  years: number[];
  countries: { name: string; iso2: string }[];
}

export async function resolveAdminScope(
  db: PrismaClient,
  actor: AuthzUser,
  requested: { year?: string | number | null; country?: string | null } = {},
): Promise<AdminScope> {
  const [yearRows, countryRows] = await Promise.all([
    db.businessYear.findMany({ orderBy: { year: "desc" } }),
    db.country.findMany({ where: { active: true, isOrigin: true }, orderBy: { createdAt: "asc" } }),
  ]);

  const years = yearRows.map((y) => y.year).filter((y) => hasScope(actor, { businessYear: y }));
  const countries = countryRows
    .filter((c) => hasScope(actor, { country: c.name }))
    .map((c) => ({ name: c.name, iso2: c.iso2 }));
  if (years.length === 0 || countries.length === 0) {
    throw new AuthorizationError("No business year or country is assigned to you");
  }

  const wantYear = Number(requested.year);
  const current = yearRows.find((y) => y.isCurrent)?.year;
  const year = years.includes(wantYear)
    ? wantYear
    : current !== undefined && years.includes(current)
      ? current
      : years[0]!;

  const wantCountry = (requested.country ?? "").trim().toLowerCase();
  const country = countries.find((c) => c.name.toLowerCase() === wantCountry)?.name ?? countries[0]!.name;

  return { year, country, years, countries };
}

/** Shipment codes are stored globally unique (`W-1@IN2026` when Turkey already
 * has W-1); staff always see the bare per-country code. */
export function displayShipmentCode(code: string): string {
  return code.split("@")[0] ?? code;
}
