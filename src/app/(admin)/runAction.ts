import "server-only";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AuthorizationError, ValidationError } from "@/lib/errors";
import { captureError } from "@/lib/logger";

export type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

/** Run an admin server action: revalidate on success, and map service errors
 * to fixed, translatable messages (never internals). */
export async function runAction<T>(area: string, fn: () => Promise<T>, paths: string[] = []): Promise<Result<T>> {
  try {
    const data = await fn();
    for (const p of paths) revalidatePath(p);
    return { ok: true, data };
  } catch (e) {
    if (e instanceof AuthorizationError) return { ok: false, error: "You don't have permission to do this." };
    if (e instanceof ValidationError) return { ok: false, error: e.message };
    if (e instanceof z.ZodError) return { ok: false, error: "Check the highlighted fields." };
    captureError(e, { area });
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}
