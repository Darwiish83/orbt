"use server";

import { AuthError } from "next-auth";
import { signIn, signOut } from "@/auth";
import { prisma } from "@/db/client";
import { RateLimitError, ValidationError } from "@/lib/errors";
import { sendOtpEmail } from "@/lib/otpEmail";
import {
  completeSetPassword,
  requestCustomerAccess,
  startCustomerSignup,
  verifyCustomerAccess,
  verifyCustomerSignup,
} from "@/modules/auth/flows";
import { getSessionUser } from "@/modules/authz/session";

/**
 * Customer sign-in actions (ADR-016). Every message returned is a fixed,
 * translatable string — never a detail that reveals which field was wrong or
 * whether an account exists.
 */
export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const RATE = "Too many attempts. Try again later.";
const BAD_LOGIN = "Customer reference or password is incorrect, or too many attempts.";

function fail(e: unknown): { ok: false; error: string } {
  if (e instanceof RateLimitError) return { ok: false, error: RATE };
  if (e instanceof ValidationError) return { ok: false, error: e.message };
  throw e;
}

const str = (f: FormData, k: string) => String(f.get(k) ?? "");

export async function customerLoginAction(_prev: ActionResult | null, f: FormData): Promise<ActionResult> {
  try {
    await signIn("credentials", { kind: "customer", reference: str(f, "reference"), password: str(f, "password"), redirectTo: "/account" });
  } catch (e) {
    // signIn throws NEXT_REDIRECT on success — that must propagate.
    if (e instanceof AuthError) return { ok: false, error: BAD_LOGIN };
    throw e;
  }
  return { ok: true };
}

/** Step 1 (first login / forgot): always "sent" unless the input is malformed or rate-limited. */
export async function requestAccessAction(input: { reference: string; phone: string; email: string }): Promise<ActionResult> {
  try {
    await requestCustomerAccess(prisma, input, sendOtpEmail);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function verifyAccessAction(input: { email: string; code: string }): Promise<ActionResult<{ token: string }>> {
  try {
    return { ok: true, token: await verifyCustomerAccess(prisma, input) };
  } catch (e) {
    return fail(e);
  }
}

export async function startSignupAction(input: {
  name: string;
  phone: string;
  email: string;
  company: string;
  location: string;
  cargoCategory: string;
}): Promise<ActionResult> {
  try {
    await startCustomerSignup(prisma, input, sendOtpEmail);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function verifySignupAction(input: { email: string; code: string }): Promise<ActionResult<{ token: string; reference: string }>> {
  try {
    const r = await verifyCustomerSignup(prisma, input);
    return { ok: true, token: r.token, reference: r.reference };
  } catch (e) {
    return fail(e);
  }
}

/** Final step: set the password, then sign the customer straight in. */
export async function customerSetPasswordAction(input: { token: string; password: string; confirm: string }): Promise<ActionResult> {
  let reference: string | null;
  try {
    ({ customerRef: reference } = await completeSetPassword(prisma, input));
  } catch (e) {
    return fail(e);
  }
  if (!reference) return { ok: false, error: "This step has expired. Please start again." };
  try {
    await signIn("credentials", { kind: "customer", reference, password: input.password, redirectTo: "/account" });
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, error: BAD_LOGIN };
    throw e;
  }
  return { ok: true };
}

/** Sign out; staff return to the admin login, customers to the customer login. */
export async function logout(): Promise<void> {
  const user = await getSessionUser();
  await signOut({ redirectTo: user && !user.customerId ? "/admin/login" : "/login" });
}
