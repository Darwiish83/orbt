import type { ShipmentStatus } from "@prisma/client";
import { prisma } from "@/db/client";
import { AuthorizationError } from "@/lib/errors";
import { can } from "@/modules/authz/core";
import { requireUser } from "@/modules/authz/session";
import { listOperations } from "@/modules/shipments/manage";
import { getAdminScope } from "../scope";
import { OperationsView } from "./OperationsView";

export const metadata = { title: "Operations" };

const STATUSES: ShipmentStatus[] = ["AT_ORIGIN_STORE", "DEPARTED", "IN_TRANSIT", "ARRIVED"];

/** Operations (spec §8): the only place a shipment's status changes. */
export default async function OperationsPage({ searchParams }: { searchParams: Promise<{ mode?: string; status?: string; q?: string }> }) {
  const user = await requireUser();
  if (!can(user, "operations:read")) throw new AuthorizationError("Missing permission: operations:read");
  const sp = await searchParams;
  const scope = await getAdminScope(user);
  const mode = sp.mode === "AIR" || sp.mode === "SEA" ? sp.mode : undefined;
  const status = STATUSES.includes(sp.status as ShipmentStatus) ? (sp.status as ShipmentStatus) : undefined;
  const data = await listOperations(prisma, user, scope, { mode, status, q: sp.q });
  return (
    <OperationsView
      data={data}
      filters={{ mode: mode ?? "ALL", status: status ?? "ALL", q: sp.q ?? "" }}
      scope={{ year: scope.year, country: scope.country }}
      canChange={can(user, "shipments:status")}
    />
  );
}
