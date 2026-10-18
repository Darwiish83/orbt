import type { ShipmentStatus } from "@prisma/client";
import { prisma } from "@/db/client";
import { listShipments } from "@/modules/shipments/service";
import { publicStatusLabel } from "@/modules/shipments/stateMachine";
import { requireUser } from "@/modules/authz/session";
import { Badge, type BadgeTone } from "@/ui/primitives";

export const metadata = { title: "My shipments" };

const TONE: Record<ShipmentStatus, BadgeTone> = {
  AT_ORIGIN_STORE: "neutral",
  DEPARTED: "warning",
  IN_TRANSIT: "info",
  ARRIVED: "brand",
  DELIVERED: "success",
  ON_HOLD: "warning",
};

export default async function AccountShipmentsPage() {
  const user = await requireUser();
  const { items } = await listShipments(prisma, user, { pageSize: 50 });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h1 style={{ font: "700 24px/1.2 var(--font-display)", color: "var(--text-strong)", margin: 0 }}>
        Your shipments
      </h1>
      {items.length === 0 ? (
        <p style={{ color: "var(--text-muted)" }}>You have no shipments yet.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {items.map((s) => (
            <div
              key={s.id}
              style={{
                background: "var(--surface-card)",
                border: "1px solid var(--border-default)",
                borderRadius: "var(--radius-l)",
                boxShadow: "var(--shadow-1)",
                padding: 16,
                display: "flex",
                alignItems: "center",
                gap: 16,
              }}
            >
              <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--navy-700)" }}>{s.code}</span>
              <span style={{ color: "var(--text-muted)", fontSize: 14 }}>
                {s.mode} · {s.originCountry} → {s.destCountry ?? "—"}
              </span>
              <span style={{ marginLeft: "auto" }}>
                <Badge tone={TONE[s.status]} dot>
                  {publicStatusLabel(s.status)}
                </Badge>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
