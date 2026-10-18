"use client";

import { useActionState } from "react";
import { Button, Icon, Input } from "@/ui/primitives";
import { inviteUserAction, type ActionState } from "./actions";

const DEPARTMENTS = ["MANAGEMENT", "OPERATIONS", "FINANCE", "CUSTOMER_SERVICE", "DOCUMENTS", "REPORTS"];
const initial: ActionState = { error: null };

export function InviteUserForm() {
  const [state, action, pending] = useActionState(inviteUserAction, initial);
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
      <Input name="name" label="Invite staff" placeholder="Full name" required style={{ flex: "2 1 180px" }} />
      <Input name="email" type="email" label="Email" placeholder="name@orbitcargo.so" required style={{ flex: "2 1 200px" }} />
      <label style={{ display: "flex", flexDirection: "column", gap: 6, flex: "1 1 160px" }}>
        <span style={{ font: "600 13px var(--font-body)", color: "var(--text-strong)" }}>Department</span>
        <select
          name="department"
          required
          defaultValue="OPERATIONS"
          style={{ height: 40, padding: "0 10px", border: "1px solid var(--border-strong)", borderRadius: "var(--radius-s)", font: "400 14px var(--font-body)", background: "#fff" }}
        >
          {DEPARTMENTS.map((d) => (
            <option key={d} value={d}>
              {d.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      </label>
      <Button type="submit" disabled={pending} leadingIcon={<Icon name="UserPlus" size={16} />}>
        {pending ? "Inviting…" : "Invite"}
      </Button>
      {state.error && (
        <div role="alert" style={{ flexBasis: "100%", color: "var(--status-danger)", fontSize: 13 }}>
          {state.error}
        </div>
      )}
      {state.ok && (
        <div role="status" style={{ flexBasis: "100%", color: "var(--status-success)", fontSize: 13 }}>
          Invitation created (user must set a password via reset).
        </div>
      )}
    </form>
  );
}
