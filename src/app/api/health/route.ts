import { prisma } from "@/db/client";

export const dynamic = "force-dynamic";

/** Liveness/readiness probe. Returns 200 when the DB is reachable, else 503.
 * No sensitive detail is exposed. */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ status: "ok", db: "up", time: new Date().toISOString() });
  } catch {
    return Response.json({ status: "degraded", db: "down" }, { status: 503 });
  }
}
