import { Prisma } from "@prisma/client";
import { ValidationError } from "@/lib/errors";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The unique index on idempotencyKey refused a second record (Prisma P2002). */
export function isDuplicateKey(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002" && JSON.stringify(e.meta?.target ?? "").includes("idempotencyKey");
}

/**
 * Save a money record at most once per form submission (security finding H3).
 * The form sends a UUID made when it opened; a replay — a double click, a resent
 * request, or a concurrent duplicate that loses the race on the unique index —
 * gets back the record already saved, never a second one. A key that belongs to
 * someone else is refused.
 */
export async function oncePerKey<R>(
  key: string | undefined,
  actorId: string,
  find: (key: string) => Promise<{ owner: string | null; result: R } | null>,
  create: () => Promise<R>,
): Promise<R> {
  if (key === undefined) return create();
  if (!UUID.test(key)) throw new ValidationError("Invalid request");
  const replay = async () => {
    const hit = await find(key);
    if (!hit) return null;
    if (hit.owner !== actorId) throw new ValidationError("Invalid request");
    return hit;
  };
  const before = await replay();
  if (before) return before.result;
  try {
    return await create();
  } catch (e) {
    if (isDuplicateKey(e)) {
      const after = await replay();
      if (after) return after.result;
    }
    throw e;
  }
}
