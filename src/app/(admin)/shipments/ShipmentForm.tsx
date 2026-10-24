"use client";

import { useState, useTransition } from "react";
import { useT } from "@/i18n/I18nProvider";
import { DateField, Flag } from "@/ui/kit";
import { Button, Dialog, Input } from "@/ui/primitives";
import { useToast } from "@/components/admin/ui";
import { createShipmentAction, updateShipmentAction, type ShipmentFormValues } from "./actions";

export interface ShipmentFormInitial {
  id?: string;
  code?: string;
  mode: "AIR" | "SEA";
  originCountry: string;
  originCity?: string | null;
  destCity?: string | null;
  destCode?: string | null;
  shipDate?: string | null;
  arrivalDate?: string | null;
  awb?: string | null;
  businessYear: number;
}

/**
 * Create / Edit Shipment (design `ShipmentForm`). The code (next W-n / C-n) is
 * assigned on the server. Country, mode and year are chosen at creation and
 * fixed afterwards; status is changed in Operations.
 */
export function ShipmentForm({
  initial,
  countries,
  years,
  onClose,
  onSaved,
}: {
  initial: ShipmentFormInitial;
  countries: string[];
  years: number[];
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const t = useT();
  const toast = useToast();
  const editing = !!initial.id;
  const [v, setV] = useState<ShipmentFormValues>({
    mode: initial.mode,
    originCountry: initial.originCountry,
    originCity: initial.originCity ?? "",
    destCity: initial.destCity ?? "Mogadishu",
    destCode: initial.destCode ?? "MGQ",
    shipDate: initial.shipDate?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
    arrivalDate: initial.arrivalDate?.slice(0, 10) ?? "",
    awb: initial.awb ?? "",
    businessYear: initial.businessYear,
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (k: keyof ShipmentFormValues, x: string | number) => setV((o) => ({ ...o, [k]: x }));
  const air = v.mode === "AIR";
  const sel = { height: 40, padding: "0 10px", border: "1px solid var(--border-strong)", borderRadius: "var(--radius-s)", background: editing ? "var(--surface-sunken)" : "#fff", font: "400 14px var(--font-body)" } as const;
  const lab = { display: "flex", flexDirection: "column" as const, gap: 6, font: "600 13px var(--font-body)", color: "var(--text-strong)" };

  const save = () =>
    start(async () => {
      setError(null);
      const r = editing ? await updateShipmentAction(initial.id!, v) : await createShipmentAction(v);
      if (!r.ok) return setError(r.error);
      toast({ tone: "success", title: "Shipment saved", message: initial.code ?? "" });
      onSaved(editing ? initial.id! : (r.data as { id: string }).id);
    });

  return (
    <Dialog
      open
      width={680}
      onClose={onClose}
      title={`${t(editing ? "Edit Shipment" : "Create Shipment")} · ${t(air ? "Air Freight" : "Sea Freight")}${initial.code ? " · " + initial.code : ""}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            {t("Cancel")}
          </Button>
          <Button onClick={save} disabled={pending} data-testid="save-shipment">
            {t("Save")}
          </Button>
        </>
      }
    >
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 14 }}>
        <label style={lab}>
          {t("Origin")} ({t("Country")})
          <select value={v.originCountry} disabled={editing} onChange={(e) => set("originCountry", e.target.value)} style={sel}>
            {countries.map((c) => (
              <option key={c} value={c}>
                {t(c)}
              </option>
            ))}
          </select>
        </label>
        <Input label={`${t("Origin Code")} (${t("City")})`} value={String(v.originCity ?? "")} onChange={(e) => set("originCity", e.target.value)} placeholder="Istanbul" />
        <label style={lab}>
          {t("Year")}
          <select value={v.businessYear} disabled={editing} onChange={(e) => set("businessYear", Number(e.target.value))} style={sel}>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
        <DateField label="Date" value={String(v.shipDate ?? "")} onChange={(x) => set("shipDate", x)} />
        <DateField label="Arrival" value={String(v.arrivalDate ?? "")} onChange={(x) => set("arrivalDate", x)} />
        <Input label={air ? "AWB" : t("Bill of Lading")} value={String(v.awb ?? "")} onChange={(e) => set("awb", e.target.value)} inputStyle={{ fontFamily: "var(--font-mono)" }} />
        <Input leadingIcon={<Flag country="Somalia" size={13} />} label={`${t("Destination")} (${t("Country")})`} value={t("Somalia")} readOnly />
        <Input label={`${t("Destination")} (${t("City")})`} value={String(v.destCity ?? "")} onChange={(e) => set("destCity", e.target.value)} />
        <Input label={t("Destination Code")} value={String(v.destCode ?? "")} onChange={(e) => set("destCode", e.target.value)} inputStyle={{ fontFamily: "var(--font-mono)" }} />
      </div>
      {!editing && <div style={{ marginTop: 12, fontSize: 12, color: "var(--text-muted)" }}>{t("The shipment code (W-1, C-1…) is given automatically. Status starts At Origin Store and is changed in Operations.")}</div>}
      {error && (
        <div role="alert" style={{ marginTop: 12, color: "var(--status-danger)", fontSize: 13 }}>
          {t(error)}
        </div>
      )}
    </Dialog>
  );
}
