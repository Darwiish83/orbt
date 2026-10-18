import { AdminShell } from "@/components/admin/AdminShell";

/**
 * Admin route group layout. In Phase 3 this gains server-side authentication +
 * authorization (deny-by-default); for now it provides the shell chrome only.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
