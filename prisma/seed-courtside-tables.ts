/**
 * Seed ANC Courtside Table + Stanchion products with pricing.
 *
 * Pricing from Natalia's reference sheet (April 2026).
 * Physical specs from UBERdisplays Quote #1213.
 *
 * Run: npx tsx prisma/seed-courtside-tables.ts
 * Safe to re-run: uses upsert on modelNumber.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const COURTSIDE_PRODUCTS = [
  // ═══════════════════════════════════════════════════════════════
  // COURTSIDE TABLES — 2.9mm
  // ═══════════════════════════════════════════════════════════════
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
      costModel: "per_unit",
      unitCost: 18145,
      unitSalePrice: 35000,
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
      costModel: "per_unit",
      unitCost: 17125,
      unitSalePrice: 31250,
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
      costModel: "per_unit",
      unitCost: 16064,
      unitSalePrice: 28000,
      resolutionX: 672,
      resolutionY: 252,
      totalModules: 24,
      weightLbs: 311,
      quoteRef: "UBERdisplays #1213",
      tableLength: "6ft",
    },
  },
  {
    modelNumber: "ANC-COURT-5FT-29",
    displayName: "ANC Courtside Table 5ft (2.9mm)",
    manufacturer: "ANC/UBERdisplays",
    productFamily: "Courtside Table",
    productType: "courtside",
    pixelPitch: 2.9,
    cabinetWidthMm: 1498,
    cabinetHeightMm: 750,
    maxNits: 1200,
    maxPowerWattsPerCab: 800,
    weightKgPerCabinet: 118, // ~260 lbs est.
    environment: "indoor",
    extendedSpecs: {
      costModel: "per_unit",
      unitCost: 18145,
      unitSalePrice: 35000,
      resolutionX: 504,
      resolutionY: 252,
      totalModules: 18,
      weightLbs: 260,
      quoteRef: "UBERdisplays #1213",
      tableLength: "5ft",
    },
  },

  // ═══════════════════════════════════════════════════════════════
  // COURTSIDE TABLES — 3.9mm
  // ═══════════════════════════════════════════════════════════════
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
      costModel: "per_unit",
      unitCost: 16560,
      unitSalePrice: 30000,
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
      costModel: "per_unit",
      unitCost: 15851,
      unitSalePrice: 26500,
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
      costModel: "per_unit",
      unitCost: 15100,
      unitSalePrice: 24500,
      resolutionX: 512,
      resolutionY: 192,
      totalModules: 24,
      weightLbs: 311,
      quoteRef: "UBERdisplays #1213",
      tableLength: "6ft",
    },
  },
  {
    modelNumber: "ANC-COURT-5FT-39",
    displayName: "ANC Courtside Table 5ft (3.9mm)",
    manufacturer: "ANC/UBERdisplays",
    productFamily: "Courtside Table",
    productType: "courtside",
    pixelPitch: 3.9,
    cabinetWidthMm: 1498,
    cabinetHeightMm: 750,
    maxNits: 1200,
    maxPowerWattsPerCab: 800,
    weightKgPerCabinet: 118, // ~260 lbs est.
    environment: "indoor",
    extendedSpecs: {
      costModel: "per_unit",
      unitCost: 16560,
      unitSalePrice: 30000,
      resolutionX: 384,
      resolutionY: 192,
      totalModules: 18,
      weightLbs: 260,
      quoteRef: "UBERdisplays #1213",
      tableLength: "5ft",
    },
  },

  // ═══════════════════════════════════════════════════════════════
  // STANCHIONS — 2.9mm
  // ═══════════════════════════════════════════════════════════════
  {
    modelNumber: "ANC-STANCH-SINGLE-29",
    displayName: "ANC Stanchion Single (2.9mm)",
    manufacturer: "ANC/UBERdisplays",
    productFamily: "Stanchion",
    productType: "stanchion",
    pixelPitch: 2.9,
    cabinetWidthMm: 750,
    cabinetHeightMm: 1500,
    maxNits: 1200,
    maxPowerWattsPerCab: 600,
    weightKgPerCabinet: 45.4, // ~100 lbs
    environment: "indoor",
    extendedSpecs: {
      costModel: "per_unit",
      unitCost: 7006,
      unitSalePrice: 45000,
      resolutionX: 252,
      resolutionY: 504,
      weightLbs: 100,
      stanchionType: "single",
      quoteRef: "UBERdisplays #1213",
    },
  },
  {
    modelNumber: "ANC-STANCH-DOUBLE-29",
    displayName: "ANC Stanchion Double (2.9mm)",
    manufacturer: "ANC/UBERdisplays",
    productFamily: "Stanchion",
    productType: "stanchion",
    pixelPitch: 2.9,
    cabinetWidthMm: 750,
    cabinetHeightMm: 1500,
    maxNits: 1200,
    maxPowerWattsPerCab: 1200,
    weightKgPerCabinet: 90.7, // ~200 lbs
    environment: "indoor",
    extendedSpecs: {
      costModel: "per_unit",
      unitCost: 17605,
      unitSalePrice: 50000,
      resolutionX: 252,
      resolutionY: 504,
      weightLbs: 200,
      stanchionType: "double",
      quoteRef: "UBERdisplays #1213",
    },
  },

  // ═══════════════════════════════════════════════════════════════
  // STANCHIONS — 3.9mm
  // ═══════════════════════════════════════════════════════════════
  {
    modelNumber: "ANC-STANCH-SINGLE-39",
    displayName: "ANC Stanchion Single (3.9mm)",
    manufacturer: "ANC/UBERdisplays",
    productFamily: "Stanchion",
    productType: "stanchion",
    pixelPitch: 3.9,
    cabinetWidthMm: 750,
    cabinetHeightMm: 1500,
    maxNits: 1200,
    maxPowerWattsPerCab: 600,
    weightKgPerCabinet: 45.4, // ~100 lbs
    environment: "indoor",
    extendedSpecs: {
      costModel: "per_unit",
      unitCost: 5898,
      unitSalePrice: 30000,
      resolutionX: 192,
      resolutionY: 384,
      weightLbs: 100,
      stanchionType: "single",
      quoteRef: "UBERdisplays #1213",
    },
  },
  {
    modelNumber: "ANC-STANCH-DOUBLE-39",
    displayName: "ANC Stanchion Double (3.9mm)",
    manufacturer: "ANC/UBERdisplays",
    productFamily: "Stanchion",
    productType: "stanchion",
    pixelPitch: 3.9,
    cabinetWidthMm: 750,
    cabinetHeightMm: 1500,
    maxNits: 1200,
    maxPowerWattsPerCab: 1200,
    weightKgPerCabinet: 90.7, // ~200 lbs
    environment: "indoor",
    extendedSpecs: {
      costModel: "per_unit",
      unitCost: 14752,
      unitSalePrice: 33000,
      resolutionX: 192,
      resolutionY: 384,
      weightLbs: 200,
      stanchionType: "double",
      quoteRef: "UBERdisplays #1213",
    },
  },
];

async function main() {
  console.log("=== Seeding Courtside Table + Stanchion products ===\n");

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

  // Step 2: Upsert all products
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
        productFamily: p.productFamily,
        productType: p.productType,
        pixelPitch: p.pixelPitch,
        cabinetWidthMm: p.cabinetWidthMm,
        cabinetHeightMm: p.cabinetHeightMm,
        maxNits: p.maxNits,
        maxPowerWattsPerCab: p.maxPowerWattsPerCab,
        weightKgPerCabinet: p.weightKgPerCabinet,
        extendedSpecs: p.extendedSpecs,
      },
    });
    const isNew = result.importedAt.getTime() === result.updatedAt.getTime();
    if (isNew) created++;
    else updated++;
    const price = (p.extendedSpecs as any).unitCost;
    const sale = (p.extendedSpecs as any).unitSalePrice;
    console.log(`  ${isNew ? "+" : "~"} ${p.modelNumber.padEnd(28)} ${p.displayName.padEnd(42)} $${price.toLocaleString()} → $${sale.toLocaleString()}`);
  }

  const courtside = await prisma.manufacturerProduct.count({
    where: { isActive: true, productType: "courtside" },
  });
  const stanchion = await prisma.manufacturerProduct.count({
    where: { isActive: true, productType: "stanchion" },
  });
  console.log(`\n=== Done. Created ${created}, updated ${updated}. ${courtside} courtside + ${stanchion} stanchion products in DB. ===`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  });
