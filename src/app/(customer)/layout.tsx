import Image from "next/image";
import Link from "next/link";
import { LangToggle } from "@/i18n/LangToggle";

/**
 * Customer-facing layout: navy top bar with the reversed logo, matching the
 * design system's portal header. Auth/self-scoping is added in later phases.
 */
export default function CustomerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <header
        style={{
          height: 68,
          flex: "none",
          display: "flex",
          alignItems: "center",
          gap: 16,
          padding: "0 32px",
          background: "var(--navy-700)",
        }}
      >
        <Link href="/" style={{ display: "inline-flex", alignItems: "center" }}>
          <Image
            src="/brand/orbit-logo-reversed.png"
            alt="OrbitCargo"
            width={140}
            height={36}
            style={{ height: 36, width: "auto" }}
            priority
          />
        </Link>
        <div style={{ flex: 1 }} />
        <LangToggle dark />
      </header>
      <main style={{ flex: 1 }}>{children}</main>
    </div>
  );
}
