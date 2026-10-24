"use client";

import { useT } from "@/i18n/I18nProvider";
import { Seg, Stat } from "@/ui/kit";
import { Badge } from "@/ui/primitives";
import { fdate, money, num } from "@/ui/format";
import type { listShipmentCosts } from "@/modules/accounting/service";
import { FinBox } from "@/components/admin/ui";

type Costs = Awaited<ReturnType<typeof listShipmentCosts>>;

function stageStatus(due: string, paid: string) {
  const d = Number(due), p = Number(paid);
  if (d <= 0) return p > 0 ? "Paid" : "—";
  return p >= d ? "Paid" : p > 0 ? "Partial" : "Unpaid";
}

export function CostsTab({ costs, mode, go }: { costs: Costs; mode: "AIR" | "SEA"; go: (p: Record<string, string | null>) => void }) {
  const t = useT();
  const S = costs.summary;
  const air = mode === "AIR";
  const unit = air ? "KG" : "CBM";
  const th = { padding: "8px 10px", font: "700 11px var(--font-body)", textTransform: "uppercase" as const, color: "var(--text-muted)", background: "var(--surface-sunken)", textAlign: "end" as const, whiteSpace: "nowrap" as const };
  const td = { padding: "8px 10px", borderTop: "1px solid var(--border-default)", textAlign: "end" as const, whiteSpace: "nowrap" as const, fontSize: 13 };
  return (
    <>
      <Seg
        options={[
          ["AIR", "Air Shipments", "Plane"],
          ["SEA", "Sea Shipments", "Ship"],
        ]}
        value={mode}
        onChange={(m) => go({ mode: m })}
      />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12 }}>
        <Stat icon="Receipt" label="Total cost" value={money(S.cost)} />
        <Stat icon="Banknote" tone="green" label="Total paid" value={money(S.paid)} />
        <Stat icon="CircleAlert" tone="red" label="Total remaining" value={money(S.remaining)} />
        <Stat icon="TrendingUp" tone="orange" label="Profit" value={money(S.profit)} />
      </div>
      <FinBox title="Shipment cost payment" pad={0}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Shipment", unit, "Origin cost", ...(air ? ["Transit cost"] : []), "Arrived cost (MGQ)", "Total cost", "Paid", "Remaining", "Status", "Profit"].map((h, i) => (
                  <th key={h} style={{ ...th, textAlign: i === 0 ? "start" : "end" }}>
                    {t(h)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {costs.rows.length === 0 && (
                <tr>
                  <td colSpan={10} style={{ ...td, textAlign: "center", color: "var(--text-muted)" }}>
                    {t("No records found")}
                  </td>
                </tr>
              )}
              {costs.rows.map((r) => {
                const due = Number(r.row.stages.ORIGIN) + Number(r.row.stages.TRANSIT) + Number(r.row.stages.ARRIVED);
                const paid = Number(r.paid.ORIGIN) + Number(r.paid.TRANSIT) + Number(r.paid.ARRIVED);
                const st = stageStatus(String(due), String(paid));
                const cell = (k: "ORIGIN" | "TRANSIT" | "ARRIVED") => (
                  <td style={td}>
                    {money(r.row.stages[k])}
                    <span style={{ display: "block", fontSize: 11, color: "var(--text-muted)" }}>
                      {t("Paid")} {money(r.paid[k])}
                    </span>
                  </td>
                );
                return (
                  <tr key={r.id} data-testid={`cost-${r.code}`}>
                    <td style={{ ...td, textAlign: "start", fontFamily: "var(--font-mono)", fontWeight: 700 }}>
                      {r.code}
                      <span style={{ display: "block", fontFamily: "var(--font-body)", fontWeight: 400, fontSize: 11, color: "var(--text-muted)" }}>{fdate(r.shipDate)}</span>
                    </td>
                    <td style={td}>{num(r.row.quantity, air ? 1 : 2)}</td>
                    {cell("ORIGIN")}
                    {air && cell("TRANSIT")}
                    {cell("ARRIVED")}
                    <td style={{ ...td, fontWeight: 700 }}>{money(due)}</td>
                    <td style={{ ...td, color: "var(--green-600)" }}>{money(paid)}</td>
                    <td style={{ ...td, color: due - paid > 0 ? "var(--red-600)" : undefined }}>{money(Math.max(0, due - paid))}</td>
                    <td style={td}>
                      <Badge tone={st === "Paid" ? "success" : st === "Partial" ? "warning" : st === "Unpaid" ? "danger" : "neutral"}>{t(st)}</Badge>
                    </td>
                    <td style={{ ...td, fontWeight: 700, color: Number(r.row.profit) >= 0 ? "var(--green-600)" : "var(--red-600)" }}>{money(r.row.profit)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </FinBox>
    </>
  );
}
