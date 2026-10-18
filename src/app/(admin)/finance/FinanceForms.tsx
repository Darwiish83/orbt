"use client";

import { useActionState } from "react";
import { Button, Icon, Input } from "@/ui/primitives";
import { createInvoiceAction, recordPaymentAction, type ActionState } from "./actions";

const initial: ActionState = { error: null };

const selectStyle = {
  height: 40,
  padding: "0 10px",
  border: "1px solid var(--border-strong)",
  borderRadius: "var(--radius-s)",
  background: "#fff",
} as const;

const cardStyle = {
  background: "var(--surface-card)",
  border: "1px solid var(--border-default)",
  borderRadius: "var(--radius-l)",
  boxShadow: "var(--shadow-1)",
  padding: 20,
  display: "flex",
  flexWrap: "wrap",
  gap: 12,
  alignItems: "flex-end",
} as const;

export function FinanceForms() {
  const [inv, invAction, invPending] = useActionState(createInvoiceAction, initial);
  const [pay, payAction, payPending] = useActionState(recordPaymentAction, initial);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
      <form action={invAction} style={cardStyle}>
        <div style={{ flexBasis: "100%", font: "700 13px var(--font-body)", color: "var(--text-strong)" }}>New invoice</div>
        <Input name="customerRef" label="Customer ref" placeholder="OR-3000" required style={{ flex: "1 1 120px" }} />
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ font: "600 13px var(--font-body)", color: "var(--text-strong)" }}>Category</span>
          <select name="category" defaultValue="FREIGHT" style={selectStyle}>
            <option value="FREIGHT">Freight</option>
            <option value="LOCAL_DELIVERY">Local delivery</option>
            <option value="CUSTOMS_TAX">Customs / tax</option>
            <option value="SERVICE">Service</option>
            <option value="OTHER">Other</option>
          </select>
        </label>
        <Input name="quantity" label="Qty" defaultValue="1" style={{ width: 70 }} />
        <Input name="unitPrice" label="Unit price" placeholder="100.00" required style={{ width: 110 }} />
        <Button type="submit" disabled={invPending} leadingIcon={<Icon name="Plus" size={16} />}>
          {invPending ? "…" : "Create"}
        </Button>
        {inv.error && <div role="alert" style={{ flexBasis: "100%", color: "var(--status-danger)", fontSize: 13 }}>{inv.error}</div>}
        {inv.ok && <div role="status" style={{ flexBasis: "100%", color: "var(--status-success)", fontSize: 13 }}>Invoice created.</div>}
      </form>

      <form action={payAction} style={cardStyle}>
        <div style={{ flexBasis: "100%", font: "700 13px var(--font-body)", color: "var(--text-strong)" }}>Record payment</div>
        <Input name="invoiceNumber" label="Invoice" placeholder="INV-2026-0001" required style={{ flex: "1 1 150px" }} />
        <Input name="amount" label="Amount" placeholder="100.00" required style={{ width: 110 }} />
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ font: "600 13px var(--font-body)", color: "var(--text-strong)" }}>Method</span>
          <select name="method" defaultValue="CASH" style={selectStyle}>
            <option value="CASH">Cash</option>
            <option value="BANK_TRANSFER">Bank transfer</option>
            <option value="MOBILE_MONEY">Mobile money</option>
            <option value="OTHER">Other</option>
          </select>
        </label>
        <Button type="submit" disabled={payPending} leadingIcon={<Icon name="Banknote" size={16} />}>
          {payPending ? "…" : "Record"}
        </Button>
        {pay.error && <div role="alert" style={{ flexBasis: "100%", color: "var(--status-danger)", fontSize: 13 }}>{pay.error}</div>}
        {pay.ok && <div role="status" style={{ flexBasis: "100%", color: "var(--status-success)", fontSize: 13 }}>Payment recorded.</div>}
      </form>
    </div>
  );
}
