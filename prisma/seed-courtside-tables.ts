/**
 * Seed ANC Courtside Table products from UBERdisplays spec sheet (Quote #1213).
 *
 * Updates existing courtside products with correct brightness (1200 nits, not 5000)
 * and seeds missing products with exact dimensions from the spec sheet.
 *
 * Run: npx tsx prisma/seed-courtside-tables.ts
 * Safe to re-run: uses upsert on modelNumber.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const COURTSIDE_PRODUCTS = [
  // 2.9mm variants
  {
    modelNumber: "ANC-COURT-10FT-29",
    displayName: "ANC Courtside Table 10ft (2.9mm)",
    manufacturer: "ANC/UBERdisplays",
    productFamily: "Courtside Table",
    productType: "courtside",
    pixelPitch: 2.9,
    cabinetWidthMm: 2996,
    cabinetHeightMm: 750,
    maxNits: 1200,
    maxPowerWattsPerCab: 1500,
    weightKgPerCabinet: 188.2, // 415 lbs
    environment: "indoor",
    extendedSpecs: {
      resolutionX: 1008,
      resolutionY: 252,
      totalModules: 36,
      weightLbs: 415,
      quoteRef: "UBERdisplays #1213",
      tableLength: "10ft",
    },
  },
  {
    modelNumber: "ANC-COURT-8FT-29",
    displayName: "ANC Courtside Table 8ft (2.9mm)",
    manufacturer: "ANC/UBERdisplays",
    productFamily: "Courtside Table",
    productType: "courtside",
    pixelPitch: 2.9,
    cabinetWidthMm: 2490,
    cabinetHeightMm: 750,
    maxNits: 1200,
    maxPowerWattsPerCab: 1250,
    weightKgPerCabinet: 156.9, // 346 lbs
    environment: "indoor",
    extendedSpecs: {
      resolutionX: 840,
      resolutionY: 252,
      totalModules: 30,
      weightLbs: 346,
      quoteRef: "UBERdisplays #1213",
      tableLength: "8ft",
    },
  },
  {
    modelNumber: "ANC-COURT-6FT-29",
    displayName: "ANC Courtside Table 6ft (2.9mm)",
    manufacturer: "ANC/UBERdisplays",
    productFamily: "Courtside Table",
    productType: "courtside",
    pixelPitch: 2.9,
    cabinetWidthMm: 1999,
    cabinetHeightMm: 750,
    maxNits: 1200,
    maxPowerWattsPerCab: 1000,
    weightKgPerCabinet: 141.1, // 311 lbs
    environment: "indoor",
    extendedSpecs: {
      resolutionX: 672,
      resolutionY: 252,
      totalModules: 24,
      weightLbs: 311,
      quoteRef: "UBERdisplays #1213",
      tableLength: "6ft",
    },
  },
  // 3.9mm variants (same physical dims, different resolution)
  {
    modelNumber: "ANC-COURT-10FT-39",
    displayName: "ANC Courtside Table 10ft (3.9mm)",
    manufacturer: "ANC/UBERdisplays",
    productFamily: "Courtside Table",
    productType: "courtside",
    pixelPitch: 3.9,
    cabinetWidthMm: 2996,
    cabinetHeightMm: 750,
    maxNits: 1200,
    maxPowerWattsPerCab: 1500,
    weightKgPerCabinet: 188.2, // 415 lbs
    environment: "indoor",
    extendedSpecs: {
      resolutionX: 768,
      resolutionY: 192,
      totalModules: 36,
      weightLbs: 415,
      quoteRef: "UBERdisplays #1213",
      tableLength: "10ft",
    },
  },
  {
    modelNumber: "ANC-COURT-8FT-39",
    displayName: "ANC Courtside Table 8ft (3.9mm)",
    manufacturer: "ANC/UBERdisplays",
    productFamily: "Courtside Table",
    productType: "courtside",
    pixelPitch: 3.9,
    cabinetWidthMm: 2490,
    cabinetHeightMm: 750,
    maxNits: 1200,
    maxPowerWattsPerCab: 1250,
    weightKgPerCabinet: 156.9, // 346 lbs
    environment: "indoor",
    extendedSpecs: {
      resolutionX: 640,
      resolutionY: 192,
      totalModules: 30,
      weightLbs: 346,
      quoteRef: "UBERdisplays #1213",
      tableLength: "8ft",
    },
  },
  {
    modelNumber: "ANC-COURT-6FT-39",
    displayName: "ANC Courtside Table 6ft (3.9mm)",
    manufacturer: "ANC/UBERdisplays",
    productFamily: "Courtside Table",
    productType: "courtside",
    pixelPitch: 3.9,
    cabinetWidthMm: 1999,
    cabinetHeightMm: 750,
    maxNits: 1200,
    maxPowerWattsPerCab: 1000,
    weightKgPerCabinet: 141.1, // 311 lbs
    environment: "indoor",
    extendedSpecs: {
      resolutionX: 512,
      resolutionY: 192,
      totalModules: 24,
      weightLbs: 311,
      quoteRef: "UBERdisplays #1213",
      tableLength: "6ft",
    },
  },
];

async function main() {
  console.log("=== Seeding Courtside Table products (UBERdisplays #1213) ===\n");

  // Step 1: Fix any existing courtside products with wrong nits
  const fixedNits = await prisma.manufacturerProduct.updateMany({
    where: {
      isActive: true,
      OR: [
        { productType: "courtside" },
        { displayName: { contains: "courtside", mode: "insensitive" } },
        { displayName: { contains: "court side", mode: "insensitive" } },
      ],
      maxNits: { gt: 1200 },
    },
    data: { maxNits: 1200 },
  });
  if (fixedNits.count > 0) {
    console.log(`  Fixed ${fixedNits.count} existing courtside product(s) brightness → 1200 nits`);
  }

  // Step 2: Upsert all courtside products
  let created = 0;
  let updated = 0;
  for (const p of COURTSIDE_PRODUCTS) {
    const result = await prisma.manufacturerProduct.upsert({
      where: { modelNumber: p.modelNumber },
      create: {
        ...p,
        serviceType: "front",
        supportsHalfModule: false,
        isCurved: false,
        sourceSpreadsheet: "UBERdisplays Quote #1213",
      },
      update: {
        displayName: p.displayName,
        pixelPitch: p.pixelPitch,
        cabinetWidthMm: p.cabinetWidthMm,
        cabinetHeightMm: p.cabinetHeightMm,
        maxNits: p.maxNits,
        maxPowerWattsPerCab: p.maxPowerWattsPerCab,
        weightKgPerCabinet: p.weightKgPerCabinet,
        extendedSpecs: p.extendedSpecs,
      },
    });
    // Check if it was created or updated by comparing importedAt vs updatedAt
    const isNew = result.importedAt.getTime() === result.updatedAt.getTime();
    if (isNew) created++;
    else updated++;
    console.log(`  ${isNew ? "+" : "~"} ${p.modelNumber.padEnd(25)} ${p.displayName} (${p.maxNits} nits)`);
  }

  const total = await prisma.manufacturerProduct.count({
    where: { isActive: true, productType: "courtside" },
  });
  console.log(`\n=== Done. Created ${created}, updated ${updated}. ${total} courtside products in DB. ===`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  });
