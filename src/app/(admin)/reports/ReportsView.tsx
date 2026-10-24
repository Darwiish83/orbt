"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { useT } from "@/i18n/I18nProvider";
import { Button, Icon } from "@/ui/primitives";
import { ReportBody, REPORT_SECTIONS, type ReportData } from "./ReportBody";

export function ReportsView({ report }: { report: ReportData }) {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const [nav, start] = useTransition();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, opacity: nav ? 0.7 : 1 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0, font: "700 26px/1.2 var(--font-display)", color: "var(--text-strong)" }}>{t("Reports")}</h1>
          <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>{t("Report selection")}</div>
        </div>
        <Button variant="outline" leadingIcon={<Icon name="FileDown" size={16} />} onClick={() => window.open(`/print/report?section=${report.section}`, "_blank", "noopener")}>
          {t("Download PDF")}
        </Button>
      </div>
      <div role="tablist" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {REPORT_SECTIONS.map(([k, l]) => {
          const on = report.section === k;
          return (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => start(() => router.push(`${pathname}?section=${k}`, { scroll: false }))}
              style={{ height: 40, padding: "0 16px", borderRadius: "var(--radius-s)", border: "1px solid " + (on ? "var(--navy-700)" : "var(--border-default)"), background: on ? "var(--navy-700)" : "#fff", color: on ? "#fff" : "var(--text-strong)", font: "600 14px var(--font-body)", cursor: "pointer" }}
            >
              {t(l)}
            </button>
          );
        })}
      </div>
      <ReportBody r={report} />
    </div>
  );
}
