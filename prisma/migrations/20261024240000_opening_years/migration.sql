-- Opening balance per earlier year (owner 2026-10-24): first the year's TOTAL,
-- then BANK lines (where it is) and SOURCE lines (what it is); both add up to
-- the total. DEBT lines (owed to us) stay outside the balance.

-- CreateEnum
CREATE TYPE "OpeningLineKind" AS ENUM ('TOTAL', 'BANK', 'SOURCE', 'DEBT');

-- AlterTable
ALTER TABLE "OpeningEntry" ADD COLUMN     "kind" "OpeningLineKind" NOT NULL DEFAULT 'SOURCE',
ALTER COLUMN "source" DROP NOT NULL;

UPDATE "OpeningEntry" SET "kind" = 'DEBT' WHERE "source" = 'DEBT';

-- Convert lines typed as "source × bank" cells into the new shape. The old
-- lines are reversed, not deleted, so they stay in the history.
CREATE TEMP TABLE old_cells AS
  SELECT * FROM "OpeningEntry" WHERE "kind" = 'SOURCE' AND "reversedAt" IS NULL;

CREATE TEMP TABLE old_years AS
  SELECT country, year, "fromYear", SUM(amount) AS total, bool_and(carried) AS carried
  FROM old_cells GROUP BY country, year, "fromYear" HAVING SUM(amount) <> 0;

INSERT INTO "OpeningEntry" (id, country, year, "fromYear", kind, amount, carried, note, "createdAt")
  SELECT 'mig' || md5('T' || country || year || "fromYear"), country, year, "fromYear", 'TOTAL', total, carried, 'Converted from earlier lines', CURRENT_TIMESTAMP
  FROM old_years;

INSERT INTO "OpeningEntry" (id, country, year, "fromYear", kind, "bankId", amount, carried, "createdAt")
  SELECT 'mig' || md5('B' || c.country || c.year || c."fromYear" || COALESCE(c."bankId", '-')), c.country, c.year, c."fromYear", 'BANK', c."bankId", SUM(c.amount), bool_and(c.carried), CURRENT_TIMESTAMP
  FROM old_cells c JOIN old_years y USING (country, year, "fromYear")
  GROUP BY c.country, c.year, c."fromYear", c."bankId" HAVING SUM(c.amount) <> 0;

INSERT INTO "OpeningEntry" (id, country, year, "fromYear", kind, source, amount, carried, "createdAt")
  SELECT 'mig' || md5('S' || c.country || c.year || c."fromYear" || c.source), c.country, c.year, c."fromYear", 'SOURCE', c.source, SUM(c.amount), bool_and(c.carried), CURRENT_TIMESTAMP
  FROM old_cells c JOIN old_years y USING (country, year, "fromYear")
  GROUP BY c.country, c.year, c."fromYear", c.source HAVING SUM(c.amount) <> 0;

UPDATE "OpeningEntry" SET "reversedAt" = CURRENT_TIMESTAMP, note = COALESCE(note || ' · ', '') || 'converted to year total'
  WHERE id IN (SELECT id FROM old_cells);

DROP TABLE old_cells;
DROP TABLE old_years;

-- Shape of each kind (old converted cells keep source + bank, but are reversed).
ALTER TABLE "OpeningEntry" ADD CONSTRAINT "OpeningEntry_kind_shape" CHECK (
  ("kind" = 'TOTAL' AND "source" IS NULL AND "bankId" IS NULL AND "person" IS NULL)
  OR ("kind" = 'BANK' AND "source" IS NULL AND "person" IS NULL)
  OR ("kind" = 'SOURCE' AND "source" IS NOT NULL AND "source" <> 'DEBT' AND ("bankId" IS NULL OR "reversedAt" IS NOT NULL))
  OR ("kind" = 'DEBT' AND "source" = 'DEBT')
);
