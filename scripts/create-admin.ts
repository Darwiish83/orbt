/**
 * DEV-ONLY helper to create a Super Admin user for local verification.
 * NOT part of the production seed. Run reference seed first (`npm run db:seed`)
 * so the `super_admin` role exists.
 *
 * Usage:
 *   npx tsx scripts/create-admin.ts <email> <password>
 */
import { hash } from "@node-rs/argon2";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const [email, password] = process.argv.slice(2);
  if (!email || !password) {
    console.error("Usage: tsx scripts/create-admin.ts <email> <password>");
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("Password must be at least 8 characters.");
    process.exit(1);
  }

  const passwordHash = await hash(password, {
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });

  const user = await prisma.user.upsert({
    where: { email: email.toLowerCase() },
    update: { passwordHash, status: "ACTIVE" },
    create: { email: email.toLowerCase(), passwordHash, status: "ACTIVE" },
  });

  const role = await prisma.role.findUnique({ where: { key: "super_admin" } });
  if (!role) {
    console.error("super_admin role missing — run `npm run db:seed` first.");
    process.exit(1);
  }
  const existing = await prisma.userRole.findFirst({ where: { userId: user.id, roleId: role.id } });
  if (!existing) {
    await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
  }

  console.log(`Super Admin ready: ${user.email}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
