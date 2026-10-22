/**
 * Display formatters ported from the design kit (`money`, `num`, `fdate`).
 *
 * These only FORMAT values. Authoritative amounts are Prisma Decimals computed
 * server-side (ADR-004); pass them as strings (`decimal.toString()`) so no
 * floating-point conversion happens. Rounding is HALF_UP on the decimal string.
 */

export type NumericLike = string | number | { toString(): string } | null | undefined;

const DEC_RE = /^([+-])?(\d*)(?:\.(\d*))?$/;

function toPlainString(v: NumericLike): string {
  if (v == null || v === "") return "0";
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return "0";
    // Avoid exponent notation for very small/large numbers.
    return Math.abs(v) < 1e21 ? v.toFixed(12) : String(v);
  }
  return v.toString().trim();
}

/** Round a decimal string to `d` places (HALF_UP) and return [negative, int, frac]. */
function roundParts(v: NumericLike, d: number): [boolean, string, string] {
  const m = DEC_RE.exec(toPlainString(v));
  if (!m) return [false, "0", "0".repeat(d)];
  const neg = m[1] === "-";
  const intPart = m[2] || "0";
  const frac = (m[3] ?? "").padEnd(d + 1, "0");
  let scaled = BigInt(intPart + frac.slice(0, d));
  if (Number(frac[d]) >= 5) scaled += 1n;
  const s = scaled.toString().padStart(d + 1, "0");
  const i = d === 0 ? s : s.slice(0, -d);
  const f = d === 0 ? "" : s.slice(-d);
  const isZero = /^0*$/.test(i + f);
  return [neg && !isZero, i.replace(/^0+(?=\d)/, ""), f];
}

function group(int: string): string {
  return int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** `$1,234.50`; negatives as `−$1,234.50` (design uses U+2212). */
export function money(v: NumericLike, d = 2): string {
  const [neg, i, f] = roundParts(v, d);
  return `${neg ? "−$" : "$"}${group(i)}${d ? "." + f : ""}`;
}

/** Grouped number with fixed decimals, e.g. `1,240.5`. */
export function num(v: NumericLike, d = 0): string {
  const [neg, i, f] = roundParts(v, d);
  return `${neg ? "-" : ""}${group(i)}${d ? "." + f : ""}`;
}

/** `02 Oct 2026` (en-GB, UTC so server and client agree). `—` when empty. */
export function fdate(v: string | Date | null | undefined): string {
  if (!v) return "—";
  const d = typeof v === "string" ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(v) ? v + "T00:00:00Z" : v) : v;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

/** True when the decimal value is greater than zero (after 2dp rounding), without float conversion. */
export function isPositive(v: NumericLike): boolean {
  const [neg, i, f] = roundParts(v, 2);
  return !neg && /[1-9]/.test(i + f);
}
