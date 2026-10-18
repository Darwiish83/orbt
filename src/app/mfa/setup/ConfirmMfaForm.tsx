"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button, Icon, Input } from "@/ui/primitives";
import { confirmMfaAction, type ConfirmState } from "./actions";

const initial: ConfirmState = { error: null };

export function ConfirmMfaForm() {
  const [state, action, pending] = useActionState(confirmMfaAction, initial);

  if (state.codes) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--status-success)" }}>
          <Icon name="ShieldCheck" size={18} />
          <strong>Two-factor authentication is on.</strong>
        </div>
        <p style={{ fontSize: 14, color: "var(--text-muted)", margin: 0 }}>
          Save these recovery codes somewhere safe. Each works once if you lose your authenticator.
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 8,
            fontFamily: "var(--font-mono)",
            background: "var(--surface-sunken)",
            border: "1px solid var(--border-default)",
            borderRadius: "var(--radius-s)",
            padding: 16,
          }}
        >
          {state.codes.map((c) => (
            <span key={c}>{c}</span>
          ))}
        </div>
        <Link href="/dashboard">
          <Button size="l" trailingIcon={<Icon name="ArrowRight" size={16} />}>
            Continue
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <form action={action} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <Input
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        label="Enter the 6-digit code"
        required
        inputStyle={{ fontFamily: "var(--font-mono)", letterSpacing: "0.3em" }}
      />
      {state.error && (
        <div role="alert" style={{ color: "var(--status-danger)", fontSize: 13 }}>
          {state.error}
        </div>
      )}
      <Button type="submit" size="l" fullWidth disabled={pending}>
        {pending ? "Verifying…" : "Turn on two-factor"}
      </Button>
    </form>
  );
}
