/**
 * The developer's contact behind the "Developed by Darwiish.dev" credit
 * (owner 2026-10-28). Fixed in code on purpose: it is not a Setting and not a
 * database row, so no admin, staff member or customer can change where the
 * link leads — only a code change, reviewed and deployed, can.
 */
export const DEVELOPER = {
  name: "Darwiish.dev",
  /** WhatsApp number in international form, digits only (e.g. 2526XXXXXXXX). Empty = no link. */
  whatsapp: "252617589166",
  /** Message the chat opens with, ready to send. */
  message: "Salaam Darwiish, waxaan ka soo arkay system-ka OrbitCargo. Waxaan jeclaan lahaa inaan kala hadlo samaynta system ama website.",
} as const;

/** wa.me link with the prepared message, or null while no valid number is set. */
export function developerWhatsAppLink(contact: { whatsapp: string; message: string } = DEVELOPER): string | null {
  if (!/^[1-9]\d{7,14}$/.test(contact.whatsapp)) return null;
  return `https://wa.me/${contact.whatsapp}?text=${encodeURIComponent(contact.message)}`;
}
