import { notFound } from "next/navigation";
import { prisma } from "@/db/client";
import { ValidationError } from "@/lib/errors";
import { can } from "@/modules/authz/core";
import { requireUser } from "@/modules/authz/session";
import { getAdminShipment } from "@/modules/shipments/manage";
import { getAdminScope } from "../../scope";
import { ShipmentDetailView } from "./ShipmentDetailView";

export const metadata = { title: "Shipment" };

export default async function ShipmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const data = await getAdminShipment(prisma, user, id).catch((e) => {
    if (e instanceof ValidationError) return null;
    throw e;
  });
  if (!data) notFound();
  const scope = await getAdminScope(user);
  return (
    <ShipmentDetailView
      data={data}
      scope={{ years: scope.years, countries: scope.countries.map((c) => c.name) }}
      perms={{ write: can(user, "shipments:write"), customers: can(user, "customers:read") }}
    />
  );
}
