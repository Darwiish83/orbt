"use server";

import { prisma } from "@/db/client";
import { consumeResetToken } from "@/modules/auth/reset";

export type ResetState = { error: string | null; ok?: boolean };

export async function resetPasswordAction(_prev: ResetState, formData: FormData): Promise<ResetState> {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (!token) return { error: "Missing reset token" };
  if (password.length < 8) return { error: "Password must be at least 8 characters" };
  if (password !== confirm) return { error: "Passwords do not match" };

  try {
    await consumeResetToken(prisma, token, password);
  } catch {
    return { error: "This reset link is invalid or has expired." };
  }
  return { error: null, ok: true };
}
