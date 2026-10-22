"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button, Icon, Input } from "@/ui/primitives";
import { requestPasswordResetAction, type ForgotState } from "./actions";

const initial: ForgotState = { done: false };

const cardStyle = {
  width: "100%",
  maxWidth: 400,
  // App layout, not a DS component: size includes padding (preflight is off).
  boxSizing: "border-box",
  background: "var(--surface-card)",
  border: "1px solid var(--border-default)",
  borderRadius: "var(--radius-l)",
  boxShadow: "var(--shadow-2)",
  borderTop: "4px solid var(--orange-500)",
  padding: 32,
} as const;

export default function ForgotPasswordPage() {
  const [state, action, pending] = useActionState(requestPasswordResetAction, initial);

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--surface-page)", padding: 24 }}>
      <div style={cardStyle}>
        <h1 style={{ font: "700 22px/1.2 var(--font-display)", color: "var(--text-strong)", margin: "0 0 6px" }}>
          Reset your password
        </h1>
        {state.done ? (
          <>
            <p style={{ fontSize: 14, color: "var(--text-muted)", margin: "0 0 20px" }}>
              If an account exists for that email, we&apos;ve sent a reset link. Check your inbox (and spam).
            </p>
            <Link href="/login">
              <Button variant="outline" fullWidth>
                Back to sign in
              </Button>
            </Link>
          </>
        ) : (
          <>
            <p style={{ fontSize: 14, color: "var(--text-muted)", margin: "0 0 22px" }}>
              Enter your email and we&apos;ll send you a link to set a new password.
            </p>
            <form action={action} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <Input name="email" type="email" label="Email" autoComplete="username" required leadingIcon={<Icon name="Mail" size={16} />} />
              <Button type="submit" size="l" fullWidth disabled={pending}>
                {pending ? "Sending…" : "Send reset link"}
              </Button>
              <Link href="/login" style={{ fontSize: 13, color: "var(--navy-700)", textAlign: "center" }}>
                Back to sign in
              </Link>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
