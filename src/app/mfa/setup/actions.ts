"use server";

import { prisma } from "@/db/client";
import { requireUser } from "@/modules/authz/session";
import { enableMfa } from "@/modules/auth/mfa";

export type ConfirmState = { error: string | null; codes?: string[] };

export async function confirmMfaAction(_prev: ConfirmState, formData: FormData): Promise<ConfirmState> {
  const user = await requireUser();
  const code = String(formData.get("code") ?? "").trim();
  if (!code) return { error: "Enter the 6-digit code from your authenticator app" };
  try {
    const codes = await enableMfa(prisma, user.id, code);
    return { error: null, codes };
  } catch {
    return { error: "That code didn't match. Try the current code from your app." };
  }
}
