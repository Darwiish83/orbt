import { prisma } from "@/db/client";
import { can } from "@/modules/authz/core";
import { listNotificationsForUser } from "@/modules/notifications/service";
import { requireUser } from "@/modules/authz/session";
import { Badge } from "@/ui/primitives";
import { Composer } from "./Composer";
import { sendAnnouncementAction } from "./actions";

export const metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const user = await requireUser();
  const { items } = await listNotificationsForUser(prisma, user, { pageSize: 50 });
  const mayWrite = can(user, "notifications:write");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {mayWrite && <Composer />}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {items.length === 0 ? (
          <p style={{ color: "var(--text-muted)" }}>No notifications.</p>
        ) : (
          items.map((n) => (
            <div
              key={n.id}
              style={{
                background: "var(--surface-card)",
                border: "1px solid var(--border-default)",
                borderRadius: "var(--radius-l)",
                boxShadow: "var(--shadow-1)",
                padding: 16,
                display: "flex",
                gap: 12,
                alignItems: "center",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ font: "600 14px var(--font-body)", color: "var(--text-strong)" }}>{n.title}</div>
                <div style={{ fontSize: 13, color: "var(--text-muted)" }}>{n.message}</div>
              </div>
              <div style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center" }}>
                <Badge tone={n.status === "SENT" ? "success" : n.status === "SCHEDULED" ? "accent" : "neutral"}>{n.status}</Badge>
                {mayWrite && n.status !== "SENT" && (
                  <form action={sendAnnouncementAction}>
                    <input type="hidden" name="id" value={n.id} />
                    <button type="submit" style={{ height: 32, padding: "0 12px", border: 0, borderRadius: "var(--radius-s)", background: "var(--action-primary)", color: "#fff", font: "700 12px var(--font-body)", cursor: "pointer" }}>
                      Send
                    </button>
                  </form>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
