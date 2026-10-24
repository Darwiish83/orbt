import { prisma } from "@/db/client";
import { can } from "@/modules/authz/core";
import { requireUser } from "@/modules/authz/session";
import { hasPin } from "@/modules/accounting/pin";
import { listShipmentCosts } from "@/modules/accounting/service";
import { getAdminScope } from "../scope";
import { isUnlocked } from "../accounting/gate";
import { PinGate } from "../accounting/PinGate";
import { ShipmentCostView } from "./ShipmentCostView";

export const metadata = { title: "Shipment cost" };

/** Shipment cost & profit (owner prompt): same access and PIN as Accounting. */
export default async function ShipmentCostPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  if (!can(user, "accounting:read")) return <PinGate mode="denied" />;
  if (!(await hasPin(prisma, user))) return <PinGate mode="set" />;
  if (!(await isUnlocked(user))) return <PinGate mode="enter" />;

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
