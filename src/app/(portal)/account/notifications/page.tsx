import { withUserDb } from "@/db/scoped";
import { requireUser } from "@/modules/authz/session";
import { listNotificationsForUser } from "@/modules/notifications/service";
import { NotificationsView, type Note } from "./NotificationsView";

export const metadata = { title: "Notifications" };

/** Customer App → Notifications (spec A7): own updates plus announcements to all customers. */
export default async function MyNotificationsPage() {
  const user = await requireUser();
  const { items } = await withUserDb(user, (db) => listNotificationsForUser(db, user, { pageSize: 100 }));
  const notes: Note[] = items.map((n) => ({
    id: n.id,
    type: n.type ?? "general",
    audience: n.audience,
    title: n.title,
    message: n.message,
    at: (n.sentAt ?? n.createdAt).toISOString(),
    details: (n.details ?? null) as Note["details"],
    image: !!n.imageKey,
  }));
  return <NotificationsView notes={notes} />;
}
