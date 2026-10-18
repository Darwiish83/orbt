import { notFound } from "next/navigation";
import type { ShipmentStatus } from "@prisma/client";
import { prisma } from "@/db/client";
import { can } from "@/modules/authz/core";
import { getShipmentForActor } from "@/modules/shipments/service";
import { TRANSITIONS } from "@/modules/shipments/stateMachine";
import { requireUser } from "@/modules/authz/session";
import { Badge } from "@/ui/primitives";
import { changeStatusAction } from "../actions";

export const metadata = { title: "Shipment" };

function titleCase(s: string) {
  return s.toLowerCase().replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

export default async function ShipmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const shipment = await getShipmentForActor(prisma, user, id);
  if (!shipment) notFound();

  const next = TRANSITIONS[shipment.status];
  const mayChange = can(user, "shipments:status");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 720 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <h1 style={{ font: "800 30px/1 var(--font-display)", color: "var(--text-strong)", margin: 0, fontFamily: "var(--font-mono)" }}>
          {shipment.code}
        </h1>
        <Badge tone="info" dot>
          {titleCase(shipment.status)}
        </Badge>
      </div>
      <div style={{ color: "var(--text-muted)" }}>
        {shipment.mode} · {[shipment.originCity, shipment.originCountry].filter(Boolean).join(", ")} →{" "}
        {[shipment.destCity, shipment.destCountry].filter(Boolean).join(", ") || "—"} · {shipment.businessYear}
        {shipment.trackingNumber ? ` · ${shipment.trackingNumber}` : ""}
      </div>

      {mayChange && next.length > 0 && (
        <div
          style={{
            background: "var(--surface-card)",
            border: "1px solid var(--border-default)",
            borderRadius: "var(--radius-l)",
            boxShadow: "var(--shadow-1)",
            padding: 16,
          }}
        >
          <div style={{ font: "700 13px var(--font-body)", color: "var(--text-strong)", marginBottom: 10 }}>Advance status</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {next.map((to: ShipmentStatus) => (
              <form key={to} action={changeStatusAction}>
                <input type="hidden" name="id" value={shipment.id} />
                <input type="hidden" name="to" value={to} />
                <button
                  type="submit"
                  style={{ height: 36, padding: "0 14px", border: 0, borderRadius: "var(--radius-s)", background: "var(--action-primary)", color: "#fff", font: "700 13px var(--font-body)", cursor: "pointer" }}
                >
                  {titleCase(to)}
                </button>
              </form>
            ))}
          </div>
        </div>
      )}

      <div
        style={{
          background: "var(--surface-card)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-l)",
          boxShadow: "var(--shadow-1)",
          padding: 20,
        }}
      >
        <div style={{ font: "700 15px var(--font-display)", color: "var(--text-strong)", marginBottom: 12 }}>Scan history</div>
        {shipment.events.length === 0 ? (
          <p style={{ color: "var(--text-muted)", fontSize: 14 }}>No events yet.</p>
        ) : (
          <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {shipment.events.map((e) => (
              <li key={e.id} style={{ display: "flex", gap: 12, padding: "6px 0", fontSize: 14 }}>
                <span style={{ fontWeight: 600, color: "var(--text-strong)" }}>{e.status ? titleCase(e.status) : e.type}</span>
                <span style={{ marginLeft: "auto", color: "var(--text-muted)" }}>
                  {e.occurredAt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
