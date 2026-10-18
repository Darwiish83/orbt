import { prisma } from "@/db/client";
import { can } from "@/modules/authz/core";
import { listTransfers } from "@/modules/transfer/service";
import { requireUser } from "@/modules/authz/session";
import { Badge, type BadgeTone } from "@/ui/primitives";
import { TransferForm } from "./TransferForm";
import { receiveTransferAction, sendTransferAction } from "./actions";

export const metadata = { title: "Transfer" };

const TONE: Record<string, BadgeTone> = { PENDING: "neutral", SENT: "info", RECEIVED: "success", CANCELLED: "danger" };

export default async function TransferPage() {
  const user = await requireUser();
  if (!can(user, "transfer:read")) {
    return <p style={{ color: "var(--text-muted)" }}>You do not have access to transfers.</p>;
  }
  const { items } = await listTransfers(prisma, user, { pageSize: 50 });
  const mayWrite = can(user, "transfer:write");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {mayWrite && <TransferForm />}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {items.length === 0 ? (
          <p style={{ color: "var(--text-muted)" }}>No transfers yet.</p>
        ) : (
          items.map((tr) => (
            <div
              key={tr.id}
              style={{
                background: "var(--surface-card)",
                border: "1px solid var(--border-default)",
                borderRadius: "var(--radius-l)",
                boxShadow: "var(--shadow-1)",
                padding: 16,
                display: "flex",
                gap: 12,
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--navy-700)" }}>{tr.reference}</span>
              <span style={{ fontSize: 14 }}>
                {tr.currency} {Number(tr.amount.toString()).toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </span>
              <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
                {tr.fromCountry} → {tr.toCountry}
              </span>
              <div style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center" }}>
                <Badge tone={TONE[tr.status] ?? "neutral"} dot>
                  {tr.status}
                </Badge>
                {mayWrite && tr.status === "PENDING" && (
                  <form action={sendTransferAction}>
                    <input type="hidden" name="id" value={tr.id} />
                    <button type="submit" style={{ height: 32, padding: "0 12px", border: 0, borderRadius: "var(--radius-s)", background: "var(--action-primary)", color: "#fff", font: "700 12px var(--font-body)", cursor: "pointer" }}>
                      Send
                    </button>
                  </form>
                )}
                {mayWrite && tr.status === "SENT" && (
                  <form action={receiveTransferAction}>
                    <input type="hidden" name="id" value={tr.id} />
                    <button type="submit" style={{ height: 32, padding: "0 12px", border: "1.5px solid var(--navy-700)", background: "transparent", color: "var(--navy-700)", borderRadius: "var(--radius-s)", font: "700 12px var(--font-body)", cursor: "pointer" }}>
                      Receive
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
