import type { Prisma, PrismaClient } from "@prisma/client";

/** Append an audit event. Accepts a transaction client too. */
export async function logAudit(
  db: PrismaClient | Prisma.TransactionClient,
  event: {
    actorUserId?: string | null;
    action: string;
    entityType?: string;
    entityId?: string;
    metadata?: Prisma.InputJsonValue;
    ip?: string | null;
    userAgent?: string | null;
  },
): Promise<void> {
  await db.auditEvent.create({
    data: {
      actorUserId: event.actorUserId ?? null,
      action: event.action,
      entityType: event.entityType,
      entityId: event.entityId,
      metadata: event.metadata,
      ip: event.ip ?? null,
      userAgent: event.userAgent ?? null,
    },
  });
}
