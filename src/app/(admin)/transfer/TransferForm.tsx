"use client";

import { useActionState } from "react";
import { Button, Icon, Input } from "@/ui/primitives";
import { createTransferAction, type ActionState } from "./actions";

const initial: ActionState = { error: null };
const year = new Date().getFullYear();

export function TransferForm() {
  const [state, action, pending] = useActionState(createTransferAction, initial);
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
      <div style={{ flexBasis: "100%", font: "700 13px var(--font-body)", color: "var(--text-strong)" }}>New transfer</div>
      <Input name="amount" label="Amount (USD)" placeholder="1000.00" required style={{ width: 130 }} />
      <Input name="fromCountry" label="From" placeholder="Turkey" required style={{ flex: "1 1 120px" }} />
      <Input name="toCountry" label="To" placeholder="India" required style={{ flex: "1 1 120px" }} />
      <Input name="businessYear" label="Year" defaultValue={String(year)} style={{ width: 90 }} />
      <Input name="note" label="Note" placeholder="Optional" style={{ flex: "1 1 160px" }} />
      <Button type="submit" disabled={pending} leadingIcon={<Icon name="ArrowLeftRight" size={16} />}>
        {pending ? "…" : "Create"}
      </Button>
      {state.error && <div role="alert" style={{ flexBasis: "100%", color: "var(--status-danger)", fontSize: 13 }}>{state.error}</div>}
      {state.ok && <div role="status" style={{ flexBasis: "100%", color: "var(--status-success)", fontSize: 13 }}>Transfer created.</div>}
    </form>
  );
}
