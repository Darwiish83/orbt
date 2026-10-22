-- Phase 11 — data model v2 (ADR-013, ADR-014, ADR-015..ADR-018).
-- Hand-edited: data migration for the 4-status set runs BEFORE the enum swap.

-- ---------------------------------------------------------------- statuses
-- DELIVERED → ARRIVED (ARRIVED is now terminal).
UPDATE "Shipment" SET "status" = 'ARRIVED' WHERE "status" = 'DELIVERED';
UPDATE "ShipmentEvent" SET "status" = 'ARRIVED' WHERE "status" = 'DELIVERED';

-- ON_HOLD → the last non-hold status recorded for the shipment, else AT_ORIGIN_STORE.
UPDATE "Shipment" s SET "status" = COALESCE((
  SELECT e."status" FROM "ShipmentEvent" e
  WHERE e."shipmentId" = s."id" AND e."status" IS NOT NULL AND e."status" <> 'ON_HOLD'
  ORDER BY e."occurredAt" DESC LIMIT 1
), 'AT_ORIGIN_STORE')
WHERE s."status" = 'ON_HOLD';
-- Hold events keep their history as a note; the removed status value is cleared.
UPDATE "ShipmentEvent"
SET "note" = TRIM(BOTH ' ' FROM CONCAT('[legacy ON_HOLD] ', COALESCE("note", ''))), "status" = NULL
WHERE "status" = 'ON_HOLD';

-- Transit is Air-only: a Sea shipment currently "in transit" is DEPARTED.
UPDATE "Shipment" SET "status" = 'DEPARTED' WHERE "mode" = 'SEA' AND "status" = 'IN_TRANSIT';

-- CreateEnum
CREATE TYPE "ReceiptDirection" AS ENUM ('IN', 'OUT');

-- CreateEnum
CREATE TYPE "ReceiptKind" AS ENUM ('PAYMENT', 'EXPENSE', 'SHIPMENT_COST', 'COMMISSION', 'TRANSFER', 'DEBT', 'DEBT_RETURN', 'OTHER');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ChargeCategory" ADD VALUE 'BRAND';
ALTER TYPE "ChargeCategory" ADD VALUE 'FATURA';

-- AlterEnum
BEGIN;
CREATE TYPE "ShipmentStatus_new" AS ENUM ('AT_ORIGIN_STORE', 'DEPARTED', 'IN_TRANSIT', 'ARRIVED');
ALTER TABLE "public"."Shipment" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Shipment" ALTER COLUMN "status" TYPE "ShipmentStatus_new" USING ("status"::text::"ShipmentStatus_new");
ALTER TABLE "ShipmentEvent" ALTER COLUMN "status" TYPE "ShipmentStatus_new" USING ("status"::text::"ShipmentStatus_new");
ALTER TYPE "ShipmentStatus" RENAME TO "ShipmentStatus_old";
ALTER TYPE "ShipmentStatus_new" RENAME TO "ShipmentStatus";
DROP TYPE "public"."ShipmentStatus_old";
ALTER TABLE "Shipment" ALTER COLUMN "status" SET DEFAULT 'AT_ORIGIN_STORE';
COMMIT;

-- AlterTable
ALTER TABLE "AirDetail" ADD COLUMN     "awbKg" DECIMAL(12,3);

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "cargoCategory" TEXT,
ADD COLUMN     "company" TEXT,
ADD COLUMN     "location" TEXT,
ADD COLUMN     "phoneKey" TEXT;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "actualMeasure" DECIMAL(12,3),
ADD COLUMN     "agentName" TEXT,
ADD COLUMN     "agentRate" DECIMAL(14,2),
ADD COLUMN     "baseRate" DECIMAL(14,2),
ADD COLUMN     "billedMeasure" DECIMAL(12,3),
ADD COLUMN     "commissionAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "discount" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "qualityRate" DECIMAL(14,2);

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "bankId" TEXT;

-- AlterTable
ALTER TABLE "Shipment" ADD COLUMN     "arrivalDate" DATE,
ADD COLUMN     "destCode" TEXT,
ADD COLUMN     "shipDate" DATE;

-- AlterTable
ALTER TABLE "ShipmentLine" ADD COLUMN     "brandPcs" INTEGER,
ADD COLUMN     "brandRate" DECIMAL(14,2),
ADD COLUMN     "delivery" DECIMAL(14,2),
ADD COLUMN     "discount" DECIMAL(14,2),
ADD COLUMN     "fatura" DECIMAL(14,2),
ADD COLUMN     "mixCount" INTEGER,
ADD COLUMN     "mixKg" DECIMAL(12,3),
ADD COLUMN     "note" TEXT,
ADD COLUMN     "other" DECIMAL(14,2),
ADD COLUMN     "qualityRate" DECIMAL(14,2),
ADD COLUMN     "rate" DECIMAL(14,2),
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "Bank" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "accountNumber" TEXT,
    "logo" TEXT,
    "isCash" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Bank_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Country" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "iso2" TEXT NOT NULL,
    "isOrigin" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Country_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessYear" (
    "year" INTEGER NOT NULL,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusinessYear_pkey" PRIMARY KEY ("year")
);

-- CreateTable
CREATE TABLE "Receipt" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "direction" "ReceiptDirection" NOT NULL,
    "kind" "ReceiptKind" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "bankId" TEXT,
    "customerId" TEXT,
    "paymentId" TEXT,
    "counterparty" TEXT,
    "note" TEXT,
    "actorUserId" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Receipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReceiptSequence" (
    "year" INTEGER NOT NULL,
    "next" INTEGER NOT NULL DEFAULT 1001,

    CONSTRAINT "ReceiptSequence_pkey" PRIMARY KEY ("year")
);

-- CreateIndex
CREATE UNIQUE INDEX "Bank_name_key" ON "Bank"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Country_name_key" ON "Country"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Country_iso2_key" ON "Country"("iso2");

-- CreateIndex
CREATE UNIQUE INDEX "Receipt_number_key" ON "Receipt"("number");

-- CreateIndex
CREATE UNIQUE INDEX "Receipt_paymentId_key" ON "Receipt"("paymentId");

-- CreateIndex
CREATE INDEX "Receipt_year_kind_idx" ON "Receipt"("year", "kind");

-- CreateIndex
CREATE INDEX "Receipt_customerId_idx" ON "Receipt"("customerId");

-- Backfill phoneKey (digits only). If two existing customers share a phone, only
-- the earliest keeps the key; the others stay NULL for staff to resolve.
UPDATE "Customer" c SET "phoneKey" = k.key
FROM (
  SELECT DISTINCT ON (regexp_replace("phone", '\D', '', 'g'))
    "id", regexp_replace("phone", '\D', '', 'g') AS key
  FROM "Customer"
  WHERE "phone" IS NOT NULL AND regexp_replace("phone", '\D', '', 'g') <> ''
  ORDER BY regexp_replace("phone", '\D', '', 'g'), "createdAt" ASC
) k
WHERE c."id" = k."id";

-- Emails are compared lowercased.
UPDATE "Customer" SET "email" = LOWER("email") WHERE "email" IS NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Customer_phoneKey_key" ON "Customer"("phoneKey");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_email_key" ON "Customer"("email");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_bankId_fkey" FOREIGN KEY ("bankId") REFERENCES "Bank"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_bankId_fkey" FOREIGN KEY ("bankId") REFERENCES "Bank"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ------------------------------------------------------- CHECK constraints
ALTER TABLE "ShipmentLine" ADD CONSTRAINT "ShipmentLine_charges_chk" CHECK (
  ("mixCount" IS NULL OR "mixCount" >= 0) AND ("mixKg" IS NULL OR "mixKg" >= 0) AND
  ("rate" IS NULL OR "rate" >= 0) AND ("qualityRate" IS NULL OR "qualityRate" >= 0) AND
  ("brandPcs" IS NULL OR "brandPcs" >= 0) AND ("brandRate" IS NULL OR "brandRate" >= 0) AND
  ("fatura" IS NULL OR "fatura" >= 0) AND ("delivery" IS NULL OR "delivery" >= 0) AND
  ("other" IS NULL OR "other" >= 0) AND ("discount" IS NULL OR "discount" >= 0)
);
ALTER TABLE "AirDetail" ADD CONSTRAINT "AirDetail_awbKg_chk" CHECK ("awbKg" IS NULL OR "awbKg" >= 0);
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_spec_chk" CHECK (
  "discount" >= 0 AND "commissionAmount" >= 0 AND
  ("actualMeasure" IS NULL OR "actualMeasure" >= 0) AND ("billedMeasure" IS NULL OR "billedMeasure" >= 0) AND
  ("baseRate" IS NULL OR "baseRate" >= 0) AND ("qualityRate" IS NULL OR "qualityRate" >= 0) AND
  ("agentRate" IS NULL OR "agentRate" >= 0)
);
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_amount_chk" CHECK ("amount" > 0);
ALTER TABLE "ReceiptSequence" ADD CONSTRAINT "ReceiptSequence_next_chk" CHECK ("next" >= 1001);
ALTER TABLE "BusinessYear" ADD CONSTRAINT "BusinessYear_range_chk" CHECK ("year" >= 2000 AND "year" <= 2100);
ALTER TABLE "Country" ADD CONSTRAINT "Country_iso2_chk" CHECK ("iso2" ~ '^[a-z]{2}$');
-- At most one current business year.
CREATE UNIQUE INDEX "BusinessYear_one_current" ON "BusinessYear"("isCurrent") WHERE "isCurrent";
