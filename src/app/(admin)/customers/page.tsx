import Link from "next/link";
import { prisma } from "@/db/client";
import { listCustomers } from "@/modules/customers/service";
import { requireUser } from "@/modules/authz/session";
import { can } from "@/modules/authz/core";
import { NewCustomerForm } from "./NewCustomerForm";

export const metadata = { title: "Customers" };

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const result = await listCustomers(prisma, user, { page, query: sp.q });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {can(user, "customers:write") && <NewCustomerForm />}

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
              {["Reference", "Name", "Country", "Status"].map((h) => (
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
                <td colSpan={4} style={{ padding: 32, textAlign: "center", color: "var(--text-muted)" }}>
                  No customers yet.
                </td>
              </tr>
            ) : (
              result.items.map((c) => (
                <tr key={c.id} style={{ borderBottom: "1px solid var(--border-default)" }}>
                  <td style={{ padding: "12px 14px", fontFamily: "var(--font-mono)", color: "var(--navy-700)" }}>
                    {c.ref}
                  </td>
                  <td style={{ padding: "12px 14px", color: "var(--text-strong)", fontWeight: 600 }}>{c.name}</td>
                  <td style={{ padding: "12px 14px", color: "var(--text-body)" }}>{c.country ?? "—"}</td>
                  <td style={{ padding: "12px 14px", color: "var(--text-body)" }}>{c.status}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Pagination page={result.page} totalPages={result.totalPages} basePath="/customers" query={sp.q} />
    </div>
  );
}

function Pagination({
  page,
  totalPages,
  basePath,
  query,
}: {
  page: number;
  totalPages: number;
  basePath: string;
  query?: string;
}) {
  const qs = (p: number) => {
    const params = new URLSearchParams();
    params.set("page", String(p));
    if (query) params.set("q", query);
    return `${basePath}?${params.toString()}`;
  };
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center", fontSize: 13, color: "var(--text-muted)" }}>
      {page > 1 ? <Link href={qs(page - 1)}>← Prev</Link> : <span style={{ opacity: 0.4 }}>← Prev</span>}
      <span>
        Page {page} of {totalPages}
      </span>
      {page < totalPages ? <Link href={qs(page + 1)}>Next →</Link> : <span style={{ opacity: 0.4 }}>Next →</span>}
    </div>
  );
}
