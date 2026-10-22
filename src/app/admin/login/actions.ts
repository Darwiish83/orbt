"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/auth";
import { prisma } from "@/db/client";
import { RateLimitError, ValidationError } from "@/lib/errors";
import { sendOtpEmail } from "@/lib/otpEmail";
import { completeSetPassword, requestStaffSetup, verifyStaffSetup } from "@/modules/auth/flows";

/** Staff sign-in actions (ADR-016). Messages are fixed and translatable. */
export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const BAD_LOGIN = "Employee ID, email or password is incorrect, or too many attempts.";

function fail(e: unknown): { ok: false; error: string } {
  if (e instanceof RateLimitError) return { ok: false, error: "Too many attempts. Try again later." };
  if (e instanceof ValidationError) return { ok: false, error: e.message };
  throw e;
}

const str = (f: FormData, k: string) => String(f.get(k) ?? "");

export async function staffLoginAction(_prev: ActionResult | null, f: FormData): Promise<ActionResult> {
  try {
    await signIn("credentials", {
      kind: "staff",
      employeeId: str(f, "employeeId"),
      email: str(f, "email"),
      password: str(f, "password"),
      code: str(f, "code") || undefined,
      redirectTo: "/dashboard",
    });
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, error: BAD_LOGIN };
    throw e;
  }
  return { ok: true };
}

/** "Create Password" step 2: send the code. Always "sent" unless malformed or rate-limited. */
export async function staffRequestCodeAction(input: { employeeId: string; email: string }): Promise<ActionResult> {
  try {
    await requestStaffSetup(prisma, input, sendOtpEmail);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function staffVerifyCodeAction(input: { email: string; code: string }): Promise<ActionResult<{ token: string }>> {
  try {
    return { ok: true, token: await verifyStaffSetup(prisma, input) };
  } catch (e) {
    return fail(e);
  }
}

/** "Create Password" step 3: set the password, then sign in (TOTP-enrolled staff use Sign in instead). */
export async function staffSetPasswordAction(input: { token: string; password: string; confirm: string }): Promise<ActionResult<{ signInRequired?: boolean }>> {
  let r: Awaited<ReturnType<typeof completeSetPassword>>;
  try {
    r = await completeSetPassword(prisma, input);
  } catch (e) {
    return fail(e);
  }
  if (!r.employeeId) return { ok: false, error: "This step has expired. Please start again." };
  try {
    await signIn("credentials", { kind: "staff", employeeId: r.employeeId, email: r.email, password: input.password, redirectTo: "/dashboard" });
  } catch (e) {
    // MFA-enrolled accounts need their authenticator code: send them to Sign in.
    if (e instanceof AuthError) return { ok: true, signInRequired: true };
    throw e;
  }
  return { ok: true };
}
