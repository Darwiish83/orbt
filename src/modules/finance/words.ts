/**
 * An amount in words for receipts ("In Word"), e.g. 1250.5 USD →
 * "One thousand two hundred fifty US dollars and fifty cents only".
 */
const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const SCALES: [number, string][] = [
  [1_000_000_000, "billion"],
  [1_000_000, "million"],
  [1_000, "thousand"],
];

function under1000(n: number): string {
  const out: string[] = [];
  if (n >= 100) {
    out.push(`${ONES[Math.floor(n / 100)]} hundred`);
    n %= 100;
  }
  if (n >= 20) {
    out.push(n % 10 ? `${TENS[Math.floor(n / 10)]}-${ONES[n % 10]}` : TENS[Math.floor(n / 10)]!);
  } else if (n > 0) {
    out.push(ONES[n]!);
  }
  return out.join(" ");
}

export function integerInWords(n: number): string {
  if (!Number.isInteger(n) || n < 0) throw new Error("integerInWords: a whole number ≥ 0");
  if (n === 0) return ONES[0]!;
  const out: string[] = [];
  for (const [size, name] of SCALES) {
    if (n >= size) {
      out.push(`${under1000(Math.floor(n / size))} ${name}`);
      n %= size;
    }
  }
  if (n) out.push(under1000(n));
  return out.join(" ");
}

// [one, many] for the currency and for its cents.
const CURRENCY: Record<string, [[string, string], [string, string]]> = {
  USD: [["US dollar", "US dollars"], ["cent", "cents"]],
  EUR: [["euro", "euros"], ["cent", "cents"]],
  TRY: [["Turkish lira", "Turkish lira"], ["kuruş", "kuruş"]],
};

/** `amount` is a decimal string with at most 2 places (server Decimal). */
export function amountInWords(amount: string, currency = "USD"): string {
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(amount.trim());
  if (!m) throw new Error("amountInWords: not an amount");
  const whole = Number(m[1]);
  const cents = Number((m[2] ?? "0").padEnd(2, "0"));
  const [major, minor] = CURRENCY[currency] ?? [[currency, currency], ["cent", "cents"]];
  const text = `${integerInWords(whole)} ${major[whole === 1 ? 0 : 1]}${cents ? ` and ${integerInWords(cents)} ${minor[cents === 1 ? 0 : 1]}` : ""}`;
  // "only" closes the amount, as written on receipts (owner 2026-10-25).
  return `${text.charAt(0).toUpperCase()}${text.slice(1)} only`;
}
