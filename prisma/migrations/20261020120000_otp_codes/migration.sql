-- CreateEnum
CREATE TYPE "OtpPurpose" AS ENUM ('CUSTOMER_ACCESS', 'CUSTOMER_SIGNUP', 'STAFF_SETUP');

-- CreateTable
CREATE TABLE "OtpCode" (
    "id" TEXT NOT NULL,
    "purpose" "OtpPurpose" NOT NULL,
    "email" TEXT NOT NULL,
    "userId" TEXT,
    "payload" JSONB,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtpCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OtpCode_email_purpose_createdAt_idx" ON "OtpCode"("email", "purpose", "createdAt");


-- Integrity: attempts never negative; a code always expires after it was created.
ALTER TABLE "OtpCode" ADD CONSTRAINT "OtpCode_chk" CHECK ("attempts" >= 0 AND "expiresAt" > "createdAt");
