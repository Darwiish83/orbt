import { ValidationError } from "@/lib/errors";

/**
 * Upload validation: allowed types, size cap, and magic-byte content sniffing
 * so the declared content type must match the actual bytes.
 */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MiB

export const ALLOWED_TYPES = {
  "application/pdf": [[0x25, 0x50, 0x44, 0x46]], // %PDF
  "image/png": [[0x89, 0x50, 0x4e, 0x47]],
  "image/jpeg": [[0xff, 0xd8, 0xff]],
  "image/webp": [[0x52, 0x49, 0x46, 0x46]], // RIFF (….WEBP)
} as const;

export type AllowedType = keyof typeof ALLOWED_TYPES;

function matchesMagic(buffer: Buffer, signatures: readonly (readonly number[])[]): boolean {
  return signatures.some((sig) => sig.every((byte, i) => buffer[i] === byte));
}

/** Detect the content type from the leading bytes, or null if unrecognized. */
export function sniffContentType(buffer: Buffer): AllowedType | null {
  for (const [type, signatures] of Object.entries(ALLOWED_TYPES) as [AllowedType, readonly (readonly number[])[]][]) {
    if (matchesMagic(buffer, signatures)) {
      if (type === "image/webp") {
        // RIFF container — confirm the WEBP fourCC at offset 8.
        if (buffer.subarray(8, 12).toString("ascii") === "WEBP") return type;
        continue;
      }
      return type;
    }
  }
  return null;
}

/** Sanitize a user-supplied filename for display/download only (never used as a
 * storage key). Strips path separators and control characters. */
export function sanitizeFilename(name: string): string {
  const base = name.replace(/[\\/]/g, "_").replace(/[\u0000-\u001f]/g, "").trim();
  return base.slice(0, 180) || "document";
}

export interface ValidatedUpload {
  contentType: AllowedType;
  size: number;
}

/**
 * Validate an upload. Throws ValidationError on: empty, too large, unrecognized
 * content, or a declared type that disagrees with the sniffed bytes.
 */
export function validateUpload(buffer: Buffer, declaredType: string): ValidatedUpload {
  if (buffer.length === 0) throw new ValidationError("Empty file");
  if (buffer.length > MAX_UPLOAD_BYTES) throw new ValidationError("File exceeds the 10 MB limit");

  const sniffed = sniffContentType(buffer);
  if (!sniffed) throw new ValidationError("Unsupported or unrecognized file type");
  if (declaredType && declaredType !== sniffed) {
    throw new ValidationError("File content does not match its declared type");
  }
  return { contentType: sniffed, size: buffer.length };
}
