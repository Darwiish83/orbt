"use server";

import { z } from "zod";
import { prisma } from "@/db/client";
import { requireUser } from "@/modules/authz/session";
import { uploadAdminDocument } from "@/modules/documents/admin";
import { softDeleteDocument } from "@/modules/documents/service";
import { searchCustomers } from "@/modules/shipments/manage";
import { runAction } from "../runAction";

export async function uploadDocumentAction(formData: FormData) {
  return runAction(
    "documents",
    async () => {
      const user = await requireUser();
      const v = z
        .object({
          target: z.enum(["customer", "shipment"]),
          customerId: z.string().max(64).optional(),
          shipmentId: z.string().max(64).optional(),
          reference: z.string().trim().max(80).optional(),
          filename: z.string().trim().max(180).optional(),
          kind: z.enum(["INVOICE", "IDENTITY", "CARGO_DOC", "OTHER"]),
          part: z.enum(["ORIGIN_AWB", "TRANSIT_AWB", "CONTAINER"]).optional(),
        })
        .parse({
          target: formData.get("target"),
          customerId: formData.get("customerId") || undefined,
          shipmentId: formData.get("shipmentId") || undefined,
          reference: formData.get("reference") || undefined,
          filename: formData.get("filename") || undefined,
          kind: formData.get("kind"),
          part: formData.get("part") || undefined,
        });
      const file = formData.get("file");
      if (!(file instanceof File) || file.size === 0) throw new z.ZodError([]);
      const doc = await uploadAdminDocument(prisma, user, { ...v, file: { buffer: Buffer.from(await file.arrayBuffer()), name: file.name, type: file.type } });
      return { id: doc.id };
    },
    ["/documents"],
  );
}

export async function deleteDocumentAction(id: string) {
  return runAction(
    "documents",
    async () => {
      const user = await requireUser();
      await softDeleteDocument(prisma, user, z.string().min(1).max(64).parse(id));
    },
    ["/documents"],
  );
}

export async function findCustomersAction(q: string) {
  return runAction("documents", async () => {
    const user = await requireUser();
    return searchCustomers(prisma, user, z.string().max(60).parse(q));
  });
}
