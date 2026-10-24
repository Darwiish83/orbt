import { prisma } from "@/db/client";
import { getSessionUser } from "@/modules/authz/session";
import { getNotificationImage } from "@/modules/notifications/announcements";

/** Announcement image, streamed from private storage after an access check. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  try {
    const { buffer, contentType } = await getNotificationImage(prisma, user, id);
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(buffer.length),
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
