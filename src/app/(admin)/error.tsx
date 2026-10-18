"use client";

import { Button } from "@/ui/primitives";

export default function AdminError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div
      style={{
        background: "var(--surface-card)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-l)",
        boxShadow: "var(--shadow-1)",
        padding: 32,
        textAlign: "center",
        maxWidth: 480,
        margin: "40px auto",
      }}
    >
      <h2 style={{ font: "700 19px var(--font-display)", color: "var(--text-strong)", margin: "0 0 8px" }}>
        Something went wrong
      </h2>
      <p style={{ color: "var(--text-muted)", fontSize: 14, margin: "0 0 20px" }}>
        The page could not be loaded. Please try again.
      </p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
