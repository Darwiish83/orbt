import type { PrismaClient } from "@prisma/client";

const START = 3000;

/**
 * Next customer reference OR-#### (starts at OR-3000), choosing the lowest free
 * integer above the current max. The DB unique constraint on Customer.ref plus
 * a caller retry guards against concurrent allocation.
 */
export async function nextCustomerRef(db: PrismaClient): Promise<string> {
  const customers = await db.customer.findMany({ select: { ref: true } });
  let max = START - 1;
  for (const c of customers) {
    const m = /^OR-(\d+)$/.exec(c.ref);
    if (m) {
      const n = parseInt(m[1]!, 10);
      if (n > max) max = n;
    }
  }
  return `OR-${max + 1}`;
}
