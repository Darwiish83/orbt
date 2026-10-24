import type { Notification, Prisma, PrismaClient } from "@prisma/client";
import { AuthorizationError, ValidationError } from "@/lib/errors";
import { logAudit } from "@/modules/audit/log";
import { isCustomerPrincipal, requirePermission, type AuthzUser } from "@/modules/authz/core";
import { localStorage } from "@/modules/documents/storage";
import { validateUpload } from "@/modules/documents/validation";

/**
 * Schedule Announcement (spec B8 / revised prompt §9). Air Flight / Sea
 * Container / General. Delivered to every customer (audience ALL). A send date
 * in the future keeps it Scheduled until then; it is published lazily when
 * notifications are read.
 */

export type AnnouncementType = "AIR" | "SEA" | "GENERAL";
export const ANNOUNCEMENT_TYPE: Record<AnnouncementType, string> = { AIR: "flight", SEA: "container", GENERAL: "general" };
const MAX_IMAGE = 2 * 1024 * 1024;

export interface AnnouncementInput {
  type: AnnouncementType;
  title: string;
  message: string;
  lastDay?: string | null;
  departureDate?: string | null;
  origin?: string | null;
  destination?: string | null;
  sendAt?: Date | null;
  image?: { buffer: Buffer; contentType: string } | null;
}

export async function createAnnouncement(db: PrismaClient, actor: AuthzUser, input: AnnouncementInput): Promise<Notification> {
  requirePermission(actor, "notifications:write");
  const title = input.title.trim();
  const message = input.message.trim();
  if (!title || !message) throw new ValidationError("Fill all required fields");
  if (title.length > 160 || message.length > 4000) throw new ValidationError("Title or message is too long");
  const dated = input.type !== "GENERAL";
  if (dated && (!input.lastDay || !input.departureDate)) throw new ValidationError("Enter the last day and the departure date");
  if (dated && input.lastDay! > input.departureDate!) throw new ValidationError("The last day must be on or before the departure date");

  let imageKey: string | null = null;
  let imageType: string | null = null;
  if (input.image) {
    if (input.image.buffer.length > MAX_IMAGE) throw new ValidationError("The image must be 2 MB or smaller");
    const v = validateUpload(input.image.buffer, input.image.contentType);
    if (!v.contentType.startsWith("image/")) throw new ValidationError("Upload a PNG, JPEG or WebP image");
    imageKey = await localStorage.put(input.image.buffer);
    imageType = v.contentType;
  }

  const scheduled = !!input.sendAt && input.sendAt.getTime() > Date.now();
  const details: Prisma.InputJsonValue = dated
    ? { lastDay: input.lastDay!, departureDate: input.departureDate!, origin: input.origin?.trim() || null, destination: input.destination?.trim() || "Mogadishu" }
    : {};
  try {
    const n = await db.notification.create({
      data: {
        audience: "ALL",
        type: ANNOUNCEMENT_TYPE[input.type],
        title,
        message,
        details,
        imageKey,
        imageType,
        status: scheduled ? "SCHEDULED" : "SENT",
        scheduledAt: scheduled ? input.sendAt : null,
        sentAt: scheduled ? null : new Date(),
        createdByUserId: actor.id,
      },
    });
    await logAudit(db, { actorUserId: actor.id, action: "announcement.create", entityType: "Notification", entityId: n.id, metadata: { type: input.type, scheduled } });
    return n;
  } catch (e) {
    if (imageKey) await localStorage.delete(imageKey);
    throw e;
  }
}

/** Publish announcements whose send time has come. Idempotent. */
export async function publishDueAnnouncements(db: PrismaClient, now = new Date()) {
  await db.notification.updateMany({ where: { status: "SCHEDULED", scheduledAt: { lte: now } }, data: { status: "SENT", sentAt: now } });
}

export async function listNotificationsAdmin(
  db: PrismaClient,
  actor: AuthzUser,
  filters: { kind?: "announcements" | "customer"; status?: "SENT" | "SCHEDULED"; q?: string; page?: number } = {},
) {
  requirePermission(actor, "notifications:read");
  await publishDueAnnouncements(db);
  const q = filters.q?.trim();
  const where: Prisma.NotificationWhereInput = {
    ...(filters.kind === "announcements" ? { audience: "ALL" } : filters.kind === "customer" ? { audience: "CUSTOMER" } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { message: { contains: q, mode: "insensitive" } }, { customer: { name: { contains: q, mode: "insensitive" } } }] } : {}),
  };
  const page = Math.max(1, filters.page ?? 1);
  const [items, total, customers, announcements, scheduled] = await Promise.all([
    db.notification.findMany({ where, include: { customer: { select: { ref: true, name: true } } }, orderBy: { createdAt: "desc" }, skip: (page - 1) * 30, take: 30 }),
    db.notification.count({ where }),
    db.customer.count({ where: { status: "ACTIVE" } }),
    db.notification.count({ where: { audience: "ALL" } }),
    db.notification.count({ where: { status: "SCHEDULED" } }),
  ]);
  return {
    total,
    page,
    stats: { all: await db.notification.count(), announcements, scheduled, customers },
    items: items.map((n) => ({
      id: n.id,
      audience: n.audience,
      type: n.type,
      title: n.title,
      message: n.message,
      status: n.status,
      details: (n.details ?? {}) as Record<string, string | null>,
      hasImage: !!n.imageKey,
      customer: n.customer ? `${n.customer.ref} — ${n.customer.name}` : null,
      createdAt: n.createdAt.toISOString(),
      scheduledAt: n.scheduledAt?.toISOString() ?? null,
      sentAt: n.sentAt?.toISOString() ?? null,
    })),
  };
}

/** The announcement image, for staff or for customers who may see it. */
export async function getNotificationImage(db: PrismaClient, actor: AuthzUser, id: string) {
  const n = await db.notification.findUnique({ where: { id } });
  if (!n?.imageKey || !n.imageType) throw new ValidationError("Not found");
  if (isCustomerPrincipal(actor)) {
    const visible = n.status === "SENT" && (n.audience === "ALL" || n.customerId === actor.customerId);
    if (!visible) throw new AuthorizationError("Not allowed");
  } else requirePermission(actor, "notifications:read");
  return { buffer: await localStorage.get(n.imageKey), contentType: n.imageType };
}
