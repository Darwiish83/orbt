-- A Super Admin may reopen a closed period (2026 onward). The close row is
-- kept (reopenedAt / reopenedBy); only one live close per country, year and
-- period, so a reopened period can be closed again.
ALTER TABLE "PeriodClose" ADD COLUMN "reopenedAt" TIMESTAMP(3),
ADD COLUMN "reopenedBy" TEXT;

DROP INDEX "PeriodClose_country_year_period_key";

CREATE INDEX "PeriodClose_country_year_period_idx" ON "PeriodClose"("country", "year", "period");

CREATE UNIQUE INDEX "PeriodClose_live_key" ON "PeriodClose"("country", "year", "period") WHERE "reopenedAt" IS NULL;

ALTER TABLE "PeriodClose" ADD CONSTRAINT "PeriodClose_reopen_shape" CHECK (("reopenedAt" IS NULL) = ("reopenedBy" IS NULL));
