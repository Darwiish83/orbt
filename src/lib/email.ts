import "server-only";
import { Resend } from "resend";
import { logger } from "./logger";

const apiKey = process.env.RESEND_API_KEY;
const FROM = process.env.EMAIL_FROM || "OrbitCargo <onboarding@resend.dev>";
const resend = apiKey ? new Resend(apiKey) : null;

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/**
 * Send a transactional email via Resend. When no key is configured (local dev),
 * it logs instead of sending so flows still work. Never logs the body.
 */
export async function sendEmail(input: SendEmailInput): Promise<{ ok: boolean; id?: string; error?: string }> {
  if (!resend) {
    logger.warn("email not configured — skipping send", { to: input.to, subject: input.subject });
    return { ok: false, error: "email-not-configured" };
  }
  try {
    const { data, error } = await resend.emails.send({
      from: FROM,
      to: input.to,
      subject: input.subject,
      html: input.html,
      ...(input.text ? { text: input.text } : {}),
    });
    if (error) {
      logger.error("email send failed", { to: input.to, subject: input.subject, error: error.message });
      return { ok: false, error: error.message };
    }
    return { ok: true, id: data?.id };
  } catch (e) {
    logger.error("email send threw", { to: input.to, subject: input.subject });
    return { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }
}

const BRAND_NAVY = "#012E6C";
const BRAND_ORANGE = "#FF5B04";

/** Minimal on-brand HTML wrapper for transactional emails. */
export function emailLayout(heading: string, bodyHtml: string): string {
  return `<!doctype html><html><body style="margin:0;background:#F7F8FA;font-family:Arial,Helvetica,sans-serif;color:#2A323F">
  <div style="max-width:480px;margin:0 auto;padding:24px">
    <div style="background:${BRAND_NAVY};color:#fff;padding:16px 20px;border-radius:10px 10px 0 0;font-weight:800;letter-spacing:.04em">
      ORBIT <span style="color:${BRAND_ORANGE}">CARGO</span>
    </div>
    <div style="background:#fff;border:1px solid #E2E5EA;border-top:0;border-radius:0 0 10px 10px;padding:24px">
      <h1 style="font-size:19px;margin:0 0 12px;color:${BRAND_NAVY}">${heading}</h1>
      ${bodyHtml}
    </div>
    <p style="color:#7E8794;font-size:12px;margin:16px 4px">OrbitCargo — Door to door, on time.</p>
  </div></body></html>`;
}
