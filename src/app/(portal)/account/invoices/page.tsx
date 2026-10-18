import type { InvoiceStatus } from "@prisma/client";
import { prisma } from "@/db/client";
import { listInvoices } from "@/modules/finance/invoices";
import { requireUser } from "@/modules/authz/session";
import { Badge, type BadgeTone } from "@/ui/primitives";

export const metadata = { title: "My invoices" };

const TONE: Record<InvoiceStatus, BadgeTone> = {
  UNPAID: "danger",
  PARTIAL: "warning",
  PAID: "success",
  VOID: "neutral",
};

const money = (v: { toString(): string }, currency: string) =>
  `${currency} ` + Number(v.toString()).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default async function AccountInvoicesPage() {
  const user = await requireUser();
  const { items } = await listInvoices(prisma, user, { pageSize: 50 });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h1 style={{ font: "700 24px/1.2 var(--font-display)", color: "var(--text-strong)", margin: 0 }}>Invoices</h1>
      {items.length === 0 ? (
        <p style={{ color: "var(--text-muted)" }}>No invoices yet.</p>
      ) : (
        items.map((inv) => (
          <div
            key={inv.id}
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
            <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--navy-700)" }}>{inv.number}</span>
            <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)" }}>{money(inv.total, inv.currency)}</span>
            <Badge tone={TONE[inv.status]} dot>
              {inv.status}
            </Badge>
          </div>
        ))
      )}
    </div>
  );
}
