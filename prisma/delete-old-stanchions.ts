/**
 * Delete old duplicate stanchion products.
 *
 * Old model numbers: ANC-ST-{29,39}-{SINGLE,DOUBLE}
 * Canonical model numbers: ANC-STANCH-{SINGLE,DOUBLE}-{29,39}
 *
 * Run: npx tsx prisma/delete-old-stanchions.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("=== Deleting old duplicate stanchion products ===\n");

  const oldModels = [
    "ANC-ST-29-SINGLE",
    "ANC-ST-29-DOUBLE",
    "ANC-ST-39-SINGLE",
    "ANC-ST-39-DOUBLE",
  ];

  for (const modelNumber of oldModels) {
    const result = await prisma.manufacturerProduct.deleteMany({
      where: { modelNumber },
    });
    console.log(`  ${modelNumber}: deleted ${result.count} record(s)`);
  }

  // Show remaining stanchion products
  const remaining = await prisma.manufacturerProduct.findMany({
    where: {
      OR: [
        { productType: "stanchion" },
        { displayName: { contains: "stanchion", mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      modelNumber: true,
      displayName: true,
      pixelPitch: true,
      extendedSpecs: true,
    },
  });

  console.log(`\nRemaining stanchion products (${remaining.length}):`);
  for (const p of remaining) {
    const es = p.extendedSpecs as any;
    console.log(
      `  ${p.modelNumber} "${p.displayName}" pitch=${p.pixelPitch} displayWidthPx=${es?.displayWidthPx} displayHeightPx=${es?.displayHeightPx}`
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("Delete failed:", e);
    process.exit(1);
  });
