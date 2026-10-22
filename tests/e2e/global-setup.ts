import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { hash } from "@node-rs/argon2";
import { PrismaClient } from "@prisma/client";
import {
  E2E_CUSTOMER_EMAIL,
  E2E_CUSTOMER_PASSWORD,
  E2E_CUSTOMER_REF,
  E2E_EMAIL,
  E2E_EMPLOYEE_ID,
  E2E_MFA_SECRET,
  E2E_PASSWORD,
} from "./constants";

function envValue(name: string): string {
  if (process.env[name]) return process.env[name]!;
  const raw = readFileSync(".env", "utf8");
  const m = new RegExp(`^${name}="?([^"\\n]+)"?`, "m").exec(raw);
  if (!m) throw new Error(`${name} not found for E2E global setup`);
  return m[1]!;
}

// Mirror src/modules/auth/secretCrypto.ts so the app can decrypt the TOTP secret.
function encryptSecret(plain: string, authSecret: string): string {
  const key = createHash("sha256").update(`${authSecret}:mfa`).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

export default async function globalSetup() {
  const prisma = new PrismaClient({ datasources: { db: { url: envValue("DATABASE_URL") } } });
  try {
    const authSecret = envValue("AUTH_SECRET");
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
    // The admin is privileged → MFA is enrolled with a fixed secret so the E2E
    // can produce a live code.
    const mfaSecret = encryptSecret(E2E_MFA_SECRET, authSecret);
    const user = await prisma.user.upsert({
      where: { email: E2E_EMAIL },
      update: { passwordHash, status: "ACTIVE", mfaEnabled: true, mfaSecret },
      create: { email: E2E_EMAIL, passwordHash, status: "ACTIVE", mfaEnabled: true, mfaSecret },
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
  } finally {
    await prisma.$disconnect();
  }
}
