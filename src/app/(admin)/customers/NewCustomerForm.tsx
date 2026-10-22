"use client";

import { useActionState } from "react";
import { Button, Icon, Input } from "@/ui/primitives";
import { createCustomerAction, type CreateCustomerState } from "./actions";

const initial: CreateCustomerState = { error: null };

export function NewCustomerForm() {
  const [state, action, pending] = useActionState(createCustomerAction, initial);

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
      <Input name="name" label="New customer" placeholder="Full name" required style={{ flex: "2 1 200px" }} />
      <Input name="company" label="Company" placeholder="Company" required style={{ flex: "2 1 180px" }} />
      <Input name="phone" label="Phone" placeholder="+252…" style={{ flex: "1 1 140px" }} />
      <Input name="email" type="email" label="Email" style={{ flex: "1 1 180px" }} />
      <Input name="location" label="Location" placeholder="e.g. Mogadishu, Bakara" style={{ flex: "1 1 160px" }} />
      <Input name="cargoCategory" label="What do you buy?" placeholder="e.g. Electronics, clothes" style={{ flex: "1 1 180px" }} />
      <Button type="submit" disabled={pending} leadingIcon={<Icon name="Plus" size={16} />}>
        {pending ? "Adding…" : "Add customer"}
      </Button>
      {state.error && (
        <div role="alert" style={{ flexBasis: "100%", color: "var(--status-danger)", fontSize: 13 }}>
          {state.error}
        </div>
      )}
      {state.ok && (
        <div role="status" style={{ flexBasis: "100%", color: "var(--status-success)", fontSize: 13 }}>
          Customer added.
        </div>
      )}
    </form>
  );
}
