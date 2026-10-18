"use client";

import { useActionState } from "react";
import { Button, Icon, Input } from "@/ui/primitives";
import { createAnnouncementAction, type ActionState } from "./actions";

const initial: ActionState = { error: null };

export function Composer() {
  const [state, action, pending] = useActionState(createAnnouncementAction, initial);
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
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div style={{ font: "700 13px var(--font-body)", color: "var(--text-strong)" }}>New announcement</div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
        <Input name="title" label="Title" placeholder="Holiday schedule" required style={{ flex: "2 1 220px" }} />
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ font: "600 13px var(--font-body)", color: "var(--text-strong)" }}>Audience</span>
          <select name="audience" defaultValue="ALL" style={{ height: 40, padding: "0 10px", border: "1px solid var(--border-strong)", borderRadius: "var(--radius-s)", background: "#fff" }}>
            <option value="ALL">Everyone</option>
            <option value="CUSTOMER">Customers</option>
            <option value="ROLE">Staff</option>
          </select>
        </label>
      </div>
      <textarea
        name="message"
        required
        rows={3}
        placeholder="Message to recipients…"
        style={{ border: "1px solid var(--border-strong)", borderRadius: "var(--radius-s)", padding: 10, font: "400 14px var(--font-body)", color: "var(--text-strong)", resize: "vertical" }}
      />
      <div>
        <Button type="submit" disabled={pending} leadingIcon={<Icon name="Bell" size={16} />}>
          {pending ? "Saving…" : "Create draft"}
        </Button>
      </div>
      {state.error && <div role="alert" style={{ color: "var(--status-danger)", fontSize: 13 }}>{state.error}</div>}
      {state.ok && <div role="status" style={{ color: "var(--status-success)", fontSize: 13 }}>Draft created.</div>}
    </form>
  );
}
