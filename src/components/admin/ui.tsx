"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useT } from "@/i18n/I18nProvider";
import { Icon, IconButton, Toast, type ToastTone } from "@/ui/primitives";

/** White bordered box with an optional title row (design `FinBox`). */
export function FinBox({ title, actions, children, pad = 16 }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; pad?: number }) {
  const t = useT();
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-l)",
        padding: pad,
        display: "flex",
        flexDirection: "column",
        gap: 12,
        minWidth: 0,
      }}
    >
      {(title || actions) && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", padding: pad === 0 ? "14px 14px 0" : 0 }}>
          {title && <div style={{ font: "700 16px var(--font-display)", color: "var(--text-strong)" }}>{typeof title === "string" ? t(title) : title}</div>}
          {actions}
        </div>
      )}
      {children}
    </div>
  );
}

/** Row actions menu (design `InvMenu`): ⋮ button opening a small popover. */
export function RowMenu({ items, dots, label = "Actions" }: { items: [label: string, onClick: () => void][]; dots?: boolean; label?: string }) {
  const t = useT();
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  useEffect(() => {
    if (!pos) return;
    const close = () => setPos(null);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [pos]);
  const toggle = (el: HTMLElement) => {
    if (pos) return setPos(null);
    const r = el.getBoundingClientRect();
    const h = items.length * 46 + 12;
    const up = r.bottom + h > window.innerHeight;
    setPos({ right: Math.max(8, window.innerWidth - r.right), top: up ? Math.max(8, r.top - h - 4) : r.bottom + 4 });
  };
  return (
    <span style={{ display: "inline-flex" }} onClick={(e) => e.stopPropagation()}>
      {dots ? (
        <button
          type="button"
          aria-label={t(label)}
          aria-haspopup="menu"
          onClick={(e) => toggle(e.currentTarget)}
          style={{ width: 32, height: 28, border: 0, background: "transparent", cursor: "pointer", color: "var(--navy-500, #2E5BA8)", display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: 6 }}
        >
          <Icon name="Ellipsis" size={20} />
        </button>
      ) : (
        <IconButton size="s" variant="outline" label={t(label)} icon={<Icon name="EllipsisVertical" size={16} />} onClick={(e) => toggle(e.currentTarget)} />
      )}
      {pos &&
        createPortal(
          <>
            <div onClick={() => setPos(null)} style={{ position: "fixed", inset: 0, zIndex: 900 }} />
            <div role="menu" style={{ position: "fixed", right: pos.right, top: pos.top, zIndex: 901, background: "#ECEDF2", borderRadius: 6, boxShadow: "0 4px 14px rgba(1,27,64,.18)", minWidth: 170, padding: "6px 0" }}>
              {items.map(([l, fn]) => (
                <button
                  key={l}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setPos(null);
                    fn();
                  }}
                  style={{ display: "block", width: "100%", padding: "13px 16px", border: 0, background: "transparent", cursor: "pointer", font: "400 14px var(--font-body)", color: "var(--text-strong)", textAlign: "start", whiteSpace: "nowrap" }}
                >
                  {t(l)}
                </button>
              ))}
            </div>
          </>,
          document.body,
        )}
    </span>
  );
}

type ToastMsg = { tone: ToastTone; title: string; message?: string };
const ToastCtx = createContext<(m: ToastMsg) => void>(() => {});

/** Page-level toast (top-right, auto-dismiss). */
export function ToastHost({ children }: { children: ReactNode }) {
  const t = useT();
  const [msg, setMsg] = useState<ToastMsg | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((m: ToastMsg) => {
    setMsg(m);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(null), 4500);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {msg && (
        <div role="status" aria-live="polite" style={{ position: "fixed", top: 16, insetInlineEnd: 16, zIndex: 1000, maxWidth: "calc(100vw - 32px)" }}>
          <Toast tone={msg.tone} title={t(msg.title)} message={msg.message ? t(msg.message) : undefined} onClose={() => setMsg(null)} />
        </div>
      )}
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);

export const fieldStyle = {
  width: "100%",
  height: 40,
  padding: "0 12px",
  border: "1px solid var(--border-strong)",
  borderRadius: 6,
  font: "400 15px var(--font-body)",
  color: "var(--text-strong)",
  background: "#fff",
  outline: 0,
  boxSizing: "border-box",
} as const;

export const labelStyle = { font: "600 12px var(--font-body)", color: "var(--text-strong)" } as const;

/** Trash icon button used to remove an optional invoice row. */
export function TrashBtn({ onClick, label = "Remove" }: { onClick: () => void; label?: string }) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={t(label)}
      title={t(label)}
      style={{ width: 32, height: 32, border: 0, background: "transparent", cursor: "pointer", color: "var(--red-600)", display: "inline-flex", alignItems: "center", justifyContent: "center", flex: "none" }}
    >
      <Icon name="Trash2" size={17} />
    </button>
  );
}

/** Rounded "+ Add …" pill (design `AddPill`). */
export function AddPill({ label, onClick }: { label: string; onClick: () => void }) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ display: "inline-flex", alignItems: "center", gap: 8, height: 40, padding: "0 18px", border: "1px solid var(--border-strong)", borderRadius: 999, background: "#fff", cursor: "pointer", font: "500 14px var(--font-body)", color: "var(--navy-700)" }}
    >
      <Icon name="Plus" size={15} />
      {t(label)}
    </button>
  );
}

/** Right-hand side panel (design `Drawer`); full width on phones. */
export function Drawer({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode }) {
  const t = useT();
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 800, background: "rgba(1,27,64,.45)" }} />
      <aside
        role="dialog"
        aria-modal="true"
        style={{ position: "fixed", top: 0, bottom: 0, insetInlineEnd: 0, zIndex: 801, width: "min(480px, 100vw)", background: "#fff", boxShadow: "0 0 40px rgba(0,0,0,.25)", display: "flex", flexDirection: "column" }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid var(--border-default)" }}>
          <div style={{ font: "700 18px var(--font-display)", color: "var(--text-strong)" }}>{typeof title === "string" ? t(title) : title}</div>
          <IconButton variant="ghost" label={t("Close")} icon={<Icon name="X" size={18} />} onClick={onClose} />
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>{children}</div>
      </aside>
    </>,
    document.body,
  );
}
