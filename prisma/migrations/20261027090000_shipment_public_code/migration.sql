-- The shipment code customers see (ADR-028): "SH-" + 5 random digits, unique,
-- never in order. Staff keep W-n / C-n in "code".
CREATE OR REPLACE FUNCTION orbit_shipment_public_code() RETURNS TEXT AS $$
DECLARE
  c TEXT;
BEGIN
  LOOP
    c := 'SH-' || (10000 + floor(random() * 90000))::int::text;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM "Shipment" WHERE "publicCode" = c);
  END LOOP;
  RETURN c;
END
$$ LANGUAGE plpgsql VOLATILE;

ALTER TABLE "Shipment" ADD COLUMN "publicCode" TEXT;

-- Existing shipments, one at a time so each code is checked against the ones
-- already given.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM "Shipment" WHERE "publicCode" IS NULL ORDER BY "createdAt", id LOOP
    UPDATE "Shipment" SET "publicCode" = orbit_shipment_public_code() WHERE id = r.id;
  END LOOP;
END
$$;

ALTER TABLE "Shipment" ALTER COLUMN "publicCode" SET DEFAULT orbit_shipment_public_code();
ALTER TABLE "Shipment" ALTER COLUMN "publicCode" SET NOT NULL;
CREATE UNIQUE INDEX "Shipment_publicCode_key" ON "Shipment"("publicCode");
