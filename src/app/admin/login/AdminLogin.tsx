"use client";

/* eslint-disable @next/next/no-img-element -- static brand logo */
import Link from "next/link";
import { Fragment, useActionState, useState, useTransition } from "react";
import { useT } from "@/i18n/I18nProvider";
import { LangToggle } from "@/i18n/LangToggle";
import { Overline, Seg } from "@/ui/kit";
import { Button, Icon, Input } from "@/ui/primitives";
import {
  staffLoginAction,
  staffRequestCodeAction,
  staffSetPasswordAction,
  staffVerifyCodeAction,
  type ActionResult,
} from "./actions";

type Mode = "signin" | "setup";
const STEPS = ["Verify", "Gmail", "Password"] as const;

/**
 * Staff sign-in (spec B1, ADR-016), matching ui_kits/admin/AdminLogin.jsx.
 * Sign in: Employee ID + Gmail + password (+ authenticator code when MFA is on).
 * Create Password (first time / forgotten): Employee ID → Gmail + emailed code
 * → create password. Step 3 asks for the Orbit password only — never the
 * person's real Gmail password.
 */
export function AdminLogin() {
  const t = useT();
  const [mode, setMode] = useState<Mode>("signin");
  const [step, setStep] = useState(0);
  const [emp, setEmp] = useState("");
  const [gmail, setGmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [token, setToken] = useState("");
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [err, setErr] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, start] = useTransition();
  const [loginState, loginAction, loginPending] = useActionState<ActionResult | null, FormData>(staffLoginAction, null);

  const run = <R extends ActionResult>(p: () => Promise<R>, then: (r: R & { ok: true }) => void) =>
    start(async () => {
      setErr("");
      const r = await p();
      if (r.ok) then(r as R & { ok: true });
      else setErr(t(r.error));
    });

  const resetSetup = () => {
    setStep(0);
    setSent(false);
    setCode("");
    setToken("");
    setP1("");
    setP2("");
  };

  const next = () => {
    setErr("");
    if (step === 0) {
      if (!/^EMP-[A-Z0-9]+$/i.test(emp.trim())) return setErr(t("Employee ID format: EMP-000"));
      setStep(1);
    } else if (step === 1 && !sent) {
      run(() => staffRequestCodeAction({ employeeId: emp, email: gmail }), () => setSent(true));
    } else if (step === 1) {
      if (code.length < 6) return setErr(t("Enter the 6-digit code sent to your Gmail"));
      run(() => staffVerifyCodeAction({ email: gmail, code }), (r) => {
        setToken(r.token);
        setStep(2);
      });
    } else {
      if (p1.length < 8) return setErr(t("Password must be at least 8 characters"));
      if (p1 !== p2) return setErr(t("Passwords do not match"));
      run(() => staffSetPasswordAction({ token, password: p1, confirm: p2 }), (r) => {
        if (r.signInRequired) {
          resetSetup();
          setMode("signin");
          setNotice(t("Password created. Sign in with your authenticator code."));
        }
      });
    }
  };

  const linkBtn = { background: "none", border: 0, color: "var(--text-link)", textDecoration: "underline", cursor: "pointer", fontSize: 13 } as const;

  return (
    <div className="auth-admin">
      <aside className="auth-admin-aside">
        <img src="/brand/orbit-logo-reversed.png" alt="Orbit Cargo & Logistics" style={{ height: 60, alignSelf: "flex-start" }} />
        <div className="auth-admin-lede">
          <Overline color="var(--orange-400)">Orbit Cargo ERP</Overline>
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontVariationSettings: "'wdth' 118",
              fontWeight: 850,
              fontSize: 52,
              lineHeight: 1.02,
              textTransform: "uppercase",
              marginTop: 14,
            }}
          >
            {t("Admin Panel")}
          </div>
          <div style={{ color: "var(--navy-300)", fontSize: 16, marginTop: 12, maxWidth: 420 }}>
            {t("Manage customers, shipments, finance and documents for every business year.")}
          </div>
        </div>
        <div className="auth-admin-foot" style={{ fontSize: 12, color: "var(--navy-300)" }}>
          © 2026 Orbit Cargo &amp; Logistics
        </div>
      </aside>

      <main className="auth-admin-main">
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, alignItems: "center", marginBottom: 20 }}>
          <Link href="/login" style={{ fontSize: 13, fontWeight: 600 }}>
            {t("Customer App")}
          </Link>
          <LangToggle />
        </div>
        <h1 style={{ margin: 0, font: "700 28px/1.2 var(--font-display)", color: "var(--text-strong)" }}>{t("Admin Login")}</h1>
        <div style={{ fontSize: 14, color: "var(--text-muted)", margin: "6px 0 22px" }}>
          {t(mode === "setup" ? "First time? Verify your account and create a password." : "Sign in with your Employee ID and password.")}
        </div>
        <Seg
          full
          value={mode}
          onChange={(m) => {
            setMode(m as Mode);
            setErr("");
            setNotice("");
          }}
          options={[
            ["setup", "Create Password"],
            ["signin", "Sign in"],
          ]}
        />
        <div style={{ height: 22 }} />

        {mode === "signin" ? (
          <form action={loginAction} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {notice && (
              <div role="status" style={{ fontSize: 13, color: "var(--status-success)", fontWeight: 600 }}>
                {notice}
              </div>
            )}
            <Input
              size="l"
              name="employeeId"
              label={t("Employee ID")}
              placeholder="EMP-000"
              autoCapitalize="characters"
              autoComplete="off"
              required
              leadingIcon={<Icon name="IdCard" size={16} />}
              inputStyle={{ fontFamily: "var(--font-mono)", textTransform: "uppercase" }}
            />
            <Input size="l" name="email" type="email" label={t("Gmail")} autoComplete="username" required leadingIcon={<Icon name="Mail" size={16} />} />
            <Input size="l" name="password" type="password" label={t("Password")} autoComplete="current-password" required leadingIcon={<Icon name="Lock" size={16} />} />
            <Input
              size="l"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              label={t("Authenticator code")}
              hint={t("Only if two-factor is enabled on your account")}
              leadingIcon={<Icon name="ShieldCheck" size={16} />}
              inputStyle={{ fontFamily: "var(--font-mono)", letterSpacing: "0.2em" }}
            />
            {loginState && !loginState.ok && (
              <div role="alert" style={{ fontSize: 13, color: "var(--status-danger)" }}>
                {t(loginState.error)}
              </div>
            )}
            <Button type="submit" size="l" fullWidth disabled={loginPending}>
              {t("Continue")}
            </Button>
          </form>
        ) : (
          <>
            <ol style={{ display: "flex", alignItems: "center", margin: "0 0 24px", padding: 0, listStyle: "none" }}>
              {STEPS.map((s, i) => (
                <Fragment key={s}>
                  <li aria-current={i === step ? "step" : undefined} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 14,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        font: "700 12px var(--font-body)",
                        background: i < step ? "var(--navy-700)" : i === step ? "var(--orange-500)" : "#fff",
                        color: i <= step ? "#fff" : "var(--text-muted)",
                        border: i > step ? "1.5px solid var(--border-strong)" : 0,
                        boxSizing: "border-box",
                      }}
                    >
                      {i < step ? <Icon name="Check" size={14} /> : i + 1}
                    </span>
                    <span style={{ font: `${i === step ? 700 : 500} 13px var(--font-body)`, color: i <= step ? "var(--text-strong)" : "var(--text-muted)" }}>{t(s)}</span>
                  </li>
                  {i < 2 && <span aria-hidden="true" style={{ flex: 1, height: 2, margin: "0 10px", background: i < step ? "var(--navy-700)" : "var(--gray-200)" }} />}
                </Fragment>
              ))}
            </ol>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {step === 0 && (
                <Input
                  size="l"
                  label={t("Employee ID")}
                  value={emp}
                  onChange={(e) => setEmp(e.target.value)}
                  placeholder="EMP-000"
                  autoCapitalize="characters"
                  leadingIcon={<Icon name="IdCard" size={16} />}
                  inputStyle={{ fontFamily: "var(--font-mono)", textTransform: "uppercase" }}
                  hint={t("Provided by your administrator")}
                />
              )}
              {step === 1 && (
                <>
                  <Input size="l" type="email" label={t("Gmail")} value={gmail} disabled={sent} onChange={(e) => setGmail(e.target.value)} leadingIcon={<Icon name="Mail" size={16} />} />
                  {sent && (
                    <Input
                      size="l"
                      label={t("Gmail Verification")}
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      placeholder="000000"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      inputStyle={{ fontFamily: "var(--font-mono)", letterSpacing: ".3em" }}
                      hint={`${t("If the details match our records, a code was sent to")} ${gmail}`}
                    />
                  )}
                </>
              )}
              {step === 2 && (
                <>
                  <Input size="l" type="password" autoComplete="new-password" label={t("Create Password")} value={p1} onChange={(e) => setP1(e.target.value)} leadingIcon={<Icon name="Lock" size={16} />} hint={t("At least 8 characters")} />
                  <Input size="l" type="password" autoComplete="new-password" label={t("Confirm Password")} value={p2} onChange={(e) => setP2(e.target.value)} leadingIcon={<Icon name="LockKeyhole" size={16} />} />
                </>
              )}
              {err && (
                <div role="alert" style={{ fontSize: 13, color: "var(--status-danger)" }}>
                  {err}
                </div>
              )}
              <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
                {step > 0 && (
                  <Button
                    size="l"
                    variant="outline"
                    onClick={() => {
                      if (step === 1 && sent) {
                        setSent(false);
                        setCode("");
                      } else setStep(step - 1);
                      setErr("");
                    }}
                  >
                    {t("Back")}
                  </Button>
                )}
                <Button size="l" style={{ flex: 1 }} disabled={busy} onClick={next} trailingIcon={step < 2 ? <Icon name="ArrowRight" size={16} /> : undefined}>
                  {t(step === 2 ? "Create Password" : step === 1 && sent ? "Verify" : step === 1 ? "Send code" : "Continue")}
                </Button>
              </div>
              {step === 1 && sent && (
                <button type="button" disabled={busy} style={{ ...linkBtn, alignSelf: "flex-end" }} onClick={() => run(() => staffRequestCodeAction({ employeeId: emp, email: gmail }), () => setCode(""))}>
                  {t("Resend code")}
                </button>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
