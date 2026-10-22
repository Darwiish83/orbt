"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { useT } from "@/i18n/I18nProvider";

export interface DataColumn<R> {
  key: string;
  label: string;
  align?: "left" | "right" | "center";
  mono?: boolean;
  strong?: boolean;
  /** Client-side cell renderer. Server components pass pre-rendered cells in the row instead. */
  render?: (row: R) => ReactNode;
}

export interface DataTableProps<R> {
  cols: DataColumn<R>[];
  rows: R[];
  /** Stable key per row (defaults to the index). */
  rowKey?: (row: R, index: number) => string;
  /** Client click handler. */
  onRow?: (row: R) => void;
  /** Name of a row field holding a URL; clicking (or Enter on) the row navigates there. Server-friendly. */
  hrefKey?: keyof R & string;
  empty?: string;
  dense?: boolean;
  /** Shrink to content width instead of filling the container. */
  fit?: boolean;
}

/** Only same-origin app paths are navigable (no protocol-relative or absolute URLs). */
function isLocalPath(v: unknown): v is string {
  return typeof v === "string" && v.startsWith("/") && !v.startsWith("//");
}

/** Bordered data table with uppercase header and hover rows. */
export function DataTable<R extends Record<string, unknown>>({
  cols,
  rows,
  rowKey,
  onRow,
  hrefKey,
  empty = "No records found",
  dense,
  fit,
}: DataTableProps<R>) {
  const t = useT();
  const router = useRouter();
  const [hover, setHover] = useState<number | null>(null);

  const activate = (r: R) => {
    if (onRow) onRow(r);
    else if (hrefKey && isLocalPath(r[hrefKey])) router.push(r[hrefKey]);
  };
  const clickable = !!onRow || !!hrefKey;

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: fit ? "auto" : "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr>
            {cols.map((c) => (
              <th
                key={c.key}
                scope="col"
                style={{
                  textAlign: c.align ?? "start",
                  padding: dense ? "8px 12px" : "10px 14px",
                  font: "700 11px var(--font-body)",
                  letterSpacing: ".06em",
                  textTransform: "uppercase",
                  color: "var(--text-muted)",
                  background: "var(--surface-sunken)",
                  borderBottom: "1px solid var(--border-default)",
                  whiteSpace: "nowrap",
                }}
              >
                {t(c.label)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((r, i) => (
              <tr
                key={rowKey ? rowKey(r, i) : i}
                onClick={clickable ? () => activate(r) : undefined}
                onKeyDown={clickable ? (e) => e.key === "Enter" && activate(r) : undefined}
                tabIndex={clickable ? 0 : undefined}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                style={{
                  cursor: clickable ? "pointer" : "default",
                  borderBottom: "1px solid var(--border-default)",
                  background: hover === i ? "var(--gray-50)" : undefined,
                }}
              >
                {cols.map((c) => (
                  <td
                    key={c.key}
                    style={{
                      padding: dense ? "9px 12px" : "12px 14px",
                      textAlign: c.align ?? "start",
                      color: "var(--text-body)",
                      whiteSpace: "nowrap",
                      fontFamily: c.mono ? "var(--font-mono)" : undefined,
                      fontWeight: c.strong ? 600 : 400,
                    }}
                  >
                    {c.render ? c.render(r) : (r[c.key] as ReactNode)}
                  </td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={cols.length} style={{ padding: 32, textAlign: "center", color: "var(--text-muted)" }}>
                {t(empty)}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
