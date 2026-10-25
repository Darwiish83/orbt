"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { useT } from "@/i18n/I18nProvider";
import { DateField, Flag, Stat } from "@/ui/kit";
import { Button, Dialog, Icon, IconButton, Input } from "@/ui/primitives";
import type { monthReport, ReportRow } from "@/modules/transfer/money";
import { ToastHost, useToast } from "@/components/admin/ui";
import { createReceiptAction, deleteAction, handedAction, newMonthAction, saveReceiveAction, saveSendAction, voidReceiptAction, type ReceiveValues, type SendValues, type TransferReceiptValues } from "./actions";

type Report = Awaited<ReturnType<typeof monthReport>>;
type Data = { report: Report; country: string; year: number; kind: "CUSTOMER" | "OPERATION" } | null;

const TAGS: [NonNullable<ReportRow["tag"]>, string, string][] = [
  ["CLOTHES", "#FF2BF0", "Clothes"],
  ["MEDICINE", "#FFFFFF", "Medicine"],
  ["OTHER", "#C9D9F5", "Other"],
];
const MN = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const f2 = (x: string | number) => (Number(x) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const d = (s: string) => `${s.slice(8, 10)}.${s.slice(5, 7)}.${s.slice(0, 4)}`;
const today = () => new Date().toISOString().slice(0, 10);

export function MoneyTransferView({ data }: { data: Data }) {
  return <ToastHost>{data ? <Inner data={data} /> : <Denied />}</ToastHost>;
}

function Denied() {
  const t = useT();
  return (
    <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>
      ⛔ {t("No access")} · {t("Money Transfer needs the Receiver or Sender role. Ask an administrator.")}
    </div>
  );
}

function Inner({ data }: { data: NonNullable<Data> }) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [nav, startNav] = useTransition();
  const [busy, start] = useTransition();
  const { report: R, country, year, kind } = data;
  const A = R.access;
  const [form, setForm] = useState<(ReceiveValues & { id?: string }) | null>(null);
  const [send, setSend] = useState<(SendValues & { id: string; feePct: string; fee: string }) | null>(null);
  const [del, setDel] = useState<{ row: ReportRow; part: "receive" | "send" } | null>(null);
  const [rcpt, setRcpt] = useState<ReportRow | null>(null);
  const [voidR, setVoidR] = useState<ReportRow | null>(null);
  const openReceipt = (id: string) => window.open(`/print/transfer-receipt/${id}`, "_blank", "noopener");
  const go = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") p.delete(k);
      else p.set(k, v);
    }
    startNav(() => router.push(`${pathname}?${p.toString()}`, { scroll: false }));
  };
  const act = (p: Promise<{ ok: boolean; error?: string }>, ok: string, msg?: string, then?: () => void) =>
    start(async () => {
      const r = await p;
      if (!r.ok) toast({ tone: "danger", title: r.error ?? "Error" });
      else {
        toast({ tone: "success", title: ok, message: msg });
        then?.();
      }
      router.refresh();
    });
  const th = { padding: "6px 8px", font: "700 12px var(--font-body)", color: "#111", border: "1px solid #9AA3AF", background: "#fff", textAlign: "center" as const, whiteSpace: "nowrap" as const };
  const td = { padding: "3px 8px", fontSize: 12, border: "1px solid #C4CAD3", whiteSpace: "nowrap" as const, color: "#111" };
  const mk = (m: number) => `${year}-${String(m).padStart(2, "0")}`;
  const roleLabel = A.role === "SUPER" ? "Super Admin" : A.role === "RECEIVER" ? "Receiver" : "Sender";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, opacity: nav || busy ? 0.75 : 1 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0, font: "700 26px/1.2 var(--font-display)", color: "var(--text-strong)" }}>{t("Money Transfer")}</h1>
          <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>{t("Money status report")}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 36, padding: "0 10px", borderRadius: 6, border: "1px solid var(--border-strong)", background: "#fff", font: "700 13px var(--font-body)", color: "var(--navy-700)" }}>
            <Icon name={A.role === "SUPER" ? "ShieldCheck" : A.role === "SENDER" ? "Send" : "HandCoins"} size={14} />
            {t(roleLabel)}
          </span>
          {A.countries.length > 1 && (
            <label style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 36, padding: "0 6px 0 10px", borderRadius: 6, border: "1px solid var(--border-strong)", background: "#fff" }}>
              <Flag country={country} size={12} />
              <select aria-label={t("Country")} value={country} onChange={(e) => go({ country: e.target.value, month: null })} style={{ border: 0, background: "transparent", font: "700 13px var(--font-body)", color: "var(--navy-700)", outline: 0 }}>
                {A.countries.map((c) => (
                  <option key={c} value={c}>
                    {t(c)}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {(
          [
            ["CUSTOMER", "Customer transfer", "ArrowLeftRight"],
            ["OPERATION", "Operation cost", "Wallet"],
          ] as const
        ).map(([k, l, ic]) => {
          const on = kind === k;
          return (
            <button key={k} type="button" aria-pressed={on} onClick={() => go({ kind: k === "CUSTOMER" ? null : k, month: null })} style={{ display: "inline-flex", alignItems: "center", gap: 8, height: 40, padding: "0 16px", borderRadius: "var(--radius-s)", border: "1.5px solid " + (on ? "var(--navy-700)" : "var(--border-default)"), background: on ? "var(--navy-700)" : "#fff", color: on ? "#fff" : "var(--text-strong)", font: "600 14px var(--font-body)", cursor: "pointer" }}>
              <Icon name={ic} size={16} />
              {t(l)}
              {k === "OPERATION" ? ` · ${t(country)}` : ""}
            </button>
          );
        })}
      </div>
      {kind === "OPERATION" && <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("Record only. Not added to Income, Balance or Shipment cost.")}</div>}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10, flex: "1 1 480px" }}>
          <Stat compact tone="green" label="Money Receive" value={f2(R.totals.received)} />
          <Stat compact tone="red" label="Money Transfer" value={f2(R.totals.sent)} />
          <Stat compact label="Not sent yet" value={f2(R.totals.notSent)} />
        </div>
        {A.canReceive && (
          <Button
            leadingIcon={<Icon name="Plus" size={16} />}
            data-testid="add-receive"
            onClick={() => setForm({ country, kind, receivedAt: mk(R.month) === today().slice(0, 7) ? today() : `${mk(R.month)}-01`, amount: "", feePct: "", currency: "USD", description: "", tag: "OTHER" })}
          >
            {t("Add Money Receive")}
          </Button>
        )}
      </div>
      <div style={{ background: "#fff", border: "1px solid #9AA3AF", overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 900, display: "table", whiteSpace: "normal" }}>
          <thead>
            <tr>
              <th colSpan={13} style={{ ...th, background: "#BDD7EE", fontSize: 14, padding: 8 }}>
                {t("MONEY STATUS REPORT")} ({MN[R.month - 1]} {year})
              </th>
            </tr>
            <tr>
              <th colSpan={6} style={{ ...th, background: "#8BD14F", fontSize: 13 }}>
                {t("MONEY RECEIVE")}
              </th>
              <th colSpan={7} style={{ ...th, background: "#FF1E1E", color: "#fff", fontSize: 13 }}>
                {t("MONEY TRANSFER")}
              </th>
            </tr>
            <tr>
              {["DATE", "AMOUNT", "TRANSFER FEE", "TOTAL AMOUNT", "CURRENCY", "DESCRIPTION", "DATE", "AMOUNT", "TRANSFER FEE", "TOTAL AMOUNT", "CURRENCY", "STATUS", ""].map((h, i) => (
                <th key={i} style={th}>
                  {h && t(h)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {R.rows.map((r) => {
              const rb = r.handed ? "#E2F0D9" : "#FFF4E8"; // green = handed to Sender, orange = not yet
              const tagBg = TAGS.find((x) => x[0] === r.tag)?.[1] ?? "#C9D9F5";
              const s = r.sent;
              return (
                <tr key={r.id} data-testid={`tr-${r.description}`}>
                  <td style={{ ...td, background: rb }}>{d(r.receivedAt)}</td>
                  <td style={{ ...td, background: rb, textAlign: "end", fontWeight: 600 }}>{f2(r.net)}</td>
                  <td style={{ ...td, background: rb, textAlign: "end", color: "#B91C1C" }}>{Number(r.feePct) ? `${r.feePct}% · ${f2(r.fee)}` : "-"}</td>
                  <td style={{ ...td, background: rb, textAlign: "end", fontWeight: 700 }}>{f2(r.amount)}</td>
                  <td style={{ ...td, background: rb, textAlign: "center" }}>{r.currency}</td>
                  <td
                    onClick={() => A.canReceive && !s && setForm({ id: r.id, country, kind, receivedAt: r.receivedAt, amount: r.amount, feePct: r.feePct, currency: r.currency, description: r.description, tag: r.tag })}
                    style={{ ...td, background: kind === "CUSTOMER" ? tagBg : "#C9D9F5", textAlign: "center", cursor: A.canReceive && !s ? "pointer" : "default", minWidth: 220, fontWeight: 600 }}
                  >
                    {r.description}
                  </td>
                  {s ? (
                    <>
                      <td style={td}>{d(s.sentAt)}</td>
                      <td style={{ ...td, textAlign: "end", fontWeight: 600 }}>{f2(s.delivered)}</td>
                      <td style={{ ...td, textAlign: "end", color: "#B91C1C" }}>{Number(s.fee) ? `−${f2(s.fee)}` : "-"}</td>
                      <td style={{ ...td, textAlign: "end", fontWeight: 700 }}>{f2(s.amount)}</td>
                      <td style={{ ...td, textAlign: "center" }}>{s.currency}</td>
                      <td style={{ ...td, textAlign: "center", fontWeight: 600, color: s.status === "PAID" ? "#111" : "#C2410C" }}>{t(s.status)}</td>
                    </>
                  ) : (
                    <td colSpan={6} style={{ ...td, textAlign: "center" }}>
                      {A.canSend && r.handed ? (
                        <button type="button" onClick={() => setSend({ id: r.id, sentAt: today(), amount: r.amount, currency: r.currency, status: "PAID", feePct: r.feePct, fee: r.fee })} style={{ border: 0, background: "transparent", color: "#C2410C", font: "600 12px var(--font-body)", cursor: "pointer" }} data-testid={`add-send-${r.description}`}>
                          + {t("Add transfer")}
                        </button>
                      ) : (
                        <span style={{ fontSize: 12, color: "#C2410C" }}>{t(r.handed ? "Waiting for transfer" : "Not handed to sender yet")}</span>
                      )}
                    </td>
                  )}
                  <td style={{ ...td, textAlign: "center", width: 80 }}>
                    <span style={{ display: "inline-flex", gap: 2 }}>
                      {kind === "CUSTOMER" &&
                        (r.receipt ? (
                          <>
                            <IconButton size="s" variant="ghost" label={`${t("Receipt")} No. ${r.receipt.number}`} icon={<Icon name="ReceiptText" size={13} color="var(--navy-700)" />} onClick={() => openReceipt(r.receipt!.id)} data-testid={`receipt-${r.description}`} />
                            {A.canReceive && <IconButton size="s" variant="ghost" label={t("Void receipt")} icon={<Icon name="FileX2" size={13} color="#B91C1C" />} onClick={() => setVoidR(r)} />}
                          </>
                        ) : (
                          A.canReceive && <IconButton size="s" variant="ghost" label={t("Create receipt")} icon={<Icon name="FilePlus2" size={13} color="var(--orange-600)" />} onClick={() => setRcpt(r)} data-testid={`create-receipt-${r.description}`} />
                        ))}
                      {A.canReceive && !s && (
                        <IconButton size="s" variant="ghost" label={t(r.handed ? "Undo handed to sender" : "Mark as handed to sender")} icon={<Icon name={r.handed ? "Undo2" : "HandCoins"} size={13} color={r.handed ? undefined : "#C2410C"} />} onClick={() => act(handedAction(r.id, !r.handed), r.handed ? "Undo handed to sender" : "Handed to sender", r.description)} />
                      )}
                      {s && A.canSend && <IconButton size="s" variant="ghost" label={t("Edit")} icon={<Icon name="Pencil" size={13} />} onClick={() => setSend({ id: r.id, sentAt: s.sentAt, amount: s.amount, currency: s.currency, status: s.status, feePct: r.feePct, fee: r.fee })} />}
                      {A.canReceive && !s && <IconButton size="s" variant="ghost" label={t("Delete Money Receive")} icon={<Icon name="Trash2" size={13} color="#15803D" />} onClick={() => setDel({ row: r, part: "receive" })} />}
                      {s && A.canSend && <IconButton size="s" variant="ghost" label={t("Delete Money Transfer")} icon={<Icon name="Trash2" size={13} color="#B91C1C" />} onClick={() => setDel({ row: r, part: "send" })} />}
                    </span>
                  </td>
                </tr>
              );
            })}
            {!R.rows.length && (
              <tr>
                <td colSpan={13} style={{ ...td, textAlign: "center", padding: 24, color: "var(--text-muted)" }}>
                  {t("No records found")}
                </td>
              </tr>
            )}
            {R.rows.length > 0 && (
              <tr>
                <td style={{ ...td, fontWeight: 700 }}>{t("Total")}</td>
                <td style={{ ...td, textAlign: "end", fontWeight: 700 }}>{f2(R.totals.received)}</td>
                <td style={{ ...td, textAlign: "end", fontWeight: 700, color: "#B91C1C" }}>{f2(R.totals.fees)}</td>
                <td style={{ ...td, textAlign: "end", fontWeight: 700 }}>{f2(Number(R.totals.received) + Number(R.totals.fees))}</td>
                <td colSpan={3} style={td} />
                <td style={{ ...td, textAlign: "end", fontWeight: 700 }}>{f2(R.totals.sent)}</td>
                <td colSpan={5} style={td} />
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div style={{ display: "flex", alignItems: "center", borderTop: "1px solid var(--border-default)", overflowX: "auto" }}>
        {A.canReceive && (
          <button type="button" onClick={() => act(newMonthAction(country), "New month started", undefined, () => go({ month: null }))} disabled={R.months[0]!.month >= 12 || busy} style={{ display: "inline-flex", alignItems: "center", gap: 6, flex: "none", height: 32, marginInlineEnd: 10, padding: "0 12px", borderRadius: 6, border: "1.5px dashed var(--navy-700)", background: "#fff", color: "var(--navy-700)", font: "600 12px var(--font-body)", cursor: "pointer", whiteSpace: "nowrap", opacity: R.months[0]!.month >= 12 ? 0.4 : 1 }}>
            <Icon name="Plus" size={14} />
            {t("Start new month")}
            {R.months[0]!.month < 12 ? ` (${String(R.months[0]!.month + 1).padStart(2, "0")}.${year})` : ""}
          </button>
        )}
        {R.months.map((m) => {
          const on = m.month === R.month;
          return (
            <button key={m.month} type="button" onClick={() => go({ month: String(m.month) })} style={{ padding: "8px 16px", border: 0, borderBottom: "3px solid " + (on ? "var(--navy-700)" : "transparent"), background: on ? "#E8EEF8" : "transparent", cursor: "pointer", font: `${on ? 700 : 500} 13px var(--font-body)`, color: on ? "var(--navy-700)" : "var(--text-muted)", whiteSpace: "nowrap" }}>
              {String(m.month).padStart(2, "0")}.{year}
              {m.count > 0 && <span style={{ marginInlineStart: 6, fontSize: 11, opacity: 0.7 }}>{m.count}</span>}
            </button>
          );
        })}
      </div>

      {form && (
        <ReceiveDialog
          v={form}
          customer={kind === "CUSTOMER"}
          onClose={() => setForm(null)}
          onSave={(v) => act(saveReceiveAction(form.id ?? null, v), "Saved", v.description.toUpperCase(), () => setForm(null))}
        />
      )}
      {rcpt && (
        <ReceiptDialog
          row={rcpt}
          onClose={() => setRcpt(null)}
          onSave={(v) =>
            start(async () => {
              const res = await createReceiptAction(rcpt.id, v);
              if (!res.ok) return toast({ tone: "danger", title: res.error });
              toast({ tone: "success", title: "Receipt created", message: `No. ${res.data!.number}` });
              setRcpt(null);
              router.refresh();
              openReceipt(res.data!.id);
            })
          }
        />
      )}
      {voidR?.receipt && (
        <Dialog
          open
          title={t("Void receipt")}
          onClose={() => setVoidR(null)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setVoidR(null)}>
                {t("Cancel")}
              </Button>
              <Button onClick={() => act(voidReceiptAction(voidR.receipt!.id), "Receipt voided", `No. ${voidR.receipt!.number}`, () => setVoidR(null))}>{t("Void receipt")}</Button>
            </>
          }
        >
          <div style={{ fontSize: 14 }}>
            <b>
              {t("Receipt")} No. {voidR.receipt.number}
            </b>{" "}
            · {voidR.description}
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8 }}>{t("The receipt is kept as void. You can then create a new one for this transfer.")}</div>
          </div>
        </Dialog>
      )}
      {send && <SendDialog v={send} onClose={() => setSend(null)} onSave={(v) => act(saveSendAction(send.id, v), "Transfer saved", `${f2(v.amount)} ${v.currency}`, () => setSend(null))} />}
      {del && (
        <Dialog
          open
          title={t(del.part === "send" ? "Delete Money Transfer" : "Delete Money Receive")}
          onClose={() => setDel(null)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setDel(null)}>
                {t("Cancel")}
              </Button>
              <Button onClick={() => act(deleteAction(del.row.id, del.part), "Deleted", del.row.description, () => setDel(null))}>{t("Delete")}</Button>
            </>
          }
        >
          <div style={{ fontSize: 14 }}>
            <b>{del.row.description}</b> · {f2(del.part === "send" ? del.row.sent!.amount : del.row.amount)} {del.row.currency}
            {del.part === "send" && <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8 }}>{t("Only the transfer side is deleted. Money Receive stays.")}</div>}
          </div>
        </Dialog>
      )}
    </div>
  );
}

function ReceiveDialog({ v: v0, customer, onClose, onSave }: { v: ReceiveValues & { id?: string }; customer: boolean; onClose: () => void; onSave: (v: ReceiveValues) => void }) {
  const t = useT();
  const [v, setV] = useState(v0);
  const amount = Number(v.amount) || 0;
  const fee = Math.round(amount * (Number(v.feePct) || 0)) / 100;
  const sel = { height: 40, padding: "0 10px", border: "1px solid var(--border-strong)", borderRadius: 6, background: "#fff" } as const;
  return (
    <Dialog
      open
      width={480}
      title={t(v0.id ? "Edit" : "Add Money Receive")}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("Cancel")}
          </Button>
          <Button onClick={() => onSave(v)} data-testid="save-receive">
            {t("Save")}
          </Button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <DateField label="Date" value={v.receivedAt} onChange={(x) => setV((o) => ({ ...o, receivedAt: x }))} />
          <Input label={`${t("Amount")} *`} type="number" min="0" step="0.01" value={v.amount} onChange={(e) => setV((o) => ({ ...o, amount: e.target.value }))} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Input label={`${t("Transfer fee")} (%)`} type="number" min="0" step="0.01" value={v.feePct ?? ""} onChange={(e) => setV((o) => ({ ...o, feePct: e.target.value }))} placeholder="0.5" />
          <label style={{ display: "flex", flexDirection: "column", gap: 6, font: "600 13px var(--font-body)" }}>
            {t("Currency")}
            <select value={v.currency} onChange={(e) => setV((o) => ({ ...o, currency: e.target.value }))} style={sel}>
              {["USD", "EUR", "TRY"].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
        </div>
        {amount > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, padding: 12, borderRadius: 8, background: "var(--surface-sunken)", fontSize: 12 }}>
            <div>
              <div style={{ color: "var(--text-muted)" }}>{t("Received")}</div>
              <b>{f2(amount)}</b>
            </div>
            <div>
              <div style={{ color: "var(--text-muted)" }}>
                {t("Transfer fee")} ({Number(v.feePct) || 0}%)
              </div>
              <b style={{ color: "#B91C1C" }}>−{f2(fee)}</b>
            </div>
            <div>
              <div style={{ color: "var(--text-muted)" }}>{t("Amount to send")}</div>
              <b style={{ color: "var(--green-600)" }}>{f2(amount - fee)}</b>
            </div>
          </div>
        )}
        <Input label={`${t("Name")} *`} value={v.description} onChange={(e) => setV((o) => ({ ...o, description: e.target.value }))} placeholder="PARTNERS TO SINA" />
        {customer && (
          <div>
            <div style={{ font: "600 13px var(--font-body)", marginBottom: 6 }}>{t("Type")}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
              {TAGS.map(([k, c, l]) => {
                const on = (v.tag ?? "OTHER") === k;
                return (
                  <button key={k} type="button" onClick={() => setV((o) => ({ ...o, tag: k }))} style={{ display: "flex", alignItems: "center", gap: 8, height: 38, padding: "0 10px", borderRadius: 8, cursor: "pointer", border: "1.5px solid " + (on ? "var(--navy-700)" : "var(--border-default)"), background: on ? "var(--surface-brand-tint)" : "#fff", font: "600 12px var(--font-body)" }}>
                    <span style={{ width: 16, height: 16, flex: "none", borderRadius: 3, background: c, border: "1px solid #9AA3AF" }} />
                    {t(l)}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}

function SendDialog({ v: v0, onClose, onSave }: { v: SendValues & { feePct: string; fee: string }; onClose: () => void; onSave: (v: SendValues) => void }) {
  const t = useT();
  const [v, setV] = useState(v0);
  const sel = { height: 40, padding: "0 10px", border: "1px solid var(--border-strong)", borderRadius: 6, background: "#fff" } as const;
  const amount = Number(v.amount) || 0;
  return (
    <Dialog
      open
      width={460}
      title={t("Money Transfer")}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("Cancel")}
          </Button>
          <Button onClick={() => onSave({ sentAt: v.sentAt, amount: v.amount, currency: v.currency, status: v.status })} data-testid="save-send">
            {t("Save")}
          </Button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <DateField label="Date" value={v.sentAt} onChange={(x) => setV((o) => ({ ...o, sentAt: x }))} />
          <Input label={t("Taken from customer")} type="number" min="0" step="0.01" value={v.amount} onChange={(e) => setV((o) => ({ ...o, amount: e.target.value }))} />
        </div>
        {amount > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, padding: 12, borderRadius: 8, background: "var(--surface-sunken)", fontSize: 12 }}>
            <div>
              <div style={{ color: "var(--text-muted)" }}>{t("Taken from customer")}</div>
              <b>{f2(amount)}</b>
            </div>
            <div>
              <div style={{ color: "var(--text-muted)" }}>
                {t("Transfer fee")} ({Number(v.feePct) || 0}% · {t("from Receive")})
              </div>
              <b style={{ color: "#B91C1C" }}>−{f2(v.fee)}</b>
            </div>
            <div>
              <div style={{ color: "var(--text-muted)" }}>{t("Delivered to owner")}</div>
              <b style={{ color: "var(--green-600)" }}>{f2(amount - Number(v.fee))}</b>
            </div>
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6, font: "600 13px var(--font-body)" }}>
            {t("Currency")}
            <select value={v.currency} onChange={(e) => setV((o) => ({ ...o, currency: e.target.value }))} style={sel}>
              {["USD", "EUR", "TRY"].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6, font: "600 13px var(--font-body)" }}>
            {t("Status")}
            <select value={v.status} onChange={(e) => setV((o) => ({ ...o, status: e.target.value as "PAID" | "PENDING" }))} style={sel}>
              <option value="PAID">{t("PAID")}</option>
              <option value="PENDING">{t("PENDING")}</option>
            </select>
          </label>
        </div>
      </div>
    </Dialog>
  );
}

/** "Create receipt": filled from the row; the customer name on top, where the money goes below. */
function ReceiptDialog({ row, onClose, onSave }: { row: ReportRow; onClose: () => void; onSave: (v: TransferReceiptValues) => void }) {
  const t = useT();
  const at = row.description.search(/\sTO\s/);
  const [v, setV] = useState<TransferReceiptValues>({
    receivedFrom: at > 0 ? row.description.slice(0, at).trim() : row.description,
    reference: "",
    amount: row.net,
    fee: Number(row.fee) ? row.fee : "",
    description: at > 0 ? row.description.slice(at).trim() : "",
  });
  const set = (k: keyof TransferReceiptValues, x: string) => setV((o) => ({ ...o, [k]: x }));
  const amount = Number(v.amount) || 0;
  const fee = Number(v.fee) || 0;
  return (
    <Dialog
      open
      width={500}
      title={t("Create receipt")}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("Cancel")}
          </Button>
          <Button onClick={() => onSave(v)} data-testid="save-receipt">
            {t("Create receipt")}
          </Button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
          {d(row.receivedAt)} · {row.currency} · {t("Numbered from 5000 each year.")}
        </div>
        <Input label={`${t("Received From")} *`} value={v.receivedFrom} onChange={(e) => set("receivedFrom", e.target.value)} placeholder="GALAD" />
        <Input label={t("Customer Reference")} value={v.reference ?? ""} onChange={(e) => set("reference", e.target.value)} placeholder="OR-3000" hint={t("Optional. With the reference, the customer sees the receipt in their Documents.")} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Input label={`${t("Amount to send")} *`} inputMode="decimal" value={v.amount} onChange={(e) => set("amount", e.target.value.replace(/[^\d.]/g, ""))} />
          <Input label={`${t("Transfer fee")} (${t("optional")})`} inputMode="decimal" value={v.fee ?? ""} onChange={(e) => set("fee", e.target.value.replace(/[^\d.]/g, ""))} placeholder="0.00" />
        </div>
        {amount > 0 && (
          <div style={{ padding: 10, borderRadius: 8, background: "var(--surface-sunken)", fontSize: 12 }}>
            {fee > 0 ? (
              <>
                {t("Amount of")}: <b>{f2(amount)}</b> · {t("Transfer fee")}: <b>{f2(fee)}</b> · {t("Total amount")}: <b style={{ color: "var(--navy-700)" }}>{f2(amount + fee)}</b>
              </>
            ) : (
              <>
                {t("Amount of")}: <b>{f2(amount)}</b> · {t("No fee shown on the receipt")}
              </>
            )}
          </div>
        )}
        <Input label={`${t("Description")} *`} value={v.description} onChange={(e) => set("description", e.target.value)} placeholder="TO SINA" />
      </div>
    </Dialog>
  );
}
