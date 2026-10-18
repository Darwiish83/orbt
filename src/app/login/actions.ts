"use server";

import { AuthError } from "next-auth";
import { signIn, signOut } from "@/auth";

export type LoginState = { error: string | null };

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  try {
    await signIn("credentials", { email, password, redirectTo: "/dashboard" });
  } catch (error) {
    // signIn throws a NEXT_REDIRECT on success — that must propagate.
    if (error instanceof AuthError) {
      // Generic message — never reveal whether the email exists.
      return { error: "Invalid email or password, or too many attempts." };
    }
    throw error;
  }
  return { error: null };
}

export async function logout(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}
