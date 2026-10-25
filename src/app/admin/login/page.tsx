import { redirect } from "next/navigation";

/** Staff now sign in on the one sign-in page (ADR-021); old links still work. */
export default function AdminLoginPage() {
  redirect("/login");
}
