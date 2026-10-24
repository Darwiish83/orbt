import { prisma } from "@/db/client";
import { AuthorizationError } from "@/lib/errors";
import { can } from "@/modules/authz/core";
import { requireUser } from "@/modules/authz/session";
import { listAdminShipments } from "@/modules/shipments/manage";
import { getAdminScope } from "../scope";
import { ShipmentsView } from "./ShipmentsView";

export const metadata = { title: "Shipments" };

/** Shipments (spec B6 / §7), per the top bar's country + year. */
export default async function ShipmentsPage({ searchParams }: { searchParams: Promise<{ mode?: string; q?: string }> }) {
  const user = await requireUser();
  if (!can(user, "shipments:read")) throw new AuthorizationError("Missing permission: shipments:read");
  const sp = await searchParams;
  const scope = await getAdminScope(user);
  const mode = sp.mode === "SEA" ? "SEA" : "AIR";
  const { rows, totals } = await listAdminShipments(prisma, user, scope, { mode, q: sp.q });
  return (
    <ShipmentsView
      scope={{ year: scope.year, country: scope.country, years: scope.years, countries: scope.countries.map((c) => c.name) }}
      mode={mode}
      q={sp.q ?? ""}
      rows={rows}
      totals={totals}
      perms={{ write: can(user, "shipments:write"), manage: can(user, "shipments:manage") }}
    />
  );
}
