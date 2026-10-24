import type { Notification, NotificationAudience, Prisma, PrismaClient } from "@prisma/client";
import { buildPage, normalizePage, type Page, type PageParams } from "@/lib/pagination";
import { logAudit } from "@/modules/audit/log";
import { isCustomerPrincipal, requirePermission, type AuthzUser } from "@/modules/authz/core";
import { publishDueAnnouncements } from "./announcements";

export interface CreateNotificationInput {
  audience: NotificationAudience;
  type?: string;
  title: string;
  message: string;
  customerId?: string; // when audience = CUSTOMER
  roleId?: string; // when audience = ROLE
  scheduledAt?: Date;
}

export async function createNotification(
  db: PrismaClient,
  actor: AuthzUser,
  input: CreateNotificationInput,
): Promise<Notification> {
  requirePermission(actor, "notifications:write");
  const notification = await db.notification.create({
    data: {
      audience: input.audience,
      type: input.type,
      title: input.title,
      message: input.message,
      customerId: input.customerId,
      roleId: input.roleId,
      scheduledAt: input.scheduledAt,
      status: input.scheduledAt ? "SCHEDULED" : "DRAFT",
      createdByUserId: actor.id,
    },
  });
  await logAudit(db, {
    actorUserId: actor.id,
    action: "notification.create",
    entityType: "Notification",
    entityId: notification.id,
  });
  return notification;
}

export async function sendNotification(db: PrismaClient, actor: AuthzUser, id: string): Promise<Notification> {
  requirePermission(actor, "notifications:write");
  return db.notification.update({ where: { id }, data: { status: "SENT", sentAt: new Date() } });
}

/** Notifications visible to the current user. Customers see ALL announcements
 * plus their own CUSTOMER notifications that have been SENT; staff with
 * notifications:read see all. */
export async function listNotificationsForUser(
  db: PrismaClient,
  actor: AuthzUser,
  filters: PageParams = {},
): Promise<Page<Notification>> {
  const { page, pageSize, skip, take } = normalizePage(filters);
  await publishDueAnnouncements(db);
  let where: Prisma.NotificationWhereInput;

  if (isCustomerPrincipal(actor)) {
    where = {
      status: "SENT",
      OR: [{ audience: "ALL" }, { audience: "CUSTOMER", customerId: actor.customerId ?? "__none__" }],
    };
  } else {
    requirePermission(actor, "notifications:read");
    where = {};
  }

  const [items, total] = await Promise.all([
    db.notification.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
    db.notification.count({ where }),
  ]);
  return buildPage(items, total, page, pageSize);
}
