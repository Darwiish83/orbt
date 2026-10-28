"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useT } from "@/i18n/I18nProvider";
import { SearchBox, StatusBadge, INVOICE_STATUS_LABEL } from "@/ui/kit";
import { Icon, Tabs } from "@/ui/primitives";
import { fdate, money, num } from "@/ui/format";
import type { myRecords } from "@/modules/portal/customerApp";
import type { TransferReceiptDoc } from "@/modules/transfer/receipts";
import { Card, Empty, SectionTitle, YearPicker } from "../ui";

type Records = Awaited<ReturnType<typeof myRecords>>;
type Doc = { id: string; filename: string; size: number; date: string; reference: string | null };
const kb = (n: number) =>
  n < 1024 * 1024
    ? `${Math.max(1, Math.round(n / 1024))} KB`
    : `${(n / 1024 / 1024).toFixed(1)} MB`;

/** Documents (design customer-app/Records.jsx): packing lists, shipment records and transfer receipts. */
export function DocumentsView({
  docs,
  records,
  transfers,
  year,
  years,
  tab,
}: {
  docs: Doc[];
  records: Records;
  transfers: TransferReceiptDoc[];
  year: number;
  years: number[];
  tab: string;
}) {
  const t = useT();
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState("");
  const setTab = (v: string) => {
    const p = new URLSearchParams(params.toString());
    if (v === "packing") p.delete("tab");
    else p.set("tab", v);
    router.push(`${path}?${p.toString()}`, { scroll: false });
  };
  const shown = docs.filter(
    (d) => !q || `${d.filename} ${d.reference ?? ""}`.toLowerCase().includes(q.toLowerCase()),
  );
  const sum = (f: (r: Records[number]) => number) => records.reduce((a, r) => a + f(r), 0);
  const summary: [string, string, string?][] = [
    ["Total Shipments", String(records.length)],
    [
      "Total KG",
      num(
        sum((r) => (r.mode === "AIR" ? Number(r.measure) : 0)),
        1,
      ),
    ],
    [
      "Total CBM",
      num(
        sum((r) => (r.mode === "SEA" ? Number(r.measure) : 0)),
        2,
      ),
    ],
    ["Invoices", money(sum((r) => Number(r.invoice?.total ?? 0))), "var(--navy-50)"],
    ["Paid Money", money(sum((r) => Number(r.invoice?.paid ?? 0))), "var(--status-success-bg)"],
    [
      "Remaining Money",
      money(sum((r) => Number(r.invoice?.balance ?? 0))),
      "var(--status-danger-bg)",
    ],
  ];
  return (
    <>
      <div className="cust-scroll-x">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { value: "packing", label: t("My Packing Lists"), count: docs.length },
            { value: "records", label: t("My Records") },
            { value: "transfer", label: t("Transfer receipts"), count: transfers.length },
          ]}
        />
      </div>
      {tab === "packing" && (
        <>
          <SearchBox value={q} onChange={setQ} placeholder="Search packing lists" />
          <SectionTitle>Available Packing Lists</SectionTitle>
          {shown.map((d) => (
            <Card key={d.id}>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <span
                  style={{
                    width: 40,
                    height: 48,
                    flex: "none",
                    borderRadius: 4,
                    background: "#FDECEC",
                    color: "var(--red-600)",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 2,
                    font: "800 9px var(--font-body)",
                  }}
                >
                  <Icon name="FileText" size={18} />
                  {(d.filename.split(".").pop() ?? "").toUpperCase().slice(0, 4)}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      font: "600 13px var(--font-body)",
                      color: "var(--text-strong)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {d.filename}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                    {[d.reference, fdate(d.date), kb(d.size)].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <a
                  href={`/api/documents/${d.id}/download`}
                  aria-label={t("Download")}
                  style={{
                    width: 34,
                    height: 34,
                    flex: "none",
                    borderRadius: "var(--radius-s)",
                    background: "var(--navy-700)",
                    color: "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Icon name="Download" size={15} />
                </a>
              </div>
            </Card>
          ))}
          {!shown.length && <Empty />}
        </>
      )}
      {tab === "records" && (
        <>
          <SectionTitle action={<YearPicker year={year} years={years} />}>
            Shipment Records
          </SectionTitle>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 8 }}>
            {summary.map(([l, v, bg], i) => (
              <div
                key={l}
                style={{
                  background: bg ?? "#fff",
                  border: "1px solid var(--border-default)",
                  borderRadius: "var(--radius-m)",
                  padding: "10px 8px",
                  minWidth: 0,
                }}
              >
                <div style={{ fontSize: 10, color: "var(--text-muted)", lineHeight: 1.25 }}>
                  {t(l)}
                </div>
                <div
                  style={{
                    font: "800 14px var(--font-display)",
                    color:
                      i === 5
                        ? "var(--status-danger)"
                        : i === 4
                          ? "var(--status-success)"
                          : "var(--text-strong)",
                    marginTop: 4,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {v}
                </div>
              </div>
            ))}
          </div>
          {records.map((r) => (
            <Card key={r.id} href={`/account/records/${r.id}`}>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <span
                    style={{
                      font: "600 13px var(--font-mono)",
                      color: "var(--text-strong)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {r.code}
                  </span>
                  {r.invoice ? (
                    <StatusBadge status={INVOICE_STATUS_LABEL[r.invoice.status]} />
                  ) : (
                    <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                      {t("No invoice yet")}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 13, color: "var(--text-body)" }}>
                  {t(r.mode === "AIR" ? "Air Cargo" : "Sea Cargo")} ·{" "}
                  {r.originCity ?? t(r.originCountry)} → {r.destCity ?? r.destCode ?? t("Somalia")}
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(3,1fr)",
                    gap: 6,
                    fontSize: 12,
                  }}
                >
                  {(
                    [
                      ["Date", r.shipDate ? fdate(r.shipDate) : "—"],
                      ["Packages", String(r.packages)],
                      ["Invoice", r.invoice?.number ?? "—"],
                    ] as const
                  ).map(([l, v]) => (
                    <div key={l} style={{ minWidth: 0 }}>
                      <div style={{ color: "var(--text-muted)", fontSize: 11 }}>{t(l)}</div>
                      <div
                        style={{
                          fontWeight: 600,
                          color: "var(--text-strong)",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {v}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          ))}
          {!records.length && <Empty />}
        </>
      )}
      {tab === "transfer" && (
        <>
          {transfers.map((r) => (
            <Card key={r.id} href={`/account/documents/transfer/${r.id}`}>
              <div
                style={{ display: "flex", alignItems: "center", gap: 12 }}
                data-testid="my-transfer-receipts"
              >
                <span
                  style={{
                    width: 36,
                    height: 36,
                    flex: "none",
                    borderRadius: "var(--radius-s)",
                    background: "var(--navy-50)",
                    color: "var(--navy-700)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Icon name="ArrowLeftRight" size={18} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ font: "700 14px var(--font-body)", color: "var(--text-strong)" }}>
                    {t("Receipt")} No. {r.number} · {r.description}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                    {fdate(r.date)} · {r.currency} {money(r.amount)}
                  </div>
                </div>
                <Icon name="ChevronRight" size={16} color="var(--text-muted)" />
              </div>
            </Card>
          ))}
          {!transfers.length && <Empty />}
        </>
      )}
    </>
  );
}
