import type { IconName } from "@/ui/primitives";

export interface AdminNavItem {
  key: string;
  label: string;
  icon: IconName;
  href: string;
}

/**
 * Admin navigation, mirroring the design system's admin Shell.
 * Presentational only in Phase 1 — role/permission gating is added in Phase 3,
 * at which point items are filtered server-side by the actor's permissions.
 */
export const ADMIN_NAV: AdminNavItem[] = [
  { key: "dashboard", label: "Dashboard", icon: "LayoutDashboard", href: "/dashboard" },
  { key: "customers", label: "Customers", icon: "Users", href: "/customers" },
  { key: "shipments", label: "Shipments", icon: "Package", href: "/shipments" },
  { key: "operations", label: "Operations", icon: "Truck", href: "/operations" },
  { key: "finance", label: "Finance", icon: "Wallet", href: "/finance" },
  { key: "transfer", label: "Transfer", icon: "ArrowLeftRight", href: "/transfer" },
  { key: "documents", label: "Documents", icon: "FileText", href: "/documents" },
  { key: "reports", label: "Reports", icon: "ChartPie", href: "/reports" },
  { key: "users", label: "Users & Team", icon: "UserCog", href: "/users" },
  { key: "notifications", label: "Notifications", icon: "Bell", href: "/notifications" },
  { key: "settings", label: "Settings", icon: "Settings", href: "/settings" },
];
