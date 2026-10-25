-- The signature is now printed on every receipt, like the stamp (owner 2026-10-25): no per-receipt signing.
-- AlterTable
ALTER TABLE "Receipt" DROP COLUMN "signedAt",
DROP COLUMN "signedByUserId";

-- AlterTable
ALTER TABLE "TransferReceipt" DROP COLUMN "signedAt",
DROP COLUMN "signedByUserId";

