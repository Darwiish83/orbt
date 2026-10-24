"use client";

import { useEffect } from "react";
import { useT } from "@/i18n/I18nProvider";
import { Button, Icon } from "@/ui/primitives";

/** "Download PDF" opens this page; its button opens the browser's print dialog
 * (Save as PDF). The page title becomes the suggested file name. */
export function PrintBar({ title }: { title: string }) {
  const t = useT();
  useEffect(() => {
    document.title = title;
  }, [title]);
  return (
    <div className="no-print" style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginBottom: 16 }}>
      <Button variant="ghost" onClick={() => window.close()}>
        {t("Close")}
      </Button>
      <Button leadingIcon={<Icon name="FileDown" size={16} />} onClick={() => window.print()}>
        {t("Download PDF")}
      </Button>
    </div>
  );
}
