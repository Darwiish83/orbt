"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition, type ComponentProps } from "react";
import { ToastHost } from "@/components/admin/ui";
import { ShipmentCostSheet } from "../accounting/ShipmentCostSheet";

export function ShipmentCostView(props: Omit<ComponentProps<typeof ShipmentCostSheet>, "go">) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [nav, startNav] = useTransition();
  const go = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") p.delete(k);
      else p.set(k, v);
    }
    startNav(() => router.push(`${pathname}?${p.toString()}`, { scroll: false }));
  };
  return (
    <ToastHost>
      <div style={{ opacity: nav ? 0.7 : 1 }}>
        <ShipmentCostSheet {...props} go={go} />
      </div>
    </ToastHost>
  );
}
