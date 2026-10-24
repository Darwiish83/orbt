-- CreateEnum
CREATE TYPE "ReminderKind" AS ENUM ('PAYMENT', 'DEMURRAGE_WARNING');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ChargeCategory" ADD VALUE 'QUALITY';
ALTER TYPE "ChargeCategory" ADD VALUE 'DEMURRAGE';

-- AlterTable
ALTER TABLE "Receipt" ADD COLUMN     "reversedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ShipmentLine" ADD COLUMN     "collectedAt" TIMESTAMP(3),
ADD COLUMN     "extraFreeDays" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "InvoiceRevision" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "before" TEXT NOT NULL,
    "after" TEXT NOT NULL,
    "actorUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentReminder" (
    "id" TEXT NOT NULL,
    "kind" "ReminderKind" NOT NULL,
    "invoiceId" TEXT,
    "shipmentId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "notificationId" TEXT,
    "actorUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentReminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InvoiceRevision_invoiceId_createdAt_idx" ON "InvoiceRevision"("invoiceId", "createdAt");

-- CreateIndex
CREATE INDEX "InvoiceRevision_createdAt_idx" ON "InvoiceRevision"("createdAt");

-- CreateIndex
CREATE INDEX "PaymentReminder_shipmentId_customerId_kind_idx" ON "PaymentReminder"("shipmentId", "customerId", "kind");

-- CreateIndex
CREATE INDEX "PaymentReminder_invoiceId_idx" ON "PaymentReminder"("invoiceId");

-- CreateIndex
CREATE INDEX "Invoice_shipmentId_idx" ON "Invoice"("shipmentId");

-- AddForeignKey
ALTER TABLE "InvoiceRevision" ADD CONSTRAINT "InvoiceRevision_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentReminder" ADD CONSTRAINT "PaymentReminder_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- One live (non-VOID) invoice per customer per shipment (spec B9: the row's
-- "Create Invoice" button becomes ⋮ once invoiced). Partial index: Prisma
-- cannot express it in the schema.
CREATE UNIQUE INDEX "Invoice_shipment_customer_live_key"
  ON "Invoice"("shipmentId", "customerId")
  WHERE "status" <> 'VOID' AND "shipmentId" IS NOT NULL;
