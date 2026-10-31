import { prisma } from "@/db/client";
import { can } from "@/modules/authz/core";
import { requireUser } from "@/modules/authz/session";
import { listShipmentCosts } from "@/modules/accounting/service";
import { getAdminScope } from "../scope";
import { PinGate } from "../accounting/PinGate";
import { ShipmentCostView } from "./ShipmentCostView";

export const metadata = { title: "Shipment cost" };

/** Shipment cost & profit: same access as Accounting, but no PIN (owner 2026-10-29).
 * Accounting itself keeps its PIN. */
export default async function ShipmentCostPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  if (!can(user, "accounting:read")) return <PinGate mode="denied" />;

  const sp = await searchParams;
  const scope = await getAdminScope(user);
  const mode = sp.mode === "SEA" ? "SEA" : "AIR";
  return (
    <ShipmentCostView
      costs={await listShipmentCosts(prisma, user, scope, mode)}
      mode={mode}
      sub={sp.sub === "origin" || sp.sub === "mgq" ? sp.sub : "profit"}
      year={scope.year}
      country={scope.country}
      perms={{ origin: can(user, "costorigin:write"), mgq: can(user, "costmgq:write") }}
    />
  );
}
