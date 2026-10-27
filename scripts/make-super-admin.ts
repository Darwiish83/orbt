/**
 * Grant the Super Admin role — without ever handling a password.
 *
 *   npx tsx scripts/make-super-admin.ts --employee EMP-003
 *   npx tsx scripts/make-super-admin.ts --email owner@example.com --name "Full Name"
 *
 * The person then sets their own password on /login → "First login or forgot
 * password?" (Employee ID + email → emailed code). If email delivery isn't
 * set up yet, add `--link` and run the command YOURSELF: it prints a one-time
 * set-password link valid for 15 minutes. Open it on this computer only and
 * never share it.
 *
 * Replaces scripts/create-admin.ts, which took the password as a command-line
 * argument (it ended up in shell history).
 */
import { PrismaClient } from "@prisma/client";
import { logAudit } from "../src/modules/audit/log";
import { createSetPasswordToken } from "../src/modules/auth/reset";
import { ensureEmployeeForUser } from "../src/modules/users/employeeCode";

const prisma = new PrismaClient();

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const employeeId = arg("employee")?.trim().toUpperCase();
  const email = arg("email")?.trim().toLowerCase();
  const name = arg("name")?.trim();
  const wantLink = process.argv.includes("--link");
  if (!employeeId && !email) {
    console.error("Usage: --employee EMP-003   or   --email someone@example.com --name \"Full Name\"   [--link]");
    process.exit(1);
  }

  let user = employeeId
    ? (await prisma.employee.findUnique({ where: { code: employeeId }, include: { user: true } }))?.user ?? null
    : await prisma.user.findUnique({ where: { email: email! } });

  if (!user && email) {
    if (!name) throw new Error("--name is required when creating a new staff account");
    user = await prisma.user.create({ data: { email: email, status: "INVITED" } });
    console.log(`Created staff account ${email} (no password yet).`);
  }
  if (!user) throw new Error(`No staff account found for ${employeeId ?? email}`);
  if (user.customerId) throw new Error("That is a customer account; only staff can be Super Admin");
  if (user.status === "SUSPENDED") throw new Error("That account is suspended; reactivate it first");

  const role = await prisma.role.findUnique({ where: { key: "super_admin" } });
  if (!role) throw new Error("super_admin role missing — run `npm run db:seed` first");
  const has = await prisma.userRole.findFirst({ where: { userId: user.id, roleId: role.id } });
  if (!has) await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });

  const code = await ensureEmployeeForUser(prisma, user.id);
  if (name) await prisma.employee.update({ where: { code }, data: { name, department: "MANAGEMENT" } });
  await logAudit(prisma, {
    action: "user.grant_super_admin",
    entityType: "User",
    entityId: user.id,
    metadata: { employeeId: code, via: "scripts/make-super-admin.ts" },
  });
  console.log(`Super Admin: ${user.email} — Employee ID ${code}`);

  if (wantLink) {
    const token = await createSetPasswordToken(prisma, user.id, 15 * 60 * 1000);
    const base = process.env.APP_URL || "http://localhost:3500";
    console.log(`\nOne-time set-password link (15 minutes, single use — don't share):\n${base}/reset-password?token=${encodeURIComponent(token)}\n`);
  } else {
    console.log("Next: /login → \"First login or forgot password?\" → Employee ID + email → code → new password.");
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e instanceof Error ? e.message : e);
    await prisma.$disconnect();
    process.exit(1);
  });
