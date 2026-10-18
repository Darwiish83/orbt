// DEV-ONLY: create friendly test accounts for manual exploration.
// Run: node scripts/seed-testers.mjs
import { hash } from "@node-rs/argon2";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const PW = { memoryCost: 19456, timeCost: 2, parallelism: 1 };

const OPS_PERMS = [
  "customers:read", "customers:write", "customers:manage",
  "shipments:read", "shipments:write", "shipments:manage", "shipments:status",
  "operations:read", "operations:write", "transfer:read",
  "quotes:read", "quotes:write", "quotes:manage",
  "invoices:read", "invoices:write", "invoices:manage",
  "payments:read", "payments:write", "payments:manage",
  "documents:read", "documents:write", "documents:manage",
  "notifications:read", "notifications:write", "reports:read",
];

async function main() {
  // A broad, NON-admin role → not "privileged", so it skips the MFA enrollment
  // gate and you can log straight in.
  const role = await prisma.role.upsert({
    where: { key: "ops_tester" },
    update: { name: "Operations Tester" },
    create: { key: "ops_tester", name: "Operations Tester" },
  });
  for (const key of OPS_PERMS) {
    const perm = await prisma.permission.upsert({ where: { key }, create: { key }, update: {} });
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } },
      create: { roleId: role.id, permissionId: perm.id },
      update: {},
    });
  }

  const staffHash = await hash("Test12345", PW);
  const staff = await prisma.user.upsert({
    where: { email: "tester@orbit.so" },
    update: { passwordHash: staffHash, status: "ACTIVE" },
    create: { email: "tester@orbit.so", passwordHash: staffHash, status: "ACTIVE" },
  });
  if (!(await prisma.userRole.findFirst({ where: { userId: staff.id, roleId: role.id } }))) {
    await prisma.userRole.create({ data: { userId: staff.id, roleId: role.id } });
  }

  const customer = await prisma.customer.upsert({
    where: { ref: "OR-DEMO" },
    update: {},
    create: { ref: "OR-DEMO", name: "Demo Importer", country: "Somalia" },
  });
  const custHash = await hash("Cust12345", PW);
  await prisma.user.upsert({
    where: { email: "cust@orbit.so" },
    update: { passwordHash: custHash, status: "ACTIVE", customerId: customer.id },
    create: { email: "cust@orbit.so", passwordHash: custHash, status: "ACTIVE", customerId: customer.id },
  });

  console.log("Staff:    tester@orbit.so / Test12345  (broad access, no MFA)");
  console.log("Customer: cust@orbit.so   / Cust12345  (portal, customer OR-DEMO)");
}

main().then(() => prisma.$disconnect()).catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
