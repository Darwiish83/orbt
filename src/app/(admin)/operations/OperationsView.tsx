"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { useT } from "@/i18n/I18nProvider";
import { Flag, SearchBox, Seg, Stat, StatusBadge, SHIPMENT_STATUS_LABEL } from "@/ui/kit";
import { Button, Checkbox, Dialog, Icon } from "@/ui/primitives";
import { num } from "@/ui/format";
import type { listOperations, OperationsRow } from "@/modules/shipments/manage";
import { FinBox, ToastHost, useToast } from "@/components/admin/ui";
import { changeStatusAction } from "./actions";

type Data = Awaited<ReturnType<typeof listOperations>>;
type Props = { data: Data; filters: { mode: string; status: string; q: string }; scope: { year: number; country: string }; canChange: boolean };

export function OperationsView(props: Props) {
  return (
    <ToastHost>
      <Inner {...props} />
    </ToastHost>
  );
}

function Inner({ data, filters, scope, canChange }: Props) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [nav, startNav] = useTransition();
  const [busy, start] = useTransition();
  const [q, setQ] = useState(filters.q);
  const [chg, setChg] = useState<OperationsRow | null>(null);
  const [ns, setNs] = useState<string>("");
  const [notify, setNotify] = useState(true);
  const [key, setKey] = useState("");
  const go = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "" || v === "ALL") p.delete(k);
      else p.set(k, v);
    }
    startNav(() => router.push(`${pathname}?${p.toString()}`, { scroll: false }));
  };
  const openChange = (r: OperationsRow) => {
    setChg(r);
    setNs(r.next[0] ?? "");
    setNotify(true);
    setKey(crypto.randomUUID());
  };
  const save = () =>
    start(async () => {
      if (!chg || !ns) return;
      const r = await changeStatusAction(chg.id, ns, notify, key);
      if (!r.ok) toast({ tone: "danger", title: r.error });
      else
        toast({
          tone: "success",
          title: "Status updated",
          message: `${chg.code} → ${t(SHIPMENT_STATUS_LABEL[ns as keyof typeof SHIPMENT_STATUS_LABEL])}${notify ? ` · ${chg.customers.length} ${t("customers notified")}` : ""}`,
        });
      setChg(null);
      router.refresh();
    });
  const sel = { height: 40, padding: "0 10px", border: "1px solid var(--border-strong)", borderRadius: "var(--radius-s)", background: "#fff", font: "400 14px var(--font-body)" } as const;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, opacity: nav ? 0.7 : 1 }}>
      <div>
        <h1 style={{ margin: 0, font: "700 26px/1.2 var(--font-display)", color: "var(--text-strong)" }}>{t("Operations")}</h1>
        <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>
          {t("Shipment statistics")} · {t(scope.country)} · {scope.year}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 12 }}>
        <Stat icon="Package" label="Total Shipments" value={String(data.stats.total)} />
        <Stat icon="Plane" tone="orange" label="Total Air" value={String(data.stats.air)} />
        <Stat icon="Ship" label="Total Sea" value={String(data.stats.sea)} />
        <Stat icon="Boxes" tone="green" label="Total Packages" value={num(data.stats.packages)} />
      </div>
      <FinBox pad={0}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", padding: 14 }}>
          <Seg
            options={[
              ["ALL", "All"],
              ["AIR", "Air", "Plane"],
              ["SEA", "Sea", "Ship"],
            ]}
            value={filters.mode}
            onChange={(m) => go({ mode: m })}
          />
          <form
            onSubmit={(e) => {
              e.preventDefault();
              go({ q });
            }}
          >
            <SearchBox value={q} onChange={setQ} style={{ width: 280, maxWidth: "100%" }} />
          </form>
          <select aria-label={t("Status")} value={filters.status} onChange={(e) => go({ status: e.target.value })} style={sel}>
            <option value="ALL">{t("All statuses")}</option>
            {Object.entries(SHIPMENT_STATUS_LABEL).map(([k, l]) => (
              <option key={k} value={k}>
                {t(l)}
              </option>
            ))}
          </select>
        </div>
        {!data.rows.length ? (
          <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)", fontSize: 14 }}>{t("No records found")}</div>
        ) : (
          data.rows.map((r) => {
            const air = r.mode === "AIR";
            return (
              <div key={r.id} data-testid={`ops-${r.code}`} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", flexWrap: "wrap", background: "var(--surface-sunken)", borderTop: "1px solid var(--border-default)" }}>
                <span style={{ width: 34, height: 34, borderRadius: "var(--radius-s)", background: air ? "var(--orange-50, #FFF1E8)" : "var(--navy-50)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
                  <Icon name={air ? "Plane" : "Ship"} size={17} color={air ? "var(--orange-500)" : "var(--navy-700)"} />
                </span>
                <div style={{ minWidth: 90 }}>
                  <div style={{ font: "700 17px var(--font-mono)", color: "var(--text-strong)" }}>{r.code}</div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                    {r.customers.length} {t("Customers")} · {num(r.packages)} {t("Packages")}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "4px 8px", fontSize: 13, color: "var(--text-body)", flex: 1, minWidth: 200 }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
                    <Flag country={r.originCountry} />
                    {t(r.originCountry)} · {r.originCity ?? "—"}
                  </span>
                  <Icon name="ArrowRight" size={14} color="var(--text-muted)" />
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
                    <Flag country={r.destCountry ?? "Somalia"} />
                    {t(r.destCountry ?? "Somalia")} · {r.destCity ?? "Mogadishu"}
                  </span>
                  {r.customers.length > 0 && <span style={{ flexBasis: "100%", fontSize: 12, color: "var(--text-muted)" }}>{r.customers.join(", ")}</span>}
                </div>
                <StatusBadge status={SHIPMENT_STATUS_LABEL[r.status]} />
                {canChange && (
                  <Button size="s" disabled={!r.next.length} onClick={() => openChange(r)} data-testid={`change-status-${r.code}`}>
                    {t("Change Shipment Status")}
                  </Button>
                )}
                <Button size="s" variant="outline" onClick={() => router.push(`/shipments/${r.id}`)}>
                  {t("Open Shipment")}
                </Button>
              </div>
            );
          })
        )}
      </FinBox>
      {chg && (
        <Dialog
          open
          onClose={() => setChg(null)}
          title={t("Change Shipment Status")}
          footer={
            <>
              <Button variant="ghost" onClick={() => setChg(null)}>
                {t("Cancel")}
              </Button>
              <Button onClick={save} disabled={busy || !ns} data-testid="save-status">
                {t("Save")}
              </Button>
            </>
          }
        >
          <div style={{ font: "600 14px var(--font-mono)", marginBottom: 4, color: "var(--text-strong)" }}>{chg.code}</div>
          <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 14 }}>
            {chg.customers.length} {t("customers will be updated at once")}
          </div>
          <div role="radiogroup" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {(chg.mode === "AIR" ? (["DEPARTED", "IN_TRANSIT", "ARRIVED"] as const) : (["DEPARTED", "ARRIVED"] as const)).map((st) => {
              const allowed = chg.next.includes(st);
              return (
                <label key={st} style={{ display: "flex", alignItems: "center", gap: 10, opacity: allowed ? 1 : 0.45, cursor: allowed ? "pointer" : "not-allowed" }}>
                  <input type="radio" name="ns" value={st} checked={ns === st} disabled={!allowed} onChange={() => setNs(st)} />
                  <StatusBadge status={SHIPMENT_STATUS_LABEL[st]} />
                </label>
              );
            })}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 10 }}>{t("Air goes Departed → Transit → Arrived; Sea goes Departed → Arrived.")}</div>
          <div style={{ marginTop: 16 }}>
            <Checkbox checked={notify} onChange={setNotify} label={t("Notify customers in this shipment")} />
          </div>
        </Dialog>
      )}
    </div>
  );
}
