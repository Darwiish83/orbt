"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { prisma } from "@/db/client";
import { resolveAdminScope } from "@/modules/authz/adminScope";
import { requireUser } from "@/modules/authz/session";
import { COUNTRY_COOKIE, YEAR_COOKIE } from "./scope";

/** Top bar Year / Country selector. Only a year and country the user may work
 * in are stored; anything else falls back to the resolved default. */
export async function setAdminScopeAction(input: { year?: number; country?: string }) {
  const user = await requireUser();
  const jar = await cookies();
  const scope = await resolveAdminScope(prisma, user, {
    year: input.year ?? jar.get(YEAR_COOKIE)?.value,
    country: input.country ?? jar.get(COUNTRY_COOKIE)?.value,
  });
  const opts = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 };
  jar.set(YEAR_COOKIE, String(scope.year), opts);
  jar.set(COUNTRY_COOKIE, scope.country, opts);
  revalidatePath("/", "layout");
}
