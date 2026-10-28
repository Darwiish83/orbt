-- Shipment pricing (ADR-036): Rate, Quality Rate and Brand Rate are set only
-- with "pricing:write"; a customer sees a cargo line only once its Rate is set.

INSERT INTO "Permission" ("id", "key", "description")
VALUES ('perm_pricing_write', 'pricing:write', 'Set Rate, Quality Rate and Brand Rate on shipment customers')
ON CONFLICT ("key") DO NOTHING;

-- Customer connection (ADR-029): unpriced cargo — and a shipment where all of
-- the customer's cargo is unpriced — stays invisible, even to a query that
-- forgets the filter.
DROP POLICY portal_own ON "ShipmentLine";
CREATE POLICY portal_own ON "ShipmentLine" FOR SELECT TO orbit_portal
  USING ("customerId" = orbit_customer() AND "rate" IS NOT NULL);

DROP POLICY portal_own ON "Shipment";
CREATE POLICY portal_own ON "Shipment" FOR SELECT TO orbit_portal
  USING (EXISTS (SELECT 1 FROM "ShipmentLine" l WHERE l."shipmentId" = "Shipment"."id" AND l."customerId" = orbit_customer() AND l."rate" IS NOT NULL));
DROP POLICY portal_own ON "ShipmentEvent";
CREATE POLICY portal_own ON "ShipmentEvent" FOR SELECT TO orbit_portal
  USING (EXISTS (SELECT 1 FROM "ShipmentLine" l WHERE l."shipmentId" = "ShipmentEvent"."shipmentId" AND l."customerId" = orbit_customer() AND l."rate" IS NOT NULL));
DROP POLICY portal_own ON "AirDetail";
CREATE POLICY portal_own ON "AirDetail" FOR SELECT TO orbit_portal
  USING (EXISTS (SELECT 1 FROM "ShipmentLine" l WHERE l."shipmentId" = "AirDetail"."shipmentId" AND l."customerId" = orbit_customer() AND l."rate" IS NOT NULL));
DROP POLICY portal_own ON "SeaDetail";
CREATE POLICY portal_own ON "SeaDetail" FOR SELECT TO orbit_portal
  USING (EXISTS (SELECT 1 FROM "ShipmentLine" l WHERE l."shipmentId" = "SeaDetail"."shipmentId" AND l."customerId" = orbit_customer() AND l."rate" IS NOT NULL));
DROP POLICY portal_own ON "RoadDetail";
CREATE POLICY portal_own ON "RoadDetail" FOR SELECT TO orbit_portal
  USING (EXISTS (SELECT 1 FROM "ShipmentLine" l WHERE l."shipmentId" = "RoadDetail"."shipmentId" AND l."customerId" = orbit_customer() AND l."rate" IS NOT NULL));
