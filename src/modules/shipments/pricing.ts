import type { Prisma } from "@prisma/client";
import { AuthorizationError } from "@/lib/errors";
import { can, type AuthzUser } from "@/modules/authz/core";
import { dec } from "@/modules/finance/money";

/**
 * Shipment pricing (owner 2026-10-28, ADR-036): the data team enters a
 * customer's cargo; Rate, Quality Rate and Brand Rate are set only by staff
 * with "Shipment pricing" (pricing:write). Everyone else sees them read-only.
 * A customer sees a cargo line only once its Rate is set.
 */
export const PRICING_FIELDS = ["rate", "qualityRate", "brandRate"] as const;

type Value = Prisma.Decimal | string | number | null | undefined;
export type PricingValues = Partial<Record<(typeof PRICING_FIELDS)[number], Value>>;

const blank = (v: Value) => v == null || v === "";
const same = (a: Value, b: Value) => (blank(a) ? blank(b) : !blank(b) && dec(a!).equals(dec(b!)));

/** Refuses a change to the pricing fields (from `current`; a new line has none)
 * unless the actor has pricing:write. Unchanged values pass, so the data team
 * can still edit a priced line's other fields. */
export function assertPricing(actor: AuthzUser, next: PricingValues, current: PricingValues = {}) {
  if (can(actor, "pricing:write")) return;
  if (PRICING_FIELDS.some((k) => !same(next[k], current[k]))) {
    throw new AuthorizationError("Only pricing staff can set Rate, Quality Rate and Brand Rate");
  }
}
