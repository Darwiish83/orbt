import { execSync } from "node:child_process";
import { hash } from "@node-rs/argon2";
import { PrismaClient } from "@prisma/client";
import {
  E2E_CUSTOMER_EMAIL,
  E2E_CUSTOMER_PASSWORD,
  E2E_CUSTOMER_REF,
  E2E_EMAIL,
  E2E_EMPLOYEE_ID,
  E2E_PASSWORD,
} from "./constants";
import { e2eEnv } from "./env";

export default async function globalSetup() {
  // The E2E database is separate from the development one; bring it up to the
  // current schema and reference data before seeding the test accounts.
  // Migrations run as the owner role (directUrl); the seed runs as the app.
  const url = e2eEnv("E2E_DATABASE_URL");
  const ownerUrl = e2eEnv("E2E_MIGRATION_DATABASE_URL");
  const env = { ...process.env, DATABASE_URL: url, MIGRATION_DATABASE_URL: ownerUrl };
  execSync("npx prisma migrate deploy", { env, stdio: "ignore" });
  execSync("npx tsx prisma/seed.ts", { env, stdio: "ignore" });

  // Fixtures are written as the owner: the app's role may not delete login
  // history (ADR-029), and clearing the E2E accounts' failures needs that.
  const prisma = new PrismaClient({ datasources: { db: { url: ownerUrl } } });
  try {
    // Negative login tests record failures; clear them for the E2E accounts only
    // so repeated runs never trip the 5-failure rate limit.
    await prisma.loginAttempt.deleteMany({
      where: {
        identifier: {
          in: [E2E_EMAIL, E2E_CUSTOMER_EMAIL, E2E_CUSTOMER_REF, E2E_EMPLOYEE_ID, "OR-9999", "EMP-001", "EMP-9999"].map((v) =>
            v.toLowerCase(),
          ),
        },
      },
    });
    const passwordHash = await hash(E2E_PASSWORD, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
    const user = await prisma.user.upsert({
      where: { email: E2E_EMAIL },
      update: { passwordHash, status: "ACTIVE", lockedUntil: null },
      create: { email: E2E_EMAIL, passwordHash, status: "ACTIVE" },
    });
    // Grant super_admin so the write-path E2E (create customer) is authorized.
    const role = await prisma.role.upsert({
      where: { key: "super_admin" },
      update: {},
      create: { key: "super_admin", name: "Super Admin", isSystem: true },
    });
    const existing = await prisma.userRole.findFirst({ where: { userId: user.id, roleId: role.id } });
    if (!existing) await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });

    // Staff sign in with an Employee ID: give the admin a fixed one.
    if (user.employeeId) {
      await prisma.employee.update({ where: { id: user.employeeId }, data: { code: E2E_EMPLOYEE_ID, active: true } });
    } else {
      const emp = await prisma.employee.upsert({
        where: { code: E2E_EMPLOYEE_ID },
        update: { active: true },
        create: { code: E2E_EMPLOYEE_ID, name: "E2E Admin", email: E2E_EMAIL, department: "MANAGEMENT" },
      });
      await prisma.user.update({ where: { id: user.id }, data: { employeeId: emp.id } });
    }

    // A customer principal for the portal E2E.
    const customer = await prisma.customer.upsert({
      where: { ref: E2E_CUSTOMER_REF },
      update: { status: "ACTIVE" },
      create: { ref: E2E_CUSTOMER_REF, name: "E2E Customer Co" },
    });
    const custHash = await hash(E2E_CUSTOMER_PASSWORD, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
    await prisma.user.upsert({
      where: { email: E2E_CUSTOMER_EMAIL },
      update: { passwordHash: custHash, status: "ACTIVE", customerId: customer.id },
      create: { email: E2E_CUSTOMER_EMAIL, passwordHash: custHash, status: "ACTIVE", customerId: customer.id },
    });

    // Once per E2E database: one invoice with a payment, so the portal can show
    // "Invoice PDF" and a receipt. Made through the real services, as the app.
    if (!(await prisma.invoice.count({ where: { customerId: customer.id } }))) {
      await seedCustomerInvoice(url, user.id, customer.id);
    }
  } finally {
    await prisma.$disconnect();
  }
}

async function seedCustomerInvoice(url: string, adminUserId: string, customerId: string) {
  const { loadAuthzUser } = await import("../../src/modules/authz/core");
  const { addShipmentLine, createShipment } = await import("../../src/modules/shipments/service");
  const { addShipmentPayment, createShipmentInvoice } = await import("../../src/modules/finance/shipmentFinance");
  const db = new PrismaClient({ datasources: { db: { url } } });
  try {
    const admin = (await loadAuthzUser(db, adminUserId))!;
    const shipment = await createShipment(db, admin, { mode: "AIR", originCountry: "Turkey", businessYear: 2026 });
    await addShipmentLine(db, admin, shipment.id, { customerId, packages: 2, chargeableWeightKg: "20", rate: "6" });
    const invoice = await createShipmentInvoice(db, admin, { shipmentId: shipment.id, customerId, billedMeasure: "20", baseRate: "6" });
    const bank = await db.bank.findUniqueOrThrow({ where: { name: "Salaam Bank" } });
    await addShipmentPayment(db, admin, { invoiceId: invoice.id, amount: "50", bankId: bank.id, receivedAt: new Date("2026-10-05T12:00:00Z") });
  } finally {
    await db.$disconnect();
  }
}
