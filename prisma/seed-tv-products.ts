/**
 * Seed LG TV products into ManufacturerProduct table.
 *
 * Run: npx tsx prisma/seed-tv-products.ts
 *
 * Source: "anc l LG TV Quote Bid Form & Template.xlsx" — UH Cost Template tab
 * Provided by Jireh Billings, Feb 24 2026.
 *
 * TVs are priced per unit (not per sqft like LED).
 * Unit pricing stored in extendedSpecs: { unitCost, unitSellPrice, tvSizeInches, margin }
 * cabinetWidthMm/cabinetHeightMm = physical TV dimensions (single unit = one "cabinet")
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Standard 16:9 TV dimensions (mm) by screen size
const TV_DIMENSIONS: Record<number, { w: number; h: number; weight: number }> = {
  32:  { w: 732,  h: 432,  weight: 5.0 },
  43:  { w: 970,  h: 567,  weight: 8.5 },
  49:  { w: 1107, h: 643,  weight: 11.0 },
  55:  { w: 1241, h: 720,  weight: 14.5 },
  65:  { w: 1462, h: 845,  weight: 21.0 },
  75:  { w: 1685, h: 971,  weight: 28.5 },
  86:  { w: 1935, h: 1114, weight: 38.0 },
  98:  { w: 2199, h: 1265, weight: 55.0 },
  110: { w: 2467, h: 1418, weight: 65.0 },
};

const LG_TV_UH_SERIES = [
  { model: "LG 32SM5J-B",   size: 32,  cost: 390,   margin: 0.20 },
  { model: "LG 43UH5J-H",   size: 43,  cost: 600,   margin: 0.20 },
  { model: "LG 49UH5J-H",   size: 49,  cost: 637.5, margin: 0.20 },
  { model: "LG 55UH5J-H",   size: 55,  cost: 875,   margin: 0.20 },
  { model: "LG 65UH5J-H",   size: 65,  cost: 1100,  margin: 0.20 },
  { model: "LG 75UH5J-M",   size: 75,  cost: 1990,  margin: 0.20 },
  { model: "LG 86UH5J-H",   size: 86,  cost: 2990,  margin: 0.20 },
  { model: "LG 98UH5J-H",   size: 98,  cost: 4300,  margin: 0.20 },
  { model: "LG 110UM5K-B",  size: 110, cost: 10000, margin: 0.20 },
];

function buildProducts() {
  return LG_TV_UH_SERIES.map((tv) => {
    const dims = TV_DIMENSIONS[tv.size];
    const sellPrice = tv.cost / (1 - tv.margin);
    return {
      manufacturer: "LG",
      productFamily: "UH Series",
      modelNumber: tv.model.replace(/\s+/g, "-").toUpperCase(),
      displayName: `${tv.model} ${tv.size}" TV`,
      productType: "tv",
      pixelPitch: 0, // Not applicable for TVs
      cabinetWidthMm: dims.w,
      cabinetHeightMm: dims.h,
      weightKgPerCabinet: dims.weight,
      maxNits: 500, // Standard commercial TV brightness
      maxPowerWattsPerCab: Math.round(tv.size * 1.5), // Approximate
      environment: "indoor" as const,
      serviceType: "front",
      supportsHalfModule: false,
      isCurved: false,
      extendedSpecs: {
        tvSizeInches: tv.size,
        unitCost: tv.cost,
        unitSellPrice: Math.round(sellPrice * 100) / 100,
        margin: tv.margin,
        series: "UH",
      },
      sourceSpreadsheet: "anc l LG TV Quote Bid Form & Template.xlsx",
    };
  });
}

async function main() {
  console.log("Seeding LG TV products (UH Series)...\n");

  const products = buildProducts();
  let created = 0;
  let skipped = 0;

  for (const product of products) {
    const existing = await prisma.manufacturerProduct.findUnique({
      where: { modelNumber: product.modelNumber },
    });

    if (existing) {
      console.log(`  SKIP ${product.modelNumber} (already exists)`);
      skipped++;
      continue;
    }

    await prisma.manufacturerProduct.create({ data: product });
    console.log(`  CREATE ${product.modelNumber} — ${product.displayName} — $${(product.extendedSpecs as any).unitCost} cost / $${(product.extendedSpecs as any).unitSellPrice} sell`);
    created++;
  }

  console.log(`\nDone: ${created} created, ${skipped} skipped.`);
  const total = await prisma.manufacturerProduct.count();
  console.log(`Total products in database: ${total}`);
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
