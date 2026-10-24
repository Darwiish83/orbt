"use server";

import { z } from "zod";
import { prisma } from "@/db/client";
import { requireUser } from "@/modules/authz/session";
import { createAnnouncement } from "@/modules/notifications/announcements";
import { runAction } from "../runAction";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const form = z.object({
  type: z.enum(["AIR", "SEA", "GENERAL"]),
  title: z.string().trim().min(1).max(160),
  message: z.string().trim().min(1).max(4000),
  lastDay: day.optional().or(z.literal("")),
  departureDate: day.optional().or(z.literal("")),
  origin: z.string().trim().max(120).optional(),
  destination: z.string().trim().max(120).optional(),
  sendAt: day.optional().or(z.literal("")),
});

/** Schedule Announcement: multipart form (the image is optional). */
export async function createAnnouncementAction(formData: FormData) {
  return runAction(
    "notifications",
    async () => {
      const user = await requireUser();
      const v = form.parse({
        type: formData.get("type"),
        title: formData.get("title"),
        message: formData.get("message"),
        lastDay: formData.get("lastDay") ?? undefined,
        departureDate: formData.get("departureDate") ?? undefined,
        origin: formData.get("origin") ?? undefined,
        destination: formData.get("destination") ?? undefined,
        sendAt: formData.get("sendAt") ?? undefined,
      });
      const file = formData.get("image");
      const image = file instanceof File && file.size > 0 ? { buffer: Buffer.from(await file.arrayBuffer()), contentType: file.type } : null;
      const n = await createAnnouncement(prisma, user, {
        ...v,
        lastDay: v.lastDay || null,
        departureDate: v.departureDate || null,
        // A send date means 07:00 Mogadishu time (04:00 UTC) that day.
        sendAt: v.sendAt ? new Date(`${v.sendAt}T04:00:00Z`) : null,
        image,
      });
      return { id: n.id, status: n.status };
    },
    ["/notifications"],
  );
}
