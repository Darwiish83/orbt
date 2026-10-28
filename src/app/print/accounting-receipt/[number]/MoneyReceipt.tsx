"use client";

import { useT } from "@/i18n/I18nProvider";
import type { listReceipts } from "@/modules/accounting/service";
import { amountInWords } from "@/modules/finance/words";
import { PaymentPaper } from "@/ui/kit";
import { fdate, money } from "@/ui/format";

type R = Awaited<ReturnType<typeof listReceipts>>[number];

/** Receipt paper for an Accounting movement: a voucher for money out, a receipt for money in (Style 1). */
export function MoneyReceipt({ r, scope }: { r: R; scope: { country: string; year: number } }) {
  const t = useT();
  const out = r.direction === "OUT";
  const words = (() => {
    try {
      return amountInWords(r.amount);
    } catch {
      return null;
    }
  })();
  return (
    <PaymentPaper
      title={out ? "PAYMENT VOUCHER" : "PAYMENT RECEIPT"}
      amountLabel={out ? "Amount paid" : "Amount received"}
      amount={money(r.amount)}
      inWords={words}
      numberLabel={out ? "Voucher No." : "Receipt No."}
      number={r.number}
      date={fdate(r.date)}
      reversed={r.reversed}
      fields={[
        [out ? "Paid to" : "Received from", r.party, out ? r.via : null],
        [out ? "Paid from" : "Paid into", r.bank ? t(r.bank) : "—"],
        [out ? "Payment for" : "Type", t(r.kindLabel)],
        ["Country · year", `${t(scope.country)} · ${scope.year}`],
      ]}
      summary={[
        ...(r.note ? [{ label: "Note", value: r.note }] : []),
        { label: out ? "Total paid" : "Total received", value: money(r.amount), strong: true, tone: "navy" as const },
      ]}
    />
  );
}
