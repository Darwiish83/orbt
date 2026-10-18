import Link from "next/link";
import type { ShipmentStatus } from "@prisma/client";
import { prisma } from "@/db/client";
import { listShipments } from "@/modules/shipments/service";
import { requireUser } from "@/modules/authz/session";
import { Badge, type BadgeTone } from "@/ui/primitives";

export const metadata = { title: "Shipments" };

const STATUS_TONE: Record<ShipmentStatus, BadgeTone> = {
  AT_ORIGIN_STORE: "neutral",
  DEPARTED: "warning",
  IN_TRANSIT: "info",
  ARRIVED: "brand",
  DELIVERED: "success",
  ON_HOLD: "warning",
};

function titleCase(s: string): string {
  return s.toLowerCase().replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

export default async function ShipmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; status?: string }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const status = (sp.status as ShipmentStatus | undefined) || undefined;
  const result = await listShipments(prisma, user, { page, status });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div
        style={{
          background: "var(--surface-card)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-l)",
          boxShadow: "var(--shadow-1)",
          overflow: "hidden",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr>
              {["Code", "Mode", "Lane", "Year", "Status"].map((h) => (
                <th
                  key={h}
                  style={{
                    textAlign: "left",
                    padding: "10px 14px",
                    font: "700 11px var(--font-body)",
                    letterSpacing: ".06em",
                    textTransform: "uppercase",
                    color: "var(--text-muted)",
                    background: "var(--surface-sunken)",
                    borderBottom: "1px solid var(--border-default)",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.items.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: 32, textAlign: "center", color: "var(--text-muted)" }}>
                  No shipments yet.
                </td>
              </tr>
            ) : (
              result.items.map((s) => (
                <tr key={s.id} style={{ borderBottom: "1px solid var(--border-default)" }}>
                  <td style={{ padding: "12px 14px", fontFamily: "var(--font-mono)", color: "var(--navy-700)", fontWeight: 600 }}>
                    {s.code}
                  </td>
                  <td style={{ padding: "12px 14px" }}>{s.mode}</td>
                  <td style={{ padding: "12px 14px", color: "var(--text-body)" }}>
                    {[s.originCity, s.originCountry].filter(Boolean).join(", ") || s.originCountry} →{" "}
                    {[s.destCity, s.destCountry].filter(Boolean).join(", ") || s.destCountry || "—"}
                  </td>
                  <td style={{ padding: "12px 14px", fontFamily: "var(--font-mono)" }}>{s.businessYear}</td>
                  <td style={{ padding: "12px 14px" }}>
                    <Badge tone={STATUS_TONE[s.status]} dot>
                      {titleCase(s.status)}
                    </Badge>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "center", fontSize: 13, color: "var(--text-muted)" }}>
        {page > 1 ? (
          <Link href={`/shipments?page=${page - 1}`}>← Prev</Link>
        ) : (
          <span style={{ opacity: 0.4 }}>← Prev</span>
        )}
        <span>
          Page {result.page} of {result.totalPages} · {result.total} total
        </span>
        {page < result.totalPages ? (
          <Link href={`/shipments?page=${page + 1}`}>Next →</Link>
        ) : (
          <span style={{ opacity: 0.4 }}>Next →</span>
        )}
      </div>
    </div>
  );
}
