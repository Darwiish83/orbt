"use server";

import { headers } from "next/headers";
import { prisma } from "@/db/client";
import { emailLayout, sendEmail } from "@/lib/email";
import { createResetToken } from "@/modules/auth/reset";
import { assertNotRateLimited, recordAttempt } from "@/modules/auth/rateLimit";

export type ForgotState = { done: boolean };

export async function requestPasswordResetAction(_prev: ForgotState, formData: FormData): Promise<ForgotState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  // Always respond the same way — never reveal whether the account exists.
  if (!email) return { done: true };

  try {
    await assertNotRateLimited(prisma, email, "reset");
  } catch {
    return { done: true };
  }

  const token = await createResetToken(prisma, email);
  await recordAttempt(prisma, { identifier: email, kind: "reset", success: !!token });

  if (token) {
    const h = await headers();
    const host = h.get("x-forwarded-host") || h.get("host");
    const proto = h.get("x-forwarded-proto") || "http";
    const url = `${proto}://${host}/reset-password?token=${encodeURIComponent(token)}`;
    await sendEmail({
      to: email,
      subject: "Reset your OrbitCargo password",
      html: emailLayout(
        "Reset your password",
        `<p style="margin:0 0 16px">We received a request to reset your password.</p>
         <a href="${url}" style="display:inline-block;background:#FF5B04;color:#fff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:4px">Reset password</a>
         <p style="margin:16px 0 0;font-size:13px;color:#5F6876">This link expires in 1 hour. If you didn't request it, you can ignore this email.</p>`,
      ),
      text: `Reset your OrbitCargo password: ${url} (expires in 1 hour)`,
    });
  }

  return { done: true };
}
