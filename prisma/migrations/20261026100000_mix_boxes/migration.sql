-- Numbered MIX boxes (ADR-026): a line lists the boxes its goods are in.
ALTER TABLE "ShipmentLine" ADD COLUMN     "mixParts" JSONB;

-- Older lines had only a MIX count + MIX KG. Give each such line its own box
-- (numbered per shipment in the order the lines were added) holding the same
-- count of parts, the KG split evenly with any remainder on the last part,
-- so MIX count, MIX KG and packages stay as they were (a line with MIX KG
-- but no count becomes one MIX).
WITH legacy AS (
  SELECT id,
         GREATEST(COALESCE("mixCount", 0), 1) AS c,
         COALESCE("mixKg", 0) AS k,
         row_number() OVER (PARTITION BY "shipmentId" ORDER BY "createdAt", id) AS box
  FROM "ShipmentLine"
  WHERE COALESCE("mixCount", 0) > 0 OR COALESCE("mixKg", 0) > 0
)
UPDATE "ShipmentLine" l
SET "mixParts" = (
      SELECT jsonb_agg(
               jsonb_build_object(
                 'box', legacy.box,
                 'kg', (CASE WHEN g = legacy.c
                             THEN legacy.k - round(legacy.k / legacy.c, 3) * (legacy.c - 1)
                             ELSE round(legacy.k / legacy.c, 3) END)::text)
               ORDER BY g)
      FROM generate_series(1, legacy.c) AS g),
    "mixCount" = legacy.c
FROM legacy
WHERE l.id = legacy.id;
