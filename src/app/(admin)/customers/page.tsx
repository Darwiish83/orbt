import { prisma } from "@/db/client";
import { AuthorizationError } from "@/lib/errors";
import { can } from "@/modules/authz/core";
import { requireUser } from "@/modules/authz/session";
import { listAdminCustomers } from "@/modules/customers/admin";
import { getAdminScope } from "../scope";
import { CustomersView } from "./CustomersView";

export const metadata = { title: "Customers" };

/** Customers (spec B5 / §6): shared by every country; levels use the top bar's year. */
export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string; page?: string }> }) {
  const user = await requireUser();
  if (!can(user, "customers:read")) throw new AuthorizationError("Missing permission: customers:read");
  const sp = await searchParams;
  const scope = await getAdminScope(user).catch(() => null);
  const year = scope?.year ?? new Date().getUTCFullYear();
  const tab = sp.tab === "active" ? "ACTIVE" : sp.tab === "inactive" ? "INACTIVE" : undefined;
  const data = await listAdminCustomers(prisma, user, year, { status: tab, q: sp.q, page: Number(sp.page) || 1 });
  return (
    <CustomersView
      data={data}
      year={year}
      filters={{ tab: sp.tab ?? "all", q: sp.q ?? "" }}
      perms={{ write: can(user, "customers:write"), manage: can(user, "customers:manage") }}
    />
  );
}
