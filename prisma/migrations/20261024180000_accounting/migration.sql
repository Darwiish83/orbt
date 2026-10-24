-- CreateEnum
CREATE TYPE "CostStage" AS ENUM ('ORIGIN', 'TRANSIT', 'ARRIVED');

-- CreateEnum
CREATE TYPE "OutCategory" AS ENUM ('SHIPMENT_COST', 'EXPENSE', 'COMMISSION', 'TRANSFER', 'DEBT', 'PROFIT_PAYOUT');

-- CreateEnum
CREATE TYPE "Partner" AS ENUM ('SOMALI_TRANSPORT', 'MAHAD');

-- CreateEnum
CREATE TYPE "ClosePeriod" AS ENUM ('H1', 'H2', 'YEAR');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "accountingPinHash" TEXT;

-- CreateTable
CREATE TABLE "ShipmentCostSheet" (
    "shipmentId" TEXT NOT NULL,
    "origin" JSONB NOT NULL DEFAULT '{}',
    "mgq" JSONB NOT NULL DEFAULT '{}',
    "originUpdatedBy" TEXT,
    "mgqUpdatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShipmentCostSheet_pkey" PRIMARY KEY ("shipmentId")
);

-- CreateTable
CREATE TABLE "CashOut" (
    "id" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "category" "OutCategory" NOT NULL,
    "shipmentId" TEXT,
    "stage" "CostStage",
    "partner" "Partner",
    "bankId" TEXT NOT NULL,
    "sentTo" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "receiptId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "reversedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashOut_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionPayment" (
    "id" TEXT NOT NULL,
    "cashOutId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "CommissionPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DebtReturn" (
    "id" TEXT NOT NULL,
    "cashOutId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "bankId" TEXT NOT NULL,
    "returnedAt" TIMESTAMP(3) NOT NULL,
    "receiptId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DebtReturn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashCount" (
    "id" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "bankId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "countedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorUserId" TEXT,

    CONSTRAINT "CashCount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PeriodClose" (
    "id" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "period" "ClosePeriod" NOT NULL,
    "fromDate" TIMESTAMP(3) NOT NULL,
    "toDate" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorUserId" TEXT,

    CONSTRAINT "PeriodClose_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpeningBalance" (
    "country" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorUserId" TEXT,

    CONSTRAINT "OpeningBalance_pkey" PRIMARY KEY ("country","year")
);

-- CreateIndex
CREATE UNIQUE INDEX "CashOut_receiptId_key" ON "CashOut"("receiptId");

-- CreateIndex
CREATE INDEX "CashOut_country_year_category_idx" ON "CashOut"("country", "year", "category");

-- CreateIndex
CREATE INDEX "CashOut_shipmentId_idx" ON "CashOut"("shipmentId");

-- CreateIndex
CREATE INDEX "CommissionPayment_invoiceId_idx" ON "CommissionPayment"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "DebtReturn_receiptId_key" ON "DebtReturn"("receiptId");

-- CreateIndex
CREATE INDEX "DebtReturn_cashOutId_idx" ON "DebtReturn"("cashOutId");

-- CreateIndex
CREATE INDEX "CashCount_country_bankId_countedAt_idx" ON "CashCount"("country", "bankId", "countedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PeriodClose_country_year_period_key" ON "PeriodClose"("country", "year", "period");

-- AddForeignKey
ALTER TABLE "ShipmentCostSheet" ADD CONSTRAINT "ShipmentCostSheet_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashOut" ADD CONSTRAINT "CashOut_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashOut" ADD CONSTRAINT "CashOut_bankId_fkey" FOREIGN KEY ("bankId") REFERENCES "Bank"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashOut" ADD CONSTRAINT "CashOut_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "Receipt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionPayment" ADD CONSTRAINT "CommissionPayment_cashOutId_fkey" FOREIGN KEY ("cashOutId") REFERENCES "CashOut"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionPayment" ADD CONSTRAINT "CommissionPayment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtReturn" ADD CONSTRAINT "DebtReturn_cashOutId_fkey" FOREIGN KEY ("cashOutId") REFERENCES "CashOut"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtReturn" ADD CONSTRAINT "DebtReturn_bankId_fkey" FOREIGN KEY ("bankId") REFERENCES "Bank"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtReturn" ADD CONSTRAINT "DebtReturn_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "Receipt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashCount" ADD CONSTRAINT "CashCount_bankId_fkey" FOREIGN KEY ("bankId") REFERENCES "Bank"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Integrity backstops (money is never zero/negative; a debt return is positive).
ALTER TABLE "CashOut" ADD CONSTRAINT "CashOut_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "CommissionPayment" ADD CONSTRAINT "CommissionPayment_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "DebtReturn" ADD CONSTRAINT "DebtReturn_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "CashCount" ADD CONSTRAINT "CashCount_amount_nonneg" CHECK ("amount" >= 0);
-- A stage only on shipment costs; a partner only on profit payouts.
ALTER TABLE "CashOut" ADD CONSTRAINT "CashOut_stage_shape" CHECK (("category" = 'SHIPMENT_COST') = ("stage" IS NOT NULL));
ALTER TABLE "CashOut" ADD CONSTRAINT "CashOut_partner_shape" CHECK (("category" = 'PROFIT_PAYOUT') = ("partner" IS NOT NULL));
