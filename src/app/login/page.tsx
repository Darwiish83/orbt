"use client";

import Image from "next/image";
import { useActionState } from "react";
import { Button, Icon, Input } from "@/ui/primitives";
import { login, type LoginState } from "./actions";

const initial: LoginState = { error: null };

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(login, initial);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "var(--surface-page)",
        padding: 24,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 400,
          background: "var(--surface-card)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-l)",
          boxShadow: "var(--shadow-2)",
          borderTop: "4px solid var(--orange-500)",
          padding: 32,
        }}
      >
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
          <Image src="/brand/orbit-logo.png" alt="OrbitCargo" width={150} height={38} priority style={{ height: 38, width: "auto" }} />
        </div>
        <h1
          style={{
            font: "700 24px/1.2 var(--font-display)",
            color: "var(--text-strong)",
            textAlign: "center",
            margin: "0 0 4px",
          }}
        >
          Sign in
        </h1>
        <p style={{ fontSize: 14, color: "var(--text-muted)", textAlign: "center", margin: "0 0 22px" }}>
          Access your OrbitCargo account.
        </p>

        <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Input
            name="email"
            type="email"
            label="Email"
            autoComplete="username"
            required
            leadingIcon={<Icon name="Mail" size={16} />}
          />
          <Input
            name="password"
            type="password"
            label="Password"
            autoComplete="current-password"
            required
            leadingIcon={<Icon name="Lock" size={16} />}
          />
          <Input
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            label="Authenticator code"
            hint="Only if two-factor is enabled on your account"
            leadingIcon={<Icon name="ShieldCheck" size={16} />}
            inputStyle={{ fontFamily: "var(--font-mono)", letterSpacing: "0.2em" }}
          />
          {state.error && (
            <div
              role="alert"
              style={{
                background: "var(--status-danger-bg)",
                color: "var(--status-danger)",
                borderRadius: "var(--radius-s)",
                padding: "8px 12px",
                fontSize: 13,
              }}
            >
              {state.error}
            </div>
          )}
          <Button type="submit" size="l" fullWidth disabled={pending}>
            {pending ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </div>
    </div>
  );
}
