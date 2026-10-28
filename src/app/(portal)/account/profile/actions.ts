"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { withUserDb } from "@/db/scoped";
import { AuthorizationError, ValidationError } from "@/lib/errors";
import { requireUser } from "@/modules/authz/session";
import { updateMyProfile } from "@/modules/portal/customerApp";

const profile = z.object({
  name: z.string().max(120),
  company: z.string().max(120),
  location: z.string().max(160),
  cargoCategory: z.string().max(120),
});
export type ProfileValues = z.input<typeof profile>;

/** The customer edits their own profile (name, company, location, cargo category). */
export async function updateProfileAction(values: ProfileValues): Promise<{ ok: boolean; error?: string }> {
  try {
    const user = await requireUser();
    await withUserDb(user, (db) => updateMyProfile(db, user, profile.parse(values)));
    revalidatePath("/account", "layout");
    return { ok: true };
  } catch (e) {
    if (e instanceof ValidationError) return { ok: false, error: e.message };
    if (e instanceof AuthorizationError) return { ok: false, error: "You don't have permission to do this." };
    if (e instanceof z.ZodError) return { ok: false, error: "Check the highlighted fields." };
    throw e;
  }
}
