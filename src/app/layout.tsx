import type { Metadata } from "next";
import "./globals.css";
import { archivo, jetbrainsMono } from "./fonts";
import { I18nProvider } from "@/i18n/I18nProvider";

export const metadata: Metadata = {
  title: {
    default: "OrbitCargo",
    template: "%s · OrbitCargo",
  },
  description: "Cargo and logistics management — air, sea and road. Door to door, on time.",
};

// Every page is rendered per request so Next puts this request's CSP nonce on
// its scripts (src/middleware.ts). A page pre-built at build time carries no
// nonce, and the strict CSP ('strict-dynamic') then blocks all of its
// JavaScript in production.
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: the i18n provider syncs <html lang/dir> on the client.
    <html lang="en" suppressHydrationWarning className={`${archivo.variable} ${jetbrainsMono.variable}`}>
      <body>
        <I18nProvider>{children}</I18nProvider>
      </body>
    </html>
  );
}
