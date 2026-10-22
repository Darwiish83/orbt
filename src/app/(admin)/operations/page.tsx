import type { ShipmentStatus } from "@prisma/client";
import { prisma } from "@/db/client";
import { can } from "@/modules/authz/core";
import { listShipments } from "@/modules/shipments/service";
import { publicStatusLabel, transitionsFor } from "@/modules/shipments/stateMachine";
import { requireUser } from "@/modules/authz/session";
import { Badge } from "@/ui/primitives";
import { changeStatusAction } from "../shipments/actions";

export const metadata = { title: "Operations" };


export default async function OperationsPage() {
  const user = await requireUser();
  const { items } = await listShipments(prisma, user, { pageSize: 50 });
  const mayChange = can(user, "shipments:status");
  const active = items.filter((s) => s.status !== "ARRIVED");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <p style={{ color: "var(--text-muted)", fontSize: 14, margin: 0 }}>
        Shipments awaiting action. Advance a shipment through its next allowed step.
      </p>
      {active.length === 0 ? (
        <p style={{ color: "var(--text-muted)" }}>Nothing in progress.</p>
      ) : (
        active.map((s) => (
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
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--navy-700)" }}>{s.code}</span>
            <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
              {s.mode} · {s.originCountry} → {s.destCountry ?? "—"}
            </span>
            <Badge tone="info" dot>
              {publicStatusLabel(s.status)}
            </Badge>
            {mayChange && (
              <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
                {transitionsFor(s.mode)[s.status].map((to: ShipmentStatus) => (
                  <form key={to} action={changeStatusAction}>
                    <input type="hidden" name="id" value={s.id} />
                    <input type="hidden" name="to" value={to} />
                    <button
                      type="submit"
                      style={{ height: 32, padding: "0 12px", border: "1.5px solid var(--navy-700)", background: "transparent", color: "var(--navy-700)", borderRadius: "var(--radius-s)", font: "700 12px var(--font-body)", cursor: "pointer" }}
                    >
                      → {publicStatusLabel(to)}
                    </button>
                  </form>
                ))}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}
