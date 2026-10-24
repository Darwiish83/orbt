import "server-only";
import { cookies } from "next/headers";
import { AuthorizationError } from "@/lib/errors";
import { requireUser } from "@/modules/authz/session";
import { PIN_COOKIE, requireAccountingAccess, verifyUnlock } from "@/modules/accounting/pin";

/** The signed-in user, with Accounting access and the PIN entered this session. */
export async function requireUnlocked() {
  const user = await requireUser();
  requireAccountingAccess(user);
  const token = (await cookies()).get(PIN_COOKIE)?.value;
  if (!verifyUnlock(user, token)) throw new AuthorizationError("Enter your Accounting PIN");
  return user;
}

export async function isUnlocked(user: Awaited<ReturnType<typeof requireUser>>) {
  return verifyUnlock(user, (await cookies()).get(PIN_COOKIE)?.value);
}
