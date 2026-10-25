-- AlterTable
ALTER TABLE "Receipt" ADD COLUMN     "signedAt" TIMESTAMP(3),
ADD COLUMN     "signedByUserId" TEXT;

-- CreateTable
CREATE TABLE "TransferReceipt" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "number" INTEGER NOT NULL,
    "country" TEXT NOT NULL,
    "transferRowId" TEXT,
    "customerId" TEXT,
    "receivedFrom" TEXT NOT NULL,
    "receivedAt" DATE NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "fee" DECIMAL(14,2),
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "description" TEXT NOT NULL,
    "signedAt" TIMESTAMP(3),
    "signedByUserId" TEXT,
    "actorUserId" TEXT NOT NULL,
    "voidedAt" TIMESTAMP(3),
    "voidedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransferReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransferReceiptSequence" (
    "year" INTEGER NOT NULL,
    "next" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "TransferReceiptSequence_pkey" PRIMARY KEY ("year")
);

-- CreateIndex
CREATE INDEX "TransferReceipt_customerId_idx" ON "TransferReceipt"("customerId");

-- CreateIndex
CREATE INDEX "TransferReceipt_transferRowId_idx" ON "TransferReceipt"("transferRowId");

-- CreateIndex
CREATE UNIQUE INDEX "TransferReceipt_year_number_key" ON "TransferReceipt"("year", "number");

-- AddForeignKey
ALTER TABLE "TransferReceipt" ADD CONSTRAINT "TransferReceipt_transferRowId_fkey" FOREIGN KEY ("transferRowId") REFERENCES "MoneyTransferRow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferReceipt" ADD CONSTRAINT "TransferReceipt_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- One live (not voided) receipt per Money Transfer row.
CREATE UNIQUE INDEX "TransferReceipt_live_row_key" ON "TransferReceipt"("transferRowId") WHERE "voidedAt" IS NULL AND "transferRowId" IS NOT NULL;

-- A receipt is for a positive amount; a typed fee is not negative.
ALTER TABLE "TransferReceipt" ADD CONSTRAINT "TransferReceipt_amounts" CHECK ("amount" > 0 AND ("fee" IS NULL OR "fee" >= 0) AND "number" > 0);
