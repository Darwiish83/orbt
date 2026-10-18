"use client";

import { useActionState } from "react";
import { Button, Icon, Input } from "@/ui/primitives";
import { createShipmentAction, type ActionState } from "./actions";

const initial: ActionState = { error: null };
const year = new Date().getFullYear();

export function NewShipmentForm() {
  const [state, action, pending] = useActionState(createShipmentAction, initial);
  return (
    <form
      action={action}
      style={{
        background: "var(--surface-card)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-l)",
        boxShadow: "var(--shadow-1)",
        padding: 20,
        display: "flex",
        flexWrap: "wrap",
        gap: 12,
        alignItems: "flex-end",
      }}
    >
      <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={{ font: "600 13px var(--font-body)", color: "var(--text-strong)" }}>Mode</span>
        <select name="mode" defaultValue="AIR" style={{ height: 40, padding: "0 10px", border: "1px solid var(--border-strong)", borderRadius: "var(--radius-s)", background: "#fff" }}>
          <option value="AIR">Air</option>
          <option value="SEA">Sea</option>
          <option value="ROAD">Road</option>
        </select>
      </label>
      <Input name="originCountry" label="Origin country" placeholder="Turkey" required style={{ flex: "1 1 140px" }} />
      <Input name="originCity" label="Origin city" placeholder="Istanbul" style={{ flex: "1 1 140px" }} />
      <Input name="destCountry" label="Dest country" placeholder="Somalia" style={{ flex: "1 1 140px" }} />
      <Input name="businessYear" label="Year" defaultValue={String(year)} style={{ width: 90 }} />
      <Button type="submit" disabled={pending} leadingIcon={<Icon name="Plus" size={16} />}>
        {pending ? "Creating…" : "New shipment"}
      </Button>
      {state.error && <div role="alert" style={{ flexBasis: "100%", color: "var(--status-danger)", fontSize: 13 }}>{state.error}</div>}
      {state.ok && <div role="status" style={{ flexBasis: "100%", color: "var(--status-success)", fontSize: 13 }}>Shipment created.</div>}
    </form>
  );
}
