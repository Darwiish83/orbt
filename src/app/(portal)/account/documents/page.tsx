import { prisma } from "@/db/client";
import { listDocuments } from "@/modules/documents/service";
import { myTransferReceipts } from "@/modules/transfer/receipts";
import { money } from "@/ui/format";
import { requireUser } from "@/modules/authz/session";
import { Icon } from "@/ui/primitives";
import { UploadForm } from "./UploadForm";

export const metadata = { title: "My documents" };

function sizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default async function AccountDocumentsPage() {
  const user = await requireUser();
  const [{ items }, transfers] = await Promise.all([listDocuments(prisma, user, { pageSize: 50 }), myTransferReceipts(prisma, user)]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h1 style={{ font: "700 24px/1.2 var(--font-display)", color: "var(--text-strong)", margin: 0 }}>Documents</h1>
      <UploadForm />

      {transfers.length > 0 && (
        <section style={{ display: "flex", flexDirection: "column", gap: 8 }} data-testid="my-transfer-receipts">
          <h2 style={{ font: "700 17px var(--font-display)", color: "var(--text-strong)", margin: 0 }}>Transfer receipts</h2>
          {transfers.map((r) => (
            <a
              key={r.id}
              href={`/account/documents/transfer/${r.id}`}
              target="_blank"
              rel="noopener"
              style={{ background: "var(--surface-card)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-l)", boxShadow: "var(--shadow-1)", padding: "12px 16px", display: "flex", alignItems: "center", gap: 12, textDecoration: "none", color: "inherit" }}
            >
              <Icon name="ArrowLeftRight" size={18} color="var(--navy-700)" />
              <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                <span style={{ color: "var(--text-strong)", fontWeight: 600 }}>
                  Receipt No. {r.number} · {r.description}
                </span>
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  {r.date.split("-").reverse().join("/")} · {r.currency} {money(r.received)}
                </span>
              </span>
              <span style={{ marginLeft: "auto", color: "var(--navy-700)", fontWeight: 600 }}>View</span>
            </a>
          ))}
        </section>
      )}

      {items.length === 0 ? (
        <p style={{ color: "var(--text-muted)" }}>No documents yet.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {items.map((d) => (
            <div
              key={d.id}
              style={{
                background: "var(--surface-card)",
                border: "1px solid var(--border-default)",
                borderRadius: "var(--radius-l)",
                boxShadow: "var(--shadow-1)",
                padding: "12px 16px",
                display: "flex",
                alignItems: "center",
                gap: 12,
              }}
            >
              <Icon name="FileText" size={18} color="var(--navy-700)" />
              <span style={{ color: "var(--text-strong)", fontWeight: 600 }}>{d.filename ?? "Document"}</span>
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{sizeLabel(d.size)}</span>
              <a
                href={`/api/documents/${d.id}/download`}
                style={{ marginLeft: "auto", color: "var(--navy-700)", fontWeight: 600, textDecoration: "none" }}
              >
                Download
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
