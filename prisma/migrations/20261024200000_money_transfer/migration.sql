-- CreateEnum
CREATE TYPE "TransferKind" AS ENUM ('CUSTOMER', 'OPERATION');

-- CreateEnum
CREATE TYPE "TransferTag" AS ENUM ('CLOTHES', 'MEDICINE', 'OTHER');

-- CreateEnum
CREATE TYPE "TransferSendStatus" AS ENUM ('PAID', 'PENDING');

-- CreateTable
CREATE TABLE "MoneyTransferRow" (
    "id" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "kind" "TransferKind" NOT NULL,
    "receivedAt" DATE NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "feePct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "description" TEXT NOT NULL,
    "tag" "TransferTag",
    "receiverUserId" TEXT,
    "handedAt" TIMESTAMP(3),
    "sentAt" DATE,
    "sentAmount" DECIMAL(14,2),
    "sentCurrency" TEXT,
    "sentStatus" "TransferSendStatus",
    "senderUserId" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MoneyTransferRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransferMonth" (
    "country" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorUserId" TEXT,

    CONSTRAINT "TransferMonth_pkey" PRIMARY KEY ("country","year","month")
);

-- CreateIndex
CREATE INDEX "MoneyTransferRow_country_year_month_kind_idx" ON "MoneyTransferRow"("country", "year", "month", "kind");


-- Integrity backstops.
ALTER TABLE "MoneyTransferRow" ADD CONSTRAINT "MoneyTransferRow_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "MoneyTransferRow" ADD CONSTRAINT "MoneyTransferRow_fee_range" CHECK ("feePct" >= 0 AND "feePct" < 100);
ALTER TABLE "MoneyTransferRow" ADD CONSTRAINT "MoneyTransferRow_month_range" CHECK ("month" BETWEEN 1 AND 12);
ALTER TABLE "MoneyTransferRow" ADD CONSTRAINT "MoneyTransferRow_sent_amount_positive" CHECK ("sentAmount" IS NULL OR "sentAmount" > 0);
-- The Sender side exists only after the Receiver handed the money over.
ALTER TABLE "MoneyTransferRow" ADD CONSTRAINT "MoneyTransferRow_sent_after_handed" CHECK ("sentAmount" IS NULL OR "handedAt" IS NOT NULL);
ALTER TABLE "TransferMonth" ADD CONSTRAINT "TransferMonth_month_range" CHECK ("month" BETWEEN 1 AND 12);
