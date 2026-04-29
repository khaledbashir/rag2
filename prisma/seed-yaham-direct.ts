/**
 * Yaham Direct Rate Card — 04.28.26 version (Exwork basis, no LGEUS markup).
 *
 * Source: NX Yaham Rate Card - ANC 04.28.26 EG.xlsx (Eric Gruner, 2026-04-28)
 * Prices: row 56 (outdoor) and row 55 (indoor) — "MSP/SQFT (USD) in Exwork basis"
 *
 * Mirrors the LG USA catalog (same 31 SKUs, same specs, same brightness split)
 * but under manufacturer "Yaham" with Exwork pricing. Natalia uses these when
 * the client contract allows quoting Yaham direct; uses LG USA when the client
 * requires LG-branded quotes.
 *
 * Run via: POST /api/products/seed-yaham-direct
 */

import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();

const SOURCE = "NX Yaham Rate Card - ANC 04.28.26 EG.xlsx";
const MANUFACTURER = "Yaham";

interface YahamProduct {
  modelNumber: string;
  displayName: string;
  productFamily: string;
  productLine: string;
  application: string;
  pixelPitch: number;
  cabinetWidthMm: number;
  cabinetHeightMm: number;
  cabinetDepthMm: number | null;
  weightKgPerCabinet: number;
  weightTBC?: boolean;
  maxNits: number;
  maxPowerWattsPerCab: number;
  typicalPowerWattsPerCab: number;
  environment: "indoor" | "outdoor";
  ipRating: string | null;
  serviceType: "front" | "rear" | "front_rear";
  costPerSqFt: number;           // Exwork basis — Yaham direct
}

const products: YahamProduct[] = [
  // ═════════════════════════════════════════════════════════════
  // OUTDOOR
  // ═════════════════════════════════════════════════════════════
  { modelNumber: "YAHAM-R2.5-MIP", displayName: "R2.5 Radiance MIP", productFamily: "Radiance", productLine: "Radiance MIP", application: "Fixed Installation",
    pixelPitch: 2.5, cabinetWidthMm: 480, cabinetHeightMm: 540, cabinetDepthMm: 120, weightKgPerCabinet: 9.5,
    maxNits: 3000, maxPowerWattsPerCab: 150, typicalPowerWattsPerCab: 60,
    environment: "outdoor", ipRating: "IP66", serviceType: "front_rear", costPerSqFt: 473.83 },
  { modelNumber: "YAHAM-R4-FS", displayName: "R4 Radiance FM", productFamily: "Radiance", productLine: "Radiance FM", application: "Fixed Installation",
    pixelPitch: 3.90625, cabinetWidthMm: 1000, cabinetHeightMm: 1000, cabinetDepthMm: 120, weightKgPerCabinet: 31,
    maxNits: 7000, maxPowerWattsPerCab: 650, typicalPowerWattsPerCab: 260,
    environment: "outdoor", ipRating: "IP66", serviceType: "front", costPerSqFt: 205.59 },
  { modelNumber: "YAHAM-R4-RS", displayName: "R4 Radiance RS", productFamily: "Radiance", productLine: "Radiance RS", application: "Fixed Installation",
    pixelPitch: 3.90625, cabinetWidthMm: 1000, cabinetHeightMm: 1000, cabinetDepthMm: 120, weightKgPerCabinet: 31,
    maxNits: 7000, maxPowerWattsPerCab: 505, typicalPowerWattsPerCab: 202,
    environment: "outdoor", ipRating: "IP66", serviceType: "rear", costPerSqFt: 275.64 },
  { modelNumber: "YAHAM-R6-HB", displayName: "R6 Radiance RS", productFamily: "Radiance", productLine: "Radiance RS", application: "Fixed Installation",
    pixelPitch: 5.95, cabinetWidthMm: 1000, cabinetHeightMm: 1000, cabinetDepthMm: 120, weightKgPerCabinet: 29.5,
    maxNits: 10000, maxPowerWattsPerCab: 650, typicalPowerWattsPerCab: 260,
    environment: "outdoor", ipRating: "IP66", serviceType: "rear", costPerSqFt: 229.94 },
  { modelNumber: "YAHAM-R6", displayName: "R6 Radiance FM", productFamily: "Radiance", productLine: "Radiance FM", application: "Fixed Installation",
    pixelPitch: 5.95, cabinetWidthMm: 1000, cabinetHeightMm: 1000, cabinetDepthMm: 120, weightKgPerCabinet: 29.5,
    maxNits: 7500, maxPowerWattsPerCab: 650, typicalPowerWattsPerCab: 260,
    environment: "outdoor", ipRating: "IP66", serviceType: "front", costPerSqFt: 152.18 },
  { modelNumber: "YAHAM-R8-HB", displayName: "R8 Radiance RS", productFamily: "Radiance", productLine: "Radiance RS", application: "Fixed Installation",
    pixelPitch: 8.33, cabinetWidthMm: 1000, cabinetHeightMm: 1000, cabinetDepthMm: 120, weightKgPerCabinet: 29.5,
    maxNits: 10000, maxPowerWattsPerCab: 650, typicalPowerWattsPerCab: 260,
    environment: "outdoor", ipRating: "IP66", serviceType: "rear", costPerSqFt: 171.59 },
  { modelNumber: "YAHAM-R8", displayName: "R8 Radiance FM", productFamily: "Radiance", productLine: "Radiance FM", application: "Fixed Installation",
    pixelPitch: 8.33, cabinetWidthMm: 1000, cabinetHeightMm: 1000, cabinetDepthMm: 120, weightKgPerCabinet: 29.5,
    maxNits: 7500, maxPowerWattsPerCab: 650, typicalPowerWattsPerCab: 260,
    environment: "outdoor", ipRating: "IP66", serviceType: "front", costPerSqFt: 125.70 },
  { modelNumber: "YAHAM-R10-HB", displayName: "R10 Radiance RS", productFamily: "Radiance", productLine: "Radiance RS", application: "Fixed Installation",
    pixelPitch: 10.4167, cabinetWidthMm: 1000, cabinetHeightMm: 1000, cabinetDepthMm: 120, weightKgPerCabinet: 29.5,
    maxNits: 10000, maxPowerWattsPerCab: 650, typicalPowerWattsPerCab: 260,
    environment: "outdoor", ipRating: "IP66", serviceType: "rear", costPerSqFt: 136.85 },
  { modelNumber: "YAHAM-R10", displayName: "R10 Radiance FM", productFamily: "Radiance", productLine: "Radiance FM", application: "Fixed Installation",
    pixelPitch: 10.4167, cabinetWidthMm: 1000, cabinetHeightMm: 1000, cabinetDepthMm: 120, weightKgPerCabinet: 29.5,
    maxNits: 7500, maxPowerWattsPerCab: 650, typicalPowerWattsPerCab: 260,
    environment: "outdoor", ipRating: "IP66", serviceType: "front", costPerSqFt: 108.98 },
  { modelNumber: "YAHAM-A10-HB", displayName: "A10 Aura RS", productFamily: "Aura", productLine: "Aura RS", application: "Stadium Perimeter",
    pixelPitch: 10, cabinetWidthMm: 1600, cabinetHeightMm: 900, cabinetDepthMm: 114, weightKgPerCabinet: 55,
    maxNits: 7500, maxPowerWattsPerCab: 680, typicalPowerWattsPerCab: 272,
    environment: "outdoor", ipRating: "IP66", serviceType: "rear", costPerSqFt: 182.71 },
  { modelNumber: "YAHAM-A10", displayName: "A10 Aura FM", productFamily: "Aura", productLine: "Aura FM", application: "Stadium Perimeter",
    pixelPitch: 10, cabinetWidthMm: 1600, cabinetHeightMm: 900, cabinetDepthMm: 114, weightKgPerCabinet: 55,
    maxNits: 6000, maxPowerWattsPerCab: 770, typicalPowerWattsPerCab: 308,
    environment: "outdoor", ipRating: "IP66", serviceType: "front", costPerSqFt: 156.39 },
  { modelNumber: "YAHAM-HO10T-HB", displayName: "HO10T Halo Fascia RS", productFamily: "Halo", productLine: "Halo Fascia RS", application: "Stadium Fascia",
    pixelPitch: 10, cabinetWidthMm: 800, cabinetHeightMm: 900, cabinetDepthMm: 130, weightKgPerCabinet: 33,
    maxNits: 10000, maxPowerWattsPerCab: 460, typicalPowerWattsPerCab: 184,
    environment: "outdoor", ipRating: "IP66", serviceType: "rear", costPerSqFt: 156.00 },
  { modelNumber: "YAHAM-HO10T", displayName: "HO10T Halo Fascia FM", productFamily: "Halo", productLine: "Halo Fascia FM", application: "Stadium Fascia",
    pixelPitch: 10, cabinetWidthMm: 800, cabinetHeightMm: 900, cabinetDepthMm: 130, weightKgPerCabinet: 33,
    maxNits: 7500, maxPowerWattsPerCab: 460, typicalPowerWattsPerCab: 184,
    environment: "outdoor", ipRating: "IP66", serviceType: "front", costPerSqFt: 109.16 },
  { modelNumber: "YAHAM-HO8T-HB", displayName: "HO8T Halo Fascia RS", productFamily: "Halo", productLine: "Halo Fascia RS", application: "Stadium Fascia",
    pixelPitch: 8.33, cabinetWidthMm: 800, cabinetHeightMm: 900, cabinetDepthMm: 130, weightKgPerCabinet: 33,
    maxNits: 10000, maxPowerWattsPerCab: 460, typicalPowerWattsPerCab: 184,
    environment: "outdoor", ipRating: "IP66", serviceType: "rear", costPerSqFt: 173.16 },
  { modelNumber: "YAHAM-HO8T", displayName: "HO8T Halo Fascia FM", productFamily: "Halo", productLine: "Halo Fascia FM", application: "Stadium Fascia",
    pixelPitch: 8.33, cabinetWidthMm: 800, cabinetHeightMm: 900, cabinetDepthMm: 130, weightKgPerCabinet: 33,
    maxNits: 7500, maxPowerWattsPerCab: 460, typicalPowerWattsPerCab: 184,
    environment: "outdoor", ipRating: "IP66", serviceType: "front", costPerSqFt: 143.87 },
  { modelNumber: "YAHAM-HO6T-HB", displayName: "HO6T Halo Fascia RS", productFamily: "Halo", productLine: "Halo Fascia RS", application: "Stadium Fascia",
    pixelPitch: 6.25, cabinetWidthMm: 800, cabinetHeightMm: 900, cabinetDepthMm: 130, weightKgPerCabinet: 33,
    maxNits: 10000, maxPowerWattsPerCab: 460, typicalPowerWattsPerCab: 184,
    environment: "outdoor", ipRating: "IP66", serviceType: "rear", costPerSqFt: 259.23 },
  { modelNumber: "YAHAM-HO6T", displayName: "HO6T Halo Fascia FM", productFamily: "Halo", productLine: "Halo Fascia FM", application: "Stadium Fascia",
    pixelPitch: 6.25, cabinetWidthMm: 800, cabinetHeightMm: 900, cabinetDepthMm: 130, weightKgPerCabinet: 33,
    maxNits: 7500, maxPowerWattsPerCab: 460, typicalPowerWattsPerCab: 184,
    environment: "outdoor", ipRating: "IP66", serviceType: "front", costPerSqFt: 181.68 },

  // ═════════════════════════════════════════════════════════════
  // INDOOR
  // ═════════════════════════════════════════════════════════════
  { modelNumber: "YAHAM-D1.25-MIP", displayName: "D1.25 Corona MIP", productFamily: "Corona", productLine: "Corona MIP", application: "Fixed Installation",
    pixelPitch: 1.25, cabinetWidthMm: 600, cabinetHeightMm: 337.5, cabinetDepthMm: null, weightKgPerCabinet: 0, weightTBC: true,
    maxNits: 1200, maxPowerWattsPerCab: 32.4, typicalPowerWattsPerCab: 12.96,
    environment: "indoor", ipRating: null, serviceType: "front_rear", costPerSqFt: 556.04 },
  { modelNumber: "YAHAM-D1.5-MIP", displayName: "D1.5 Corona MIP", productFamily: "Corona", productLine: "Corona MIP", application: "Fixed Installation",
    pixelPitch: 1.5, cabinetWidthMm: 600, cabinetHeightMm: 337.5, cabinetDepthMm: null, weightKgPerCabinet: 0, weightTBC: true,
    maxNits: 1200, maxPowerWattsPerCab: 32, typicalPowerWattsPerCab: 12.8,
    environment: "indoor", ipRating: null, serviceType: "front_rear", costPerSqFt: 446.39 },
  { modelNumber: "YAHAM-D1.874-MIP", displayName: "D1.874 Corona MIP", productFamily: "Corona", productLine: "Corona MIP", application: "Fixed Installation",
    pixelPitch: 1.875, cabinetWidthMm: 600, cabinetHeightMm: 337.5, cabinetDepthMm: null, weightKgPerCabinet: 0, weightTBC: true,
    maxNits: 1200, maxPowerWattsPerCab: 32, typicalPowerWattsPerCab: 12.8,
    environment: "indoor", ipRating: null, serviceType: "front_rear", costPerSqFt: 351.43 },
  { modelNumber: "YAHAM-C2.5-MIP", displayName: "C2.5 Corona MIP", productFamily: "Corona", productLine: "Corona MIP", application: "Fixed Installation",
    pixelPitch: 2.5, cabinetWidthMm: 960, cabinetHeightMm: 960, cabinetDepthMm: 97, weightKgPerCabinet: 21,
    maxNits: 2000, maxPowerWattsPerCab: 370, typicalPowerWattsPerCab: 148,
    environment: "indoor", ipRating: null, serviceType: "front_rear", costPerSqFt: 222.48 },
  { modelNumber: "YAHAM-C4-HB", displayName: "C4 Corona RS", productFamily: "Corona", productLine: "Corona RS", application: "Fixed Installation",
    pixelPitch: 4, cabinetWidthMm: 960, cabinetHeightMm: 960, cabinetDepthMm: 97, weightKgPerCabinet: 19.5,
    maxNits: 2000, maxPowerWattsPerCab: 370, typicalPowerWattsPerCab: 148,
    environment: "indoor", ipRating: null, serviceType: "rear", costPerSqFt: 157.46 },
  { modelNumber: "YAHAM-C4", displayName: "C4 Corona FM", productFamily: "Corona", productLine: "Corona FM", application: "Fixed Installation",
    pixelPitch: 4, cabinetWidthMm: 960, cabinetHeightMm: 960, cabinetDepthMm: 97, weightKgPerCabinet: 19.5,
    maxNits: 1200, maxPowerWattsPerCab: 410, typicalPowerWattsPerCab: 164,
    environment: "indoor", ipRating: null, serviceType: "front", costPerSqFt: 125.81 },
  { modelNumber: "YAHAM-C6-HB", displayName: "C6 Corona RS", productFamily: "Corona", productLine: "Corona RS", application: "Fixed Installation",
    pixelPitch: 6, cabinetWidthMm: 960, cabinetHeightMm: 960, cabinetDepthMm: 97, weightKgPerCabinet: 19.5,
    maxNits: 2000, maxPowerWattsPerCab: 370, typicalPowerWattsPerCab: 148,
    environment: "indoor", ipRating: null, serviceType: "rear", costPerSqFt: 128.43 },
  { modelNumber: "YAHAM-C6", displayName: "C6 Corona FM", productFamily: "Corona", productLine: "Corona FM", application: "Fixed Installation",
    pixelPitch: 6, cabinetWidthMm: 960, cabinetHeightMm: 960, cabinetDepthMm: 97, weightKgPerCabinet: 19.5,
    maxNits: 1200, maxPowerWattsPerCab: 410, typicalPowerWattsPerCab: 164,
    environment: "indoor", ipRating: null, serviceType: "front", costPerSqFt: 116.53 },
  { modelNumber: "YAHAM-C10-HB", displayName: "C10 Corona RS", productFamily: "Corona", productLine: "Corona RS", application: "Fixed Installation",
    pixelPitch: 10, cabinetWidthMm: 960, cabinetHeightMm: 960, cabinetDepthMm: 97, weightKgPerCabinet: 19.5,
    maxNits: 2000, maxPowerWattsPerCab: 370, typicalPowerWattsPerCab: 148,
    environment: "indoor", ipRating: null, serviceType: "rear", costPerSqFt: 99.29 },
  { modelNumber: "YAHAM-C10", displayName: "C10 Corona FM", productFamily: "Corona", productLine: "Corona FM", application: "Fixed Installation",
    pixelPitch: 10, cabinetWidthMm: 960, cabinetHeightMm: 960, cabinetDepthMm: 97, weightKgPerCabinet: 19.5,
    maxNits: 1200, maxPowerWattsPerCab: 410, typicalPowerWattsPerCab: 164,
    environment: "indoor", ipRating: null, serviceType: "front", costPerSqFt: 92.74 },
  { modelNumber: "YAHAM-H6T-HB", displayName: "H6T Halo Fascia RS", productFamily: "Halo", productLine: "Halo Fascia RS", application: "Stadium Fascia",
    pixelPitch: 6, cabinetWidthMm: 960, cabinetHeightMm: 960, cabinetDepthMm: 150.8, weightKgPerCabinet: 26,
    maxNits: 2000, maxPowerWattsPerCab: 370, typicalPowerWattsPerCab: 148,
    environment: "indoor", ipRating: null, serviceType: "rear", costPerSqFt: 149.29 },
  { modelNumber: "YAHAM-H6T", displayName: "H6T Halo Fascia FM", productFamily: "Halo", productLine: "Halo Fascia FM", application: "Stadium Fascia",
    pixelPitch: 6, cabinetWidthMm: 960, cabinetHeightMm: 960, cabinetDepthMm: 150.8, weightKgPerCabinet: 26,
    maxNits: 1200, maxPowerWattsPerCab: 410, typicalPowerWattsPerCab: 164,
    environment: "indoor", ipRating: null, serviceType: "front", costPerSqFt: 140.22 },
  { modelNumber: "YAHAM-H10T-HB", displayName: "H10T Halo Fascia RS", productFamily: "Halo", productLine: "Halo Fascia RS", application: "Stadium Fascia",
    pixelPitch: 10, cabinetWidthMm: 960, cabinetHeightMm: 960, cabinetDepthMm: 150.8, weightKgPerCabinet: 26,
    maxNits: 2000, maxPowerWattsPerCab: 370, typicalPowerWattsPerCab: 148,
    environment: "indoor", ipRating: null, serviceType: "rear", costPerSqFt: 102.82 },
  { modelNumber: "YAHAM-H10T", displayName: "H10T Halo Fascia FM", productFamily: "Halo", productLine: "Halo Fascia FM", application: "Stadium Fascia",
    pixelPitch: 10, cabinetWidthMm: 960, cabinetHeightMm: 960, cabinetDepthMm: 150.8, weightKgPerCabinet: 26,
    maxNits: 1200, maxPowerWattsPerCab: 410, typicalPowerWattsPerCab: 164,
    environment: "indoor", ipRating: null, serviceType: "front", costPerSqFt: 97.38 },
];

export async function seedYahamDirectRateCard() {
  // 1. Hard-delete the 17 soft-deleted LG LED rows (Natalia greenlit on 2026-04-16).
  //    ScreenConfig FKs are ON DELETE SET NULL, so historical proposals keep their rows.
  const del = await prisma.manufacturerProduct.deleteMany({
    where: {
      manufacturer: { in: ["LG", "LG Outdoor", "LG/Yaham", "LG/Yaham - Outdoor"] },
      productType: "led",
      isActive: false,
    },
  });

  let created = 0;
  let updated = 0;

  for (const p of products) {
    const extendedSpecs: Record<string, unknown> = {
      productLine: p.productLine,
      importSource: SOURCE,
      priceBasis: "Exwork",
    };
    if (p.weightTBC) extendedSpecs.weightTBC = true;

    const data = {
      manufacturer: MANUFACTURER,
      productFamily: p.productFamily,
      productLine: p.productLine,
      application: p.application,
      modelNumber: p.modelNumber,
      displayName: `${p.displayName} (${MANUFACTURER})`,
      productType: "led",
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
      costPerSqFt: new Prisma.Decimal(p.costPerSqFt),
      extendedSpecs: extendedSpecs as Prisma.InputJsonValue,
      sourceSpreadsheet: SOURCE,
      isActive: true,
    };

    const existing = await prisma.manufacturerProduct.findUnique({
      where: { modelNumber: p.modelNumber },
    });

    if (existing) {
      await prisma.manufacturerProduct.update({
        where: { modelNumber: p.modelNumber },
        data,
      });
      updated++;
    } else {
      await prisma.manufacturerProduct.create({ data });
      created++;
    }
  }

  return {
    deletedOldLG: del.count,
    created,
    updated,
    total: products.length,
    source: SOURCE,
  };
}

if (require.main === module) {
  seedYahamDirectRateCard()
    .then((r) => {
      console.log("Yaham direct rate card seeded:", r);
      return prisma.$disconnect();
    })
    .catch(async (e) => {
      console.error(e);
      await prisma.$disconnect();
      process.exit(1);
    });
}
