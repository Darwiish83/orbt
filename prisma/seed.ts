/**
 * Reference-data seed (idempotent). Seeds ONLY reference data the app needs —
 * roles, the permission catalogue, banks, countries and the business year — not fake customers/shipments/
 * payments. Safe to run repeatedly (upserts). The role→permission mapping is a
 * baseline from docs/security/PERMISSION_MATRIX.md and is finalized in Phase 3.
 *
 * Run: `npx prisma db seed`
 */
import { PrismaClient } from "@prisma/client";
import { seedReferenceData } from "../src/modules/reference/data";

const prisma = new PrismaClient();

// Roles — the DS 7-role set (ADR-001) plus Super Admin and Customer.
const ROLES: { key: string; name: string }[] = [
  { key: "super_admin", name: "Super Admin" },
  { key: "operation_admin", name: "Operation Admin" },
  { key: "operation_staff", name: "Operation Staff" },
  { key: "finance_admin", name: "Finance Admin" },
  { key: "finance_staff", name: "Finance Staff" },
  { key: "customer_support", name: "Customer Support" },
  { key: "document_officer", name: "Document Officer" },
  { key: "report_manager", name: "Report Manager" },
  { key: "customer", name: "Customer" },
];

// Permission catalogue (resource:action).
const PERMISSIONS: string[] = [
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
  // Customer self-scope (object-level ownership enforced in services, Phase 3+).
  "self:read",
  "self:write",
];

// Baseline role → permission mapping (provisional; finalized Phase 3).
const ROLE_PERMISSIONS: Record<string, string[] | "*"> = {
  super_admin: "*",
  operation_admin: [
    "customers:write",
    "shipments:manage",
    "shipments:status",
    "operations:write",
    "transfer:write",
    "documents:read",
    "notifications:write",
    "reports:read",
    "users:write",
    "settings:read",
    "audit:read",
  ],
  operation_staff: [
    "customers:read",
    "shipments:write",
    "shipments:status",
    "operations:write",
    "transfer:write",
    "documents:read",
    "notifications:read",
    "reports:read",
  ],
  finance_admin: [
    "customers:read",
    "shipments:read",
    "quotes:manage",
    "invoices:manage",
    "payments:manage",
    "documents:read",
    "reports:read",
    "settings:read",
    "audit:read",
  ],
  finance_staff: [
    "customers:read",
    "shipments:read",
    "quotes:write",
    "invoices:write",
    "payments:write",
    "documents:read",
    "reports:read",
  ],
  customer_support: [
    "customers:write",
    "shipments:read",
    "quotes:read",
    "invoices:read",
    "documents:read",
    "notifications:write",
  ],
  document_officer: ["documents:manage", "shipments:read", "customers:read"],
  report_manager: ["reports:manage", "shipments:read", "customers:read", "audit:read"],
  customer: ["self:read", "self:write"],
};

async function main() {
  // Permissions
  for (const key of PERMISSIONS) {
    await prisma.permission.upsert({ where: { key }, create: { key }, update: {} });
  }

  // Roles
  for (const role of ROLES) {
    await prisma.role.upsert({
      where: { key: role.key },
      create: { key: role.key, name: role.name, isSystem: true },
      update: { name: role.name, isSystem: true },
    });
  }

  // Role → permission links
  const allPermissions = await prisma.permission.findMany();
  const permByKey = new Map(allPermissions.map((p) => [p.key, p.id]));

  for (const [roleKey, perms] of Object.entries(ROLE_PERMISSIONS)) {
    const role = await prisma.role.findUniqueOrThrow({ where: { key: roleKey } });
    const keys = perms === "*" ? PERMISSIONS : perms;
    for (const permKey of keys) {
      const permissionId = permByKey.get(permKey);
      if (!permissionId) throw new Error(`Unknown permission "${permKey}" for role "${roleKey}"`);
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId } },
        create: { roleId: role.id, permissionId },
        update: {},
      });
    }
  }

  // Banks, countries, business year (Phase 11).
  await seedReferenceData(prisma);

  const [roleCount, permCount, linkCount] = await Promise.all([
    prisma.role.count(),
    prisma.permission.count(),
    prisma.rolePermission.count(),
  ]);
  console.log(`Seeded ${roleCount} roles, ${permCount} permissions, ${linkCount} role-permission links.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
