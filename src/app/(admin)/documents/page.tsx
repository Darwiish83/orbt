import { prisma } from "@/db/client";
import { AuthorizationError } from "@/lib/errors";
import { displayShipmentCode } from "@/modules/authz/adminScope";
import { can } from "@/modules/authz/core";
import { requireUser } from "@/modules/authz/session";
import { listAdminDocuments } from "@/modules/documents/admin";
import { getAdminScope } from "../scope";
import { DocumentsView } from "./DocumentsView";

export const metadata = { title: "Documents" };

/** Documents (spec B12 / §13) for the top bar's country + year. */
export default async function DocumentsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  if (!can(user, "documents:read")) throw new AuthorizationError("Missing permission: documents:read");
  const sp = await searchParams;
  const scope = await getAdminScope(user);
  const mode = sp.mode === "AIR" || sp.mode === "SEA" ? sp.mode : undefined;
  const [data, shipments] = await Promise.all([
    listAdminDocuments(prisma, user, { year: scope.year, country: scope.country, from: sp.from, to: sp.to, mode, shipmentId: sp.ship, customerId: sp.cust, q: sp.q, page: Number(sp.page) || 1 }),
    prisma.shipment.findMany({ where: { originCountry: scope.country, businessYear: scope.year }, select: { id: true, code: true, mode: true }, orderBy: { createdAt: "asc" }, take: 500 }),
  ]);
  return (
    <DocumentsView
      data={data}
      shipments={shipments.map((s) => ({ id: s.id, code: displayShipmentCode(s.code), mode: s.mode }))}
      scope={{ year: scope.year, country: scope.country }}
      filters={{ from: sp.from ?? "", to: sp.to ?? "", mode: mode ?? "ALL", ship: sp.ship ?? "", q: sp.q ?? "" }}
      perms={{ write: can(user, "documents:write"), manage: can(user, "documents:manage") }}
    />
  );
}
