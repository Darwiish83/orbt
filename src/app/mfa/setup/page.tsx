import { redirect } from "next/navigation";
import QRCode from "qrcode";
import Image from "next/image";
import { prisma } from "@/db/client";
import { getSessionUser } from "@/modules/authz/session";
import { getOrStartSetup } from "@/modules/auth/mfa";
import { ConfirmMfaForm } from "./ConfirmMfaForm";

export const metadata = { title: "Set up two-factor" };

export default async function MfaSetupPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.mfaEnabled) redirect("/dashboard");

  const { secret, otpauthUri } = await getOrStartSetup(prisma, user.id, user.email);
  const qr = await QRCode.toDataURL(otpauthUri, { margin: 1, width: 200 });

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--surface-page)", padding: 24 }}>
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          background: "var(--surface-card)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-l)",
          boxShadow: "var(--shadow-2)",
          borderTop: "4px solid var(--orange-500)",
          padding: 32,
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <div>
          <h1 style={{ font: "700 22px/1.2 var(--font-display)", color: "var(--text-strong)", margin: "0 0 4px" }}>
            Set up two-factor authentication
          </h1>
          <p style={{ fontSize: 14, color: "var(--text-muted)", margin: 0 }}>
            Your account requires a second factor. Scan this with an authenticator app (Google
            Authenticator, 1Password, Authy…).
          </p>
        </div>

        <div style={{ display: "flex", justifyContent: "center" }}>
          <Image src={qr} alt="Authenticator QR code" width={200} height={200} unoptimized />
        </div>

        <details>
          <summary style={{ fontSize: 13, color: "var(--text-muted)", cursor: "pointer" }}>No scanner? Enter the key manually</summary>
          <code
            style={{
              display: "block",
              marginTop: 8,
              padding: "8px 10px",
              background: "var(--surface-sunken)",
              borderRadius: "var(--radius-s)",
              fontFamily: "var(--font-mono)",
              fontSize: 13,
              wordBreak: "break-all",
            }}
          >
            {secret}
          </code>
        </details>

        <ConfirmMfaForm />
      </div>
    </div>
  );
}
