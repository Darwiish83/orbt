import "server-only";
import type { OtpPurpose } from "@prisma/client";
import { emailLayout, sendEmail } from "./email";
import { logger } from "./logger";

const SUBJECT: Record<OtpPurpose, string> = {
  CUSTOMER_ACCESS: "Your Orbit verification code",
  CUSTOMER_SIGNUP: "Welcome to Orbit — your verification code",
  STAFF_SETUP: "Orbit Admin — your verification code",
};

/**
 * Email a one-time code. In local development, when the email can't be sent
 * (no provider, or the provider refuses the address), the code is written to
 * the server log so the flow can be exercised; in production a missing
 * provider is an error, and a code is never a log line.
 */
export async function sendOtpEmail(to: string, code: string, purpose: OtpPurpose): Promise<void> {
  const result = await sendEmail({
    to,
    subject: SUBJECT[purpose],
    html: emailLayout(
      "Your verification code",
      `<p style="margin:0 0 12px">Enter this code in the Orbit app:</p>
       <p style="margin:0 0 16px;font:700 30px/1 monospace;letter-spacing:.3em;color:#012E6C">${code}</p>
       <p style="margin:0;font-size:13px;color:#5F6876">It expires in 10 minutes. If you didn't ask for it, ignore this email.</p>`,
    ),
    text: `Your Orbit verification code is ${code}. It expires in 10 minutes.`,
  });
  if (result.ok) return;
  if (process.env.NODE_ENV === "production") {
    if (result.error === "email-not-configured") throw new Error("Email provider is not configured");
    return;
  }
  // Local development only: also when the provider refuses the address (e.g. a
  // Resend test account can only mail its owner), so sign-in can still be tried.
  logger.warn("DEV ONLY — verification code (email not sent)", { to, purpose, reason: result.error, devCode: code });
}
