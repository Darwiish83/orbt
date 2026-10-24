"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition, type CSSProperties, type ReactNode } from "react";
import { useT } from "@/i18n/I18nProvider";
import { Seg } from "@/ui/kit";
import { Badge, Icon } from "@/ui/primitives";
import { fdate, money, num } from "@/ui/format";
import type { CostShipment, listShipmentCosts } from "@/modules/accounting/service";
import { useToast } from "@/components/admin/ui";
import { saveSheetAction } from "./actions";

/**
 * Shipment cost (owner prompt "SHIPMENT COST & PROFIT"; design kit
 * AccountingShipCost.jsx + AccountingArrival.jsx). Three sheets:
 *  - Shipment cost & profit: one row per shipment, W-1 first.
 *  - Operation cost (origin country) and (MGQ): one column per shipment.
 * Typed cells save one field at a time when you leave them; every other
 * figure is calculated on the server and refreshes after the save.
 */

type Costs = Awaited<ReturnType<typeof listShipmentCosts>>;
type Perms = { origin: boolean; mgq: boolean };
export type SheetSub = "profit" | "origin" | "mgq";

const TR = "#FDEBDD"; // origin inputs (air profit sheet)
const MG = "#DCE8FB"; // pulled from another sheet
const PR = "#FFE7A8"; // profit
const SP = "#E6F4EA"; // partner shares
const BL = "#FDE9D9"; // sea sheet peach
const BLU = "#DCE6F2";
const YEL = "#FFC000";
const GREY = "#F2F2F2";

const ddmm = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join(".") : "-");
const isZero = (v: string) => !Number(v);

/** "$ … 1,234.50" split cell used by the operation-cost sheets. */
function Usd({ v, bold }: { v: string; bold?: boolean }) {
  return (
    <span style={{ display: "flex", justifyContent: "space-between", gap: 6, fontWeight: bold ? 800 : undefined }}>
      <span>$</span>
      <span>{isZero(v) ? "-" : money(v).replace(/^\$/, "")}</span>
    </span>
  );
}

/** A typed cell: saves just this field when you leave it (or press Enter). */
function Cell({ r, sheet, field, label, text, disabled, align, placeholder = "-" }: { r: CostShipment; sheet: "origin" | "mgq"; field: string; label: string; text?: boolean; disabled: boolean; align?: "start" | "end" | "center"; placeholder?: string }) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const saved = (sheet === "origin" ? r.originInputs : r.mgqInputs)[field] ?? "";
  const [v, setV] = useState(saved);
  const [pending, start] = useTransition();
  useEffect(() => setV(saved), [saved]);
  const commit = () => {
    const next = v.trim();
    if (disabled || next === saved) return;
    start(async () => {
      const res = await saveSheetAction(r.id, sheet, { [field]: next });
      if (!res.ok) {
        toast({ tone: "danger", title: res.error });
        setV(saved);
      }
      router.refresh();
    });
  };
  return (
    <input
      aria-label={`${r.code} · ${t(label)}`}
      value={v}
      disabled={disabled}
      inputMode={text ? "text" : "decimal"}
      placeholder={placeholder}
      onChange={(e) => setV(text ? e.target.value : e.target.value.replace(/[^\d.]/g, ""))}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      style={{ width: "100%", minWidth: 0, height: 26, padding: "0 4px", border: "1px solid transparent", borderRadius: 4, background: "transparent", outline: pending ? "2px solid var(--orange-500)" : 0, font: "500 12px var(--font-body)", textAlign: align ?? (text ? "center" : "end"), color: "#111", boxSizing: "border-box" }}
      onFocus={(e) => {
        e.target.style.borderColor = "var(--navy-700)";
        e.target.style.background = "#fff";
      }}
      onBlurCapture={(e) => {
        e.target.style.borderColor = "transparent";
        e.target.style.background = "transparent";
      }}
    />
  );
}

// ------------------------------------------------------------------ page

export function ShipmentCostSheet({ costs, mode, sub, year, country, perms, go }: { costs: Costs; mode: "AIR" | "SEA"; sub: SheetSub; year: number; country: string; perms: Perms; go: (p: Record<string, string | null>) => void }) {
  const t = useT();
  const air = mode === "AIR";
  const profit = Number(costs.summary.profit);
  const modeSeg = (long: boolean) => (
    <Seg
      options={[
        ["AIR", `${t(long ? "Airways" : "Air")} ${year}`, "Plane"],
        ["SEA", `${t(long ? "Seaways" : "Sea")} ${year}`, "Ship"],
      ]}
      value={mode}
      onChange={(m) => go({ mode: m })}
    />
  );
  const viewOnly = (sub === "origin" && !perms.origin) || (sub === "mgq" && !perms.mgq) || (sub === "profit" && !perms.origin);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, font: "700 11px var(--font-body)", letterSpacing: ".14em", textTransform: "uppercase", color: "var(--orange-600)" }}>
          <span style={{ width: 18, height: 2, background: "var(--orange-500)" }} />
          {t("Shipment profit")}
        </div>
        <h1 style={{ margin: "6px 0 0", font: "700 26px var(--font-display)", color: "var(--text-strong)" }}>{t("Shipment cost")}</h1>
      </div>
      <div style={{ maxWidth: "100%", overflowX: "auto" }}>
        <Seg
          options={[
            ["profit", "Shipment cost & profit", "Calculator"],
            ["origin", `${t("Operation cost")} (${t(country)})`, "PlaneTakeoff"],
            ["mgq", `${t("Operation cost")} (MGQ)`, "PlaneLanding"],
          ]}
          value={sub}
          onChange={(k) => go({ sub: k === "profit" ? null : k })}
        />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          {modeSeg(sub === "profit")}
          {viewOnly && <Badge tone="warning">{t("View only")}</Badge>}
          {sub === "mgq" && <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("Type the costs paid in Mogadishu. NET, TOTAL and RATE are calculated automatically and go to Shipment cost → Total Cost MGQ.")}</span>}
        </div>
        {sub === "profit" && (
          <div data-testid="sheet-totals" style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 13 }}>
            <span>
              {t("Total Shipment Cost")}: <b>{money(costs.summary.totalCost)}</b>
            </span>
            <span>
              {t("Total Income")}: <b>{money(costs.summary.totalIncome)}</b>
            </span>
            <span>
              {t("Profit")}: <b style={{ color: profit < 0 ? "var(--red-600)" : "var(--green-600)" }}>{money(costs.summary.profit)}</b>
            </span>
          </div>
        )}
      </div>
      {sub === "profit" && <ProfitTable rows={costs.rows} air={air} perms={perms} />}
      {sub === "origin" && <OriginSheet rows={costs.rows} air={air} year={year} country={country} perms={perms} />}
      {sub === "mgq" && (air ? <MgqAir rows={costs.rows} perms={perms} /> : <MgqSea rows={costs.rows} year={year} perms={perms} />)}
      <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
        {t(
          sub === "profit"
            ? air
              ? "Date, Week, AWB No, KGS, Local Delivery, Invoice Charge and Total Income Somalia come from the shipment automatically. You type AWB Cost, Rate, Custom, Delivery & Packaging, Branded Charges and Transfer Money; Total Cost MGQ comes from Operation cost (MGQ)."
              : "Port Charges and Import Tax come from Operation cost (MGQ). Import Tax = CANSHUR + XALIN."
            : sub === "origin"
              ? "Same numbers as Origin cost & profit — editing here updates it too."
              : "",
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ cost & profit (one row per shipment)

interface PCol {
  h: string;
  bg?: string;
  /** Typed field on the origin sheet. */
  in?: string;
  text?: boolean;
  get?: (r: CostShipment, i: number) => ReactNode;
  bold?: boolean;
  left?: boolean;
  title?: (r: CostShipment) => string;
}

const STICKY_W = [40, 96, 84, 128];

function splitCols(rows: CostShipment[], bg: string): PCol[] {
  if (!rows.some((r) => r.row.split[1] > 0 || r.row.split[2] > 0)) return [];
  const share = (r: CostShipment, i: 0 | 1 | 2) => {
    const pct = r.row.split[i];
    if (!pct) return <span style={{ color: "var(--text-muted)" }}>—</span>;
    const v = i === 0 ? r.row.orbit : i === 1 ? r.row.somaliTransport : r.row.mahad;
    return (
      <>
        {money(v)}
        <span style={{ display: "block", fontSize: 10, fontWeight: 500, color: "var(--text-muted)" }}>
          {pct}%{i === 1 && !isZero(r.row.transferMoney) ? ` + ${money(r.row.transferMoney)}` : ""}
        </span>
      </>
    );
  };
  return [
    { h: "Orbit Cargo", bg, bold: true, get: (r) => share(r, 0) },
    { h: "Somali Transport", bg, get: (r) => share(r, 1) },
    { h: "Mahad", bg, get: (r) => share(r, 2) },
  ];
}

function airCols(rows: CostShipment[]): PCol[] {
  const m = (v: string) => money(v);
  return [
    { h: "#", get: (_r, i) => i + 1 },
    { h: "Date", left: true, get: (r) => fdate(r.shipDate) },
    { h: "Week", left: true, bold: true, get: (r) => <span style={{ fontFamily: "var(--font-mono)" }}>{r.code}</span> },
    { h: "AWB No", left: true, get: (r) => <span style={{ fontFamily: "var(--font-mono)" }}>{r.awb ?? "—"}</span> },
    { h: "AWB Cost", bg: TR, in: "awbCost" },
    { h: "Rate", bg: TR, in: "rate" },
    { h: "KGS", bg: TR, bold: true, get: (r) => num(r.row.quantity, 1) },
    { h: "Custom", bg: TR, in: "custom" },
    { h: "Delivery & Packaging", bg: TR, in: "deliveryPackaging" },
    { h: "Local Delivery for Customers", bg: TR, get: (r) => m(r.row.localDelivery) },
    { h: "Invoice Charge", bg: TR, get: (r) => m(r.row.invoiceCharge) },
    { h: "Branded Charges", bg: TR, in: "brandedCharges" },
    { h: "Cost Rate", get: (r) => m(r.row.costRate) },
    { h: "Total Shipment Cost Amount", get: (r) => m(r.row.originCost) },
    { h: "Rate MGQ", get: (r) => m(r.row.rateMgq) },
    {
      h: "Total Cost MGQ",
      bg: MG,
      title: () => "From Operation cost (MGQ) → TOTAL AIR COST",
      get: (r) => (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <Icon name="Link" size={11} color="var(--navy-700)" />
          {m(r.row.mgqTotal)}
        </span>
      ),
    },
    { h: "Total Cost Rate", get: (r) => m(r.row.totalCostRate) },
    { h: "Total Shipment Cost", bg: MG, bold: true, get: (r) => m(r.row.totalCost) },
    { h: "Income Rate", get: (r) => m(r.row.incomeRate) },
    { h: "Total Income Somalia", bg: MG, get: (r) => m(r.row.incomeSomalia), title: (r) => `Collected ${m(r.row.collected)}${isZero(r.row.commission) ? "" : ` − Commission ${m(r.row.commission)}`}` },
    { h: "Transfer Money", bg: MG, in: "transferMoney" },
    { h: "Total Income", get: (r) => m(r.row.totalIncome) },
    { h: "Profit", bg: PR, bold: true, get: (r) => <span style={{ color: Number(r.row.profit) < 0 ? "var(--red-600)" : undefined }}>{m(r.row.profit)}</span> },
    ...splitCols(rows, SP),
  ];
}

function seaCols(rows: CostShipment[]): PCol[] {
  const m = (v: string) => money(v);
  return [
    { h: "#", get: (_r, i) => i + 1 },
    { h: "Date", get: (r) => ddmm(r.shipDate) },
    { h: "Container No", bold: true, get: (r) => r.container ?? r.code },
    { h: "Seaway Bill No", get: (r) => r.billOfLading ?? "—" },
    { h: "CBM", get: (r) => num(r.row.quantity, 2) },
    { h: "Custom TR", in: "custom" },
    { h: "Freight", in: "freight" },
    { h: "Local Transport", in: "localTransport" },
    { h: "Local Delivery for Customers", bg: GREY, get: (r) => m(r.row.localDelivery) },
    { h: "Invoice Charge", bg: GREY, get: (r) => m(r.row.invoiceCharge) },
    { h: "Storage & Loading", in: "storage" },
    { h: "Branded Charges", in: "brand" },
    { h: "Branded Income Somalia", in: "brandIncomeSomalia" },
    { h: "Branded Income TR", in: "brandIncomeOrigin" },
    { h: "Total Cost Amount TR", bold: true, get: (r) => m(r.row.originCost) },
    { h: "Port Charges", bg: BLU, get: (r) => m(r.row.mgqNet) },
    { h: "Import Tax", bg: BLU, get: (r) => m(r.row.importTax) },
    { h: "Total Cost", bold: true, get: (r) => m(r.row.totalCost) },
    { h: "Commission", bg: BLU, get: (r) => (isZero(r.row.commission) ? "-" : `−${m(r.row.commission)}`) },
    { h: "Transfer Money", bg: BLU, in: "transferMoney" },
    { h: "Total Income Somali", bg: BLU, get: (r) => m(r.row.incomeAfterTransfer) },
    { h: "Total Income TR", bg: BLU, in: "incomeOrigin" },
    { h: "Total Income", bold: true, get: (r) => m(r.row.totalIncome) },
    { h: "Profit", bg: YEL, bold: true, get: (r) => <span style={{ color: Number(r.row.profit) < 0 ? "#B91C1C" : undefined }}>{m(r.row.profit)}</span> },
    ...splitCols(rows, "#E2EFDA"),
  ];
}

function ProfitTable({ rows, air, perms }: { rows: CostShipment[]; air: boolean; perms: Perms }) {
  const t = useT();
  const cols = air ? airCols(rows) : seaCols(rows);
  const line = air ? "var(--border-default)" : "#9AA3AF";
  const base = air ? "#fff" : BL;
  const left = (i: number) => STICKY_W.slice(0, i).reduce((a, b) => a + b, 0);
  const sticky = (i: number): CSSProperties => (i < 4 ? { position: "sticky", insetInlineStart: left(i), zIndex: 2, minWidth: STICKY_W[i], maxWidth: STICKY_W[i], boxShadow: i === 3 ? `2px 0 0 ${line}` : undefined } : {});
  const th = (c: PCol, i: number): CSSProperties => ({
    background: c.bg ?? (air ? "var(--surface-sunken, #F2F4F7)" : BL),
    font: "700 10px/1.25 var(--font-body)",
    textTransform: "uppercase",
    letterSpacing: ".03em",
    color: "var(--text-strong)",
    padding: "8px 6px",
    borderRight: `1px solid ${line}`,
    borderBottom: `1px solid ${air ? "var(--border-strong)" : line}`,
    textAlign: "center",
    verticalAlign: "bottom",
    minWidth: 84,
    whiteSpace: "normal",
    position: "sticky",
    top: 0,
    zIndex: i < 4 ? 3 : 1,
    ...(i < 4 ? { insetInlineStart: left(i), minWidth: STICKY_W[i], maxWidth: STICKY_W[i] } : {}),
  });
  const td = (c: PCol, i: number): CSSProperties => ({
    background: c.bg ?? base,
    padding: c.in ? "2px 4px" : "4px 6px",
    borderRight: `1px solid ${line}`,
    borderBottom: `1px solid ${line}`,
    font: `${c.bold ? 700 : 500} 12px var(--font-body)`,
    color: "var(--text-strong)",
    textAlign: i === 0 ? "center" : c.left ? "start" : "end",
    whiteSpace: "nowrap",
    ...sticky(i),
  });
  return (
    <div style={{ background: "#fff", border: `1px solid ${air ? "var(--border-default)" : "#9AA3AF"}`, borderRadius: air ? "var(--radius-l)" : 0, overflow: "auto", maxHeight: "70vh" }}>
      <table style={{ borderCollapse: "separate", borderSpacing: 0, minWidth: "100%" }}>
        <thead>
          <tr>
            {cols.map((c, i) => (
              <th key={c.h} style={th(c, i)}>
                {t(c.h)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={r.id} data-testid={`sheet-row-${r.code}`}>
              {cols.map((c, i) => (
                <td key={c.h} style={td(c, i)} title={c.title ? t(c.title(r)) : undefined}>
                  {c.in ? <Cell r={r} sheet="origin" field={c.in} label={c.h} disabled={!perms.origin} placeholder={air ? "0" : "0.00"} /> : c.get!(r, ri)}
                </td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={cols.length} style={{ padding: 30, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
                {t("No records found")}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ------------------------------------------------------------------ operation-cost sheets (one column per shipment)

const RED: CSSProperties = { color: "#E00000", font: "700 12px var(--font-body)", textTransform: "uppercase", whiteSpace: "nowrap" };
const cell = (bg?: string): CSSProperties => ({ padding: "3px 6px", border: "1px solid #9AA3AF", background: bg ?? "#DCE6F2", fontSize: 12, whiteSpace: "nowrap", minWidth: 112 });
const labelCell = (bg?: string, extra?: CSSProperties): CSSProperties => ({ ...cell(bg), minWidth: 230, position: "sticky", insetInlineStart: 0, zIndex: 1, ...extra });

function Grid({ children, empty, span }: { children: ReactNode; empty: boolean; span: number }) {
  const t = useT();
  return (
    <div style={{ overflowX: "auto", border: "1px solid #9AA3AF", background: "#fff", maxWidth: "100%" }}>
      <table style={{ borderCollapse: "collapse", fontFamily: "var(--font-body)" }}>
        <tbody>
          {children}
          {empty && (
            <tr>
              <td colSpan={span} style={{ padding: 24, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
                {t("No records found")}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function OriginSheet({ rows, air, year, country, perms }: { rows: CostShipment[]; air: boolean; year: number; country: string; perms: Perms }) {
  const t = useT();
  const inRow = (label: string, field: string) => (
    <tr key={field}>
      <td style={{ ...labelCell(), ...RED }}>{t(label)}</td>
      {rows.map((r) => (
        <td key={r.id} style={cell("#fff")}>
          <Cell r={r} sheet="origin" field={field} label={label} disabled={!perms.origin} />
        </td>
      ))}
    </tr>
  );
  const calcRow = (label: string, get: (r: CostShipment) => string, bg = GREY) => (
    <tr key={label}>
      <td style={{ ...labelCell(), ...RED }}>{t(label)}</td>
      {rows.map((r) => (
        <td key={r.id} style={cell(bg)}>
          <Usd v={get(r)} />
        </td>
      ))}
    </tr>
  );
  const unit = air ? "KG" : "CBM";
  return (
    <Grid empty={!rows.length} span={2}>
      <tr>
        <td style={{ ...labelCell("#17375E"), color: "#fff", fontWeight: 700 }}>
          {t("Operation cost")} · {String(t(country)).toUpperCase()}
        </td>
        <td colSpan={Math.max(1, rows.length)} style={{ ...cell("#17375E"), color: "#fff", fontWeight: 700 }}>
          {t(air ? "Air" : "Sea")} {year}
        </td>
      </tr>
      <tr>
        <td style={{ ...labelCell("#B8CCE4"), fontWeight: 700 }}>{air ? "WEEK" : "CNT NO"}</td>
        {rows.map((r) => (
          <td key={r.id} style={{ ...cell("#B8CCE4"), textAlign: "center", fontWeight: 700 }}>
            {air ? r.code : (r.container ?? r.code)}
          </td>
        ))}
      </tr>
      <tr>
        <td style={{ ...labelCell(), ...RED }}>{t("Date")}</td>
        {rows.map((r) => (
          <td key={r.id} style={{ ...cell("#fff"), textAlign: "center", fontSize: 11 }}>
            {ddmm(r.shipDate)}
          </td>
        ))}
      </tr>
      <tr>
        <td style={{ ...labelCell(), ...RED }}>{unit}</td>
        {rows.map((r) => (
          <td key={r.id} style={{ ...cell("#fff"), textAlign: "center", fontWeight: 700 }}>
            {num(r.row.quantity, 2)}
          </td>
        ))}
      </tr>
      {air
        ? [inRow("AWB Cost", "awbCost"), inRow("Rate", "rate"), inRow("Custom", "custom"), inRow("Delivery & Packaging", "deliveryPackaging"), inRow("Branded Charges", "brandedCharges")]
        : [inRow("Custom TR", "custom"), inRow("Freight", "freight"), inRow("Local Transport", "localTransport"), inRow("Storage & Loading", "storage"), inRow("Branded Charges", "brand")]}
      {air && calcRow(`${t("Freight")} (${t("Rate")} × KG)`, (r) => r.row.freight)}
      {calcRow("Invoice Charge", (r) => r.row.invoiceCharge)}
      {calcRow("Local Delivery", (r) => r.row.localDelivery)}
      {air && (
        <tr>
          <td style={{ ...labelCell(), ...RED }}>{t("Transfer money")} (%)</td>
          {rows.map((r) => (
            <td key={r.id} style={cell("#FFF2CC")}>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 60, flex: "none", display: "inline-flex", alignItems: "center", borderInlineEnd: "1px solid #D9C27A", paddingInlineEnd: 4 }}>
                  <Cell r={r} sheet="origin" field="transferPercent" label="Transfer money %" disabled={!perms.origin} />
                  <span style={{ fontSize: 11 }}>%</span>
                </span>
                <span style={{ flex: 1 }}>
                  <Usd v={r.row.transferFee} />
                </span>
              </span>
            </td>
          ))}
        </tr>
      )}
      <tr>
        <td style={{ ...labelCell("#00FF00"), ...RED }}>{t("Total Origin Cost")}</td>
        {rows.map((r) => (
          <td key={r.id} style={cell("#00FF00")}>
            <Usd v={r.row.originCost} bold />
          </td>
        ))}
      </tr>
      {calcRow("Rate", (r) => r.row.costRate, "#fff")}
      <tr>
        <td style={labelCell("#B8CCE4")} />
        {rows.map((r) => (
          <td key={r.id} style={cell("#B8CCE4")} />
        ))}
      </tr>
    </Grid>
  );
}

function MgqAir({ rows, perms }: { rows: CostShipment[]; perms: Perms }) {
  const t = useT();
  const dis = !perms.mgq;
  const tn = (r: CostShipment) => r.mgqInputs.transitCountry ?? "";
  const lab = (l: string, extra?: ReactNode) => (
    <td style={{ ...labelCell(), ...RED }}>
      {t(l)}
      {extra}
    </td>
  );
  const rate = (label: string, field: string, amount: (r: CostShipment) => string) => (
    <tr key={field}>
      {lab(label, <span style={{ marginInlineStart: 6, fontSize: 10, color: "var(--text-muted)", textTransform: "none" }}>($ / kg)</span>)}
      {rows.map((r) => (
        <td key={r.id} style={cell("#fff")}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 54, flex: "none", borderInlineEnd: "1px dashed #C4CAD3", paddingInlineEnd: 4 }}>
              <Cell r={r} sheet="mgq" field={field} label={label} disabled={dis} />
            </span>
            <span style={{ flex: 1 }}>
              <Usd v={amount(r)} />
            </span>
          </div>
        </td>
      ))}
    </tr>
  );
  const plain = (label: string, field: string) => (
    <tr key={field}>
      {lab(label)}
      {rows.map((r) => (
        <td key={r.id} style={cell("#fff")}>
          <Cell r={r} sheet="mgq" field={field} label={label} disabled={dis} />
        </td>
      ))}
    </tr>
  );
  const total = (label: string, get: (r: CostShipment) => string, bold?: boolean) => (
    <tr key={label}>
      {lab(label)}
      {rows.map((r) => (
        <td key={r.id} style={{ ...cell("#fff"), fontWeight: bold ? 700 : undefined }}>
          <Usd v={get(r)} />
        </td>
      ))}
    </tr>
  );
  return (
    <Grid empty={!rows.length} span={2}>
      <tr>
        <td style={labelCell("#4F81BD")} />
        {rows.map((r) => (
          <td key={r.id} style={cell("#4F81BD")} />
        ))}
      </tr>
      <tr>
        <td style={{ ...labelCell("#B8CCE4"), font: "700 12px var(--font-body)" }}>WEEK</td>
        {rows.map((r) => (
          <td key={r.id} style={{ ...cell("#B8CCE4"), textAlign: "center", fontWeight: 700 }}>
            {r.code}
            {tn(r) ? ` (${tn(r).toUpperCase()})` : ""}
          </td>
        ))}
      </tr>
      <tr>
        {lab("Transit")}
        {rows.map((r) => (
          <td key={r.id} style={cell("#fff")}>
            <Cell r={r} sheet="mgq" field="transitCountry" label="Transit" text placeholder="" disabled={dis} />
          </td>
        ))}
      </tr>
      <tr>
        {lab("Date")}
        {rows.map((r) => (
          <td key={r.id} style={{ ...cell("#fff"), textAlign: "center", fontSize: 11 }}>
            {ddmm(r.arrivalDate)}
          </td>
        ))}
      </tr>
      <tr>
        {lab("KG")}
        {rows.map((r) => (
          <td key={r.id} style={{ ...cell("#fff"), textAlign: "center", fontWeight: 700 }}>
            {num(r.row.quantity, 2)}
          </td>
        ))}
      </tr>
      {rate("Quality control", "qualityControlRate", (r) => r.row.mgqAmounts.qualityControl)}
      {rate("Airport handling Arimas", "airportHandlingRate", (r) => r.row.mgqAmounts.airportHandling)}
      {rate("MGQ Custom", "mgqCustomRate", (r) => r.row.mgqAmounts.mgqCustom)}
      {plain("TRPR MGQ", "trpr")}
      {plain("Loader MGQ", "loader")}
      {plain("Extra charges", "extra")}
      <tr>
        {lab("Transit cost")}
        {rows.map((r) => (
          <td key={r.id} style={cell("#fff")}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: tn(r) ? "var(--navy-700)" : "var(--text-muted)", whiteSpace: "nowrap" }}>{tn(r) ? `→ ${tn(r).toUpperCase()}` : t("type transit")}</span>
              <Cell r={r} sheet="mgq" field="transitCost" label="Transit cost" disabled={dis} />
            </div>
          </td>
        ))}
      </tr>
      {total("Net MGQ", (r) => r.row.mgqNet)}
      {total("Total Air Cost", (r) => r.row.mgqTotal, true)}
      {total("Rate", (r) => r.row.rateMgq)}
      <tr>
        <td style={labelCell("#B8CCE4")} />
        {rows.map((r) => (
          <td key={r.id} style={cell("#B8CCE4")} />
        ))}
      </tr>
    </Grid>
  );
}

/** Sea MGQ rows, in the owner's sheet order and wording. */
const SEA_ROWS: [string, string][] = [
  ["maersk", "MEARSK"],
  ["albayrak", "ALBAYRAK"],
  ["inlandPickupTruck", "GAARI GUDAHA QABSASHADA"],
  ["scan", "SCAN"],
  ["qualityControl", "Quality control"],
  ["portPorters", "XAMALI GUDAHA DEKEDDA"],
  ["customsDuty", "CANSHUR"],
  ["clearance", "XALIN"],
  ["truck", "TRUCK GAARI"],
  ["storeUnloading", "LOADING DAJIN STORE"],
];

function MgqSea({ rows, year, perms }: { rows: CostShipment[]; year: number; perms: Perms }) {
  const t = useT();
  return (
    <Grid empty={!rows.length} span={2}>
      <tr>
        <td style={{ ...labelCell("#17375E"), color: "#fff", fontWeight: 700, textAlign: "center" }}>{t("OPERATION COST FOR SEA CARGO")}</td>
        <td colSpan={Math.max(1, rows.length)} style={{ ...cell("#17375E"), color: "#fff", fontWeight: 700 }}>
          {t("OPERATION COST FOR SEA CARGO")} {year}
        </td>
      </tr>
      <tr>
        <td style={{ ...labelCell("#4BACC6"), textAlign: "center", fontWeight: 700 }}>CNT NO</td>
        {rows.map((r) => (
          <td key={r.id} style={{ ...cell("#4BACC6"), textAlign: "center", fontWeight: 700 }}>
            {r.container ?? r.code}
          </td>
        ))}
      </tr>
      <tr>
        <td style={labelCell("#FCD5B4")}>{t("Date").toUpperCase()}</td>
        {rows.map((r) => (
          <td key={r.id} style={{ ...cell(BL), textAlign: "center" }}>
            {ddmm(r.arrivalDate)}
          </td>
        ))}
      </tr>
      {SEA_ROWS.map(([k, l]) => (
        <tr key={k}>
          <td style={labelCell("#FCD5B4")}>{t(l)}</td>
          {rows.map((r) => (
            <td key={r.id} style={cell(BL)}>
              <Cell r={r} sheet="mgq" field={k} label={l} disabled={!perms.mgq} />
            </td>
          ))}
        </tr>
      ))}
      {(
        [
          ["TOTAL PORT CHARGES", (r: CostShipment) => r.row.mgqNet],
          ["IMPORT TAX", (r: CostShipment) => r.row.importTax],
        ] as const
      ).map(([l, get]) => (
        <tr key={l}>
          <td style={{ ...labelCell("#FAC090"), fontWeight: 700 }}>{t(l)}</td>
          {rows.map((r) => (
            <td key={r.id} style={{ ...cell("#FCD5B4"), fontWeight: 700 }}>
              <Usd v={get(r)} />
            </td>
          ))}
        </tr>
      ))}
      <tr>
        <td style={{ ...labelCell("#FCD5B4"), fontWeight: 700 }}>{t("TOTAL AMOUNT")}</td>
        {rows.map((r) => (
          <td key={r.id} style={{ ...cell(BL), fontWeight: 800, fontSize: 14 }}>
            <Usd v={r.row.mgqTotal} />
          </td>
        ))}
      </tr>
    </Grid>
  );
}
