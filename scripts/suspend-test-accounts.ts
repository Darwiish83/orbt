/**
 * Suspend the demo / test accounts that earlier phases created in the dev
 * database (owner decision 2026-10-27: leave test data behind). Reversible —
 * nothing is deleted:
 *  - staff users → SUSPENDED (sessions revoked), employee → inactive
 *  - test customers → SUSPENDED (and their portal users)
 *  - the test-only "ops_tester" role is removed from everyone
 *
 *   npx tsx scripts/suspend-test-accounts.ts           (dry run: shows what would change)
 *   npx tsx scripts/suspend-test-accounts.ts --apply   (does it; audited)
 *
 * The E2E suite now uses its own database (E2E_DATABASE_URL), so it never
 * recreates these accounts in the real one.
 */
import { PrismaClient } from "@prisma/client";
import { logAudit } from "../src/modules/audit/log";

const prisma = new PrismaClient();

const TEST_STAFF = [
  "tester@orbit.so",
  "support@demo.so",
  "opsadmin@demo.so",
  "opsstaff@demo.so",
  "finstaff@demo.so",
  "finadmin@demo.so",
  "docs@demo.so",
  "reports@demo.so",
  "e2e-admin@orbit.so",
];
const TEST_CUSTOMER_REFS = ["OR-DEMO", "OR-3005", "OR-E2E"];
const TEST_CUSTOMER_NAME_PREFIX = "E2E Customer ";
const TEST_ROLE = "ops_tester";

async function main() {
  const apply = process.argv.includes("--apply");

  const staff = await prisma.user.findMany({
    where: { email: { in: TEST_STAFF }, status: { not: "SUSPENDED" } },
    select: { id: true, email: true, employeeId: true },
  });
  const customers = await prisma.customer.findMany({
    where: {
      status: { not: "SUSPENDED" },
      OR: [{ ref: { in: TEST_CUSTOMER_REFS } }, { name: { startsWith: TEST_CUSTOMER_NAME_PREFIX } }],
    },
    select: { id: true, ref: true, name: true, user: { select: { id: true } } },
  });
  const testRole = await prisma.role.findUnique({ where: { key: TEST_ROLE } });
  const roleLinks = testRole ? await prisma.userRole.count({ where: { roleId: testRole.id } }) : 0;

  console.log(`Staff to suspend (${staff.length}): ${staff.map((s) => s.email).join(", ") || "—"}`);
  console.log(`Customers to suspend (${customers.length}): ${customers.map((c) => c.ref).join(", ") || "—"}`);
  console.log(`"${TEST_ROLE}" role assignments to remove: ${roleLinks}`);
  if (!apply) {
    console.log("\nDry run. Re-run with --apply to make these changes.");
    return;
  }

  await prisma.$transaction(async (tx) => {
    for (const s of staff) {
      await tx.user.update({ where: { id: s.id }, data: { status: "SUSPENDED", sessionEpoch: { increment: 1 } } });
      if (s.employeeId) await tx.employee.update({ where: { id: s.employeeId }, data: { active: false } });
      await logAudit(tx, { action: "user.suspend_test_account", entityType: "User", entityId: s.id, metadata: { email: s.email } });
    }
    for (const c of customers) {
      await tx.customer.update({ where: { id: c.id }, data: { status: "SUSPENDED" } });
      if (c.user) await tx.user.update({ where: { id: c.user.id }, data: { status: "SUSPENDED", sessionEpoch: { increment: 1 } } });
      await logAudit(tx, { action: "customer.suspend_test_account", entityType: "Customer", entityId: c.id, metadata: { ref: c.ref } });
    }
    if (testRole) await tx.userRole.deleteMany({ where: { roleId: testRole.id } });
  });
  console.log("\nDone. Undo any account from Users & Team / Customers (set Active) if needed.");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e instanceof Error ? e.message : e);
    await prisma.$disconnect();
    process.exit(1);
  });
