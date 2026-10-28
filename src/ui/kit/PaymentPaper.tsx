"use client";

/* eslint-disable @next/next/no-img-element -- static brand images */
import type { ReactNode } from "react";
import { COMPANY } from "@/config/company";
import { useT } from "@/i18n/I18nProvider";
import { Signature, Stamp } from "./Stamp";

export interface PaymentPaperProps {
  /** "PAYMENT RECEIPT" (money in) or "PAYMENT VOUCHER" (money out). */
  title: string;
  amountLabel: string;
  /** Already formatted, e.g. "$1,500.00". */
  amount: string;
  inWords?: string | null;
  numberLabel: string;
  number: string;
  date: string;
  /** Two-column details: label, value and an optional grey line under it. */
  fields: [label: string, value: ReactNode, sub?: ReactNode][];
  /** Figures box under the details; the last row with `strong` is highlighted. */
  summary?: { label: string; value: ReactNode; strong?: boolean; tone?: "orange" | "navy" }[];
  reversed?: boolean;
  compact?: boolean;
}

/**
 * Payment receipt / voucher paper (owner-approved "Style 1", 2026-10-26):
 * navy header with the amount and its words, number + date, details in two
 * columns, a figures box, then the stamp over the cashier's signature.
 * A reversed paper keeps its data but is struck through and stamped REVERSED.
 */
export function PaymentPaper(p: PaymentPaperProps) {
  const t = useT();
  const pad = p.compact ? 14 : 18;
  const k = { font: "600 10px var(--font-body)", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--text-muted)" } as const;
  return (
    <div
      data-testid="payment-paper"
      style={{
        background: "#fff",
        border: "1px solid var(--border-default)",
        borderRadius: 10,
        overflow: "hidden",
        color: "var(--text-strong)",
        printColorAdjust: "exact",
        WebkitPrintColorAdjust: "exact",
      }}
    >
      <div style={{ background: "var(--navy-700)", color: "#fff", padding: pad }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <img src="/brand/orbit-logo-reversed.png" alt={COMPANY.name} style={{ height: p.compact ? 40 : 52 }} />
          <span
            style={{
              font: "700 10px var(--font-body)",
              letterSpacing: ".18em",
              color: "var(--orange-400, #FF8A3D)",
              border: "1px solid var(--orange-400, #FF8A3D)",
              borderRadius: 4,
              padding: "4px 9px",
              whiteSpace: "nowrap",
            }}
          >
            {t(p.title)}
          </span>
        </div>
        <div style={{ marginTop: p.compact ? 12 : 18, fontSize: 12, color: "var(--navy-300)" }}>{t(p.amountLabel)}</div>
        <div
          style={{
            font: `800 ${p.compact ? 28 : 34}px/1.1 var(--font-display)`,
            textDecoration: p.reversed ? "line-through" : undefined,
            color: p.reversed ? "#F7C1C1" : "#fff",
          }}
        >
          {p.amount}
        </div>
        <div style={{ fontSize: 12, color: p.reversed ? "#F7C1C1" : "var(--navy-300)", marginTop: 3 }}>
          {p.reversed ? t("Reversed · not valid") : p.inWords}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderBottom: "1px solid var(--border-default)" }}>
        <div style={{ padding: `10px ${pad}px`, borderInlineEnd: "1px solid var(--border-default)" }}>
          <div style={k}>{t(p.numberLabel)}</div>
          <div style={{ font: "700 13px var(--font-mono)", marginTop: 2 }}>{p.number}</div>
        </div>
        <div style={{ padding: `10px ${pad}px` }}>
          <div style={k}>{t("Date")}</div>
          <div style={{ fontWeight: 700, fontSize: 13, marginTop: 2 }}>{p.date}</div>
        </div>
      </div>

      <div style={{ padding: `12px ${pad}px`, display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: "12px 16px", opacity: p.reversed ? 0.6 : 1 }}>
        {p.fields.map(([label, value, sub]) => (
          <div key={label} style={{ minWidth: 0 }}>
            <div style={k}>{t(label)}</div>
            <div style={{ fontWeight: 700, fontSize: 13, marginTop: 2, overflowWrap: "anywhere" }}>{value}</div>
            {sub && <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 1, overflowWrap: "anywhere" }}>{sub}</div>}
          </div>
        ))}
      </div>

      {p.reversed ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "4px 0 20px" }}>
          <span
            style={{
              transform: "rotate(-8deg)",
              border: "3px solid var(--red-600)",
              color: "var(--red-600)",
              font: "800 22px var(--font-display)",
              letterSpacing: ".2em",
              padding: "4px 18px",
              borderRadius: 6,
            }}
          >
            {t("REVERSED")}
          </span>
        </div>
      ) : (
        <>
          {!!p.summary?.length && (
            <div style={{ margin: `0 ${pad}px`, border: "1px solid var(--border-default)", borderRadius: 8, overflow: "hidden" }}>
              {p.summary.map((r, i) => (
                <div
                  key={r.label}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    padding: "7px 12px",
                    fontSize: 13,
                    borderTop: i ? "1px solid var(--border-default)" : undefined,
                    background: r.strong ? (r.tone === "orange" ? "#FFF7ED" : "var(--navy-50)") : undefined,
                  }}
                >
                  <span style={{ color: r.strong ? "var(--text-strong)" : "var(--text-muted)", fontWeight: r.strong ? 700 : 400 }}>{t(r.label)}</span>
                  <span style={{ fontWeight: r.strong ? 800 : 600, color: r.strong ? (r.tone === "orange" ? "#C2410C" : "var(--navy-700)") : undefined }}>{r.value}</span>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 14, flexWrap: "wrap", padding: `14px ${pad}px` }}>
            <SignedByOrbit label={t("Authorised signature")} small={p.compact} />
          </div>
        </>
      )}

      <div
        style={{
          borderTop: "1px solid var(--border-default)",
          background: "var(--surface-sunken)",
          padding: `7px ${pad}px`,
          display: "flex",
          justifyContent: "space-between",
          gap: 10,
          flexWrap: "wrap",
          fontSize: 10.5,
          color: "var(--text-muted)",
        }}
      >
        <span>{COMPANY.addressLines.join(", ")}</span>
        <span>{COMPANY.phones.join(" · ")}</span>
      </div>
    </div>
  );
}

/** The stamp pressed over the cashier's signature, above the signature line. */
function SignedByOrbit({ label, small }: { label: string; small?: boolean }) {
  const st = small ? 70 : 82;
  return (
    <span style={{ position: "relative", display: "inline-block", width: st + 70, height: st + 22 }}>
      <span style={{ position: "absolute", left: 0, bottom: 18 }}>
        <Signature width={small ? 100 : 116} />
      </span>
      <span style={{ position: "absolute", left: 56, top: 0 }}>
        <Stamp size={st} />
      </span>
      <span style={{ position: "absolute", left: 0, right: 0, bottom: 0, borderTop: "1px solid var(--text-strong)", paddingTop: 3, fontSize: 10.5, color: "var(--text-muted)" }}>{label}</span>
    </span>
  );
}
