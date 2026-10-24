"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition, type ReactNode } from "react";
import { useT } from "@/i18n/I18nProvider";
import { DataTable, Flag, Overline, Stat, StatusBadge, SHIPMENT_STATUS_LABEL, type DataColumn } from "@/ui/kit";
import { Badge, Button, Dialog, Icon, Input } from "@/ui/primitives";
import { fdate, money, num } from "@/ui/format";
import type { getAdminShipment, ShipmentLineRow } from "@/modules/shipments/manage";
import { FinBox, RowMenu, ToastHost, useToast } from "@/components/admin/ui";
import { addLineAction, deleteLineAction, notifyLineAction, searchCustomersAction, setAwbKgAction, updateLineAction, type LineFormValues } from "../actions";
import { ShipmentForm } from "../ShipmentForm";

type Data = Awaited<ReturnType<typeof getAdminShipment>>;

function Table<R>(p: { cols: DataColumn<R>[]; rows: R[]; empty?: string; dense?: boolean; rowKey?: (r: R, i: number) => string }) {
  const A = DataTable as unknown as (q: typeof p) => ReactNode;
  return <A {...p} />;
}

export function ShipmentDetailView(props: { data: Data; scope: { years: number[]; countries: string[] }; perms: { write: boolean; customers: boolean } }) {
  return (
    <ToastHost>
      <Inner {...props} />
    </ToastHost>
  );
}

function Inner({ data, scope, perms }: { data: Data; scope: { years: number[]; countries: string[] }; perms: { write: boolean; customers: boolean } }) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const [busy, start] = useTransition();
  const s = data.shipment;
  const air = s.mode === "AIR";
  const unit = air ? " kg" : " m³";
  const [line, setLine] = useState<ShipmentLineRow | "new" | null>(null);
  const [del, setDel] = useState<ShipmentLineRow | null>(null);
  const [edit, setEdit] = useState(false);
  const [awb, setAwb] = useState(data.totals.awbKg ?? "");
  const diff = data.totals.difference;

  const act = (p: Promise<{ ok: boolean; error?: string }>, ok: string, msg?: string) =>
    start(async () => {
      const r = await p;
      if (!r.ok) toast({ tone: "danger", title: r.error ?? "Error" });
      else toast({ tone: "success", title: ok, message: msg });
      router.refresh();
    });

  const cols: DataColumn<ShipmentLineRow>[] = [
    { key: "r", label: "Reference", mono: true, strong: true, render: (r) => r.customerRef },
    { key: "n", label: "Name", render: (r) => r.customerName },
    { key: "s", label: "Status", render: () => <StatusBadge status={SHIPMENT_STATUS_LABEL[s.status]} /> },
    {
      key: "p",
      label: "Packages",
      align: "right",
      render: (r) => (
        <span>
          {r.packages} {t("box")}
          {r.mixCount ? `, ${r.mixCount} ${t("mix")}` : ""}
        </span>
      ),
    },
    { key: "m", label: "Measure", align: "right", render: (r) => num(r.measure, 1) + unit },
    { key: "bp", label: "Brand PCS", align: "right", render: (r) => r.brandPcs },
    { key: "br", label: "Brand Rate", align: "right", render: (r) => money(r.brandRate) },
    { key: "ba", label: "Brand Amount", align: "right", render: (r) => money(r.brandPcs * Number(r.brandRate)) },
    { key: "ra", label: "Rate", align: "right", render: (r) => money(r.rate) },
    { key: "q", label: "Quality", align: "right", render: (r) => (Number(r.qualityRate) ? money(Number(r.qualityRate) * Number(r.measure)) : "—") },
    { key: "f", label: "Fatura", align: "right", render: (r) => money(r.fatura) },
    { key: "d", label: "Delivery", align: "right", render: (r) => money(r.delivery) },
    { key: "a", label: "Amount", align: "right", strong: true, render: (r) => money(r.amount) },
    {
      key: "no",
      label: "Notification",
      render: (r) =>
        r.notifiedAt ? (
          <Badge tone="success">{t("Sent")}</Badge>
        ) : perms.write ? (
          <Button size="s" variant="outline" disabled={busy} leadingIcon={<Icon name="Send" size={13} />} onClick={() => act(notifyLineAction(s.id, r.id), "Notification sent", `${r.customerRef} · ${s.code}`)}>
            {t("Notify")}
          </Button>
        ) : (
          "—"
        ),
    },
    {
      key: "x",
      label: "",
      align: "right",
      render: (r) =>
        perms.write ? (
          <RowMenu
            items={[
              ["Edit Customer", () => setLine(r)],
              ["Delete Customer", () => setDel(r)],
            ]}
          />
        ) : null,
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <Button variant="ghost" size="s" leadingIcon={<Icon name="ArrowLeft" size={15} />} onClick={() => router.push(`/shipments?mode=${s.mode}`)}>
          {t("Shipment list")}
        </Button>
      </div>
      <div style={{ background: "var(--navy-700)", color: "#fff", borderRadius: "var(--radius-l)", padding: 22, display: "flex", gap: 24, alignItems: "center", flexWrap: "wrap" }}>
        <div>
          <Overline color="var(--orange-400)">{t(air ? "Air Freight" : "Sea Freight")}</Overline>
          <div data-testid="shipment-code" style={{ font: "600 24px var(--font-mono)", marginTop: 8 }}>
            {s.code}
          </div>
          <div style={{ fontSize: 13, color: "var(--navy-300)", marginTop: 4 }}>
            {air ? "AWB" : "B/L"} {s.awb ?? "—"}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flex: 1, minWidth: 260 }}>
          <div>
            <div style={{ font: "800 24px var(--font-display)", display: "flex", alignItems: "center", gap: 10 }}>
              <Flag country={s.originCountry} size={20} />
              {t(s.originCountry)}
            </div>
            <div style={{ fontSize: 12, color: "var(--navy-300)" }}>
              {s.originCity ?? "—"} · {fdate(s.shipDate)}
            </div>
          </div>
          <div style={{ flex: 1, height: 2, background: "repeating-linear-gradient(90deg,var(--orange-500) 0 8px,transparent 8px 14px)" }} />
          <Icon name={air ? "Plane" : "Ship"} size={22} color="var(--orange-500)" />
          <div style={{ flex: 1, height: 2, background: "rgba(255,255,255,.2)" }} />
          <div style={{ textAlign: "end" }}>
            <div style={{ font: "800 24px var(--font-display)", display: "flex", alignItems: "center", gap: 10, justifyContent: "flex-end" }}>
              <Flag country={s.destCountry ?? "Somalia"} size={20} />
              {t(s.destCountry ?? "Somalia")}
            </div>
            <div style={{ fontSize: 12, color: "var(--navy-300)" }}>
              {s.destCity ?? "Mogadishu"} · {fdate(s.arrivalDate)}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
          <StatusBadge status={SHIPMENT_STATUS_LABEL[s.status]} />
          {perms.write && (
            <Button size="s" variant="inverse" leadingIcon={<Icon name="Pencil" size={14} />} onClick={() => setEdit(true)}>
              {t("Edit Shipment")}
            </Button>
          )}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12 }}>
        <Stat icon="UsersRound" label="Customers" value={String(data.totals.customers)} />
        <Stat icon="Boxes" label="Total Packages" value={num(data.totals.packages)} />
        <Stat icon={air ? "Weight" : "Box"} tone="orange" label={air ? "Total KG" : "Total CBM"} value={num(data.totals.measure, 1)} />
        {air && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              act(setAwbKgAction(s.id, String(awb)), "AWB KG saved");
            }}
            style={{ background: "#fff", border: "1.5px solid var(--navy-700)", borderRadius: "var(--radius-l)", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 6 }}
          >
            <span style={{ font: "600 12px var(--font-body)", color: "var(--text-muted)" }}>{t("AWB KG")}</span>
            <input
              type="number"
              step="0.1"
              min="0"
              aria-label={t("AWB KG")}
              data-testid="awb-kg"
              value={awb}
              placeholder="0"
              readOnly={!perms.write}
              onChange={(e) => setAwb(e.target.value)}
              onBlur={() => perms.write && String(awb) !== String(data.totals.awbKg ?? "") && act(setAwbKgAction(s.id, String(awb)), "AWB KG saved")}
              style={{ width: "100%", border: 0, borderBottom: "1px dashed var(--border-strong)", outline: 0, background: "transparent", font: "800 22px var(--font-display)", color: "var(--text-strong)", padding: "2px 0" }}
            />
          </form>
        )}
        {air && (
          <Stat
            icon="Scale"
            tone={diff === null ? undefined : Number(diff) === 0 ? "green" : "red"}
            label="Difference"
            value={diff === null ? "—" : (Number(diff) > 0 ? "+" : "") + num(diff, 1) + unit}
          />
        )}
        <Stat icon="Banknote" tone="green" label="Total Amount" value={money(data.totals.amount)} />
      </div>
      <FinBox
        title="Customer list"
        pad={0}
        actions={
          perms.write && perms.customers ? (
            <Button size="s" leadingIcon={<Icon name="UserPlus" size={14} />} onClick={() => setLine("new")} data-testid="add-line">
              {t("Add Customer")}
            </Button>
          ) : undefined
        }
      >
        <Table dense rows={data.lines} cols={cols} empty="No customers in this shipment" rowKey={(r) => r.id} />
      </FinBox>

      {line && (
        <LineForm
          shipment={s}
          line={line === "new" ? null : line}
          onClose={() => setLine(null)}
          onSaved={() => {
            setLine(null);
            toast({ tone: "success", title: "Customer saved", message: s.code });
            router.refresh();
          }}
        />
      )}
      {edit && (
        <ShipmentForm
          initial={{ ...s, businessYear: s.businessYear }}
          countries={scope.countries}
          years={scope.years}
          onClose={() => setEdit(false)}
          onSaved={() => {
            setEdit(false);
            router.refresh();
          }}
        />
      )}
      {del && (
        <Dialog
          open
          title={t("Delete Customer")}
          onClose={() => setDel(null)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setDel(null)}>
                {t("Cancel")}
              </Button>
              <Button
                disabled={busy}
                style={{ background: "var(--red-600)", borderColor: "var(--red-600)" }}
                onClick={() => {
                  act(deleteLineAction(s.id, del.id), "Customer removed", del.customerRef);
                  setDel(null);
                }}
              >
                {t("Delete")}
              </Button>
            </>
          }
        >
          <div style={{ fontSize: 14 }}>
            {t("Remove this entry from the shipment?")} <b>{del.customerRef}</b> · {del.customerName} · {num(del.measure, 1)}
            {unit}
          </div>
        </Dialog>
      )}
    </div>
  );
}

type Customer = { id: string; ref: string; name: string; company: string | null };

/** Customer picker: type a name or reference; the server searches (spec §7). */
function CustomerPicker({ value, onChange }: { value: Customer | null; onChange: (c: Customer) => void }) {
  const t = useT();
  const [q, setQ] = useState(value ? `${value.ref} — ${value.name}` : "");
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<Customer[]>([]);
  useEffect(() => {
    if (!open) return;
    const term = value && q === `${value.ref} — ${value.name}` ? "" : q;
    const id = setTimeout(async () => {
      const r = await searchCustomersAction(term);
      if (r.ok) setList(r.data ?? []);
    }, 200);
    return () => clearTimeout(id);
  }, [q, open, value]);
  return (
    <div style={{ position: "relative" }}>
      <Input
        label={t("Customer")}
        value={q}
        placeholder={t("Type name or Customer Reference")}
        leadingIcon={<Icon name="Search" size={15} />}
        onFocus={(e) => {
          e.target.select();
          setOpen(true);
        }}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        data-testid="customer-picker"
      />
      {open && (
        <div role="listbox" style={{ position: "absolute", left: 0, right: 0, top: "100%", marginTop: 4, zIndex: 20, background: "#fff", border: "1px solid var(--border-default)", borderRadius: "var(--radius-m)", boxShadow: "var(--shadow-3)", maxHeight: 260, overflowY: "auto" }}>
          {list.map((c) => (
            <div
              key={c.id}
              role="option"
              aria-selected={c.id === value?.id}
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(c);
                setQ(`${c.ref} — ${c.name}`);
                setOpen(false);
              }}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", cursor: "pointer", background: c.id === value?.id ? "var(--surface-brand-tint)" : "#fff", borderBottom: "1px solid var(--border-default)" }}
            >
              <span style={{ font: "600 12px var(--font-mono)", color: "var(--navy-700)", flex: "none" }}>{c.ref}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", font: "600 13px var(--font-body)", color: "var(--text-strong)" }}>{c.name}</span>
                <span style={{ display: "block", fontSize: 11, color: "var(--text-muted)" }}>{c.company}</span>
              </span>
            </div>
          ))}
          {!list.length && <div style={{ padding: 14, fontSize: 13, color: "var(--text-muted)", textAlign: "center" }}>{t("No records found")}</div>}
        </div>
      )}
    </div>
  );
}

/**
 * Add / Edit Customer in a shipment (design `LineForm`): boxes and their
 * KG/CBM, MIX (count + KG, Air), rate, quality per KG, brand, fatura and
 * delivery. Measure = KG + MIX KG; the amount shown is a preview — the server
 * recomputes it. The same customer can be added again (entries stack).
 */
function LineForm({ shipment, line, onClose, onSaved }: { shipment: Data["shipment"]; line: ShipmentLineRow | null; onClose: () => void; onSaved: () => void }) {
  const t = useT();
  const air = shipment.mode === "AIR";
  const [customer, setCustomer] = useState<Customer | null>(line ? { id: line.customerId, ref: line.customerRef, name: line.customerName, company: null } : null);
  const z = (v: string | number | undefined) => (v === undefined || v === "0" || v === 0 ? "" : String(v));
  const [v, setV] = useState<Record<keyof LineFormValues, string>>({
    packages: z(line?.packages ?? 1),
    box: z(line?.boxMeasure),
    mixCount: z(line?.mixCount),
    mixMeasure: z(line?.mixMeasure),
    rate: z(line?.rate),
    qualityRate: z(line?.qualityRate),
    brandPcs: z(line?.brandPcs),
    brandRate: z(line?.brandRate),
    fatura: z(line?.fatura),
    delivery: z(line?.delivery),
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const n = (k: keyof LineFormValues) => Number(v[k]) || 0;
  const measure = n("box") + (air ? n("mixMeasure") : 0);
  const amount = measure * (n("rate") + n("qualityRate")) + n("brandPcs") * n("brandRate") + n("fatura") + n("delivery");

  const save = () =>
    start(async () => {
      setError(null);
      if (!customer) return setError("Select a customer first");
      const values = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, x.trim()])) as LineFormValues;
      const r = line ? await updateLineAction(shipment.id, line.id, shipment.mode, values) : await addLineAction(shipment.id, shipment.mode, customer.id, values);
      if (!r.ok) return setError(r.error);
      onSaved();
    });

  const F = (k: keyof LineFormValues, label: string, step = "0.01") => (
    <Input key={k} type="number" min="0" step={step} label={t(label)} value={v[k]} onChange={(e) => setV((o) => ({ ...o, [k]: e.target.value }))} />
  );
  return (
    <Dialog
      open
      width={680}
      onClose={onClose}
      title={`${t(line ? "Edit Customer" : "Add Customer")} · ${shipment.code}`}
      footer={
        <>
          <span style={{ marginInlineEnd: "auto", font: "700 15px var(--font-body)", color: "var(--text-strong)", alignSelf: "center" }}>
            {air ? "KG" : "CBM"}: {num(measure, 2)} · {t("Amount")}: {money(amount)}
          </span>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            {t("Cancel")}
          </Button>
          <Button onClick={save} disabled={pending} data-testid="save-line">
            {t("Save")}
          </Button>
        </>
      }
    >
      {line ? (
        <div style={{ font: "600 14px var(--font-body)" }}>
          <span style={{ fontFamily: "var(--font-mono)", color: "var(--navy-700)" }}>{line.customerRef}</span> — {line.customerName}
        </div>
      ) : (
        <CustomerPicker value={customer} onChange={setCustomer} />
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 14, marginTop: 14 }}>
        {F("packages", "Boxes", "1")}
        {F("box", air ? "Boxes KG" : "Boxes CBM", air ? "0.1" : "0.001")}
        {F("rate", "Rate")}
        {F("qualityRate", air ? "Quality (per KG)" : "Quality (per CBM)")}
        {F("brandPcs", "Brand PCS", "1")}
        {F("brandRate", "Brand Rate")}
        {F("fatura", "Fatura")}
        {F("delivery", "Delivery")}
      </div>
      {air && (
        <div style={{ marginTop: 16, padding: 12, borderRadius: 8, background: "#E6FAFE", border: "1px solid #9BE7F5", display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <Icon name="PackageOpen" size={16} color="#0E7490" />
            <b style={{ fontSize: 13, color: "#0E7490" }}>{t("Mixed box")}</b>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("One box shared by several customers")}</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 14 }}>
            {F("mixCount", "MIX count", "1")}
            {F("mixMeasure", "MIX KG", "0.1")}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
            {t("Shown as")}:{" "}
            <b style={{ color: "var(--text-strong)" }}>
              {n("packages")} {t("box")}
              {n("mixCount") ? `, ${n("mixCount")} ${t("mix")}` : ""}
            </b>{" "}
            · {t("Measure")} = {num(n("box"), 1)} + {num(n("mixMeasure"), 1)} = <b>{num(measure, 1)} kg</b>
          </div>
        </div>
      )}
      {error && (
        <div role="alert" style={{ marginTop: 12, color: "var(--status-danger)", fontSize: 13 }}>
          {t(error)}
        </div>
      )}
    </Dialog>
  );
}
