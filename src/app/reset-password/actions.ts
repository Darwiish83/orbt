"use server";

import { prisma } from "@/db/client";
import { ValidationError } from "@/lib/errors";
import { completeSetPassword } from "@/modules/auth/flows";

export type ResetState = { error: string | null; ok?: boolean };

/**
 * Set a password from a one-time link (today only the owner's first password,
 * made by scripts/make-super-admin.ts --link). Same path as the code flows:
 * the full password rules, a single-use token that a suspended account can't
 * use, and an audit entry.
 */
export async function resetPasswordAction(_prev: ResetState, formData: FormData): Promise<ResetState> {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (!token) return { error: "Missing reset token" };
  try {
    await completeSetPassword(prisma, { token, password, confirm });
  } catch (e) {
    if (e instanceof ValidationError) return { error: e.message };
    throw e;
  }
  return { error: null, ok: true };
}
