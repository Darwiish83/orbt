-- Customer App → Profile: a customer edits their own name, company, location
-- and cargo category through the portal role (ADR-029). Only those columns,
-- only their own row; everything else on Customer stays read-only for them.
GRANT UPDATE ("name", "company", "location", "cargoCategory", "updatedAt") ON "Customer" TO orbit_portal;
CREATE POLICY portal_update_own ON "Customer" FOR UPDATE TO orbit_portal
  USING ("id" = orbit_customer()) WITH CHECK ("id" = orbit_customer());
