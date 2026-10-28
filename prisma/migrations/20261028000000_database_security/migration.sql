-- ============================================================================
-- Database-level security (ADR-029). The database defends itself even if the
-- application code is bypassed or has a bug:
--   1. least-privilege roles (no superuser at runtime)
--   2. triggers that refuse forbidden changes (financial history, audit log,
--      shipment status, closed periods)
--   3. Row-Level Security: a customer connection only ever sees its own rows
-- Roles are created here only if missing (fresh databases / CI, where this
-- runs as a superuser). On a configured server scripts/db-setup-roles.ts
-- creates them with passwords and makes orbit_owner the owner of every object.
-- ============================================================================

-- ------------------------------------------------------------------- roles
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'orbit_owner') THEN
    CREATE ROLE orbit_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'orbit_runtime') THEN
    CREATE ROLE orbit_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'orbit_portal') THEN
    CREATE ROLE orbit_portal NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOINHERIT;
  END IF;
END $$;

-- -------------------------------------------------------------- privileges
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO orbit_runtime, orbit_portal;

-- Runtime (the app's staff side and all background work): read/write rows,
-- never DDL, never TRUNCATE, never the migration ledger.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO orbit_runtime;
REVOKE ALL ON "_prisma_migrations" FROM orbit_runtime, orbit_portal;

-- Financial and operational history is never deleted (corrections are reversals).
REVOKE DELETE ON
  "AuditEvent", "ShipmentEvent", "Invoice", "InvoiceRevision", "Payment", "PaymentAllocation",
  "Receipt", "ReceiptSequence", "TransferReceipt", "TransferReceiptSequence", "CashOut", "CashCount",
  "CommissionPayment", "DebtReturn", "OpeningBalance", "OpeningEntry", "PeriodClose",
  "MoneyTransferRow", "TransferMonth", "Transfer", "LoginAttempt"
FROM orbit_runtime;

-- Append-only records: written once, never changed.
REVOKE UPDATE ON
  "AuditEvent", "ShipmentEvent", "InvoiceRevision", "PaymentAllocation", "CashCount",
  "CommissionPayment", "DebtReturn", "LoginAttempt"
FROM orbit_runtime;

-- Customer portal: read its own rows (RLS below) + the reference tables it shows;
-- the only writes are uploading a document and the audit line for it.
GRANT SELECT ON
  "Customer", "Shipment", "ShipmentLine", "ShipmentEvent", "AirDetail", "SeaDetail", "RoadDetail",
  "Invoice", "ChargeLineItem", "InvoiceRevision", "Quote", "Payment", "PaymentAllocation", "Receipt",
  "Document", "Notification", "TransferReceipt",
  "Bank", "Country", "BusinessYear", "AppSetting"
TO orbit_portal;
GRANT INSERT ON "Document", "AuditEvent" TO orbit_portal;

-- Tables created by later migrations: runtime gets row access by default
-- (protect them explicitly in that migration); the portal gets nothing.
DO $$
BEGIN
  EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE orbit_owner IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO orbit_runtime';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'default privileges for orbit_owner not set (run scripts/db-setup-roles.ts)';
END $$;

-- ----------------------------------------------------------------- triggers
CREATE OR REPLACE FUNCTION orbit_forbid() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'orbit: % on "%" is not allowed (%)', TG_OP, TG_TABLE_NAME, TG_ARGV[0]
    USING ERRCODE = 'insufficient_privilege';
END $$;

-- Append-only / never-deleted, enforced for every role (even a stolen owner login
-- can't silently rewrite history without first dropping the trigger).
CREATE TRIGGER audit_append_only BEFORE UPDATE OR DELETE ON "AuditEvent"
  FOR EACH ROW EXECUTE FUNCTION orbit_forbid('audit log is append-only');
CREATE TRIGGER shipment_event_append_only BEFORE UPDATE OR DELETE ON "ShipmentEvent"
  FOR EACH ROW EXECUTE FUNCTION orbit_forbid('shipment history is append-only');
CREATE TRIGGER invoice_revision_append_only BEFORE UPDATE OR DELETE ON "InvoiceRevision"
  FOR EACH ROW EXECUTE FUNCTION orbit_forbid('invoice history is append-only');
CREATE TRIGGER allocation_append_only BEFORE UPDATE OR DELETE ON "PaymentAllocation"
  FOR EACH ROW EXECUTE FUNCTION orbit_forbid('payment allocations are append-only; reverse the payment');
CREATE TRIGGER invoice_no_delete BEFORE DELETE ON "Invoice"
  FOR EACH ROW EXECUTE FUNCTION orbit_forbid('void the invoice instead');
CREATE TRIGGER payment_no_delete BEFORE DELETE ON "Payment"
  FOR EACH ROW EXECUTE FUNCTION orbit_forbid('reverse the payment instead');
CREATE TRIGGER receipt_no_delete BEFORE DELETE ON "Receipt"
  FOR EACH ROW EXECUTE FUNCTION orbit_forbid('receipts are kept forever');
CREATE TRIGGER transfer_receipt_no_delete BEFORE DELETE ON "TransferReceipt"
  FOR EACH ROW EXECUTE FUNCTION orbit_forbid('void the receipt instead');
CREATE TRIGGER cash_out_no_delete BEFORE DELETE ON "CashOut"
  FOR EACH ROW EXECUTE FUNCTION orbit_forbid('reverse the out instead');
CREATE TRIGGER period_close_no_delete BEFORE DELETE ON "PeriodClose"
  FOR EACH ROW EXECUTE FUNCTION orbit_forbid('reopen the period instead');

-- Reversal-only updates: once written, only the reversal/void markers may be
-- set, once, from empty. Nothing else on the row can change.
CREATE OR REPLACE FUNCTION orbit_receipt_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."reversedAt" IS NOT NULL OR NEW."reversedAt" IS NULL
     OR (to_jsonb(NEW) - 'reversedAt') IS DISTINCT FROM (to_jsonb(OLD) - 'reversedAt') THEN
    RAISE EXCEPTION 'orbit: a receipt can only be reversed, once' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER receipt_reversal_only BEFORE UPDATE ON "Receipt"
  FOR EACH ROW EXECUTE FUNCTION orbit_receipt_guard();

CREATE OR REPLACE FUNCTION orbit_payment_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."reversedAt" IS NOT NULL OR NEW."reversedAt" IS NULL
     OR (to_jsonb(NEW) - 'reversedAt' - 'reversalReason') IS DISTINCT FROM (to_jsonb(OLD) - 'reversedAt' - 'reversalReason') THEN
    RAISE EXCEPTION 'orbit: a payment can only be reversed, once' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER payment_reversal_only BEFORE UPDATE ON "Payment"
  FOR EACH ROW EXECUTE FUNCTION orbit_payment_guard();

CREATE OR REPLACE FUNCTION orbit_cash_out_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."reversedAt" IS NOT NULL OR NEW."reversedAt" IS NULL
     OR (to_jsonb(NEW) - 'reversedAt') IS DISTINCT FROM (to_jsonb(OLD) - 'reversedAt') THEN
    RAISE EXCEPTION 'orbit: an out can only be reversed, once' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER cash_out_reversal_only BEFORE UPDATE ON "CashOut"
  FOR EACH ROW EXECUTE FUNCTION orbit_cash_out_guard();

CREATE OR REPLACE FUNCTION orbit_transfer_receipt_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."voidedAt" IS NOT NULL OR NEW."voidedAt" IS NULL
     OR (to_jsonb(NEW) - 'voidedAt' - 'voidedBy') IS DISTINCT FROM (to_jsonb(OLD) - 'voidedAt' - 'voidedBy') THEN
    RAISE EXCEPTION 'orbit: a transfer receipt can only be voided, once' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER transfer_receipt_void_only BEFORE UPDATE ON "TransferReceipt"
  FOR EACH ROW EXECUTE FUNCTION orbit_transfer_receipt_guard();

CREATE OR REPLACE FUNCTION orbit_period_close_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."reopenedAt" IS NOT NULL OR NEW."reopenedAt" IS NULL
     OR (to_jsonb(NEW) - 'reopenedAt' - 'reopenedBy') IS DISTINCT FROM (to_jsonb(OLD) - 'reopenedAt' - 'reopenedBy') THEN
    RAISE EXCEPTION 'orbit: a closed period can only be reopened, once' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER period_close_reopen_only BEFORE UPDATE ON "PeriodClose"
  FOR EACH ROW EXECUTE FUNCTION orbit_period_close_guard();

-- An invoice keeps its identity: number, customer, shipment and currency are fixed.
CREATE OR REPLACE FUNCTION orbit_invoice_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."number" IS DISTINCT FROM OLD."number" OR NEW."customerId" IS DISTINCT FROM OLD."customerId"
     OR NEW."shipmentId" IS DISTINCT FROM OLD."shipmentId" OR NEW."currency" IS DISTINCT FROM OLD."currency" THEN
    RAISE EXCEPTION 'orbit: an invoice''s number, customer, shipment and currency can''t change'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER invoice_identity BEFORE UPDATE ON "Invoice"
  FOR EACH ROW EXECUTE FUNCTION orbit_invoice_identity();

-- Number counters only move forward (no reusing a receipt number).
CREATE OR REPLACE FUNCTION orbit_counter_forward() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."next" <= OLD."next" OR NEW."year" <> OLD."year" THEN
    RAISE EXCEPTION 'orbit: number counters only move forward' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER receipt_counter_forward BEFORE UPDATE ON "ReceiptSequence"
  FOR EACH ROW EXECUTE FUNCTION orbit_counter_forward();
CREATE TRIGGER transfer_receipt_counter_forward BEFORE UPDATE ON "TransferReceiptSequence"
  FOR EACH ROW EXECUTE FUNCTION orbit_counter_forward();

-- Shipment status: only the four-step path (ADR-017), Transit for Air only,
-- Arrived final. Same rule as src/modules/shipments/stateMachine.ts.
CREATE OR REPLACE FUNCTION orbit_shipment_status() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."mode" IS DISTINCT FROM OLD."mode" THEN
    RAISE EXCEPTION 'orbit: a shipment''s mode can''t change' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW."status" IS NOT DISTINCT FROM OLD."status" THEN RETURN NEW; END IF;
  IF (OLD."status" = 'AT_ORIGIN_STORE' AND NEW."status" = 'DEPARTED')
     OR (OLD."status" = 'DEPARTED' AND NEW."status" = 'IN_TRANSIT' AND NEW."mode" = 'AIR')
     OR (OLD."status" = 'IN_TRANSIT' AND NEW."status" = 'ARRIVED' AND NEW."mode" = 'AIR')
     OR (OLD."status" = 'DEPARTED' AND NEW."status" = 'ARRIVED' AND NEW."mode" <> 'AIR') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'orbit: illegal shipment status change % -> % (%)', OLD."status", NEW."status", NEW."mode"
    USING ERRCODE = 'check_violation';
END $$;
CREATE TRIGGER shipment_status_path BEFORE UPDATE OF "status", "mode" ON "Shipment"
  FOR EACH ROW EXECUTE FUNCTION orbit_shipment_status();

-- Closed periods (spec §11): nothing dated in a closed period, and nothing in a
-- closed business year, can be written. Same rule as modules/accounting/periods.ts.
CREATE OR REPLACE FUNCTION orbit_assert_open(p_country text, p_year int, p_at timestamp) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "PeriodClose" pc WHERE pc."country" = p_country AND pc."reopenedAt" IS NULL
             AND ((pc."year" = p_year AND pc."period" = 'YEAR')
                  OR (p_at IS NOT NULL AND pc."fromDate" <= p_at AND pc."toDate" >= p_at))) THEN
    RAISE EXCEPTION 'orbit: this period is closed and cannot be changed' USING ERRCODE = 'insufficient_privilege';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION orbit_cash_out_open() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM orbit_assert_open(NEW."country", NEW."year", NEW."paidAt");
  RETURN NEW;
END $$;
CREATE TRIGGER cash_out_open_period BEFORE INSERT OR UPDATE ON "CashOut"
  FOR EACH ROW EXECUTE FUNCTION orbit_cash_out_open();

-- Invoices follow their shipment's country and business year.
CREATE OR REPLACE FUNCTION orbit_invoice_year_open(p_invoice text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE c text; y int;
BEGIN
  SELECT s."originCountry", s."businessYear" INTO c, y
  FROM "Invoice" i JOIN "Shipment" s ON s."id" = i."shipmentId" WHERE i."id" = p_invoice;
  IF c IS NOT NULL THEN PERFORM orbit_assert_open(c, y, NULL); END IF;
END $$;

CREATE OR REPLACE FUNCTION orbit_invoice_open() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c text; y int;
BEGIN
  SELECT s."originCountry", s."businessYear" INTO c, y FROM "Shipment" s WHERE s."id" = NEW."shipmentId";
  IF c IS NOT NULL THEN PERFORM orbit_assert_open(c, y, NULL); END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER invoice_open_year BEFORE INSERT OR UPDATE ON "Invoice"
  FOR EACH ROW EXECUTE FUNCTION orbit_invoice_open();

CREATE OR REPLACE FUNCTION orbit_invoice_child_open() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE inv text;
BEGIN
  inv := CASE WHEN TG_OP = 'DELETE' THEN OLD."invoiceId" ELSE NEW."invoiceId" END;
  IF inv IS NOT NULL THEN PERFORM orbit_invoice_year_open(inv); END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER charge_line_open_year BEFORE INSERT OR UPDATE OR DELETE ON "ChargeLineItem"
  FOR EACH ROW EXECUTE FUNCTION orbit_invoice_child_open();
CREATE TRIGGER allocation_open_year BEFORE INSERT ON "PaymentAllocation"
  FOR EACH ROW EXECUTE FUNCTION orbit_invoice_child_open();

-- ------------------------------------------------------- row-level security
-- The portal connection (orbit_portal) must set app.customer_id inside each
-- transaction (src/db/client.ts → withCustomerDb). Unset → no rows (fail closed).
-- The runtime role keeps full row access (its authorization is in the app).
CREATE OR REPLACE FUNCTION orbit_customer() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.customer_id', true), '')
$$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['Customer','Shipment','ShipmentLine','ShipmentEvent','AirDetail','SeaDetail','RoadDetail',
                           'Invoice','ChargeLineItem','InvoiceRevision','Quote','Payment','PaymentAllocation','Receipt',
                           'Document','Notification','TransferReceipt'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY runtime_all ON %I FOR ALL TO orbit_runtime USING (true) WITH CHECK (true)', t);
  END LOOP;
END $$;

CREATE POLICY portal_own ON "Customer" FOR SELECT TO orbit_portal USING ("id" = orbit_customer());
CREATE POLICY portal_own ON "ShipmentLine" FOR SELECT TO orbit_portal USING ("customerId" = orbit_customer());
CREATE POLICY portal_own ON "Shipment" FOR SELECT TO orbit_portal
  USING (EXISTS (SELECT 1 FROM "ShipmentLine" l WHERE l."shipmentId" = "Shipment"."id" AND l."customerId" = orbit_customer()));
CREATE POLICY portal_own ON "ShipmentEvent" FOR SELECT TO orbit_portal
  USING (EXISTS (SELECT 1 FROM "ShipmentLine" l WHERE l."shipmentId" = "ShipmentEvent"."shipmentId" AND l."customerId" = orbit_customer()));
CREATE POLICY portal_own ON "AirDetail" FOR SELECT TO orbit_portal
  USING (EXISTS (SELECT 1 FROM "ShipmentLine" l WHERE l."shipmentId" = "AirDetail"."shipmentId" AND l."customerId" = orbit_customer()));
CREATE POLICY portal_own ON "SeaDetail" FOR SELECT TO orbit_portal
  USING (EXISTS (SELECT 1 FROM "ShipmentLine" l WHERE l."shipmentId" = "SeaDetail"."shipmentId" AND l."customerId" = orbit_customer()));
CREATE POLICY portal_own ON "RoadDetail" FOR SELECT TO orbit_portal
  USING (EXISTS (SELECT 1 FROM "ShipmentLine" l WHERE l."shipmentId" = "RoadDetail"."shipmentId" AND l."customerId" = orbit_customer()));
CREATE POLICY portal_own ON "Invoice" FOR SELECT TO orbit_portal USING ("customerId" = orbit_customer());
CREATE POLICY portal_own ON "Quote" FOR SELECT TO orbit_portal USING ("customerId" = orbit_customer());
CREATE POLICY portal_own ON "ChargeLineItem" FOR SELECT TO orbit_portal
  USING (EXISTS (SELECT 1 FROM "Invoice" i WHERE i."id" = "ChargeLineItem"."invoiceId" AND i."customerId" = orbit_customer())
      OR EXISTS (SELECT 1 FROM "Quote" q WHERE q."id" = "ChargeLineItem"."quoteId" AND q."customerId" = orbit_customer()));
CREATE POLICY portal_own ON "InvoiceRevision" FOR SELECT TO orbit_portal
  USING (EXISTS (SELECT 1 FROM "Invoice" i WHERE i."id" = "InvoiceRevision"."invoiceId" AND i."customerId" = orbit_customer()));
CREATE POLICY portal_own ON "Payment" FOR SELECT TO orbit_portal USING ("customerId" = orbit_customer());
CREATE POLICY portal_own ON "PaymentAllocation" FOR SELECT TO orbit_portal
  USING (EXISTS (SELECT 1 FROM "Payment" p WHERE p."id" = "PaymentAllocation"."paymentId" AND p."customerId" = orbit_customer()));
CREATE POLICY portal_own ON "Receipt" FOR SELECT TO orbit_portal USING ("customerId" = orbit_customer());
CREATE POLICY portal_own ON "Document" FOR SELECT TO orbit_portal USING ("customerId" = orbit_customer());
CREATE POLICY portal_upload ON "Document" FOR INSERT TO orbit_portal WITH CHECK ("customerId" = orbit_customer());
CREATE POLICY portal_own ON "Notification" FOR SELECT TO orbit_portal
  USING ("customerId" = orbit_customer() OR ("audience" = 'ALL' AND orbit_customer() IS NOT NULL));
CREATE POLICY portal_own ON "TransferReceipt" FOR SELECT TO orbit_portal USING ("customerId" = orbit_customer());
