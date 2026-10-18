"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/db/client";
import { AuthorizationError, ValidationError } from "@/lib/errors";
import { requireUser } from "@/modules/authz/session";
import { uploadDocument } from "@/modules/documents/service";

export type UploadState = { error: string | null; ok?: boolean };

export async function uploadDocumentAction(_prev: UploadState, formData: FormData): Promise<UploadState> {
  const user = await requireUser();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a file to upload" };

  const buffer = Buffer.from(await file.arrayBuffer());
  try {
    await uploadDocument(prisma, user, {
      buffer,
      filename: file.name,
      declaredType: file.type,
      kind: "OTHER",
    });
  } catch (e) {
    if (e instanceof ValidationError) return { error: e.message };
    if (e instanceof AuthorizationError) return { error: "You cannot upload documents here." };
    throw e;
  }
  revalidatePath("/account/documents");
  return { error: null, ok: true };
}
