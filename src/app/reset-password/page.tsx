import Link from "next/link";
import { ResetForm } from "./ResetForm";

export const metadata = { title: "Set a new password" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--surface-page)", padding: 24 }}>
      <div
        style={{
          width: "100%",
          maxWidth: 400,
          // App layout, not a DS component: size includes padding (preflight is off).
          boxSizing: "border-box",
          background: "var(--surface-card)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-l)",
          boxShadow: "var(--shadow-2)",
          borderTop: "4px solid var(--orange-500)",
          padding: 32,
        }}
      >
        <h1 style={{ font: "700 22px/1.2 var(--font-display)", color: "var(--text-strong)", margin: "0 0 16px" }}>
          Set a new password
        </h1>
        {token ? (
          <ResetForm token={token} />
        ) : (
          <>
            <p style={{ fontSize: 14, color: "var(--text-muted)", margin: "0 0 20px" }}>
              This link is missing its token. Request a new reset email.
            </p>
            <Link href="/forgot-password" style={{ color: "var(--navy-700)", fontWeight: 600 }}>
              Request a reset link
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
