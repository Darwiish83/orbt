/**
 * DEV/ONE-OFF: give every staff user without an Employee record an Employee
 * ID, so they can use the staff sign-in form (email + password + Employee ID).
 * Additive only — creates Employee rows and links them; never deletes or
 * changes passwords, roles or customers. Safe to re-run (skips linked users).
 *
 *   npx tsx scripts/backfill-employee-ids.ts
 */
import { PrismaClient } from "@prisma/client";
import { ensureEmployeeForUser } from "../src/modules/users/employeeCode";

const prisma = new PrismaClient();

async function main() {
  // Staff = not a customer contact, and holds at least one role.
  const users = await prisma.user.findMany({
    where: { customerId: null, employeeId: null, roles: { some: {} } },
    select: { id: true, email: true },
    orderBy: { createdAt: "asc" },
  });
  if (!users.length) {
    console.log("All staff users already have an Employee ID.");
    return;
  }
  for (const u of users) console.log(`${u.email} → ${await ensureEmployeeForUser(prisma, u.id)}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
