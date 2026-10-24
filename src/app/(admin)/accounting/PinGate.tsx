"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useT } from "@/i18n/I18nProvider";
import { Button, Icon } from "@/ui/primitives";
import { setPinAction, unlockAction } from "./actions";

/** Accounting PIN screen: "⛔ No access" without the special access, first-time
 * PIN creation, or PIN entry (once per session). */
export function PinGate({ mode }: { mode: "denied" | "set" | "enter" }) {
  const t = useT();
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const submit = () =>
    start(async () => {
      setError(null);
      const r = mode === "set" ? await setPinAction(pin, confirm) : await unlockAction(pin);
      if (!r.ok) return setError(r.error);
      router.refresh();
    });
  const input = { width: "100%", height: 52, textAlign: "center" as const, letterSpacing: ".5em", font: "800 24px var(--font-mono)", border: "1px solid var(--border-strong)", borderRadius: 8, boxSizing: "border-box" as const };
  return (
    <div style={{ display: "flex", justifyContent: "center", padding: "40px 0" }}>
      <div style={{ width: 380, maxWidth: "100%", background: "#fff", border: "1px solid var(--border-default)", borderRadius: "var(--radius-l)", padding: 28, display: "flex", flexDirection: "column", gap: 16, alignItems: "center", textAlign: "center" }}>
        <span style={{ width: 56, height: 56, borderRadius: 28, background: mode === "denied" ? "#FDEEEE" : "var(--navy-50)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon name={mode === "denied" ? "Ban" : "Lock"} size={26} color={mode === "denied" ? "var(--red-600)" : "var(--navy-700)"} />
        </span>
        <div style={{ font: "700 20px var(--font-display)", color: "var(--text-strong)" }}>{mode === "denied" ? `⛔ ${t("No access")}` : t("Accounting")}</div>
        {mode === "denied" ? (
          <div style={{ fontSize: 13, color: "var(--text-muted)" }}>{t("Accounting needs special access. Ask an administrator.")}</div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
            style={{ width: "100%", display: "flex", flexDirection: "column", gap: 12 }}
          >
            <div style={{ fontSize: 13, color: "var(--text-muted)" }}>{t(mode === "set" ? "Choose a PIN of 4 to 8 digits. You will enter it each time you open Accounting." : "Enter your Accounting PIN")}</div>
            <input aria-label={t("PIN")} data-testid="acc-pin" type="password" inputMode="numeric" autoComplete="off" maxLength={8} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} style={input} autoFocus />
            {mode === "set" && <input aria-label={t("Confirm PIN")} type="password" inputMode="numeric" autoComplete="off" maxLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value.replace(/\D/g, ""))} style={input} placeholder={t("Confirm PIN")} />}
            {error && (
              <div role="alert" style={{ color: "var(--status-danger)", fontSize: 13 }}>
                {t(error)}
              </div>
            )}
            <Button type="submit" fullWidth disabled={pending || pin.length < 4} data-testid="acc-unlock">
              {t(mode === "set" ? "Save PIN" : "Unlock")}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
