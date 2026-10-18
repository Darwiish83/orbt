"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button, Icon, Input } from "@/ui/primitives";
import { resetPasswordAction, type ResetState } from "./actions";

const initial: ResetState = { error: null };

export function ResetForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(resetPasswordAction, initial);

  if (state.ok) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--status-success)" }}>
          <Icon name="ShieldCheck" size={18} />
          <strong>Password updated.</strong>
        </div>
        <Link href="/login">
          <Button size="l" fullWidth trailingIcon={<Icon name="ArrowRight" size={16} />}>
            Sign in
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <form action={action} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <input type="hidden" name="token" value={token} />
      <Input name="password" type="password" label="New password" autoComplete="new-password" required hint="At least 8 characters" leadingIcon={<Icon name="Lock" size={16} />} />
      <Input name="confirm" type="password" label="Confirm password" autoComplete="new-password" required leadingIcon={<Icon name="LockKeyhole" size={16} />} />
      {state.error && (
        <div role="alert" style={{ color: "var(--status-danger)", fontSize: 13 }}>
          {state.error}
        </div>
      )}
      <Button type="submit" size="l" fullWidth disabled={pending}>
        {pending ? "Saving…" : "Set new password"}
      </Button>
    </form>
  );
}
