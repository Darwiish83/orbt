import type { InvoiceStatus } from "@prisma/client";
import { prisma } from "@/db/client";
import { listInvoices } from "@/modules/finance/invoices";
import { requireUser } from "@/modules/authz/session";
import { Badge, type BadgeTone } from "@/ui/primitives";

export const metadata = { title: "Finance" };

const STATUS_TONE: Record<InvoiceStatus, BadgeTone> = {
  UNPAID: "danger",
  PARTIAL: "warning",
  PAID: "success",
  VOID: "neutral",
};

const money = (v: { toString(): string }) =>
  "$" + Number(v.toString()).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const result = await listInvoices(prisma, user, { page });

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
              {["Invoice", "Currency", "Total", "Balance", "Status"].map((h) => (
                <th
                  key={h}
                  style={{
                    textAlign: h === "Total" || h === "Balance" ? "right" : "left",
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
                  No invoices yet.
                </td>
              </tr>
            ) : (
              result.items.map((inv) => {
                const balance = inv.total.minus(inv.amountAllocated);
                return (
                  <tr key={inv.id} style={{ borderBottom: "1px solid var(--border-default)" }}>
                    <td style={{ padding: "12px 14px", fontFamily: "var(--font-mono)", color: "var(--navy-700)", fontWeight: 600 }}>
                      {inv.number}
                    </td>
                    <td style={{ padding: "12px 14px" }}>{inv.currency}</td>
                    <td style={{ padding: "12px 14px", textAlign: "right", fontFamily: "var(--font-mono)" }}>{money(inv.total)}</td>
                    <td style={{ padding: "12px 14px", textAlign: "right", fontFamily: "var(--font-mono)" }}>{money(balance)}</td>
                    <td style={{ padding: "12px 14px" }}>
                      <Badge tone={STATUS_TONE[inv.status]} dot>
                        {inv.status}
                      </Badge>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
