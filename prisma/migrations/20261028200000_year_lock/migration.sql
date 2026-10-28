-- ADR-031 (owner 2026-10-28): a closed year is closed for everything, and only
-- a Super Admin can open it again. The database enforces it too, so a request
-- that skips the app is refused the same way.

-- 1. Reopening a closed period: only once, nothing else on the row changes, and
--    the person recorded as reopening it must be an active Super Admin.
CREATE OR REPLACE FUNCTION orbit_period_close_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."reopenedAt" IS NOT NULL OR NEW."reopenedAt" IS NULL
     OR (to_jsonb(NEW) - 'reopenedAt' - 'reopenedBy') IS DISTINCT FROM (to_jsonb(OLD) - 'reopenedAt' - 'reopenedBy') THEN
    RAISE EXCEPTION 'orbit: a closed period can only be reopened, once' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "UserRole" ur
    JOIN "Role" r ON r."id" = ur."roleId"
    JOIN "User" u ON u."id" = ur."userId"
    WHERE ur."userId" = NEW."reopenedBy" AND r."key" = 'super_admin' AND u."status" = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'orbit: only a Super Admin can reopen a closed period' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;

-- 2. Shipments of a closed year: no new ones, no change (status included), no delete.
CREATE OR REPLACE FUNCTION orbit_shipment_open() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN PERFORM orbit_assert_open(OLD."originCountry", OLD."businessYear", NULL); END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN PERFORM orbit_assert_open(NEW."originCountry", NEW."businessYear", NULL); END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER shipment_open_year BEFORE INSERT OR UPDATE OR DELETE ON "Shipment"
  FOR EACH ROW EXECUTE FUNCTION orbit_shipment_open();

-- 3. Cargo lines follow their shipment's year.
CREATE OR REPLACE FUNCTION orbit_shipment_line_open() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c text; y int;
BEGIN
  SELECT s."originCountry", s."businessYear" INTO c, y FROM "Shipment" s
  WHERE s."id" = CASE WHEN TG_OP = 'DELETE' THEN OLD."shipmentId" ELSE NEW."shipmentId" END;
  IF c IS NOT NULL THEN PERFORM orbit_assert_open(c, y, NULL); END IF;
  IF TG_OP = 'UPDATE' AND NEW."shipmentId" IS DISTINCT FROM OLD."shipmentId" THEN
    SELECT s."originCountry", s."businessYear" INTO c, y FROM "Shipment" s WHERE s."id" = OLD."shipmentId";
    IF c IS NOT NULL THEN PERFORM orbit_assert_open(c, y, NULL); END IF;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER shipment_line_open_year BEFORE INSERT OR UPDATE OR DELETE ON "ShipmentLine"
  FOR EACH ROW EXECUTE FUNCTION orbit_shipment_line_open();

-- 4. Only Orbit profit moves into a new year (plus debts owed to us): a live
--    opening line is a total, a bank amount, the PROFIT part or a DEBT.
--    Commission, partner shares, transfer money, shipment costs and the like
--    are paid out before a close and can never be carried. Reversed lines are
--    history and keep whatever they were. NOT VALID + VALIDATE: older databases
--    with legacy lines still migrate; new rows are always checked.
ALTER TABLE "OpeningEntry" ADD CONSTRAINT "OpeningEntry_only_profit_carries" CHECK (
  "reversedAt" IS NOT NULL
  OR ("kind" IN ('TOTAL', 'BANK') AND "source" IS NULL)
  OR ("kind" = 'SOURCE' AND "source" = 'PROFIT')
  OR ("kind" = 'DEBT' AND "source" = 'DEBT' AND "amount" > 0)
) NOT VALID;
DO $$ BEGIN
  ALTER TABLE "OpeningEntry" VALIDATE CONSTRAINT "OpeningEntry_only_profit_carries";
EXCEPTION WHEN check_violation THEN
  RAISE NOTICE 'OpeningEntry has older live lines with other parts; new lines are still checked';
END $$;
