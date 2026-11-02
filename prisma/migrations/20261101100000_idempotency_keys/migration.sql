-- Security finding H3: one record per form submission. Outs, debt returns and
-- Money Receive rows carry the client's UUID idempotency key; the unique index
-- makes the database refuse a second record for the same submission.

-- AlterTable
ALTER TABLE "CashOut" ADD COLUMN     "idempotencyKey" TEXT;

-- AlterTable
ALTER TABLE "DebtReturn" ADD COLUMN     "idempotencyKey" TEXT;

-- AlterTable
ALTER TABLE "MoneyTransferRow" ADD COLUMN     "idempotencyKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "CashOut_idempotencyKey_key" ON "CashOut"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "DebtReturn_idempotencyKey_key" ON "DebtReturn"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "MoneyTransferRow_idempotencyKey_key" ON "MoneyTransferRow"("idempotencyKey");


-- Keys are UUIDs (the forms generate them with crypto.randomUUID()).
ALTER TABLE "CashOut" ADD CONSTRAINT "CashOut_idempotencyKey_uuid" CHECK ("idempotencyKey" IS NULL OR "idempotencyKey" ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$');
ALTER TABLE "DebtReturn" ADD CONSTRAINT "DebtReturn_idempotencyKey_uuid" CHECK ("idempotencyKey" IS NULL OR "idempotencyKey" ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$');
ALTER TABLE "MoneyTransferRow" ADD CONSTRAINT "MoneyTransferRow_idempotencyKey_uuid" CHECK ("idempotencyKey" IS NULL OR "idempotencyKey" ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$');
