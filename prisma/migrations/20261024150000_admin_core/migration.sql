-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "accessFrom" TIMESTAMP(3),
ADD COLUMN     "accessUntil" TIMESTAMP(3),
ADD COLUMN     "accountingAccess" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "transferCountries" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "details" JSONB,
ADD COLUMN     "imageKey" TEXT,
ADD COLUMN     "imageType" TEXT;

-- AlterTable
ALTER TABLE "ShipmentLine" ADD COLUMN     "notifiedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "lastLoginAt" TIMESTAMP(3);

