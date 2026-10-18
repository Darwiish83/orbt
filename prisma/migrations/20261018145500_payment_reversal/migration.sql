-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "reversalReason" TEXT,
ADD COLUMN     "reversedAt" TIMESTAMP(3);
