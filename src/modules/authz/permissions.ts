/**
 * Permission catalogue (resource:action). Mirrors prisma/seed.ts and
 * docs/security/PERMISSION_MATRIX.md. Authorization is deny-by-default:
 * nothing is allowed unless a permission grants it.
 */
export const PERMISSIONS = [
  "customers:read",
  "customers:write",
  "customers:manage",
  "shipments:read",
  "shipments:write",
  "shipments:manage",
  "shipments:status",
  "operations:read",
  "operations:write",
  "transfer:read",
  "transfer:write",
  // Money Transfer roles (Phase 17): come from the employee's Receiver / Sender setting.
  "transfer:receive",
  "transfer:send",
  "quotes:read",
  "quotes:write",
  "quotes:manage",
  "invoices:read",
  "invoices:write",
  "invoices:manage",
  "payments:read",
  "payments:write",
  "payments:manage",
  "documents:read",
  "documents:write",
  "documents:manage",
  "notifications:read",
  "notifications:write",
  "reports:read",
  "reports:manage",
  "users:read",
  "users:write",
  "users:manage",
  "settings:read",
  "settings:write",
  "audit:read",
  "self:read",
  "self:write",
  // Accounting (Phase 16): read/write come with the employee's Accounting
  // special access; manage = period closing. Cost sheets have their own editors.
  "accounting:read",
  "accounting:write",
  "accounting:manage",
  "costorigin:write",
  "costmgq:write",
  // Shipment pricing (ADR-036): only this sets Rate, Quality Rate and Brand Rate.
  "pricing:write",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const SUPER_ADMIN_ROLE_KEY = "super_admin";
export const CUSTOMER_ROLE_KEY = "customer";
