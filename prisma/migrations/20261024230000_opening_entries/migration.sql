-- CreateEnum
CREATE TYPE "OpeningSource" AS ENUM ('PROFIT', 'TRANSFER', 'COMMISSION', 'SOMALI_TRANSPORT', 'MAHAD', 'DEBT', 'SHIPMENT_COST', 'OTHER');

-- AlterTable
ALTER TABLE "DebtReturn" ADD COLUMN     "openingEntryId" TEXT,
ALTER COLUMN "cashOutId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "OpeningEntry" (
    "id" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "fromYear" INTEGER NOT NULL,
    "source" "OpeningSource" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "bankId" TEXT,
    "person" TEXT,
    "note" TEXT,
    "carried" BOOLEAN NOT NULL DEFAULT false,
    "actorUserId" TEXT,
    "reversedAt" TIMESTAMP(3),
    "reversedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OpeningEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OpeningEntry_country_year_idx" ON "OpeningEntry"("country", "year");

-- CreateIndex
CREATE INDEX "DebtReturn_openingEntryId_idx" ON "DebtReturn"("openingEntryId");

-- AddForeignKey
ALTER TABLE "DebtReturn" ADD CONSTRAINT "DebtReturn_openingEntryId_fkey" FOREIGN KEY ("openingEntryId") REFERENCES "OpeningEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpeningEntry" ADD CONSTRAINT "OpeningEntry_bankId_fkey" FOREIGN KEY ("bankId") REFERENCES "Bank"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Rules the app also enforces (defence in depth)
ALTER TABLE "OpeningEntry" ADD CONSTRAINT "OpeningEntry_amount_nonzero" CHECK ("amount" <> 0);
ALTER TABLE "OpeningEntry" ADD CONSTRAINT "OpeningEntry_from_earlier_year" CHECK ("fromYear" < "year");
ALTER TABLE "OpeningEntry" ADD CONSTRAINT "OpeningEntry_debt_shape" CHECK ("source" <> 'DEBT' OR ("amount" > 0 AND "person" IS NOT NULL AND "bankId" IS NULL));
ALTER TABLE "DebtReturn" ADD CONSTRAINT "DebtReturn_one_debt" CHECK (num_nonnulls("cashOutId", "openingEntryId") = 1);
