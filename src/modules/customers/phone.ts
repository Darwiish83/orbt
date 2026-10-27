/**
 * Customer phone rule (owner decision 2026-10-27): a Somali mobile number is
 * mandatory and must be exactly 9 digits after the +252 country code, e.g.
 * 61 555 0100. Accepted spellings: "61 555 0100", "615550100", "0615550100",
 * "+252 61 555 0100", "252615550100". Pure (no server imports) so forms can
 * run the same check before submitting; the server always re-checks.
 */

export const PHONE_DIGITS = 9;

/** Fixed, translatable messages. */
export const PHONE_REQUIRED = "Enter the phone number: 9 digits after +252 (e.g. 61 555 0100)";
export const PHONE_TAKEN = "This phone number is already registered";

/** The 9 local digits, or null when the input isn't a complete 9-digit number. */
export function localPhoneDigits(input: string | null | undefined): string | null {
  let d = (input ?? "").replace(/\D/g, "");
  if (d.length === PHONE_DIGITS + 3 && d.startsWith("252")) d = d.slice(3);
  else if (d.length === PHONE_DIGITS + 1 && d.startsWith("0")) d = d.slice(1);
  return d.length === PHONE_DIGITS ? d : null;
}

/** Canonical stored form and duplicate-check key, or null when invalid. */
export function parseSomaliPhone(input: string | null | undefined): { phone: string; key: string } | null {
  const d = localPhoneDigits(input);
  if (!d) return null;
  return { phone: `+252 ${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5)}`, key: `252${d}` };
}
