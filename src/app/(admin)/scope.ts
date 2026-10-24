import "server-only";
import { cookies } from "next/headers";
import { prisma } from "@/db/client";
import { resolveAdminScope, type AdminScope } from "@/modules/authz/adminScope";
import type { AuthzUser } from "@/modules/authz/core";

export const YEAR_COOKIE = "orbit-year";
export const COUNTRY_COOKIE = "orbit-country";

/** The top bar's Year + Country for this request, validated on the server. */
export async function getAdminScope(user: AuthzUser): Promise<AdminScope> {
  const jar = await cookies();
  return resolveAdminScope(prisma, user, {
    year: jar.get(YEAR_COOKIE)?.value,
    country: jar.get(COUNTRY_COOKIE)?.value,
  });
}
