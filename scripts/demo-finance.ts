/**
 * DEV demo data for Finance (Phase 15): customers and Turkey/India air and sea
 * shipments with cargo lines, created through the real services as the dev
 * super admin. Safe to re-run (it only adds when no demo shipment exists).
 * Run: npx tsx scripts/demo-finance.ts <admin-email>
 */
import { prisma } from "@/db/client";
import { loadAuthzUser } from "@/modules/authz/core";
import { createCustomer } from "@/modules/customers/service";
import { addShipmentLine, changeShipmentStatus, createShipment } from "@/modules/shipments/service";

async function main() {
  const email = process.argv[2];
  if (!email) throw new Error("Usage: tsx scripts/demo-finance.ts <admin-email>");
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  const admin = user && (await loadAuthzUser(prisma, user.id));
  if (!admin?.isSuperAdmin) throw new Error("Pass the email of an active super admin");
  if (await prisma.shipment.findFirst({ where: { businessYear: 2026, originCountry: "Turkey" } })) {
    console.log("Demo shipments already exist — nothing to do.");
    return;
  }

  const people = [
    ["Hal-Abuur Trading", "+252 61 555 0101", "Electronics"],
    ["Bakaal Market", "+252 61 555 0102", "Clothes"],
    ["Daryeel Pharmacy", "+252 61 555 0103", "Medicine"],
    ["Xamar Furniture", "+252 61 555 0104", "Furniture"],
  ] as const;
  const customers = [];
  for (const [name, phone, cargo] of people) {
    customers.push(await createCustomer(prisma, admin, { name, company: name, phone, cargoCategory: cargo, location: "Mogadishu" }));
  }

  const w1 = await createShipment(prisma, admin, { mode: "AIR", originCountry: "Turkey", originCity: "Istanbul", businessYear: 2026, shipDate: new Date("2026-10-02"), arrivalDate: new Date("2026-10-06"), awbNumber: "235-1234 5675" });
  await addShipmentLine(prisma, admin, w1.id, { customerId: customers[0]!.id, packages: 10, chargeableWeightKg: "120", mixCount: 2, mixKg: "8", rate: "6", qualityRate: "0.5", fatura: "20", delivery: "15" });
  await addShipmentLine(prisma, admin, w1.id, { customerId: customers[1]!.id, packages: 6, chargeableWeightKg: "84.5", rate: "6", brandPcs: 4, brandRate: "3" });
  await addShipmentLine(prisma, admin, w1.id, { customerId: customers[2]!.id, packages: 3, chargeableWeightKg: "40", rate: "6.5" });
  await changeShipmentStatus(prisma, admin, w1.id, "DEPARTED");
  await changeShipmentStatus(prisma, admin, w1.id, "IN_TRANSIT");
  await changeShipmentStatus(prisma, admin, w1.id, "ARRIVED");
  // Arrived a week ago, so the demurrage list has something to show.
  await prisma.shipment.update({ where: { id: w1.id }, data: { arrivedAt: new Date(Date.now() - 7 * 86_400_000) } });

  const w2 = await createShipment(prisma, admin, { mode: "AIR", originCountry: "Turkey", originCity: "Istanbul", businessYear: 2026, shipDate: new Date("2026-10-16") });
  await addShipmentLine(prisma, admin, w2.id, { customerId: customers[0]!.id, packages: 4, chargeableWeightKg: "55", rate: "6" });
  await addShipmentLine(prisma, admin, w2.id, { customerId: customers[3]!.id, packages: 8, chargeableWeightKg: "160", rate: "5.8" });

  const c1 = await createShipment(prisma, admin, { mode: "SEA", originCountry: "Turkey", originCity: "Mersin", businessYear: 2026, shipDate: new Date("2026-09-20") });
  await addShipmentLine(prisma, admin, c1.id, { customerId: customers[3]!.id, packages: 20, volumeCbm: "6.5", rate: "180" });
  await addShipmentLine(prisma, admin, c1.id, { customerId: customers[1]!.id, packages: 12, volumeCbm: "3.2", rate: "185" });

  const india = await createShipment(prisma, admin, { mode: "AIR", originCountry: "India", originCity: "Mumbai", businessYear: 2026, shipDate: new Date("2026-10-10") });
  await addShipmentLine(prisma, admin, india.id, { customerId: customers[2]!.id, packages: 5, chargeableWeightKg: "70", rate: "5" });

  console.log("Demo data created: 4 customers; Turkey W-1 (arrived), W-2, C-1; India W-1.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
