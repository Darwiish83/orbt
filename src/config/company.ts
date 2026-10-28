/** Company identity printed on every invoice and receipt (owner spec §0). */
export const COMPANY = {
  name: "Orbit Cargo & Logistics",
  addressLines: ["Jedmarexan, Howlwadag District", "Mogadishu, Somalia"],
  phones: ["+252 614111539", "+252 614145971"],
  /** Primary number (receipts show it under the address). */
  phone: "+252 614111539",
  hours: "08:00–18:00",
  /** WhatsApp chat link (solid green button in the apps). */
  whatsappUrl: "https://wa.me/252614111539",
} as const;

/**
 * Accounts printed on the invoice for the customer to pay into (owner
 * 2026-10-26): Premier Bank is not offered on invoices, and Salaam is printed
 * with its full name. `bank` is the bank as recorded in the system.
 */
export const INVOICE_BANK_ACCOUNTS = [
  { bank: "Salaam Bank", label: "Salaam Somali Bank", accountNumber: "37215407" },
  { bank: "Dahabshiil Bank", label: "Dahabshiil Bank", accountNumber: "310015695901" },
] as const;

/** Bank logos bundled under /banks, matched by bank name. */
export function bankLogo(bank: string | null | undefined): string | null {
  const b = bank ?? "";
  if (/salaam/i.test(b)) return "/banks/salaam.png";
  if (/dahab/i.test(b)) return "/banks/dahabshiil.png";
  if (/premier/i.test(b)) return "/banks/premier.png";
  return null;
}
