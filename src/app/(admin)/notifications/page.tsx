import { prisma } from "@/db/client";
import { AuthorizationError } from "@/lib/errors";
import { can } from "@/modules/authz/core";
import { requireUser } from "@/modules/authz/session";
import { listNotificationsAdmin } from "@/modules/notifications/announcements";
import { NotificationsView } from "./NotificationsView";

export const metadata = { title: "Notifications" };

/** Notifications (spec B14 / §15) with Schedule Announcement (§9). */
export default async function NotificationsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  if (!can(user, "notifications:read")) throw new AuthorizationError("Missing permission: notifications:read");
  const sp = await searchParams;
  const kind = sp.kind === "announcements" || sp.kind === "customer" ? sp.kind : undefined;
  const status = sp.status === "SENT" || sp.status === "SCHEDULED" ? sp.status : undefined;
  const data = await listNotificationsAdmin(prisma, user, { kind, status, q: sp.q, page: Number(sp.page) || 1 });
  return <NotificationsView data={data} filters={{ kind: kind ?? "all", status: status ?? "ALL", q: sp.q ?? "" }} compose={sp.compose === "1"} canWrite={can(user, "notifications:write")} />;
}
