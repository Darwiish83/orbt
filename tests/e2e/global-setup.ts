import { readFileSync } from "node:fs";
import { hash } from "@node-rs/argon2";
import { PrismaClient } from "@prisma/client";
import { E2E_EMAIL, E2E_PASSWORD } from "./constants";

/** Ensure a known ACTIVE admin exists in the dev DB for the auth E2E flow. */
function devDatabaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const raw = readFileSync(".env", "utf8");
  const m = /^DATABASE_URL="?([^"\n]+)"?/m.exec(raw);
  if (!m) throw new Error("DATABASE_URL not found for E2E global setup");
  return m[1]!;
}

export default async function globalSetup() {
  const prisma = new PrismaClient({ datasources: { db: { url: devDatabaseUrl() } } });
  try {
    const passwordHash = await hash(E2E_PASSWORD, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
    await prisma.user.upsert({
      where: { email: E2E_EMAIL },
      update: { passwordHash, status: "ACTIVE" },
      create: { email: E2E_EMAIL, passwordHash, status: "ACTIVE" },
    });
  } finally {
    await prisma.$disconnect();
  }
}
