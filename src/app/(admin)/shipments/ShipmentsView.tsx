"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { useT } from "@/i18n/I18nProvider";
import { DataTable, Flag, SearchBox, Seg, Stat, StatusBadge, SHIPMENT_STATUS_LABEL, type DataColumn } from "@/ui/kit";
import { Button, Dialog, Icon } from "@/ui/primitives";
import { fdate, money, num } from "@/ui/format";
import type { AdminShipmentRow } from "@/modules/shipments/manage";
import { FinBox, RowMenu, ToastHost, useToast } from "@/components/admin/ui";
import { deleteShipmentAction } from "./actions";
import { ShipmentForm, type ShipmentFormInitial } from "./ShipmentForm";

interface Props {
  scope: { year: number; country: string; years: number[]; countries: string[] };
  mode: "AIR" | "SEA";
  q: string;
  rows: AdminShipmentRow[];
  totals: { shipments: number; packages: number; measure: string; amount: string };
  perms: { write: boolean; manage: boolean };
}

function Table<R>(p: { cols: DataColumn<R>[]; rows: R[]; empty?: string; dense?: boolean; onRow?: (r: R) => void; rowKey?: (r: R, i: number) => string }) {
  const A = DataTable as unknown as (q: typeof p) => ReactNode;
  return <A {...p} />;
}

export function ShipmentsView(props: Props) {
  return (
    <ToastHost>
      <Inner {...props} />
    </ToastHost>
  );
}

function Inner({ scope, mode, q: q0, rows, totals, perms }: Props) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [nav, startNav] = useTransition();
  const [busy, start] = useTransition();
  const [q, setQ] = useState(q0);
  const [form, setForm] = useState<ShipmentFormInitial | null>(null);
  const [del, setDel] = useState<AdminShipmentRow | null>(null);
  const air = mode === "AIR";
  const go = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") p.delete(k);
      else p.set(k, v);
    }
    startNav(() => router.push(`${pathname}?${p.toString()}`, { scroll: false }));
  };
  const open = (r: AdminShipmentRow) => router.push(`/shipments/${r.id}`);

  const cols: DataColumn<AdminShipmentRow>[] = [
    { key: "c", label: "Shipment", mono: true, strong: true, render: (r) => r.code },
    { key: "d", label: "Date", render: (r) => fdate(r.shipDate) },
    { key: "a", label: "Arrival", render: (r) => fdate(r.arrivalDate) },
    {
      key: "o",
      label: "Origin",
      render: (r) => (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <Flag country={r.originCountry} />
          {t(r.originCountry)}
        </span>
      ),
    },
    { key: "oc", label: "Origin Code", render: (r) => r.originCity ?? "—" },
    {
      key: "de",
      label: "Destination",
      render: (r) => (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <Flag country={r.destCountry ?? "Somalia"} />
          {t(r.destCountry ?? "Somalia")}
        </span>
      ),
    },
    { key: "dc", label: "Destination Code", render: (r) => r.destCity ?? "—" },
    { key: "cu", label: "Customers", align: "right", render: (r) => r.customers },
    { key: "m", label: air ? "KG" : "CBM", align: "right", render: (r) => num(r.measure, air ? 1 : 2) },
    { key: "am", label: "Amount", align: "right", render: (r) => money(r.amount) },
    { key: "s", label: "Status", render: (r) => <StatusBadge status={SHIPMENT_STATUS_LABEL[r.status]} /> },
    { key: "w", label: air ? "AWB" : "Bill of Lading", mono: true, render: (r) => r.awb ?? "—" },
    {
      key: "x",
      label: "",
      align: "right",
      render: (r) => (
        <RowMenu
          items={
            [
              ["Open Shipment", () => open(r)],
              perms.write && ["Edit Shipment", () => setForm({ ...r, businessYear: scope.year })],
              perms.manage && ["Delete Shipment", () => setDel(r)],
            ].filter(Boolean) as [string, () => void][]
          }
        />
      ),
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, opacity: nav ? 0.7 : 1 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0, font: "700 26px/1.2 var(--font-display)", color: "var(--text-strong)" }}>{t("Shipments")}</h1>
          <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>
            {t(scope.country)} · {t("Business year")} {scope.year}
          </div>
        </div>
        {perms.write && (
          <Button leadingIcon={<Icon name="Plus" size={16} />} data-testid="create-shipment" onClick={() => setForm({ mode, originCountry: scope.country, businessYear: scope.year })}>
            {t("Create Shipment")}
          </Button>
        )}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <Seg
          options={[
            ["AIR", "Air Freight", "Plane"],
            ["SEA", "Sea Freight", "Ship"],
          ]}
          value={mode}
          onChange={(m) => go({ mode: m, q: null })}
        />
        <form
          onSubmit={(e) => {
            e.preventDefault();
            go({ q });
          }}
        >
          <SearchBox value={q} onChange={setQ} placeholder="Search shipment code or AWB" style={{ width: 340, maxWidth: "100%" }} />
        </form>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 12 }}>
        <Stat icon="Package" label="Total Shipments" value={String(totals.shipments)} />
        <Stat icon="Boxes" label="Total Packages" value={num(totals.packages)} />
        <Stat icon={air ? "Weight" : "Box"} tone="orange" label={air ? "Total KG" : "Total CBM"} value={num(totals.measure, air ? 1 : 2)} />
        <Stat icon="Banknote" tone="green" label="Total Amount" value={money(totals.amount)} />
      </div>
      <FinBox title="Shipment list" pad={0}>
        <Table dense rows={rows} cols={cols} empty="No shipments yet" onRow={open} rowKey={(r) => r.id} />
      </FinBox>
      {form && (
        <ShipmentForm
          initial={form}
          countries={scope.countries}
          years={scope.years}
          onClose={() => setForm(null)}
          onSaved={(sid) => {
            setForm(null);
            if (form.id) router.refresh();
            else router.push(`/shipments/${sid}`);
          }}
        />
      )}
      {del && (
        <Dialog
          open
          title={t("Delete Shipment")}
          onClose={() => setDel(null)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setDel(null)}>
                {t("Cancel")}
              </Button>
              <Button
                disabled={busy}
                style={{ background: "var(--red-600)", borderColor: "var(--red-600)" }}
                onClick={() =>
                  start(async () => {
                    const r = await deleteShipmentAction(del.id);
                    if (!r.ok) toast({ tone: "danger", title: r.error });
                    else toast({ tone: "success", title: "Shipment deleted", message: del.code });
                    setDel(null);
                    router.refresh();
                  })
                }
              >
                {t("Delete")}
              </Button>
            </>
          }
        >
          <div style={{ fontSize: 14, color: "var(--text-body)" }}>
            {t("Are you sure you want to delete")} <b>{del.code}</b>?
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8 }}>{t("Only an empty shipment that has not moved can be deleted.")}</div>
          </div>
        </Dialog>
      )}
    </div>
  );
}
