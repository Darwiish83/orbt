import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { ValidationError } from "@/lib/errors";
import { logAudit } from "@/modules/audit/log";
import { nextCustomerRef } from "@/modules/customers/ref";
import { PHONE_REQUIRED, PHONE_TAKEN } from "@/modules/customers/phone";
import { assertUniqueContact, requireSomaliPhone, somaliPhoneKey } from "@/modules/customers/service";
import { assertNotRateLimited, recordAttempt } from "./rateLimit";
import { issueOtp, verifyOtp, type OtpSender } from "./otp";
import { assertStrongPassword } from "./passwordPolicy";
import { consumeResetToken, createSetPasswordToken, peekResetToken } from "./reset";

/**
 * Sign-in onboarding flows (ADR-016), all server-side:
 *
 *  Customer — first login / forgotten password:
 *    Reference + Phone + Email → emailed code → set password.
 *  Customer — "Create New Account":
 *    details → emailed code → customer + account created, Reference delivered
 *    as an in-app notification → set password.
 *  Staff — "Create Password":
 *    Employee ID + email → emailed code → set password.
 *
 * Requests never reveal whether the details matched (no account enumeration):
 * they always "succeed"; a code is only sent when everything matches, and
 * mismatches count towards the rate limit.
 */

const norm = (v: string) => v.trim().toUpperCase();
const lower = (v: string) => v.trim().toLowerCase();
const emailSchema = z.string().trim().toLowerCase().email().max(254);

// ------------------------------------------------- customer: first login / forgot

export async function requestCustomerAccess(
  db: PrismaClient,
  input: { reference: string; phone: string; email: string },
  send: OtpSender,
): Promise<void> {
  const reference = norm(input.reference);
  const email = emailSchema.safeParse(input.email);
  if (!reference || !email.success) {
    throw new ValidationError("Enter your customer reference, phone number and email");
  }
  if (!somaliPhoneKey(input.phone)) {
    throw new ValidationError(PHONE_REQUIRED);
  }
  await assertNotRateLimited(db, reference, "otp");

  const customer = await db.customer.findFirst({
    where: { ref: { equals: reference, mode: "insensitive" } },
    include: { user: true },
  });
  const matches =
    !!customer &&
    customer.status === "ACTIVE" &&
    !!customer.email &&
    customer.email === email.data &&
    !!customer.phoneKey &&
    customer.phoneKey === somaliPhoneKey(input.phone) &&
    (!customer.user || (customer.user.email === email.data && customer.user.status !== "SUSPENDED"));

  await recordAttempt(db, { identifier: reference, kind: "otp", success: matches });
  if (!matches) return;

  // First login: create the portal account (no password yet).
  const user =
    customer.user ??
    (await db.user.create({ data: { email: email.data, status: "INVITED", customerId: customer.id } }));
  const { code } = await issueOtp(db, { purpose: "CUSTOMER_ACCESS", email: email.data, userId: user.id });
  await send(email.data, code, "CUSTOMER_ACCESS");
}

/** Verify the code; returns a short-lived set-password token. */
export async function verifyCustomerAccess(db: PrismaClient, input: { email: string; code: string }): Promise<string> {
  const otp = await verifyOtp(db, { purpose: "CUSTOMER_ACCESS", email: input.email, code: input.code });
  if (!otp.userId) throw new ValidationError("Invalid or expired code");
  return createSetPasswordToken(db, otp.userId);
}

// ------------------------------------------------------------ customer: signup

const signupSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(1).max(40),
  email: emailSchema,
  company: z.string().trim().min(1).max(120),
  location: z.string().trim().min(1).max(160),
  cargoCategory: z.string().trim().min(1).max(160),
});
export type SignupInput = z.input<typeof signupSchema>;

const ALREADY = "This email or phone is already registered. Log in with your Customer Reference.";
const EMAIL_TAKEN = "This email is already registered. Log in with your Customer Reference.";

/** Duplicate check with a message that says which field is taken (owner request). */
async function assertSignupContactFree(db: Parameters<typeof assertUniqueContact>[0], email: string, phoneKey: string) {
  try {
    await assertUniqueContact(db, email, phoneKey);
  } catch (e) {
    throw new ValidationError(e instanceof ValidationError && e.message === PHONE_TAKEN ? PHONE_TAKEN : EMAIL_TAKEN);
  }
}

export async function startCustomerSignup(db: PrismaClient, input: SignupInput, send: OtpSender): Promise<void> {
  const parsed = signupSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError("Please fill in all required fields");
  const d = parsed.data;
  const { key: phoneKey } = requireSomaliPhone(d.phone);
  await assertSignupContactFree(db, d.email, phoneKey);
  if (await db.user.findUnique({ where: { email: d.email }, select: { id: true } })) throw new ValidationError(EMAIL_TAKEN);

  const { code } = await issueOtp(db, { purpose: "CUSTOMER_SIGNUP", email: d.email, payload: { ...d, phoneKey } });
  await send(d.email, code, "CUSTOMER_SIGNUP");
}

/**
 * Verify the signup code, then create the customer (next OR- reference), the
 * portal account and the welcome notification carrying the Reference — all in
 * one transaction. Returns the new Reference and a set-password token.
 */
export async function verifyCustomerSignup(
  db: PrismaClient,
  input: { email: string; code: string },
): Promise<{ reference: string; token: string }> {
  const otp = await verifyOtp(db, { purpose: "CUSTOMER_SIGNUP", email: input.email, code: input.code });
  const d = signupSchema.extend({ phoneKey: z.string() }).parse(otp.payload);

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const { userId, ref } = await db.$transaction(async (tx) => {
        // Re-check: someone may have registered the same email/phone meanwhile.
        await assertSignupContactFree(tx, d.email, d.phoneKey);
        const ref = await nextCustomerRef(tx);
        const customer = await tx.customer.create({
          data: {
            ref,
            name: d.name,
            company: d.company,
            phone: requireSomaliPhone(d.phone).phone,
            phoneKey: d.phoneKey,
            email: d.email,
            location: d.location,
            cargoCategory: d.cargoCategory,
          },
        });
        const user = await tx.user.create({ data: { email: d.email, status: "INVITED", customerId: customer.id } });
        await tx.notification.create({
          data: {
            audience: "CUSTOMER",
            type: "welcome",
            customerId: customer.id,
            title: "Welcome to Orbit — your Customer Reference",
            message: `Your account has been created. Your Customer Reference is ${ref}. Use it to log in and as your payment reference.`,
            status: "SENT",
            sentAt: new Date(),
          },
        });
        await logAudit(tx, {
          actorUserId: null,
          action: "customer.self_register",
          entityType: "Customer",
          entityId: customer.id,
          metadata: { ref },
        });
        return { userId: user.id, ref };
      });
      return { reference: ref, token: await createSetPasswordToken(db, userId) };
    } catch (e) {
      const refClash =
        e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002" && JSON.stringify(e.meta?.target).includes("ref");
      if (!refClash || attempt === 4) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new ValidationError(ALREADY);
        throw e;
      }
    }
  }
  throw new Error("unreachable");
}

// ----------------------------------------------------------- staff: setup/reset

export async function requestStaffSetup(
  db: PrismaClient,
  input: { employeeId: string; email: string },
  send: OtpSender,
): Promise<void> {
  const employeeId = norm(input.employeeId);
  const email = emailSchema.safeParse(input.email);
  if (!/^EMP-[A-Z0-9]+$/.test(employeeId) || !email.success) {
    throw new ValidationError("Enter your Employee ID and email");
  }
  await assertNotRateLimited(db, employeeId, "otp");

  const employee = await db.employee.findFirst({
    where: { code: { equals: employeeId, mode: "insensitive" } },
    include: { user: true },
  });
  const user = employee?.user;
  const matches =
    !!employee && employee.active && !!user && user.email === email.data && !user.customerId && user.status !== "SUSPENDED";

  await recordAttempt(db, { identifier: employeeId, kind: "otp", success: matches });
  if (!matches) return;

  const { code } = await issueOtp(db, { purpose: "STAFF_SETUP", email: email.data, userId: user.id });
  await send(email.data, code, "STAFF_SETUP");
}

export async function verifyStaffSetup(db: PrismaClient, input: { email: string; code: string }): Promise<string> {
  const otp = await verifyOtp(db, { purpose: "STAFF_SETUP", email: input.email, code: input.code });
  if (!otp.userId) throw new ValidationError("Invalid or expired code");
  return createSetPasswordToken(db, otp.userId);
}

// --------------------------------------------------------------- set password

/**
 * Consume a set-password token (single-use, short-lived) and set the
 * password. Activates the account and invalidates older sessions. Returns the
 * identifiers needed to sign the user straight in.
 */
export async function completeSetPassword(
  db: PrismaClient,
  input: { token: string; password: string; confirm: string },
): Promise<{ userId: string; email: string; customerRef: string | null; employeeId: string | null }> {
  const EXPIRED = "This step has expired. Please start again.";
  // Check the rules against this person's email/ID before the token is spent.
  const owner = await peekResetToken(db, input.token);
  if (!owner) throw new ValidationError(EXPIRED);
  const who = await db.user.findUniqueOrThrow({
    where: { id: owner },
    select: { email: true, customer: { select: { ref: true } }, employee: { select: { code: true } } },
  });
  assertStrongPassword(input.password, input.confirm, { email: who.email, id: who.customer?.ref ?? who.employee?.code });
  let userId: string;
  try {
    userId = await consumeResetToken(db, input.token, input.password);
  } catch {
    throw new ValidationError(EXPIRED);
  }
  const u = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: { email: true, customer: { select: { ref: true } }, employee: { select: { code: true } } },
  });
  await logAudit(db, { actorUserId: userId, action: "auth.password_set", entityType: "User", entityId: userId });
  return { userId, email: lower(u.email), customerRef: u.customer?.ref ?? null, employeeId: u.employee?.code ?? null };
}
