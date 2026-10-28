"use server";

import { AuthError } from "next-auth";
import { signIn, signOut } from "@/auth";
import { prisma } from "@/db/client";
import { RateLimitError, ValidationError } from "@/lib/errors";
import { sendOtpEmail } from "@/lib/otpEmail";
import {
  completeSetPassword,
  requestCustomerAccess,
  requestStaffSetup,
  startCustomerSignup,
  verifyCustomerAccess,
  verifyCustomerSignup,
  verifyStaffSetup,
} from "@/modules/auth/flows";

/**
 * One sign-in page for staff and customers (ADR-016, ADR-021). The ID decides
 * who is signing in: an Employee ID (EMP-…) goes to the admin, anything else
 * is a Customer Reference. Every message returned is a fixed, translatable
 * string — never a detail that reveals which field was wrong or whether an
 * account exists.
 */
export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const RATE = "Too many attempts. Try again later.";
const BAD_LOGIN = "ID, email or password is incorrect, or too many attempts.";

function fail(e: unknown): { ok: false; error: string } {
  if (e instanceof RateLimitError) return { ok: false, error: RATE };
  if (e instanceof ValidationError) return { ok: false, error: e.message };
  throw e;
}

const str = (f: FormData, k: string) => String(f.get(k) ?? "");
const isStaffId = (id: string) => /^\s*EMP-/i.test(id);

export async function loginAction(_prev: ActionResult | null, f: FormData): Promise<ActionResult> {
  const id = str(f, "id");
  try {
    if (isStaffId(id)) {
      await signIn("credentials", {
        kind: "staff",
        employeeId: id,
        email: str(f, "email"),
        password: str(f, "password"),
        redirectTo: "/dashboard",
      });
    } else {
      await signIn("credentials", { kind: "customer", reference: id, email: str(f, "email"), password: str(f, "password"), redirectTo: "/account" });
    }
  } catch (e) {
    // signIn throws NEXT_REDIRECT on success — that must propagate.
    if (e instanceof AuthError) return { ok: false, error: BAD_LOGIN };
    throw e;
  }
  return { ok: true };
}

/** First login / forgot password, step 1: always "sent" unless the input is malformed or rate-limited. */
export async function requestAccessAction(input: { id: string; phone: string; email: string }): Promise<ActionResult> {
  try {
    if (isStaffId(input.id)) await requestStaffSetup(prisma, { employeeId: input.id, email: input.email }, sendOtpEmail);
    else await requestCustomerAccess(prisma, { reference: input.id, phone: input.phone, email: input.email }, sendOtpEmail);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function verifyAccessAction(input: { id: string; email: string; code: string }): Promise<ActionResult<{ token: string }>> {
  try {
    const verify = isStaffId(input.id) ? verifyStaffSetup : verifyCustomerAccess;
    return { ok: true, token: await verify(prisma, { email: input.email, code: input.code }) };
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

/** Final step: set the password, then sign straight in. */
export async function setPasswordAction(input: { token: string; password: string; confirm: string }): Promise<ActionResult> {
  let r: Awaited<ReturnType<typeof completeSetPassword>>;
  try {
    r = await completeSetPassword(prisma, input);
  } catch (e) {
    return fail(e);
  }
  try {
    if (r.employeeId) {
      await signIn("credentials", { kind: "staff", employeeId: r.employeeId, email: r.email, password: input.password, redirectTo: "/dashboard" });
    } else if (r.customerRef) {
      await signIn("credentials", { kind: "customer", reference: r.customerRef, email: r.email, password: input.password, redirectTo: "/account" });
    } else {
      return { ok: false, error: "This step has expired. Please start again." };
    }
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, error: BAD_LOGIN };
    throw e;
  }
  return { ok: true };
}

/** Sign out; everyone returns to the one sign-in page. */
export async function logout(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}
