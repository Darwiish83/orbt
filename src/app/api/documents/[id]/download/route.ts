import type { NextRequest } from "next/server";
import { prisma } from "@/db/client";
import { withUserDb } from "@/db/scoped";
import { getSessionUser } from "@/modules/authz/session";
import { getDocumentByToken, getDocumentForDownload } from "@/modules/documents/service";
import { verifySignedToken } from "@/modules/documents/signing";

/**
 * Authorized document download. Access requires EITHER a valid short-lived
 * signed token bound to this document id, OR an authenticated session that
 * passes object-level authorization. Files are streamed from private storage;
 * nothing is ever served from a public directory.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = req.nextUrl.searchParams.get("token");

  let result: Awaited<ReturnType<typeof getDocumentForDownload>> = null;

  if (token && verifySignedToken(id, token)) {
    result = await getDocumentByToken(prisma, id);
  } else {
    const user = await getSessionUser();
    if (!user) return new Response("Unauthorized", { status: 401 });
    try {
      result = await withUserDb(user, (db) => getDocumentForDownload(db, user, id));
    } catch {
      return new Response("Forbidden", { status: 403 });
    }
  }

  if (!result) return new Response("Not found", { status: 404 });

  const { document, buffer } = result;
  const safeName = (document.filename ?? "document").replace(/["\r\n]/g, "");
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": document.contentType,
      "Content-Disposition": `attachment; filename="${safeName}"`,
      "Content-Length": String(buffer.length),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
