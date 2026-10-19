import type { IconName } from "@/ui/primitives";
import type { Permission } from "@/modules/authz/permissions";

export interface AdminNavItem {
  key: string;
  label: string;
  icon: IconName;
  href: string;
  /** Permission needed to SEE this item. Undefined = visible to any staff. */
  permission?: Permission;
}

/**
 * Admin navigation. Items are filtered by the actor's permissions in the admin
 * layout so each person only sees what they can use (UX). Server-side
 * authorization on each page is the real gate (defense in depth).
 */
export const ADMIN_NAV: AdminNavItem[] = [
  { key: "dashboard", label: "Dashboard", icon: "LayoutDashboard", href: "/dashboard" },
  { key: "customers", label: "Customers", icon: "Users", href: "/customers", permission: "customers:read" },
  { key: "shipments", label: "Shipments", icon: "Package", href: "/shipments", permission: "shipments:read" },
  { key: "operations", label: "Operations", icon: "Truck", href: "/operations", permission: "operations:read" },
  { key: "finance", label: "Finance", icon: "Wallet", href: "/finance", permission: "invoices:read" },
  { key: "transfer", label: "Transfer", icon: "ArrowLeftRight", href: "/transfer", permission: "transfer:read" },
  { key: "documents", label: "Documents", icon: "FileText", href: "/documents", permission: "documents:read" },
  { key: "reports", label: "Reports", icon: "ChartPie", href: "/reports", permission: "reports:read" },
  { key: "users", label: "Users & Team", icon: "UserCog", href: "/users", permission: "users:read" },
  { key: "notifications", label: "Notifications", icon: "Bell", href: "/notifications", permission: "notifications:read" },
  { key: "settings", label: "Settings", icon: "Settings", href: "/settings", permission: "settings:read" },
];
