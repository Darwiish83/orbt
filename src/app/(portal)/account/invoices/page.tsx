import { redirect } from "next/navigation";

/** Invoices live under Finance in the Customer App. */
export default function AccountInvoicesPage() {
  redirect("/account/finance");
}
