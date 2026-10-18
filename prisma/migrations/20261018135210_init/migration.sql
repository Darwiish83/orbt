-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "Department" AS ENUM ('MANAGEMENT', 'OPERATIONS', 'FINANCE', 'CUSTOMER_SERVICE', 'DOCUMENTS', 'REPORTS');

-- CreateEnum
CREATE TYPE "TransferRole" AS ENUM ('NONE', 'SEND', 'RECEIVE');

-- CreateEnum
CREATE TYPE "AccessLevel" AS ENUM ('NONE', 'VIEW', 'EDIT');

-- CreateEnum
CREATE TYPE "CustomerStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "ShipmentMode" AS ENUM ('AIR', 'SEA', 'ROAD');

-- CreateEnum
CREATE TYPE "ShipmentStatus" AS ENUM ('AT_ORIGIN_STORE', 'DEPARTED', 'IN_TRANSIT', 'ARRIVED', 'DELIVERED', 'ON_HOLD');

-- CreateEnum
CREATE TYPE "ShipmentEventType" AS ENUM ('SCAN', 'MILESTONE', 'DELAY', 'EXCEPTION', 'DELIVERY', 'STATUS_CHANGE');

-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('UNPAID', 'PARTIAL', 'PAID', 'VOID');

-- CreateEnum
CREATE TYPE "ChargeParentType" AS ENUM ('QUOTE', 'INVOICE');

-- CreateEnum
CREATE TYPE "ChargeCategory" AS ENUM ('FREIGHT', 'LOCAL_DELIVERY', 'CUSTOMS_TAX', 'SERVICE', 'OTHER');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'BANK_TRANSFER', 'MOBILE_MONEY', 'OTHER');

-- CreateEnum
CREATE TYPE "DocumentKind" AS ENUM ('INVOICE', 'IDENTITY', 'CARGO_DOC', 'OTHER');

-- CreateEnum
CREATE TYPE "DocumentVisibility" AS ENUM ('PRIVATE', 'CUSTOMER_VISIBLE');

-- CreateEnum
CREATE TYPE "NotificationAudience" AS ENUM ('CUSTOMER', 'ROLE', 'ALL');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'SENT');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'INVITED',
    "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "employeeId" TEXT,
    "customerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "country" TEXT,
    "businessYear" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "department" "Department" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "transferRole" "TransferRole" NOT NULL DEFAULT 'NONE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeScope" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "country" TEXT NOT NULL,

    CONSTRAINT "EmployeeScope_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeePageAccess" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "page" TEXT NOT NULL,
    "level" "AccessLevel" NOT NULL DEFAULT 'NONE',

    CONSTRAINT "EmployeePageAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "country" TEXT,
    "status" "CustomerStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shipment" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "trackingNumber" TEXT,
    "mode" "ShipmentMode" NOT NULL,
    "originCountry" TEXT NOT NULL,
    "originCity" TEXT,
    "destCountry" TEXT,
    "destCity" TEXT,
    "status" "ShipmentStatus" NOT NULL DEFAULT 'AT_ORIGIN_STORE',
    "businessYear" INTEGER NOT NULL,
    "departedAt" TIMESTAMP(3),
    "arrivedAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AirDetail" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "awbNumber" TEXT,
    "flightRef" TEXT,
    "chargeableWeightKg" DECIMAL(12,3),

    CONSTRAINT "AirDetail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeaDetail" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "blNumber" TEXT,
    "containerRefs" TEXT[],
    "volumeCbm" DECIMAL(12,3),

    CONSTRAINT "SeaDetail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoadDetail" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "vehicleRef" TEXT,
    "driverRef" TEXT,
    "route" TEXT,

    CONSTRAINT "RoadDetail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipmentLine" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "description" TEXT,
    "packages" INTEGER,
    "chargeableWeightKg" DECIMAL(12,3),
    "volumeCbm" DECIMAL(12,3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShipmentLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipmentEvent" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "type" "ShipmentEventType" NOT NULL,
    "status" "ShipmentStatus",
    "note" TEXT,
    "actorUserId" TEXT,
    "idempotencyKey" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShipmentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quote" (
    "id" TEXT NOT NULL,
    "number" TEXT,
    "customerId" TEXT NOT NULL,
    "shipmentId" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" "QuoteStatus" NOT NULL DEFAULT 'DRAFT',
    "expiresAt" TIMESTAMP(3),
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "businessYear" INTEGER,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "shipmentId" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" "InvoiceStatus" NOT NULL DEFAULT 'UNPAID',
    "issuedAt" TIMESTAMP(3),
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "amountAllocated" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "businessYear" INTEGER,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChargeLineItem" (
    "id" TEXT NOT NULL,
    "parentType" "ChargeParentType" NOT NULL,
    "quoteId" TEXT,
    "invoiceId" TEXT,
    "category" "ChargeCategory" NOT NULL,
    "description" TEXT,
    "quantity" DECIMAL(12,3) NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(14,2) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChargeLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "method" "PaymentMethod" NOT NULL,
    "reference" TEXT,
    "idempotencyKey" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentAllocation" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "kind" "DocumentKind" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "checksum" TEXT,
    "visibility" "DocumentVisibility" NOT NULL DEFAULT 'PRIVATE',
    "customerId" TEXT,
    "shipmentId" TEXT,
    "uploadedByUserId" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "audience" "NotificationAudience" NOT NULL,
    "type" TEXT,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduledAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "customerId" TEXT,
    "roleId" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "metadata" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_employeeId_key" ON "User"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "User_customerId_key" ON "User"("customerId");

-- CreateIndex
CREATE INDEX "User_status_idx" ON "User"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Role_key_key" ON "Role"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_key_key" ON "Permission"("key");

-- CreateIndex
CREATE INDEX "RolePermission_permissionId_idx" ON "RolePermission"("permissionId");

-- CreateIndex
CREATE INDEX "UserRole_roleId_idx" ON "UserRole"("roleId");

-- CreateIndex
CREATE UNIQUE INDEX "UserRole_userId_roleId_country_businessYear_key" ON "UserRole"("userId", "roleId", "country", "businessYear");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_code_key" ON "Employee"("code");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeScope_employeeId_country_key" ON "EmployeeScope"("employeeId", "country");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeePageAccess_employeeId_page_key" ON "EmployeePageAccess"("employeeId", "page");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_ref_key" ON "Customer"("ref");

-- CreateIndex
CREATE INDEX "Customer_status_idx" ON "Customer"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Shipment_code_key" ON "Shipment"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Shipment_trackingNumber_key" ON "Shipment"("trackingNumber");

-- CreateIndex
CREATE INDEX "Shipment_status_idx" ON "Shipment"("status");

-- CreateIndex
CREATE INDEX "Shipment_businessYear_idx" ON "Shipment"("businessYear");

-- CreateIndex
CREATE UNIQUE INDEX "Shipment_businessYear_mode_originCountry_code_key" ON "Shipment"("businessYear", "mode", "originCountry", "code");

-- CreateIndex
CREATE UNIQUE INDEX "AirDetail_shipmentId_key" ON "AirDetail"("shipmentId");

-- CreateIndex
CREATE UNIQUE INDEX "SeaDetail_shipmentId_key" ON "SeaDetail"("shipmentId");

-- CreateIndex
CREATE UNIQUE INDEX "RoadDetail_shipmentId_key" ON "RoadDetail"("shipmentId");

-- CreateIndex
CREATE INDEX "ShipmentLine_shipmentId_idx" ON "ShipmentLine"("shipmentId");

-- CreateIndex
CREATE INDEX "ShipmentLine_customerId_idx" ON "ShipmentLine"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "ShipmentEvent_idempotencyKey_key" ON "ShipmentEvent"("idempotencyKey");

-- CreateIndex
CREATE INDEX "ShipmentEvent_shipmentId_occurredAt_idx" ON "ShipmentEvent"("shipmentId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "Quote_number_key" ON "Quote"("number");

-- CreateIndex
CREATE INDEX "Quote_customerId_idx" ON "Quote"("customerId");

-- CreateIndex
CREATE INDEX "Quote_status_idx" ON "Quote"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_number_key" ON "Invoice"("number");

-- CreateIndex
CREATE INDEX "Invoice_customerId_idx" ON "Invoice"("customerId");

-- CreateIndex
CREATE INDEX "Invoice_status_idx" ON "Invoice"("status");

-- CreateIndex
CREATE INDEX "ChargeLineItem_quoteId_idx" ON "ChargeLineItem"("quoteId");

-- CreateIndex
CREATE INDEX "ChargeLineItem_invoiceId_idx" ON "ChargeLineItem"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_idempotencyKey_key" ON "Payment"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Payment_customerId_idx" ON "Payment"("customerId");

-- CreateIndex
CREATE INDEX "PaymentAllocation_invoiceId_idx" ON "PaymentAllocation"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAllocation_paymentId_invoiceId_key" ON "PaymentAllocation"("paymentId", "invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "Document_storageKey_key" ON "Document"("storageKey");

-- CreateIndex
CREATE INDEX "Document_customerId_idx" ON "Document"("customerId");

-- CreateIndex
CREATE INDEX "Document_shipmentId_idx" ON "Document"("shipmentId");

-- CreateIndex
CREATE INDEX "Notification_status_idx" ON "Notification"("status");

-- CreateIndex
CREATE INDEX "Notification_customerId_idx" ON "Notification"("customerId");

-- CreateIndex
CREATE INDEX "AuditEvent_entityType_entityId_idx" ON "AuditEvent"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditEvent_actorUserId_createdAt_idx" ON "AuditEvent"("actorUserId", "createdAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeScope" ADD CONSTRAINT "EmployeeScope_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeePageAccess" ADD CONSTRAINT "EmployeePageAccess_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AirDetail" ADD CONSTRAINT "AirDetail_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeaDetail" ADD CONSTRAINT "SeaDetail_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoadDetail" ADD CONSTRAINT "RoadDetail_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentLine" ADD CONSTRAINT "ShipmentLine_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentLine" ADD CONSTRAINT "ShipmentLine_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentEvent" ADD CONSTRAINT "ShipmentEvent_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChargeLineItem" ADD CONSTRAINT "ChargeLineItem_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChargeLineItem" ADD CONSTRAINT "ChargeLineItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ----------------------------------------------------------------------------
-- CHECK constraints (Phase 2 data integrity; not expressible in Prisma schema)
-- ----------------------------------------------------------------------------

-- A user is EITHER staff OR a customer contact, never both.
ALTER TABLE "User" ADD CONSTRAINT "User_single_principal_chk"
  CHECK ("employeeId" IS NULL OR "customerId" IS NULL);

-- A charge line belongs to exactly one parent, matching its parentType.
ALTER TABLE "ChargeLineItem" ADD CONSTRAINT "ChargeLineItem_parent_chk" CHECK (
  ("parentType" = 'QUOTE'   AND "quoteId"   IS NOT NULL AND "invoiceId" IS NULL) OR
  ("parentType" = 'INVOICE' AND "invoiceId" IS NOT NULL AND "quoteId"   IS NULL)
);
ALTER TABLE "ChargeLineItem" ADD CONSTRAINT "ChargeLineItem_amounts_chk"
  CHECK ("quantity" > 0 AND "unitPrice" >= 0 AND "amount" >= 0);

-- Financial non-negativity / allocation sanity.
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_totals_chk"
  CHECK ("total" >= 0 AND "amountAllocated" >= 0 AND "amountAllocated" <= "total");
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_total_chk" CHECK ("total" >= 0);
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_amount_chk" CHECK ("amount" > 0);
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_amount_chk"
  CHECK ("amount" > 0);

-- Weights / volumes / counts are non-negative.
ALTER TABLE "ShipmentLine" ADD CONSTRAINT "ShipmentLine_measure_chk" CHECK (
  ("chargeableWeightKg" IS NULL OR "chargeableWeightKg" >= 0) AND
  ("volumeCbm" IS NULL OR "volumeCbm" >= 0) AND
  ("packages" IS NULL OR "packages" >= 0)
);
ALTER TABLE "AirDetail" ADD CONSTRAINT "AirDetail_weight_chk"
  CHECK ("chargeableWeightKg" IS NULL OR "chargeableWeightKg" >= 0);
ALTER TABLE "SeaDetail" ADD CONSTRAINT "SeaDetail_volume_chk"
  CHECK ("volumeCbm" IS NULL OR "volumeCbm" >= 0);

-- Business year within a sane range.
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_year_chk"
  CHECK ("businessYear" >= 2000 AND "businessYear" <= 2100);
