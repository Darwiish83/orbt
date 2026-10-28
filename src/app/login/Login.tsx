"use client";

/* eslint-disable @next/next/no-img-element -- static brand logo */
import { useActionState, useState, useTransition, type ReactNode } from "react";
import { useT } from "@/i18n/I18nProvider";
import { localPhoneDigits, PHONE_REQUIRED } from "@/modules/customers/phone";
import { PASSWORD_MIN, PW_MISMATCH, PW_NEEDS_MIX, PW_TOO_SHORT } from "@/modules/auth/passwordPolicy";
import { LangToggle } from "@/i18n/LangToggle";
import { DeveloperCredit } from "@/components/DeveloperCredit";
import { Overline, Seg } from "@/ui/kit";
import { Button, Card, Icon, Input } from "@/ui/primitives";
import {
  loginAction,
  requestAccessAction,
  setPasswordAction,
  startSignupAction,
  verifyAccessAction,
  verifySignupAction,
  type ActionResult,
} from "./actions";

type Mode = "existing" | "new";
type Step = "form" | "otp" | "setpw";

const blankSignup = { name: "", phone: "", email: "", company: "", location: "", cargoCategory: "" };

/** Phone input keeps digits and spaces only. */
const onlyPhoneChars = (v: string) => v.replace(/[^\d ]/g, "").slice(0, 13);

/** Phone field with the design's fixed +252 prefix. */
function phoneLead() {
  return <span style={{ font: "600 14px var(--font-body)", color: "var(--text-strong)" }}>+252</span>;
}

function ErrorBox({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      style={{
        display: "flex",
        gap: 8,
        padding: 10,
        borderRadius: "var(--radius-s)",
        background: "var(--status-danger-bg)",
        color: "var(--status-danger)",
        fontSize: 13,
        fontWeight: 600,
      }}
    >
      <Icon name="CircleAlert" size={16} />
      {children}
    </div>
  );
}

/** Six boxes over one numeric input (design's OTP entry). */
function OtpBoxes({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <div style={{ position: "relative", display: "flex", gap: 8 }}>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          aria-hidden="true"
          style={{
            flex: 1,
            height: 50,
            borderRadius: "var(--radius-s)",
            border: `1.5px solid ${value.length === i ? "var(--orange-500)" : "var(--border-strong)"}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            font: "700 22px var(--font-mono)",
            color: "var(--text-strong)",
            background: "#fff",
          }}
        >
          {value[i] ?? ""}
        </div>
      ))}
      <input
        aria-label={label}
        autoFocus
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
        style={{ position: "absolute", inset: 0, opacity: 0, cursor: "text", width: "100%" }}
      />
    </div>
  );
}

/** Employee IDs start with EMP-; anything else is a Customer Reference. */
const isStaffId = (id: string) => /^\s*EMP-/i.test(id);

/**
 * One sign-in page for staff and customers (spec A1/B1, ADR-016, ADR-021),
 * in the design of ui_kits/customer-app/Login.jsx.
 * Sign in → ID (Employee ID or Customer Reference) + Gmail + Password (+ the
 * authenticator code for staff with two-factor). The server sends staff to the
 * admin and customers to their account. First login / forgot → ID + Gmail
 * (+ phone for customers) → OTP → create password. New Customer (customers
 * only) → details → OTP → account + Reference (in-app notification) → create
 * password.
 */
export function Login() {
  const t = useT();
  const [mode, setMode] = useState<Mode>("existing");
  const [access, setAccess] = useState(false); // first login / forgot password
  const [step, setStep] = useState<Step>("form");
  const [ref, setRef] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [token, setToken] = useState("");
  const [newRef, setNewRef] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [nc, setNcS] = useState(blankSignup);
  const [err, setErr] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, start] = useTransition();
  const [loginState, signInAction, loginPending] = useActionState<ActionResult | null, FormData>(loginAction, null);
  const staff = isStaffId(ref);

  const setNc = (k: keyof typeof blankSignup, v: string) => setNcS((o) => ({ ...o, [k]: v }));
  const run = <R extends ActionResult>(p: () => Promise<R>, then: (r: R & { ok: true }) => void) =>
    start(async () => {
      setErr("");
      const r = await p();
      if (r.ok) then(r as R & { ok: true });
      else setErr(t(r.error));
    });

  // Customers must give a 9-digit number before moving on (the server re-checks).
  const sendAccess = () => {
    if (!staff && !localPhoneDigits(phone)) return setErr(t(PHONE_REQUIRED));
    run(() => requestAccessAction({ id: ref, phone, email }), () => {
      setOtp("");
      setStep("otp");
    });
  };
  const sendSignup = () => {
    if (Object.values(nc).some((v) => !v.trim())) return setErr(t("Please fill in all required fields"));
    if (!localPhoneDigits(nc.phone)) return setErr(t(PHONE_REQUIRED));
    run(() => startSignupAction(nc), () => {
      setEmail(nc.email);
      setOtp("");
      setStep("otp");
    });
  };
  const verify = () =>
    mode === "new"
      ? run(() => verifySignupAction({ email, code: otp }), (r) => {
          setToken(r.token);
          setNewRef(r.reference);
          setStep("setpw");
        })
      : run(() => verifyAccessAction({ id: ref, email, code: otp }), (r) => {
          setToken(r.token);
          setStep("setpw");
        });
  const savePw = () => {
    // Quick checks here; the server enforces the full password rules.
    if (pw.length < PASSWORD_MIN) return setErr(t(PW_TOO_SHORT));
    if (pw !== pw2) return setErr(t(PW_MISMATCH));
    if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return setErr(t(PW_NEEDS_MIX));
    run(() => setPasswordAction({ token, password: pw, confirm: pw2 }), () => undefined);
  };
  const backToForm = () => {
    setStep("form");
    setOtp("");
    setErr("");
  };

  const feats: [Parameters<typeof Icon>[0]["name"], string][] = [
    ["ShieldCheck", "Fast and Secure"],
    ["Truck", "Reliable Logistics"],
    ["Globe", "Worldwide Coverage"],
  ];

  return (
    <div className="auth-cust">
      <aside className="auth-cust-aside">
        <Overline color="var(--orange-400)">Orbit Cargo ERP</Overline>
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontVariationSettings: "'wdth' 118",
            fontWeight: 850,
            fontSize: 48,
            lineHeight: 1.02,
            textTransform: "uppercase",
          }}
        >
          {t("Your Cargo, Our Priority")}
        </div>
        <div style={{ color: "var(--navy-300)", fontSize: 16, maxWidth: 420 }}>
          {t("Air and sea freight, customs clearance and supplier services — every shipment, invoice and payment in one place.")}
        </div>
      </aside>

      <main className="auth-cust-main">
        <div className="auth-cust-hero">
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <LangToggle dark />
          </div>
          <div style={{ display: "flex", justifyContent: "center", marginTop: 4 }}>
            <img src="/brand/orbit-logo-reversed.png" alt="Orbit Cargo & Logistics" style={{ height: 72 }} />
          </div>
          <div style={{ textAlign: "center", marginTop: 18 }}>
            <h1
              style={{
                margin: 0,
                fontFamily: "var(--font-display)",
                fontVariationSettings: "'wdth' 118",
                fontWeight: 850,
                fontSize: 34,
                lineHeight: 1.05,
                textTransform: "uppercase",
              }}
            >
              {t("Welcome to Orbit")}
            </h1>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
                font: "700 15px var(--font-body)",
                letterSpacing: ".18em",
                textTransform: "uppercase",
                color: "var(--orange-400)",
                marginTop: 8,
              }}
            >
              <span style={{ width: 22, height: 2, background: "var(--orange-500)" }} />
              Cargo &amp; Logistics
              <span style={{ width: 22, height: 2, background: "var(--orange-500)" }} />
            </div>
          </div>
        </div>

        <div className="auth-cust-body">
          <Card elevated padding={18}>
            {step === "form" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <Seg
                  full
                  value={mode}
                  onChange={(m) => {
                    setMode(m as Mode);
                    setErr("");
                    setNotice("");
                  }}
                  options={[
                    ["existing", "Sign in"],
                    ["new", "New Customer"],
                  ]}
                />
                {mode === "existing" && !access && (
                  <form action={signInAction} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    {notice && (
                      <div role="status" style={{ fontSize: 13, color: "var(--status-success)", fontWeight: 600 }}>
                        {notice}
                      </div>
                    )}
                    <Input
                      name="id"
                      label={t("Employee ID or Customer Reference")}
                      value={ref}
                      onChange={(e) => setRef(e.target.value)}
                      placeholder="EMP-000 / OR-0000"
                      autoComplete="username"
                      autoCapitalize="characters"
                      required
                      leadingIcon={<Icon name="IdCard" size={16} />}
                      inputStyle={{ fontFamily: "var(--font-mono)", fontSize: 14, textTransform: "uppercase" }}
                    />
                    <Input
                      name="email"
                      label={t("Gmail")}
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="email"
                      required
                      leadingIcon={<Icon name="Mail" size={16} />}
                    />
                    <Input
                      name="password"
                      label={t("Password")}
                      type="password"
                      autoComplete="current-password"
                      required
                      leadingIcon={<Icon name="Lock" size={16} />}
                      error={loginState && !loginState.ok ? t(loginState.error) : undefined}
                    />
                    <Button type="submit" fullWidth size="l" disabled={loginPending} trailingIcon={<Icon name="ArrowRight" size={16} />}>
                      {t("Log in")}
                    </Button>
                    <button
                      type="button"
                      onClick={() => {
                        setAccess(true);
                        setErr("");
                      }}
                      style={{ alignSelf: "center", fontSize: 13, background: "none", border: 0, color: "var(--text-link)", textDecoration: "underline", cursor: "pointer" }}
                    >
                      {t("First login or forgot password?")}
                    </button>
                  </form>
                )}
                {mode === "existing" && access && (
                  <>
                    <Input
                      label={t("Employee ID or Customer Reference")}
                      value={ref}
                      onChange={(e) => setRef(e.target.value)}
                      placeholder="EMP-000 / OR-0000"
                      leadingIcon={<Icon name="IdCard" size={16} />}
                      inputStyle={{ fontFamily: "var(--font-mono)", fontSize: 14, textTransform: "uppercase" }}
                    />
                    <Input
                      label={t("Gmail")}
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      leadingIcon={<Icon name="Mail" size={16} />}
                      hint={t("Your OTP code will be sent to this email")}
                    />
                    {!staff && (
                      <Input
                        label={t("Phone Number")}
                        value={phone}
                        onChange={(e) => setPhone(onlyPhoneChars(e.target.value))}
                        inputMode="tel"
                        leadingIcon={phoneLead()}
                        placeholder="61 555 0100"
                        hint={t("9 digits after +252")}
                      />
                    )}
                    {err && <ErrorBox>{err}</ErrorBox>}
                    <Button fullWidth size="l" onClick={sendAccess} disabled={busy} trailingIcon={<Icon name="ArrowRight" size={16} />}>
                      {t("Send OTP")}
                    </Button>
                    <button
                      type="button"
                      onClick={() => {
                        setAccess(false);
                        setErr("");
                      }}
                      style={{ alignSelf: "center", fontSize: 13, background: "none", border: 0, color: "var(--text-link)", textDecoration: "underline", cursor: "pointer" }}
                    >
                      {t("Back")}
                    </button>
                  </>
                )}
                {mode === "new" && (
                  <>
                    <Input label={`${t("Full Name")} *`} value={nc.name} onChange={(e) => setNc("name", e.target.value)} placeholder="Abdirahman Hassan" />
                    <Input
                      label={`${t("Phone Number")} *`}
                      value={nc.phone}
                      onChange={(e) => setNc("phone", onlyPhoneChars(e.target.value))}
                      inputMode="tel"
                      leadingIcon={phoneLead()}
                      placeholder="61 555 0100"
                      hint={t("9 digits after +252")}
                    />
                    <Input
                      label={`${t("Email")} *`}
                      type="email"
                      value={nc.email}
                      onChange={(e) => setNc("email", e.target.value)}
                      leadingIcon={<Icon name="Mail" size={16} />}
                      placeholder="name@example.com"
                      hint={t("Your OTP code will be sent to this email")}
                    />
                    <Input label={`${t("Company")} *`} value={nc.company} onChange={(e) => setNc("company", e.target.value)} leadingIcon={<Icon name="Building2" size={16} />} placeholder="Hassan General Trading" />
                    <Input label={`${t("Location")} *`} value={nc.location} onChange={(e) => setNc("location", e.target.value)} leadingIcon={<Icon name="MapPin" size={16} />} placeholder={t("e.g. Mogadishu, Bakara")} />
                    <Input
                      label={`${t("What do you buy?")} *`}
                      value={nc.cargoCategory}
                      onChange={(e) => setNc("cargoCategory", e.target.value)}
                      leadingIcon={<Icon name="ShoppingBag" size={16} />}
                      placeholder={t("e.g. Electronics, clothes, spare parts")}
                    />
                    {err && <ErrorBox>{err}</ErrorBox>}
                    <Button fullWidth size="l" onClick={sendSignup} disabled={busy}>
                      {t("Create New Account")}
                    </Button>
                  </>
                )}
              </div>
            )}

            {step === "otp" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{ font: "700 17px var(--font-display)", color: "var(--text-strong)" }}>{t("Enter verification code")}</div>
                <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
                  {t("If the details match our records, we sent a 6-digit code to")} <b style={{ color: "var(--text-strong)" }}>{email}</b>
                </div>
                <OtpBoxes value={otp} onChange={setOtp} label={t("Enter verification code")} />
                {err && <ErrorBox>{err}</ErrorBox>}
                <Button fullWidth size="l" disabled={otp.length < 6 || busy} onClick={verify}>
                  {t("Verify")}
                </Button>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                  <button type="button" onClick={backToForm} style={{ background: "none", border: 0, color: "var(--text-link)", textDecoration: "underline", cursor: "pointer", fontSize: 13 }}>
                    {t("Back")}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={mode === "new" ? sendSignup : sendAccess}
                    style={{ background: "none", border: 0, color: "var(--text-link)", textDecoration: "underline", cursor: "pointer", fontSize: 13 }}
                  >
                    {t("Resend code")}
                  </button>
                </div>
              </div>
            )}

            {step === "setpw" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {newRef && (
                  <div role="status" style={{ display: "flex", gap: 10, padding: 12, borderRadius: "var(--radius-m)", background: "var(--status-success-bg)", color: "var(--status-success)" }}>
                    <span style={{ flex: "none", marginTop: 1 }}>
                      <Icon name="CircleCheck" size={18} />
                    </span>
                    <div style={{ fontSize: 13, color: "var(--gray-800)" }}>
                      <b style={{ color: "var(--status-success)" }}>{t("Account created")}</b>
                      <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 6 }}>
                        <Icon name="Bell" size={14} />
                        {t("Your Customer Reference has been sent to your app notifications.")}
                      </div>
                    </div>
                  </div>
                )}
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ width: 40, height: 40, borderRadius: "var(--radius-m)", background: "var(--orange-50)", color: "var(--orange-600)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
                    <Icon name="KeyRound" size={20} />
                  </span>
                  <div>
                    <div style={{ font: "700 17px var(--font-display)", color: "var(--text-strong)" }}>{t(newRef ? "Create your password" : "Set a new password")}</div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("Next time, sign in with your ID, Gmail and password.")}</div>
                  </div>
                </div>
                <Input
                  label={t(staff && !newRef ? "Employee ID" : "Customer Reference")}
                  value={(newRef || ref).trim().toUpperCase()}
                  disabled
                  inputStyle={{ fontFamily: "var(--font-mono)" }}
                />
                <Input
                  label={t("Password")}
                  type="password"
                  autoComplete="new-password"
                  value={pw}
                  onChange={(e) => setPw(e.target.value)}
                  leadingIcon={<Icon name="Lock" size={16} />}
                  hint={t("At least 10 characters, with letters and numbers")}
                />
                <Input
                  label={t("Confirm Password")}
                  type="password"
                  autoComplete="new-password"
                  value={pw2}
                  onChange={(e) => setPw2(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && savePw()}
                  leadingIcon={<Icon name="Lock" size={16} />}
                />
                {err && <ErrorBox>{err}</ErrorBox>}
                <Button fullWidth size="l" onClick={savePw} disabled={busy}>
                  {t("Save password & continue")}
                </Button>
              </div>
            )}
          </Card>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, margin: "20px 0 16px" }}>
            {feats.map(([i, l]) => (
              <div key={l} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, textAlign: "center", font: "600 12px/1.3 var(--font-body)", color: "var(--text-strong)" }}>
                <span style={{ width: 42, height: 42, borderRadius: "var(--radius-m)", background: "var(--orange-50)", color: "var(--orange-600)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon name={i} size={20} />
                </span>
                {t(l)}
              </div>
            ))}
          </div>
          <div style={{ padding: "8px 0 16px" }}>
            <DeveloperCredit />
          </div>
        </div>
      </main>
    </div>
  );
}
