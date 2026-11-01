/**
 * The app's public origin for links sent outside the app (password-reset
 * emails). It comes from APP_URL only — never from the request's Host or
 * X-Forwarded-Host, which whoever sends the request controls (an attacker
 * could make a genuine email point at their own site, with a valid token).
 *
 * Production requires an HTTPS APP_URL (also enforced at boot by src/lib/env.ts);
 * development falls back to the same default as env.ts.
 */
export function trustedAppOrigin(raw: string | undefined = process.env.APP_URL, nodeEnv: string | undefined = process.env.NODE_ENV): string {
  const production = nodeEnv === "production";
  const value = raw?.trim() || (production ? "" : "http://localhost:3000");
  if (!value) throw new Error("APP_URL is not configured");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("APP_URL is not a valid URL");
  }
  if (url.protocol !== "https:" && !(url.protocol === "http:" && !production)) throw new Error("APP_URL must be HTTPS in production");
  if (url.username || url.password) throw new Error("APP_URL must not contain credentials");
  return url.origin;
}

/** The emailed password-reset link for a token, on the trusted origin. */
export function passwordResetUrl(token: string, raw?: string, nodeEnv?: string): string {
  return `${trustedAppOrigin(raw ?? process.env.APP_URL, nodeEnv ?? process.env.NODE_ENV)}/reset-password?token=${encodeURIComponent(token)}`;
}
