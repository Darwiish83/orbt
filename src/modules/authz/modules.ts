import type { AccessLevel } from "@prisma/client";
import { PERMISSIONS, type Permission } from "./permissions";

/**
 * Admin modules for Users & Team → Access Control (spec §5): each module is
 * set per employee to No access, View only or Full. A module maps to the
 * permission resources it uses; the override is applied on the server when the
 * user is loaded (loadAuthzUser), so hidden menus are never the only guard.
 * Accounting and Money Transfer use their own special-access settings.
 */
export interface AdminModule {
  key: string;
  label: string;
  resources: string[];
  /** Extra permissions outside the module's resources. */
  extra?: Permission[];
  /** Permissions of these resources that belong to another module. */
  exclude?: Permission[];
}

export const ADMIN_MODULES: AdminModule[] = [
  { key: "dashboard", label: "Dashboard", resources: [] },
  { key: "users", label: "Users & Team", resources: ["users", "audit"] },
  { key: "customers", label: "Customers", resources: ["customers"] },
  { key: "shipments", label: "Shipments", resources: ["shipments"], exclude: ["shipments:status"] },
  { key: "operations", label: "Operations", resources: ["operations"], extra: ["shipments:status", "shipments:read"] },
  { key: "finance", label: "Finance", resources: ["invoices", "payments", "quotes"] },
  { key: "documents", label: "Documents", resources: ["documents"] },
  { key: "reports", label: "Reports", resources: ["reports"] },
  { key: "notifications", label: "Notifications", resources: ["notifications"] },
  { key: "settings", label: "Settings", resources: ["settings"] },
  // Accounting cost sheets (spec §11): each filled by its own staff only.
  { key: "costorigin", label: "Operation cost (Origin)", resources: ["costorigin"] },
  { key: "costmgq", label: "Operation cost (MGQ)", resources: ["costmgq"] },
];

export const MODULE_KEYS = ADMIN_MODULES.map((m) => m.key);

/** Every permission a module controls. */
export function modulePermissions(m: AdminModule): Permission[] {
  const own = PERMISSIONS.filter((p) => m.resources.includes(p.split(":")[0]!) && !(m.exclude ?? []).includes(p));
  return [...new Set([...own, ...(m.extra ?? [])])];
}

/** The read permissions a "View only" module keeps. */
function viewPermissions(m: AdminModule): Permission[] {
  return modulePermissions(m).filter((p) => p.endsWith(":read"));
}

/**
 * Apply per-employee module overrides to the role permissions:
 * NONE removes the module, VIEW keeps read only, EDIT (Full) grants it all.
 * Modules without an override keep what the roles give.
 */
export function applyModuleAccess(permissions: Set<string>, overrides: { page: string; level: AccessLevel }[]): Set<string> {
  const out = new Set(permissions);
  for (const o of overrides) {
    const m = ADMIN_MODULES.find((x) => x.key === o.page);
    if (!m) continue;
    const all = modulePermissions(m);
    if (o.level === "NONE") for (const p of all) out.delete(p);
    else if (o.level === "VIEW") {
      for (const p of all) out.delete(p);
      for (const p of viewPermissions(m)) out.add(p);
    } else for (const p of all) out.add(p);
  }
  return out;
}

/** The level a set of permissions gives a module (for showing role defaults). */
export function moduleLevel(permissions: Set<string>, m: AdminModule): AccessLevel {
  const all = modulePermissions(m);
  if (all.length === 0) return "EDIT";
  if (all.some((p) => !p.endsWith(":read") && permissions.has(p))) return "EDIT";
  if (all.some((p) => permissions.has(p))) return "VIEW";
  return "NONE";
}
