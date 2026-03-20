/**
 * Yaham NX Rate Card — Full product catalog with dual brightness variants.
 * Source: NX Yaham Rate Card - LGEUS Markup 02.16.26 EG.xlsx
 *
 * Each model has two LED package options (White SMD vs Black SMD) with
 * different brightness levels. Both are seeded as separate products.
 *
 * Run via: POST /api/products/seed-yaham
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface YahamProduct {
  modelNumber: string;
  displayName: string;
  productFamily: string;
  pixelPitch: number;
  cabinetWidthMm: number;
  cabinetHeightMm: number;
  cabinetDepthMm: number;
  weightKgPerCabinet: number;
  maxNits: number;
  maxPowerWattsPerCab: number;
  typicalPowerWattsPerCab: number;
  environment: "indoor" | "outdoor";
  ipRating: string;
  serviceType: string;
  refreshRate: number;
  costPerSqFt: number;
  application: string; // "Fixed Installation", "Stadium Perimeter", "Stadium Fascia"
  ledPackage: string; // "White SMD" or "Black SMD" or "MIP"
}

// ═══════════════════════════════════════════════════════════════════════════
// OUTDOOR — Radiance, Aura, Halo series
// ═══════════════════════════════════════════════════════════════════════════

const outdoor: YahamProduct[] = [
  // R2.5-MIP — single variant (MIP package)
  {
    modelNumber: "YAHAM-R2.5-MIP",
    displayName: "Yaham Radiance R2.5 MIP Outdoor (2.5mm, 3000 nits)",
    productFamily: "Radiance",
    pixelPitch: 2.5,
    cabinetWidthMm: 480, cabinetHeightMm: 540, cabinetDepthMm: 120,
    weightKgPerCabinet: 9.5,
    maxNits: 3000,
    maxPowerWattsPerCab: 150, typicalPowerWattsPerCab: 60,
    environment: "outdoor", ipRating: "IP66",
    serviceType: "front_rear", refreshRate: 5040,
    costPerSqFt: 536.25,
    application: "Fixed Installation", ledPackage: "MIP",
  },

  // R4 — White (7000 nits) and Black (5000 nits)
  {
    modelNumber: "YAHAM-R4-7000",
    displayName: "Yaham Radiance R4 Outdoor (3.91mm, 7000 nits)",
    productFamily: "Radiance",
    pixelPitch: 3.91,
    cabinetWidthMm: 1000, cabinetHeightMm: 1000, cabinetDepthMm: 120,
    weightKgPerCabinet: 31,
    maxNits: 7000,
    maxPowerWattsPerCab: 650, typicalPowerWattsPerCab: 260,
    environment: "outdoor", ipRating: "IP66",
    serviceType: "front_rear", refreshRate: 5040,
    costPerSqFt: 232.53,
    application: "Fixed Installation", ledPackage: "White SMD",
  },
  {
    modelNumber: "YAHAM-R4-5000",
    displayName: "Yaham Radiance R4 Outdoor (3.91mm, 5000 nits)",
    productFamily: "Radiance",
    pixelPitch: 3.91,
    cabinetWidthMm: 1000, cabinetHeightMm: 1000, cabinetDepthMm: 120,
    weightKgPerCabinet: 31,
    maxNits: 5000,
    maxPowerWattsPerCab: 650, typicalPowerWattsPerCab: 260,
    environment: "outdoor", ipRating: "IP66",
    serviceType: "front_rear", refreshRate: 5040,
    costPerSqFt: 311.78,
    application: "Fixed Installation", ledPackage: "Black SMD",
  },

  // R6 — 10000 nits and 7500 nits
  {
    modelNumber: "YAHAM-R6-10000",
    displayName: "Yaham Radiance R6 Outdoor (5.95mm, 10000 nits)",
    productFamily: "Radiance",
    pixelPitch: 5.95,
    cabinetWidthMm: 1000, cabinetHeightMm: 1000, cabinetDepthMm: 120,
    weightKgPerCabinet: 29.5,
    maxNits: 10000,
    maxPowerWattsPerCab: 650, typicalPowerWattsPerCab: 260,
    environment: "outdoor", ipRating: "IP66",
    serviceType: "front_rear", refreshRate: 7680,
    costPerSqFt: 260.14,
    application: "Fixed Installation", ledPackage: "White SMD",
  },
  {
    modelNumber: "YAHAM-R6-7500",
    displayName: "Yaham Radiance R6 Outdoor (5.95mm, 7500 nits)",
    productFamily: "Radiance",
    pixelPitch: 5.95,
    cabinetWidthMm: 1000, cabinetHeightMm: 1000, cabinetDepthMm: 120,
    weightKgPerCabinet: 29.5,
    maxNits: 7500,
    maxPowerWattsPerCab: 650, typicalPowerWattsPerCab: 260,
    environment: "outdoor", ipRating: "IP66",
    serviceType: "front_rear", refreshRate: 7680,
    costPerSqFt: 172.10,
    application: "Fixed Installation", ledPackage: "Black SMD",
  },

  // R8 — 10000 nits and 7500 nits
  {
    modelNumber: "YAHAM-R8-10000",
    displayName: "Yaham Radiance R8 Outdoor (8.33mm, 10000 nits)",
    productFamily: "Radiance",
    pixelPitch: 8.33,
    cabinetWidthMm: 1000, cabinetHeightMm: 1000, cabinetDepthMm: 120,
    weightKgPerCabinet: 29.5,
    maxNits: 10000,
    maxPowerWattsPerCab: 650, typicalPowerWattsPerCab: 260,
    environment: "outdoor", ipRating: "IP66",
    serviceType: "front_rear", refreshRate: 7680,
    costPerSqFt: 194.07,
    application: "Fixed Installation", ledPackage: "White SMD",
  },
  {
    modelNumber: "YAHAM-R8-7500",
    displayName: "Yaham Radiance R8 Outdoor (8.33mm, 7500 nits)",
    productFamily: "Radiance",
    pixelPitch: 8.33,
    cabinetWidthMm: 1000, cabinetHeightMm: 1000, cabinetDepthMm: 120,
    weightKgPerCabinet: 29.5,
    maxNits: 7500,
    maxPowerWattsPerCab: 650, typicalPowerWattsPerCab: 260,
    environment: "outdoor", ipRating: "IP66",
    serviceType: "front_rear", refreshRate: 7680,
    costPerSqFt: 142.16,
    application: "Fixed Installation", ledPackage: "Black SMD",
  },

  // R10 — 10000 nits and 7500 nits
  {
    modelNumber: "YAHAM-R10-10000",
    displayName: "Yaham Radiance R10 Outdoor (10mm, 10000 nits)",
    productFamily: "Radiance",
    pixelPitch: 10.417,
    cabinetWidthMm: 1000, cabinetHeightMm: 1000, cabinetDepthMm: 120,
    weightKgPerCabinet: 29.5,
    maxNits: 10000,
    maxPowerWattsPerCab: 650, typicalPowerWattsPerCab: 260,
    environment: "outdoor", ipRating: "IP66",
    serviceType: "front_rear", refreshRate: 7680,
    costPerSqFt: 154.79,
    application: "Fixed Installation", ledPackage: "White SMD",
  },
  {
    modelNumber: "YAHAM-R10-7500",
    displayName: "Yaham Radiance R10 Outdoor (10mm, 7500 nits)",
    productFamily: "Radiance",
    pixelPitch: 10.417,
    cabinetWidthMm: 1000, cabinetHeightMm: 1000, cabinetDepthMm: 120,
    weightKgPerCabinet: 29.5,
    maxNits: 7500,
    maxPowerWattsPerCab: 650, typicalPowerWattsPerCab: 260,
    environment: "outdoor", ipRating: "IP66",
    serviceType: "front_rear", refreshRate: 7680,
    costPerSqFt: 123.20,
    application: "Fixed Installation", ledPackage: "Black SMD",
  },

  // A10 — Aura Perimeter — 7500 nits and 6000 nits
  {
    modelNumber: "YAHAM-A10-7500",
    displayName: "Yaham Aura A10 Perimeter Outdoor (10mm, 7500 nits)",
    productFamily: "Aura",
    pixelPitch: 10,
    cabinetWidthMm: 1600, cabinetHeightMm: 900, cabinetDepthMm: 114,
    weightKgPerCabinet: 55,
    maxNits: 7500,
    maxPowerWattsPerCab: 680, typicalPowerWattsPerCab: 272,
    environment: "outdoor", ipRating: "IP66",
    serviceType: "front_rear", refreshRate: 7680,
    costPerSqFt: 206.59,
    application: "Stadium Perimeter", ledPackage: "White SMD",
  },
  {
    modelNumber: "YAHAM-A10-6000",
    displayName: "Yaham Aura A10 Perimeter Outdoor (10mm, 6000 nits)",
    productFamily: "Aura",
    pixelPitch: 10,
    cabinetWidthMm: 1600, cabinetHeightMm: 900, cabinetDepthMm: 114,
    weightKgPerCabinet: 55,
    maxNits: 6000,
    maxPowerWattsPerCab: 770, typicalPowerWattsPerCab: 308,
    environment: "outdoor", ipRating: "IP66",
    serviceType: "front_rear", refreshRate: 7680,
    costPerSqFt: 176.84,
    application: "Stadium Perimeter", ledPackage: "Black SMD",
  },

  // HO10T — Halo Fascia 10mm — 10000 nits and 7500 nits
  {
    modelNumber: "YAHAM-HO10T-10000",
    displayName: "Yaham Halo HO10T Fascia Outdoor (10mm, 10000 nits)",
    productFamily: "Halo",
    pixelPitch: 10,
    cabinetWidthMm: 800, cabinetHeightMm: 900, cabinetDepthMm: 130,
    weightKgPerCabinet: 33,
    maxNits: 10000,
    maxPowerWattsPerCab: 460, typicalPowerWattsPerCab: 184,
    environment: "outdoor", ipRating: "IP66",
    serviceType: "top", refreshRate: 7680,
    costPerSqFt: 176.45,
    application: "Stadium Fascia / Ribbon", ledPackage: "White SMD",
  },
  {
    modelNumber: "YAHAM-HO10T-7500",
    displayName: "Yaham Halo HO10T Fascia Outdoor (10mm, 7500 nits)",
    productFamily: "Halo",
    pixelPitch: 10,
    cabinetWidthMm: 800, cabinetHeightMm: 900, cabinetDepthMm: 130,
    weightKgPerCabinet: 33,
    maxNits: 7500,
    maxPowerWattsPerCab: 460, typicalPowerWattsPerCab: 184,
    environment: "outdoor", ipRating: "IP66",
    serviceType: "top", refreshRate: 7680,
    costPerSqFt: 145.17,
    application: "Stadium Fascia / Ribbon", ledPackage: "Black SMD",
  },

  // HO6T — Halo Fascia 6.25mm — 10000 nits and 7500 nits
  {
    modelNumber: "YAHAM-HO6T-10000",
    displayName: "Yaham Halo HO6T Fascia Outdoor (6.25mm, 10000 nits)",
    productFamily: "Halo",
    pixelPitch: 6.25,
    cabinetWidthMm: 800, cabinetHeightMm: 900, cabinetDepthMm: 130,
    weightKgPerCabinet: 33,
    maxNits: 10000,
    maxPowerWattsPerCab: 460, typicalPowerWattsPerCab: 184,
    environment: "outdoor", ipRating: "IP66",
    serviceType: "top", refreshRate: 7680,
    costPerSqFt: 293.20,
    application: "Stadium Fascia / Ribbon", ledPackage: "White SMD",
  },
  {
    modelNumber: "YAHAM-HO6T-7500",
    displayName: "Yaham Halo HO6T Fascia Outdoor (6.25mm, 7500 nits)",
    productFamily: "Halo",
    pixelPitch: 6.25,
    cabinetWidthMm: 800, cabinetHeightMm: 900, cabinetDepthMm: 130,
    weightKgPerCabinet: 33,
    maxNits: 7500,
    maxPowerWattsPerCab: 460, typicalPowerWattsPerCab: 184,
    environment: "outdoor", ipRating: "IP66",
    serviceType: "top", refreshRate: 7680,
    costPerSqFt: 205.45,
    application: "Stadium Fascia / Ribbon", ledPackage: "Black SMD",
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// INDOOR — Corona, Halo series
// ═══════════════════════════════════════════════════════════════════════════

const indoor: YahamProduct[] = [
  // C2.5-MIP — single variant
  {
    modelNumber: "YAHAM-C2.5-MIP",
    displayName: "Yaham Corona C2.5 MIP Indoor (2.5mm, 2000 nits)",
    productFamily: "Corona",
    pixelPitch: 2.5,
    cabinetWidthMm: 960, cabinetHeightMm: 960, cabinetDepthMm: 97,
    weightKgPerCabinet: 21,
    maxNits: 2000,
    maxPowerWattsPerCab: 370, typicalPowerWattsPerCab: 148,
    environment: "indoor", ipRating: "IP40",
    serviceType: "front_rear", refreshRate: 3840,
    costPerSqFt: 251.57,
    application: "Fixed Installation", ledPackage: "MIP",
  },

  // C2.5 — 2000 nits and 1200 nits
  {
    modelNumber: "YAHAM-C2.5-2000",
    displayName: "Yaham Corona C2.5 Indoor (2.5mm, 2000 nits)",
    productFamily: "Corona",
    pixelPitch: 2.5,
    cabinetWidthMm: 960, cabinetHeightMm: 960, cabinetDepthMm: 97,
    weightKgPerCabinet: 19.5,
    maxNits: 2000,
    maxPowerWattsPerCab: 370, typicalPowerWattsPerCab: 148,
    environment: "indoor", ipRating: "IP40",
    serviceType: "front_rear", refreshRate: 3840,
    costPerSqFt: 295.53,
    application: "Fixed Installation", ledPackage: "Black SMD",
  },
  {
    modelNumber: "YAHAM-C2.5-1200",
    displayName: "Yaham Corona C2.5 Indoor (2.5mm, 1200 nits)",
    productFamily: "Corona",
    pixelPitch: 2.5,
    cabinetWidthMm: 960, cabinetHeightMm: 960, cabinetDepthMm: 97,
    weightKgPerCabinet: 19.5,
    maxNits: 1200,
    maxPowerWattsPerCab: 410, typicalPowerWattsPerCab: 164,
    environment: "indoor", ipRating: "IP40",
    serviceType: "front_rear", refreshRate: 3840,
    costPerSqFt: 205.96,
    application: "Fixed Installation", ledPackage: "White SMD",
  },

  // C4 — 2000 nits and 1200 nits
  {
    modelNumber: "YAHAM-C4-2000",
    displayName: "Yaham Corona C4 Indoor (4mm, 2000 nits)",
    productFamily: "Corona",
    pixelPitch: 4,
    cabinetWidthMm: 960, cabinetHeightMm: 960, cabinetDepthMm: 97,
    weightKgPerCabinet: 19.5,
    maxNits: 2000,
    maxPowerWattsPerCab: 370, typicalPowerWattsPerCab: 148,
    environment: "indoor", ipRating: "IP40",
    serviceType: "front_rear", refreshRate: 3840,
    costPerSqFt: 178.09,
    application: "Fixed Installation", ledPackage: "Black SMD",
  },
  {
    modelNumber: "YAHAM-C4-1200",
    displayName: "Yaham Corona C4 Indoor (4mm, 1200 nits)",
    productFamily: "Corona",
    pixelPitch: 4,
    cabinetWidthMm: 960, cabinetHeightMm: 960, cabinetDepthMm: 97,
    weightKgPerCabinet: 19.5,
    maxNits: 1200,
    maxPowerWattsPerCab: 410, typicalPowerWattsPerCab: 164,
    environment: "indoor", ipRating: "IP40",
    serviceType: "front_rear", refreshRate: 3840,
    costPerSqFt: 142.33,
    application: "Fixed Installation", ledPackage: "White SMD",
  },

  // C6 — 2000 nits and 1200 nits
  {
    modelNumber: "YAHAM-C6-2000",
    displayName: "Yaham Corona C6 Indoor (6mm, 2000 nits)",
    productFamily: "Corona",
    pixelPitch: 6,
    cabinetWidthMm: 960, cabinetHeightMm: 960, cabinetDepthMm: 97,
    weightKgPerCabinet: 19.5,
    maxNits: 2000,
    maxPowerWattsPerCab: 370, typicalPowerWattsPerCab: 148,
    environment: "indoor", ipRating: "IP40",
    serviceType: "front_rear", refreshRate: 3840,
    costPerSqFt: 136.51,
    application: "Fixed Installation", ledPackage: "Black SMD",
  },
  {
    modelNumber: "YAHAM-C6-1200",
    displayName: "Yaham Corona C6 Indoor (6mm, 1200 nits)",
    productFamily: "Corona",
    pixelPitch: 6,
    cabinetWidthMm: 960, cabinetHeightMm: 960, cabinetDepthMm: 97,
    weightKgPerCabinet: 19.5,
    maxNits: 1200,
    maxPowerWattsPerCab: 410, typicalPowerWattsPerCab: 164,
    environment: "indoor", ipRating: "IP40",
    serviceType: "front_rear", refreshRate: 3840,
    costPerSqFt: 131.89,
    application: "Fixed Installation", ledPackage: "White SMD",
  },

  // C10 — 2000 nits and 1200 nits
  {
    modelNumber: "YAHAM-C10-2000",
    displayName: "Yaham Corona C10 Indoor (10mm, 2000 nits)",
    productFamily: "Corona",
    pixelPitch: 10,
    cabinetWidthMm: 960, cabinetHeightMm: 960, cabinetDepthMm: 97,
    weightKgPerCabinet: 19.5,
    maxNits: 2000,
    maxPowerWattsPerCab: 370, typicalPowerWattsPerCab: 148,
    environment: "indoor", ipRating: "IP40",
    serviceType: "front_rear", refreshRate: 3840,
    costPerSqFt: 112.22,
    application: "Fixed Installation", ledPackage: "Black SMD",
  },
  {
    modelNumber: "YAHAM-C10-1200",
    displayName: "Yaham Corona C10 Indoor (10mm, 1200 nits)",
    productFamily: "Corona",
    pixelPitch: 10,
    cabinetWidthMm: 960, cabinetHeightMm: 960, cabinetDepthMm: 97,
    weightKgPerCabinet: 19.5,
    maxNits: 1200,
    maxPowerWattsPerCab: 410, typicalPowerWattsPerCab: 164,
    environment: "indoor", ipRating: "IP40",
    serviceType: "front_rear", refreshRate: 3840,
    costPerSqFt: 104.92,
    application: "Fixed Installation", ledPackage: "White SMD",
  },

  // H10T — Halo Fascia Indoor — 2000 nits and 1200 nits
  {
    modelNumber: "YAHAM-H10T-2000",
    displayName: "Yaham Halo H10T Fascia Indoor (10mm, 2000 nits)",
    productFamily: "Halo",
    pixelPitch: 10,
    cabinetWidthMm: 960, cabinetHeightMm: 960, cabinetDepthMm: 150.8,
    weightKgPerCabinet: 26,
    maxNits: 2000,
    maxPowerWattsPerCab: 370, typicalPowerWattsPerCab: 148,
    environment: "indoor", ipRating: "IP40",
    serviceType: "top", refreshRate: 6000,
    costPerSqFt: 116.25,
    application: "Stadium Fascia / Ribbon", ledPackage: "Black SMD",
  },
  {
    modelNumber: "YAHAM-H10T-1200",
    displayName: "Yaham Halo H10T Fascia Indoor (10mm, 1200 nits)",
    productFamily: "Halo",
    pixelPitch: 10,
    cabinetWidthMm: 960, cabinetHeightMm: 960, cabinetDepthMm: 150.8,
    weightKgPerCabinet: 26,
    maxNits: 1200,
    maxPowerWattsPerCab: 410, typicalPowerWattsPerCab: 164,
    environment: "indoor", ipRating: "IP40",
    serviceType: "top", refreshRate: 6000,
    costPerSqFt: 110.13,
    application: "Stadium Fascia / Ribbon", ledPackage: "White SMD",
  },
];

// ═══════════════════════════════════════════════════════════════════════════

const ALL_PRODUCTS = [...outdoor, ...indoor];

export async function seedYahamRateCard(): Promise<{ created: number; updated: number; total: number }> {
  let created = 0;
  let updated = 0;

  for (const p of ALL_PRODUCTS) {
    const data = {
      manufacturer: "Yaham",
      productFamily: p.productFamily,
      displayName: p.displayName,
      productType: "led" as const,
      pixelPitch: p.pixelPitch,
      cabinetWidthMm: p.cabinetWidthMm,
      cabinetHeightMm: p.cabinetHeightMm,
      cabinetDepthMm: p.cabinetDepthMm,
      weightKgPerCabinet: p.weightKgPerCabinet,
      maxNits: p.maxNits,
      maxPowerWattsPerCab: p.maxPowerWattsPerCab,
      typicalPowerWattsPerCab: p.typicalPowerWattsPerCab,
      environment: p.environment,
      ipRating: p.ipRating,
      serviceType: p.serviceType,
      refreshRate: p.refreshRate,
      costPerSqFt: p.costPerSqFt,
      isActive: true,
      sourceSpreadsheet: "NX Yaham Rate Card - LGEUS Markup 02.16.26 EG.xlsx",
      extendedSpecs: {
        application: p.application,
        ledPackage: p.ledPackage,
        priceDate: "2026-02-04",
        markupSource: "LGEUS 28%",
      },
    };

    await prisma.manufacturerProduct.upsert({
      where: { modelNumber: p.modelNumber },
      update: data,
      create: { modelNumber: p.modelNumber, ...data },
    });

    // Check if it was an insert or update (simple heuristic)
    const existing = await prisma.manufacturerProduct.findUnique({
      where: { modelNumber: p.modelNumber },
      select: { importedAt: true, updatedAt: true },
    });
    if (existing && existing.importedAt.getTime() === existing.updatedAt.getTime()) {
      created++;
    } else {
      updated++;
    }
  }

  return { created, updated, total: ALL_PRODUCTS.length };
}

// Allow direct execution
if (require.main === module) {
  seedYahamRateCard()
    .then((r) => {
      console.log(`Done: ${r.created} created, ${r.updated} updated, ${r.total} total`);
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
