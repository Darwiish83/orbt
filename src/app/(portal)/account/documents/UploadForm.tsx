"use client";

import { useActionState } from "react";
import { Button, Icon } from "@/ui/primitives";
import { uploadDocumentAction, type UploadState } from "./actions";

const initial: UploadState = { error: null };

export function UploadForm() {
  const [state, action, pending] = useActionState(uploadDocumentAction, initial);

  return (
    <form
      action={action}
      style={{
        background: "var(--surface-card)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-l)",
        boxShadow: "var(--shadow-1)",
        padding: 20,
        display: "flex",
        flexWrap: "wrap",
        gap: 12,
        alignItems: "center",
      }}
    >
      <input
        type="file"
        name="file"
        accept=".pdf,.png,.jpg,.jpeg,.webp"
        required
        style={{ font: "400 14px var(--font-body)", color: "var(--text-body)" }}
      />
      <Button type="submit" disabled={pending} leadingIcon={<Icon name="Upload" size={16} />}>
        {pending ? "Uploading…" : "Upload"}
      </Button>
      <span style={{ fontSize: 12, color: "var(--text-muted)" }}>PDF or image, up to 10 MB.</span>
      {state.error && (
        <div role="alert" style={{ flexBasis: "100%", color: "var(--status-danger)", fontSize: 13 }}>
          {state.error}
        </div>
      )}
      {state.ok && (
        <div role="status" style={{ flexBasis: "100%", color: "var(--status-success)", fontSize: 13 }}>
          Document uploaded.
        </div>
      )}
    </form>
  );
}
