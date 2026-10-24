-- AlterTable
ALTER TABLE "CashOut" ADD COLUMN     "forYear" INTEGER,
ADD COLUMN     "reference" TEXT;


-- An out for an earlier year belongs to a year before the one it is paid in.
ALTER TABLE "CashOut" ADD CONSTRAINT "CashOut_for_earlier_year" CHECK ("forYear" IS NULL OR "forYear" < "year");

-- A shipment cost for an earlier year whose shipment is not in the system
-- (e.g. 2025 W-30) has no stage; it carries a reference instead.
ALTER TABLE "CashOut" DROP CONSTRAINT "CashOut_stage_shape";
ALTER TABLE "CashOut" ADD CONSTRAINT "CashOut_stage_shape" CHECK (
  CASE WHEN "category" = 'SHIPMENT_COST'
    THEN "stage" IS NOT NULL OR ("forYear" IS NOT NULL AND "shipmentId" IS NULL AND "reference" IS NOT NULL)
    ELSE "stage" IS NULL
  END
);
