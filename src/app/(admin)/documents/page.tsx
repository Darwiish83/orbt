import { prisma } from "@/db/client";
import { can } from "@/modules/authz/core";
import { listDocuments } from "@/modules/documents/service";
import { requireUser } from "@/modules/authz/session";
import { Icon } from "@/ui/primitives";

export const metadata = { title: "Documents" };

const sizeLabel = (b: number) => (b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1048576).toFixed(1)} MB`);

export default async function AdminDocumentsPage() {
  const user = await requireUser();
  if (!can(user, "documents:read")) {
    return <p style={{ color: "var(--text-muted)" }}>You do not have access to documents.</p>;
  }
  const { items } = await listDocuments(prisma, user, { pageSize: 50 });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {items.length === 0 ? (
        <p style={{ color: "var(--text-muted)" }}>No documents uploaded yet.</p>
      ) : (
        items.map((d) => (
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
            <span style={{ fontWeight: 600, color: "var(--text-strong)" }}>{d.filename ?? "Document"}</span>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
              {d.kind} · {sizeLabel(d.size)}
            </span>
            <a href={`/api/documents/${d.id}/download`} style={{ marginLeft: "auto", color: "var(--navy-700)", fontWeight: 600, textDecoration: "none" }}>
              Download
            </a>
          </div>
        ))
      )}
    </div>
  );
}
