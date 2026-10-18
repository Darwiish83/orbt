import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Short-lived signed download tokens (HMAC-SHA256 over documentId + expiry,
 * keyed by AUTH_SECRET). Lets a time-limited link be shared without a session;
 * the download route still binds the token to a specific document id.
 */
function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is required to sign download URLs");
  return s;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("hex");
}

export function createSignedToken(documentId: string, ttlMs = 5 * 60 * 1000): string {
  const expires = Date.now() + ttlMs;
  const sig = sign(`${documentId}.${expires}`);
  return `${expires}.${sig}`;
}

export function verifySignedToken(documentId: string, token: string): boolean {
  const [expiresStr, sig] = token.split(".");
  if (!expiresStr || !sig) return false;
  const expires = Number(expiresStr);
  if (!Number.isFinite(expires) || expires < Date.now()) return false;

  const expected = sign(`${documentId}.${expires}`);
  const a = Buffer.from(sig, "hex");
  const b = Buffer.from(expected, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
