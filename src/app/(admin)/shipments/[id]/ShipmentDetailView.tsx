"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition, type CSSProperties, type ReactNode } from "react";
import { useT } from "@/i18n/I18nProvider";
import {
  DataTable,
  Flag,
  Overline,
  Stat,
  StatusBadge,
  SHIPMENT_STATUS_LABEL,
  type DataColumn,
} from "@/ui/kit";
import { Badge, Button, Dialog, Icon, Input } from "@/ui/primitives";
import { fdate, money, num } from "@/ui/format";
import type { getAdminShipment, ShipmentLineRow } from "@/modules/shipments/manage";
import { FinBox, RowMenu, ToastHost, useToast } from "@/components/admin/ui";
import {
  addLineAction,
  deleteLineAction,
  notifyLineAction,
  searchCustomersAction,
  setAwbKgAction,
  updateLineAction,
  type LineFormValues,
} from "../actions";
import { ShipmentForm } from "../ShipmentForm";

type Data = Awaited<ReturnType<typeof getAdminShipment>>;

function Table<R>(p: {
  cols: DataColumn<R>[];
  rows: R[];
  empty?: string;
  dense?: boolean;
  rowKey?: (r: R, i: number) => string;
}) {
  const A = DataTable as unknown as (q: typeof p) => ReactNode;
  return <A {...p} />;
}

/** write = Shipments edit (the data team); pricing = Shipment pricing (Rate, Quality Rate, Brand Rate; ADR-036). */
type Perms = { write: boolean; customers: boolean; pricing: boolean };

export function ShipmentDetailView(props: {
  data: Data;
  scope: { years: number[]; countries: string[] };
  perms: Perms;
}) {
  return (
    <ToastHost>
      <Inner {...props} />
    </ToastHost>
  );
}

function Inner({
  data,
  scope,
  perms,
}: {
  data: Data;
  scope: { years: number[]; countries: string[] };
  perms: Perms;
}) {
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
    {
      key: "s",
      label: "Status",
      render: () => <StatusBadge status={SHIPMENT_STATUS_LABEL[s.status]} />,
    },
    {
      key: "p",
      label: "Packages",
      align: "right",
      render: (r) => (
        <span>
          {packagesLabel(r, t)}
          {r.mixParts.length > 0 && (
            <span style={{ display: "block", fontSize: 11, color: "#0E7490" }}>
              {mixBoxesLabel(r)}
            </span>
          )}
        </span>
      ),
    },
    { key: "m", label: "Measure", align: "right", render: (r) => num(r.measure, 1) + unit },
    { key: "bp", label: "Brand PCS", align: "right", render: (r) => r.brandPcs },
    { key: "br", label: "Brand Rate", align: "right", render: (r) => money(r.brandRate) },
    {
      key: "ba",
      label: "Brand Amount",
      align: "right",
      render: (r) => money(r.brandPcs * Number(r.brandRate)),
    },
    {
      key: "ra",
      label: "Rate",
      align: "right",
      // No Rate yet: the customer doesn't see this cargo until pricing sets it (ADR-036).
      render: (r) =>
        r.priced ? (
          money(r.rate)
        ) : (
          <span data-testid="pending-rate">
            <Badge tone="warning">{t("Pending rate")}</Badge>
          </span>
        ),
    },
    {
      key: "q",
      label: "Quality Rate",
      align: "right",
      render: (r) => (Number(r.qualityRate) ? money(r.qualityRate) : "—"),
    },
    { key: "f", label: "Fatura", align: "right", render: (r) => money(r.fatura) },
    { key: "d", label: "Delivery", align: "right", render: (r) => money(r.delivery) },
    { key: "a", label: "Amount", align: "right", strong: true, render: (r) => money(r.amount) },
    {
      key: "no",
      label: "Notification",
      render: (r) =>
        r.notifiedAt ? (
          <Badge tone="success">{t("Sent")}</Badge>
        ) : perms.write && r.priced ? (
          <Button
            size="s"
            variant="outline"
            disabled={busy}
            leadingIcon={<Icon name="Send" size={13} />}
            onClick={() =>
              act(notifyLineAction(s.id, r.id), "Notification sent", `${r.customerRef} · ${s.code}`)
            }
          >
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
        ) : perms.pricing ? (
          <RowMenu items={[["Set rates", () => setLine(r)]]} />
        ) : null,
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <Button
          variant="ghost"
          size="s"
          leadingIcon={<Icon name="ArrowLeft" size={15} />}
          onClick={() => router.push(`/shipments?mode=${s.mode}`)}
        >
          {t("Shipment list")}
        </Button>
      </div>
      <div
        style={{
          background: "var(--navy-700)",
          color: "#fff",
          borderRadius: "var(--radius-l)",
          padding: "clamp(16px, 4vw, 22px)",
          display: "flex",
          gap: "16px 24px",
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <div>
          <Overline color="var(--orange-400)">{t(air ? "Air Freight" : "Sea Freight")}</Overline>
          <div
            data-testid="shipment-code"
            style={{ font: "600 24px var(--font-mono)", marginTop: 8 }}
          >
            {s.code}
          </div>
          <div
            data-testid="shipment-public-code"
            title={t("The code customers see")}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              marginTop: 6,
              padding: "3px 8px",
              borderRadius: 4,
              background: "rgba(255,255,255,.12)",
              font: "600 12px var(--font-mono)",
              color: "#fff",
            }}
          >
            <Icon name="UserRound" size={12} />
            {s.publicCode}
          </div>
          <div style={{ fontSize: 13, color: "var(--navy-300)", marginTop: 4 }}>
            {air ? "AWB" : "B/L"} {s.awb ?? "—"}
          </div>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            flex: 1,
            minWidth: "min(100%, 360px)",
          }}
        >
          <div>
            <div
              style={{
                font: "800 clamp(17px, 4.6vw, 24px) var(--font-display)",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <Flag country={s.originCountry} size={20} />
              {t(s.originCountry)}
            </div>
            <div style={{ fontSize: 12, color: "var(--navy-300)" }}>
              {s.originCity ?? "—"} · {fdate(s.shipDate)}
            </div>
          </div>
          <div
            style={{
              flex: 1,
              minWidth: 8,
              height: 2,
              background:
                "repeating-linear-gradient(90deg,var(--orange-500) 0 8px,transparent 8px 14px)",
            }}
          />
          <Icon name={air ? "Plane" : "Ship"} size={22} color="var(--orange-500)" />
          <div style={{ flex: 1, minWidth: 8, height: 2, background: "rgba(255,255,255,.2)" }} />
          <div style={{ textAlign: "end" }}>
            <div
              style={{
                font: "800 clamp(17px, 4.6vw, 24px) var(--font-display)",
                display: "flex",
                alignItems: "center",
                gap: 8,
                justifyContent: "flex-end",
              }}
            >
              <Flag country={s.destCountry ?? "Somalia"} size={20} />
              {t(s.destCountry ?? "Somalia")}
            </div>
            <div style={{ fontSize: 12, color: "var(--navy-300)" }}>
              {s.destCity ?? "Mogadishu"} · {fdate(s.arrivalDate)}
            </div>
          </div>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            alignItems: "flex-end",
            marginInlineStart: "auto",
          }}
        >
          <StatusBadge status={SHIPMENT_STATUS_LABEL[s.status]} />
          {perms.write && (
            <Button
              size="s"
              variant="inverse"
              leadingIcon={<Icon name="Pencil" size={14} />}
              onClick={() => setEdit(true)}
            >
              {t("Edit Shipment")}
            </Button>
          )}
        </div>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(min(170px, 42vw),1fr))",
          gap: 12,
        }}
      >
        <Stat icon="UsersRound" label="Customers" value={String(data.totals.customers)} />
        <Stat icon="Boxes" label="Total Packages" value={num(data.totals.packages)} />
        <Stat
          icon={air ? "Weight" : "Box"}
          tone="orange"
          label={air ? "Total KG" : "Total CBM"}
          value={num(data.totals.measure, 1)}
        />
        {air && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              act(setAwbKgAction(s.id, String(awb)), "AWB KG saved");
            }}
            style={{
              background: "#fff",
              border: "1.5px solid var(--navy-700)",
              borderRadius: "var(--radius-l)",
              padding: "12px 14px",
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            <span style={{ font: "600 12px var(--font-body)", color: "var(--text-muted)" }}>
              {t("AWB KG")}
            </span>
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
              onBlur={() =>
                perms.write &&
                String(awb) !== String(data.totals.awbKg ?? "") &&
                act(setAwbKgAction(s.id, String(awb)), "AWB KG saved")
              }
              style={{
                width: "100%",
                border: 0,
                borderBottom: "1px dashed var(--border-strong)",
                outline: 0,
                background: "transparent",
                font: "800 22px var(--font-display)",
                color: "var(--text-strong)",
                padding: "2px 0",
              }}
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
            <Button
              size="s"
              leadingIcon={<Icon name="UserPlus" size={14} />}
              onClick={() => setLine("new")}
              data-testid="add-line"
            >
              {t("Add Customer")}
            </Button>
          ) : undefined
        }
      >
        {/* Wide table: on a phone it scrolls sideways, with a visible bar. */}
        <div className="ship-lines">
          <Table
            dense
            rows={data.lines}
            cols={cols}
            empty="No customers in this shipment"
            rowKey={(r) => r.id}
          />
        </div>
      </FinBox>

      {line && (
        <LineForm
          shipment={s}
          boxes={mixBoxesOf(data.lines.filter((x) => line === "new" || x.id !== line.id))}
          line={line === "new" ? null : line}
          perms={perms}
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
            {t("Remove this entry from the shipment?")} <b>{del.customerRef}</b> ·{" "}
            {del.customerName} · {num(del.measure, 1)}
            {unit}
          </div>
        </Dialog>
      )}
    </div>
  );
}

/** "10 box, 2 mix" (design ORBIT_MIX.label). */
function packagesLabel(
  r: Pick<ShipmentLineRow, "packages" | "mixCount">,
  t: (k: string) => string,
) {
  return r.mixCount
    ? `${r.packages ? `${r.packages} ${t("box")}, ` : ""}${r.mixCount} ${t("mix")}`
    : `${r.packages} ${t("box")}`;
}

/** "MIX 1 · MIX 3" — the shared boxes this line's goods are in. */
function mixBoxesLabel(r: Pick<ShipmentLineRow, "mixParts">) {
  return [...new Set(r.mixParts.map((p) => p.box))].map((n) => `MIX ${n}`).join(" · ");
}

/** The MIX box numbers already used in the shipment. */
function mixBoxesOf(lines: Pick<ShipmentLineRow, "mixParts">[]) {
  return [...new Set(lines.flatMap((l) => l.mixParts.map((p) => p.box)))].sort((a, b) => a - b);
}

type Customer = { id: string; ref: string; name: string; company: string | null };

/** Customer picker: type a name or reference; the server searches (spec §7). */
function CustomerPicker({
  value,
  onChange,
}: {
  value: Customer | null;
  onChange: (c: Customer) => void;
}) {
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
        <div
          role="listbox"
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: "100%",
            marginTop: 4,
            zIndex: 20,
            background: "#fff",
            border: "1px solid var(--border-default)",
            borderRadius: "var(--radius-m)",
            boxShadow: "var(--shadow-3)",
            maxHeight: 260,
            overflowY: "auto",
          }}
        >
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
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "9px 12px",
                cursor: "pointer",
                background: c.id === value?.id ? "var(--surface-brand-tint)" : "#fff",
                borderBottom: "1px solid var(--border-default)",
              }}
            >
              <span
                style={{
                  font: "600 12px var(--font-mono)",
                  color: "var(--navy-700)",
                  flex: "none",
                }}
              >
                {c.ref}
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span
                  style={{
                    display: "block",
                    font: "600 13px var(--font-body)",
                    color: "var(--text-strong)",
                  }}
                >
                  {c.name}
                </span>
                <span style={{ display: "block", fontSize: 11, color: "var(--text-muted)" }}>
                  {c.company}
                </span>
              </span>
            </div>
          ))}
          {!list.length && (
            <div
              style={{ padding: 14, fontSize: 13, color: "var(--text-muted)", textAlign: "center" }}
            >
              {t("No records found")}
            </div>
          )}
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
function LineForm({
  shipment,
  boxes,
  line,
  perms,
  onClose,
  onSaved,
}: {
  shipment: Data["shipment"];
  boxes: number[];
  line: ShipmentLineRow | null;
  perms: Perms;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT();
  const air = shipment.mode === "AIR";
  const [customer, setCustomer] = useState<Customer | null>(
    line
      ? { id: line.customerId, ref: line.customerRef, name: line.customerName, company: null }
      : null,
  );
  const z = (v: string | number | undefined) =>
    v === undefined || v === "0" || v === 0 ? "" : String(v);
  const [v, setV] = useState<Record<Exclude<keyof LineFormValues, "mixParts">, string>>({
    packages: z(line?.packages ?? 1),
    box: z(line?.boxMeasure),
    rate: z(line?.rate),
    qualityRate: z(line?.qualityRate),
    brandPcs: z(line?.brandPcs),
    brandRate: z(line?.brandRate),
    fatura: z(line?.fatura),
    delivery: z(line?.delivery),
  });
  // MIX boxes this customer is in, each with the KG typed per part ("Add again").
  const [mix, setMix] = useState<{ box: number; parts: string[] }[]>(() => {
    const m = new Map<number, string[]>();
    for (const p of line?.mixParts ?? []) m.set(p.box, [...(m.get(p.box) ?? []), z(p.kg)]);
    return [...m.entries()].map(([box, parts]) => ({ box, parts }));
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const n = (k: keyof typeof v) => Number(v[k]) || 0;
  const mine = mix.map((m) => m.box);
  const all = [...new Set([...boxes, ...mine])].sort((a, b) => a - b);
  const parts = mix.flatMap((m) => m.parts);
  const filled = parts.filter((p) => Number(p));
  const mixKg = parts.reduce((a, x) => a + (Number(x) || 0), 0);
  const measure = n("box") + (air ? mixKg : 0);
  const amount =
    measure * (n("rate") + n("qualityRate")) +
    n("brandPcs") * n("brandRate") +
    n("fatura") +
    n("delivery");
  const toggle = (box: number) =>
    setMix((o) =>
      o.some((m) => m.box === box)
        ? o.filter((m) => m.box !== box)
        : [...o, { box, parts: [""] }].sort((a, b) => a.box - b.box),
    );
  const setParts = (box: number, p: string[]) =>
    setMix((o) => o.map((m) => (m.box === box ? { ...m, parts: p } : m)));

  const save = () =>
    start(async () => {
      setError(null);
      if (!customer) return setError("Select a customer first");
      const values: LineFormValues = {
        ...(Object.fromEntries(Object.entries(v).map(([k, x]) => [k, x.trim()])) as Omit<
          LineFormValues,
          "mixParts"
        >),
        mixParts: air
          ? mix.flatMap((m) => m.parts.map((kg) => ({ box: m.box, kg: kg.trim() })))
          : [],
      };
      const r = line
        ? await updateLineAction(shipment.id, line.id, shipment.mode, values)
        : await addLineAction(shipment.id, shipment.mode, customer.id, values);
      if (!r.ok) return setError(r.error);
      onSaved();
    });

  // The data team fills the cargo; Rate, Quality Rate and Brand Rate are
  // pricing staff's (ADR-036). The server refuses the same.
  const isPrice = (k: keyof typeof v) => k === "rate" || k === "qualityRate" || k === "brandRate";
  const F = (k: keyof typeof v, label: string, step = "0.01") => (
    <Input
      key={k}
      type="number"
      min="0"
      step={step}
      label={t(label)}
      value={v[k]}
      disabled={isPrice(k) ? !perms.pricing : !perms.write}
      data-testid={`line-${k}`}
      onChange={(e) => setV((o) => ({ ...o, [k]: e.target.value }))}
    />
  );
  const chip = (on: boolean, dashed = false): CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    height: 30,
    padding: "0 12px",
    borderRadius: 15,
    cursor: "pointer",
    border: `1.5px ${dashed ? "dashed" : "solid"} ${on || dashed ? "#0E7490" : "#9BE7F5"}`,
    background: on ? "#0E7490" : dashed ? "transparent" : "#fff",
    color: on ? "#fff" : "#0E7490",
    font: "700 12px var(--font-body)",
  });
  return (
    <Dialog
      open
      width={680}
      onClose={onClose}
      title={`${t(line ? (perms.write ? "Edit Customer" : "Set rates") : "Add Customer")} · ${shipment.code}`}
      footer={
        <>
          <span
            style={{
              marginInlineEnd: "auto",
              font: "700 15px var(--font-body)",
              color: "var(--text-strong)",
              alignSelf: "center",
            }}
          >
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
          <span style={{ fontFamily: "var(--font-mono)", color: "var(--navy-700)" }}>
            {line.customerRef}
          </span>{" "}
          — {line.customerName}
        </div>
      ) : (
        <CustomerPicker value={customer} onChange={setCustomer} />
      )}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))",
          gap: 14,
          marginTop: 14,
        }}
      >
        {F("packages", "Boxes", "1")}
        {F("box", air ? "KG" : "CBM", air ? "0.1" : "0.001")}
        {F("rate", "Rate")}
        {F("qualityRate", "Quality Rate")}
        {F("brandPcs", "Brand PCS", "1")}
        {F("brandRate", "Brand Rate")}
        {F("fatura", "Fatura")}
        {F("delivery", "Delivery")}
      </div>
      {!perms.pricing && (
        <div
          style={{
            marginTop: 10,
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 12,
            color: "var(--text-muted)",
          }}
        >
          <Icon name="Lock" size={13} />
          {t(
            "Rate, Quality Rate and Brand Rate are set by pricing staff. The customer sees this cargo once the Rate is set.",
          )}
        </div>
      )}
      {air && (
        <fieldset disabled={!perms.write} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
          <div
            data-testid="mix-box"
            style={{
              marginTop: 16,
              padding: 12,
              borderRadius: 8,
              background: "#E6FAFE",
              border: "1px solid #9BE7F5",
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <Icon name="PackageOpen" size={16} color="#0E7490" />
              <b style={{ fontSize: 13, color: "#0E7490" }}>{t("Mixed box")}</b>
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                {t("One box shared by several customers")}
              </span>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {all.map((b) => {
                const on = mine.includes(b);
                return (
                  <button
                    key={b}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggle(b)}
                    style={chip(on)}
                  >
                    {on && <Icon name="Check" size={12} />}
                    MIX {b}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => toggle((all.length ? Math.max(...all) : 0) + 1)}
                style={chip(false, true)}
                data-testid="new-mix"
              >
                <Icon name="Plus" size={12} />
                {t("New MIX")}
              </button>
            </div>
            {mix.map((m) => (
              <div key={m.box} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <b style={{ fontSize: 12, color: "#0E7490" }}>
                  MIX {m.box} · KG
                  {m.parts.length > 1
                    ? ` · ${t("Total")}: ${num(
                        m.parts.reduce((a, x) => a + (Number(x) || 0), 0),
                        2,
                      )}`
                    : ""}
                </b>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  {m.parts.map((x, i) => (
                    <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={x}
                        placeholder="0"
                        aria-label={`MIX ${m.box} KG`}
                        onChange={(e) =>
                          setParts(
                            m.box,
                            m.parts.map((y, k) => (k === i ? e.target.value : y)),
                          )
                        }
                        style={{
                          width: 110,
                          height: 38,
                          padding: "0 10px",
                          border: "1px solid var(--border-strong)",
                          borderRadius: 6,
                          font: "500 14px var(--font-body)",
                          background: "#fff",
                        }}
                      />
                      {m.parts.length > 1 && (
                        <button
                          type="button"
                          title={t("Delete")}
                          aria-label={t("Delete")}
                          onClick={() =>
                            setParts(
                              m.box,
                              m.parts.filter((_, k) => k !== i),
                            )
                          }
                          style={{
                            border: 0,
                            background: "transparent",
                            cursor: "pointer",
                            color: "var(--red-600)",
                            padding: 2,
                          }}
                        >
                          <Icon name="X" size={14} />
                        </button>
                      )}
                    </span>
                  ))}
                  <button
                    type="button"
                    onClick={() => setParts(m.box, [...m.parts, ""])}
                    style={{ ...chip(false, true), padding: "0 10px", gap: 4 }}
                  >
                    <Icon name="Plus" size={12} />
                    {t("Add again")}
                  </button>
                </div>
              </div>
            ))}
            {mix.length > 0 && (
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                {t("Shown as")}:{" "}
                <b style={{ color: "var(--text-strong)" }}>
                  {packagesLabel({ packages: n("packages"), mixCount: parts.length }, t)}
                </b>{" "}
                · {t("In mix")}:{" "}
                <b style={{ color: "var(--text-strong)" }}>
                  {filled.length > 1
                    ? `${filled.map((p) => num(Number(p), 2)).join(" + ")} = `
                    : ""}
                  {num(mixKg, 2)} kg
                </b>
              </div>
            )}
          </div>
        </fieldset>
      )}
      {error && (
        <div role="alert" style={{ marginTop: 12, color: "var(--status-danger)", fontSize: 13 }}>
          {t(error)}
        </div>
      )}
    </Dialog>
  );
}
