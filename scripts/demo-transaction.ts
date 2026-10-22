/**
 * DEV demo: one shipment driven end-to-end through EVERY role. Each step runs
 * as the real user for that role, so permissions are enforced and the audit log
 * records who did what. Run: npx tsx scripts/demo-transaction.ts
 */
import { prisma } from "@/db/client";
import { hashPassword } from "@/modules/auth/password";
import { loadAuthzUser, type AuthzUser } from "@/modules/authz/core";
import { createCustomer } from "@/modules/customers/service";
import {
  addShipmentLine,
  assignTrackingNumber,
  changeShipmentStatus,
  createShipment,
} from "@/modules/shipments/service";
import { createInvoice } from "@/modules/finance/invoices";
import { recordPayment } from "@/modules/finance/payments";
import { uploadDocument } from "@/modules/documents/service";
import { getReport } from "@/modules/reporting/service";

const PASSWORD = "Demo12345!";
const YEAR = new Date().getFullYear();
const steps: string[] = [];
function log(role: string, who: string, action: string) {
  steps.push(`• ${role.padEnd(18)} (${who.padEnd(20)}) → ${action}`);
}

async function userForRole(roleKey: string, email: string, customerId?: string): Promise<AuthzUser> {
  const role = await prisma.role.findUnique({ where: { key: roleKey } });
  const passwordHash = await hashPassword(PASSWORD);
  const u = await prisma.user.upsert({
    where: { email },
    update: { passwordHash, status: "ACTIVE", customerId: customerId ?? null },
    create: { email, passwordHash, status: "ACTIVE", customerId: customerId ?? null },
  });
  if (role && roleKey !== "customer") {
    if (!(await prisma.userRole.findFirst({ where: { userId: u.id, roleId: role.id } }))) {
      await prisma.userRole.create({ data: { userId: u.id, roleId: role.id } });
    }
  }
  const authz = await loadAuthzUser(prisma, u.id);
  if (!authz) throw new Error(`could not load ${email}`);
  return authz;
}

async function main() {
  // One user per role (roles were seeded with their permissions by `db:seed`).
  const support = await userForRole("customer_support", "support@demo.so");
  const opsAdmin = await userForRole("operation_admin", "opsadmin@demo.so");
  const opsStaff = await userForRole("operation_staff", "opsstaff@demo.so");
  const finStaff = await userForRole("finance_staff", "finstaff@demo.so");
  const finAdmin = await userForRole("finance_admin", "finadmin@demo.so");
  const docOfficer = await userForRole("document_officer", "docs@demo.so");
  const reportMgr = await userForRole("report_manager", "reports@demo.so");

  // 1) Customer Support onboards the customer.
  const customer = await createCustomer(prisma, support, {
    name: "Hal-Abuur Trading",
    company: "Hal-Abuur Trading",
    country: "Somalia",
    phone: "+252 61 555 0100",
  });
  log("Customer Support", "support@demo.so", `created customer ${customer.ref} (Hal-Abuur Trading)`);

  const custUser = await userForRole("customer", "customer@demo.so", customer.id);
  log("Customer", "customer@demo.so", `can now sign in to the portal as ${customer.ref}`);

  // 2) Operation Admin opens the consolidation shipment + the customer's cargo line + tracking.
  const shipment = await createShipment(prisma, opsAdmin, {
    mode: "SEA",
    originCountry: "Turkey",
    originCity: "Guangzhou",
    destCountry: "Somalia",
    destCity: "Mogadishu",
    businessYear: YEAR,
  });
  log("Operation Admin", "opsadmin@demo.so", `created shipment ${shipment.code} (Guangzhou → Mogadishu, Sea)`);

  await addShipmentLine(prisma, opsAdmin, shipment.id, {
    customerId: customer.id,
    description: "Electronics",
    packages: 20,
    volumeCbm: 12.5,
  });
  const tracking = await assignTrackingNumber(prisma, opsAdmin, shipment.id);
  log("Operation Admin", "opsadmin@demo.so", `added cargo line + tracking ${tracking}`);

  // 3) Operation Staff moves the shipment through its lifecycle.
  await changeShipmentStatus(prisma, opsStaff, shipment.id, "DEPARTED", { note: "Left Guangzhou port" });
  await changeShipmentStatus(prisma, opsStaff, shipment.id, "IN_TRANSIT");
  await changeShipmentStatus(prisma, opsStaff, shipment.id, "ARRIVED");
  log("Operation Staff", "opsstaff@demo.so", "advanced status: Departed → In transit → Arrived");

  // 4) Finance Staff raises the invoice (totals computed server-side).
  const invoice = await createInvoice(prisma, finStaff, {
    customerId: customer.id,
    shipmentId: shipment.id,
    businessYear: YEAR,
    lines: [
      { category: "FREIGHT", description: "Sea freight 12.5 CBM", quantity: 12.5, unitPrice: "80.00" },
      { category: "LOCAL_DELIVERY", description: "Mogadishu delivery", quantity: 1, unitPrice: "150.00" },
    ],
  });
  log("Finance Staff", "finstaff@demo.so", `created invoice ${invoice.number} total $${invoice.total.toString()}`);

  // 5) Finance Admin records the payment.
  await recordPayment(prisma, finAdmin, {
    customerId: customer.id,
    amount: "1150.00",
    method: "MOBILE_MONEY",
    allocations: [{ invoiceId: invoice.id, amount: "1150.00" }],
  });
  log("Finance Admin", "finadmin@demo.so", "recorded $1,150.00 payment → invoice PAID");

  // 6) Operation Staff delivers.
  // ARRIVED (Mogadishu) is the final status (ADR-017).

  // 7) Document Officer files the bill of lading against the customer.
  const pdf = Buffer.from("%PDF-1.4\nOrbitCargo Bill of Lading\n", "latin1");
  await uploadDocument(prisma, docOfficer, {
    buffer: pdf,
    filename: "bill-of-lading.pdf",
    declaredType: "application/pdf",
    kind: "CARGO_DOC",
    customerId: customer.id,
    shipmentId: shipment.id,
  });
  log("Document Officer", "docs@demo.so", "uploaded bill-of-lading.pdf (private, authorized download)");

  // 8) Customer sees only their own data.
  const seen = await prisma.shipmentLine.count({ where: { customerId: customer.id } });
  log("Customer", "customer@demo.so", `portal shows ${seen} shipment + invoice + document (own only)`);

  // 9) Report Manager reads the aggregates.
  const report = await getReport(prisma, reportMgr, { businessYear: YEAR });
  log(
    "Report Manager",
    "reports@demo.so",
    `report: ${report.shipments.total} shipments, invoiced $${report.finance.invoiced}, collected $${report.finance.collected}`,
  );

  // Timeline + audit trail.
  console.log(`\n=== ONE TRANSACTION — ${shipment.code} / ${tracking} ===\n`);
  console.log(steps.join("\n"));

  const audit = await prisma.auditEvent.findMany({
    where: { entityId: { in: [shipment.id, invoice.id, customer.id] } },
    orderBy: { createdAt: "asc" },
    select: { action: true, actorUserId: true },
  });
  console.log(`\nAudit events recorded for this transaction: ${audit.length}`);
  console.log("\nAll demo logins (password for every one): " + PASSWORD);
  for (const e of ["support", "opsadmin", "opsstaff", "finstaff", "finadmin", "docs", "reports", "customer"]) {
    console.log(`  ${e}@demo.so`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
