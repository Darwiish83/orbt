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
 * Email a one-time code. A code is never written to any log, in any
 * environment: a failed send logs only the address, purpose and provider
 * reason (sendEmail logs the provider error too). In production a missing
 * provider is an error. Local flows can be exercised with the verified domain,
 * or in tests with an injected sender.
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
  if (process.env.NODE_ENV === "production" && result.error === "email-not-configured") {
    throw new Error("Email provider is not configured");
  }
  logger.warn("verification code email not sent", { to, purpose, reason: result.error });
}
