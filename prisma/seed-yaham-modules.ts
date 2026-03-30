/**
 * Seed Yaham NX Rate Card module dimensions into ManufacturerProduct.
 *
 * Module dimensions come from the Yaham NX Rate Card spec sheets.
 * These enable sub-cabinet snapping: instead of jumping full cabinets (~1.6ft),
 * we snap in module increments (~0.79ft indoor, ~0.82ft outdoor).
 *
 * Run: npx tsx prisma/seed-yaham-modules.ts
 * Safe to re-run: only updates moduleWidthMm/moduleHeightMm on matching products.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Yaham NX Rate Card module dimensions (mm)
const YAHAM_MODULE_SPECS: Array<{
  skuPattern: string;
  moduleWidthMm: number;
  moduleHeightMm: number;
  description: string;
}> = [
  // Outdoor Radiance series
  { skuPattern: "R2.5",  moduleWidthMm: 240, moduleHeightMm: 270, description: "Radiance 2.5mm MIP" },
  { skuPattern: "R4",    moduleWidthMm: 500, moduleHeightMm: 250, description: "Radiance 4mm" },
  { skuPattern: "R6",    moduleWidthMm: 500, moduleHeightMm: 333, description: "Radiance 6mm" },
  { skuPattern: "R8",    moduleWidthMm: 500, moduleHeightMm: 333, description: "Radiance 8mm" },
  { skuPattern: "R10",   moduleWidthMm: 500, moduleHeightMm: 333, description: "Radiance 10mm" },
  { skuPattern: "A10",   moduleWidthMm: 400, moduleHeightMm: 300, description: "Aura 10mm" },
  { skuPattern: "HO10T", moduleWidthMm: 400, moduleHeightMm: 300, description: "Halo Outdoor 10mm" },
  { skuPattern: "HO6T",  moduleWidthMm: 400, moduleHeightMm: 300, description: "Halo Outdoor 6mm" },
  // Indoor Corona + Halo Indoor series
  { skuPattern: "C2.5",  moduleWidthMm: 240, moduleHeightMm: 240, description: "Corona 2.5mm MIP" },
  { skuPattern: "C4",    moduleWidthMm: 240, moduleHeightMm: 240, description: "Corona 4mm" },
  { skuPattern: "C6",    moduleWidthMm: 240, moduleHeightMm: 240, description: "Corona 6mm" },
  { skuPattern: "C10",   moduleWidthMm: 240, moduleHeightMm: 240, description: "Corona 10mm" },
  { skuPattern: "H10T",  moduleWidthMm: 240, moduleHeightMm: 240, description: "Halo Indoor 10mm" },
];

// Static catalog entries (from led-products.ts) — match by key prefix
const STATIC_MODULE_SPECS: Array<{
  modelPrefix: string;
  moduleWidthMm: number;
  moduleHeightMm: number;
  description: string;
}> = [
  { modelPrefix: "YAHAM-OUT-100", moduleWidthMm: 500, moduleHeightMm: 333, description: "Yaham Outdoor 10mm" },
  { modelPrefix: "YAHAM-OUT-160", moduleWidthMm: 500, moduleHeightMm: 333, description: "Yaham Outdoor 16mm" },
  { modelPrefix: "YAHAM-S3-039",  moduleWidthMm: 160, moduleHeightMm: 160, description: "Yaham S3 3.9mm" },
  { modelPrefix: "YAHAM-S3-060",  moduleWidthMm: 160, moduleHeightMm: 160, description: "Yaham S3 6mm" },
  { modelPrefix: "YAHAM-S3-100",  moduleWidthMm: 160, moduleHeightMm: 160, description: "Yaham S3 10mm" },
];

async function main() {
  console.log("=== Seeding Yaham NX module dimensions ===\n");

  // Step 1: Update DB products by SKU/model number pattern
  let dbUpdated = 0;
  for (const spec of YAHAM_MODULE_SPECS) {
    const result = await prisma.manufacturerProduct.updateMany({
      where: {
        isActive: true,
        OR: [
          { modelNumber: { contains: spec.skuPattern, mode: "insensitive" } },
          { displayName: { contains: spec.skuPattern, mode: "insensitive" } },
        ],
      },
      data: {
        moduleWidthMm: spec.moduleWidthMm,
        moduleHeightMm: spec.moduleHeightMm,
      },
    });
    if (result.count > 0) {
      console.log(`  ${spec.skuPattern.padEnd(8)} → ${result.count} product(s) updated  [${spec.moduleWidthMm}×${spec.moduleHeightMm}mm]  ${spec.description}`);
      dbUpdated += result.count;
    }
  }

  // Step 2: Update static catalog entries by exact model number
  let staticUpdated = 0;
  for (const spec of STATIC_MODULE_SPECS) {
    const result = await prisma.manufacturerProduct.updateMany({
      where: {
        modelNumber: spec.modelPrefix,
        isActive: true,
      },
      data: {
        moduleWidthMm: spec.moduleWidthMm,
        moduleHeightMm: spec.moduleHeightMm,
      },
    });
    if (result.count > 0) {
      console.log(`  ${spec.modelPrefix.padEnd(16)} → ${result.count} product(s)  [${spec.moduleWidthMm}×${spec.moduleHeightMm}mm]  ${spec.description}`);
      staticUpdated += result.count;
    }
  }

  // Summary
  const withModules = await prisma.manufacturerProduct.count({
    where: { isActive: true, moduleWidthMm: { not: null } },
  });
  const total = await prisma.manufacturerProduct.count({ where: { isActive: true } });

  console.log(`\n=== Done. Updated ${dbUpdated + staticUpdated} products. ${withModules}/${total} products have module dimensions. ===`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  });
