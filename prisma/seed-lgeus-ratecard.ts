/**
 * LG USA (LGEUS) Rate Card — 04.15.26 version.
 *
 * Source: NX Yaham Rate Card - LGEUS Markup 04.15.26 EG.xlsx (Eric Gruner, 2026-04-15)
 *
 * 31 SKUs across indoor + outdoor sport series. Each dual-brightness model emits
 * two separate rows (regular + High Brightness) per Natalia's direction — catalog
 * split instead of tier field, no schema changes. Internal-use naming only.
 *
 * Retires rows tagged with the 02.16.26 version of this same sheet
 * (13 rows, already soft-deletable by `sourceSpreadsheet` match).
 *
 * Run via: POST /api/products/seed-lgeus
 */

import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();

const SOURCE = "NX Yaham Rate Card - LGEUS Markup 04.15.26 EG.xlsx";
const MANUFACTURER = "LG USA";
const OBSOLETE_SOURCE_MATCH = "02.16.26";

interface LGEUSProduct {
  modelNumber: string;
  displayName: string;
  productFamily: string;
  productLine: string;          // Radiance / Aura / Halo / Corona
  application: string;          // Fixed Installation / Stadium Perimeter / Stadium Fascia
  pixelPitch: number;
  cabinetWidthMm: number;
  cabinetHeightMm: number;
  cabinetDepthMm: number | null;
  weightKgPerCabinet: number;   // 0 = TBC (flagged in extendedSpecs)
  weightTBC?: boolean;
  maxNits: number;
  maxPowerWattsPerCab: number;
  typicalPowerWattsPerCab: number;
  environment: "indoor" | "outdoor";
  ipRating: string | null;
  serviceType: "front" | "rear" | "front_rear";
  costPerSqFt: number;          // LGEUS 28% markup MSP/SQFT USD
}

const products: LGEUSProduct[] = [
  // ═════════════════════════════════════════════════════════════
  // OUTDOOR — Radiance / Aura / Halo Fascia
  // ═════════════════════════════════════════════════════════════
  {
    modelNumber: "LGEUS-R2.5-MIP",
    displayName: "R2.5 Radiance MIP",
    productFamily: "Radiance",
    productLine: "Radiance MIP",
    application: "Fixed Installation",
    pixelPitch: 2.5,
    cabinetWidthMm: 480, cabinetHeightMm: 540, cabinetDepthMm: 120,
    weightKgPerCabinet: 9.5,
    maxNits: 3000,
    maxPowerWattsPerCab: 150, typicalPowerWattsPerCab: 60,
    environment: "outdoor", ipRating: "IP66", serviceType: "front_rear",
    costPerSqFt: 595.60,
  },
  // R4 — both variants are 7000 nits; differ by service type + power, not brightness
  {
    modelNumber: "LGEUS-R4-FS",
    displayName: "R4 Radiance FM",
    productFamily: "Radiance",
    productLine: "Radiance FM",
    application: "Fixed Installation",
    pixelPitch: 3.90625,
    cabinetWidthMm: 1000, cabinetHeightMm: 1000, cabinetDepthMm: 120,
    weightKgPerCabinet: 31,
    maxNits: 7000,
    maxPowerWattsPerCab: 650, typicalPowerWattsPerCab: 260,
    environment: "outdoor", ipRating: "IP66", serviceType: "front",
    costPerSqFt: 258.35,
  },
  {
    modelNumber: "LGEUS-R4-RS",
    displayName: "R4 Radiance RS",
    productFamily: "Radiance",
    productLine: "Radiance RS",
    application: "Fixed Installation",
    pixelPitch: 3.90625,
    cabinetWidthMm: 1000, cabinetHeightMm: 1000, cabinetDepthMm: 120,
    weightKgPerCabinet: 31,
    maxNits: 7000,
    maxPowerWattsPerCab: 505, typicalPowerWattsPerCab: 202,
    environment: "outdoor", ipRating: "IP66", serviceType: "rear",
    costPerSqFt: 346.39,
  },
  // R6 — HB (RS, 10000 nits) + regular (FM, 7500 nits)
  {
    modelNumber: "LGEUS-R6-HB",
    displayName: "R6 Radiance RS",
    productFamily: "Radiance", productLine: "Radiance RS",
    application: "Fixed Installation",
    pixelPitch: 5.95,
    cabinetWidthMm: 1000, cabinetHeightMm: 1000, cabinetDepthMm: 120,
    weightKgPerCabinet: 29.5,
    maxNits: 10000,
    maxPowerWattsPerCab: 650, typicalPowerWattsPerCab: 260,
    environment: "outdoor", ipRating: "IP66", serviceType: "rear",
    costPerSqFt: 288.98,
  },
  {
    modelNumber: "LGEUS-R6",
    displayName: "R6 Radiance FM",
    productFamily: "Radiance", productLine: "Radiance FM",
    application: "Fixed Installation",
    pixelPitch: 5.95,
    cabinetWidthMm: 1000, cabinetHeightMm: 1000, cabinetDepthMm: 120,
    weightKgPerCabinet: 29.5,
    maxNits: 7500,
    maxPowerWattsPerCab: 650, typicalPowerWattsPerCab: 260,
    environment: "outdoor", ipRating: "IP66", serviceType: "front",
    costPerSqFt: 191.19,
  },
  // R8
  {
    modelNumber: "LGEUS-R8-HB",
    displayName: "R8 Radiance RS",
    productFamily: "Radiance", productLine: "Radiance RS",
    application: "Fixed Installation",
    pixelPitch: 8.33,
    cabinetWidthMm: 1000, cabinetHeightMm: 1000, cabinetDepthMm: 120,
    weightKgPerCabinet: 29.5,
    maxNits: 10000,
    maxPowerWattsPerCab: 650, typicalPowerWattsPerCab: 260,
    environment: "outdoor", ipRating: "IP66", serviceType: "rear",
    costPerSqFt: 215.64,
  },
  {
    modelNumber: "LGEUS-R8",
    displayName: "R8 Radiance FM",
    productFamily: "Radiance", productLine: "Radiance FM",
    application: "Fixed Installation",
    pixelPitch: 8.33,
    cabinetWidthMm: 1000, cabinetHeightMm: 1000, cabinetDepthMm: 120,
    weightKgPerCabinet: 29.5,
    maxNits: 7500,
    maxPowerWattsPerCab: 650, typicalPowerWattsPerCab: 260,
    environment: "outdoor", ipRating: "IP66", serviceType: "front",
    costPerSqFt: 157.95,
  },
  // R10
  {
    modelNumber: "LGEUS-R10-HB",
    displayName: "R10 Radiance RS",
    productFamily: "Radiance", productLine: "Radiance RS",
    application: "Fixed Installation",
    pixelPitch: 10.4167,
    cabinetWidthMm: 1000, cabinetHeightMm: 1000, cabinetDepthMm: 120,
    weightKgPerCabinet: 29.5,
    maxNits: 10000,
    maxPowerWattsPerCab: 650, typicalPowerWattsPerCab: 260,
    environment: "outdoor", ipRating: "IP66", serviceType: "rear",
    costPerSqFt: 171.96,
  },
  {
    modelNumber: "LGEUS-R10",
    displayName: "R10 Radiance FM",
    productFamily: "Radiance", productLine: "Radiance FM",
    application: "Fixed Installation",
    pixelPitch: 10.4167,
    cabinetWidthMm: 1000, cabinetHeightMm: 1000, cabinetDepthMm: 120,
    weightKgPerCabinet: 29.5,
    maxNits: 7500,
    maxPowerWattsPerCab: 650, typicalPowerWattsPerCab: 260,
    environment: "outdoor", ipRating: "IP66", serviceType: "front",
    costPerSqFt: 136.94,
  },
  // A10 — Stadium Perimeter (Aura series)
  {
    modelNumber: "LGEUS-A10-HB",
    displayName: "A10 Aura RS",
    productFamily: "Aura", productLine: "Aura RS",
    application: "Stadium Perimeter",
    pixelPitch: 10,
    cabinetWidthMm: 1600, cabinetHeightMm: 900, cabinetDepthMm: 114,
    weightKgPerCabinet: 55,
    maxNits: 7500,
    maxPowerWattsPerCab: 680, typicalPowerWattsPerCab: 272,
    environment: "outdoor", ipRating: "IP66", serviceType: "rear",
    costPerSqFt: 229.58,
  },
  {
    modelNumber: "LGEUS-A10",
    displayName: "A10 Aura FM",
    productFamily: "Aura", productLine: "Aura FM",
    application: "Stadium Perimeter",
    pixelPitch: 10,
    cabinetWidthMm: 1600, cabinetHeightMm: 900, cabinetDepthMm: 114,
    weightKgPerCabinet: 55,
    maxNits: 6000,
    maxPowerWattsPerCab: 770, typicalPowerWattsPerCab: 308,
    environment: "outdoor", ipRating: "IP66", serviceType: "front",
    costPerSqFt: 196.48,
  },
  // HO10T — Stadium Fascia (Halo outdoor)
  {
    modelNumber: "LGEUS-HO10T-HB",
    displayName: "HO10T Halo Fascia RS",
    productFamily: "Halo", productLine: "Halo Fascia RS",
    application: "Stadium Fascia",
    pixelPitch: 10,
    cabinetWidthMm: 800, cabinetHeightMm: 900, cabinetDepthMm: 130,
    weightKgPerCabinet: 33,
    maxNits: 10000,
    maxPowerWattsPerCab: 460, typicalPowerWattsPerCab: 184,
    environment: "outdoor", ipRating: "IP66", serviceType: "rear",
    costPerSqFt: 196.10,
  },
  {
    modelNumber: "LGEUS-HO10T",
    displayName: "HO10T Halo Fascia FM",
    productFamily: "Halo", productLine: "Halo Fascia FM",
    application: "Stadium Fascia",
    pixelPitch: 10,
    cabinetWidthMm: 800, cabinetHeightMm: 900, cabinetDepthMm: 130,
    weightKgPerCabinet: 33,
    maxNits: 7500,
    maxPowerWattsPerCab: 460, typicalPowerWattsPerCab: 184,
    environment: "outdoor", ipRating: "IP66", serviceType: "front",
    costPerSqFt: 161.38,
  },
  // HO8T
  {
    modelNumber: "LGEUS-HO8T-HB",
    displayName: "HO8T Halo Fascia RS",
    productFamily: "Halo", productLine: "Halo Fascia RS",
    application: "Stadium Fascia",
    pixelPitch: 8.33,
    cabinetWidthMm: 800, cabinetHeightMm: 900, cabinetDepthMm: 130,
    weightKgPerCabinet: 33,
    maxNits: 10000,
    maxPowerWattsPerCab: 460, typicalPowerWattsPerCab: 184,
    environment: "outdoor", ipRating: "IP66", serviceType: "rear",
    costPerSqFt: 217.66,
  },
  {
    modelNumber: "LGEUS-HO8T",
    displayName: "HO8T Halo Fascia FM",
    productFamily: "Halo", productLine: "Halo Fascia FM",
    application: "Stadium Fascia",
    pixelPitch: 8.33,
    cabinetWidthMm: 800, cabinetHeightMm: 900, cabinetDepthMm: 130,
    weightKgPerCabinet: 33,
    maxNits: 7500,
    maxPowerWattsPerCab: 460, typicalPowerWattsPerCab: 184,
    environment: "outdoor", ipRating: "IP66", serviceType: "front",
    costPerSqFt: 180.84,
  },
  // HO6T
  {
    modelNumber: "LGEUS-HO6T-HB",
    displayName: "HO6T Halo Fascia RS",
    productFamily: "Halo", productLine: "Halo Fascia RS",
    application: "Stadium Fascia",
    pixelPitch: 6.25,
    cabinetWidthMm: 800, cabinetHeightMm: 900, cabinetDepthMm: 130,
    weightKgPerCabinet: 33,
    maxNits: 10000,
    maxPowerWattsPerCab: 460, typicalPowerWattsPerCab: 184,
    environment: "outdoor", ipRating: "IP66", serviceType: "rear",
    costPerSqFt: 325.82,
  },
  {
    modelNumber: "LGEUS-HO6T",
    displayName: "HO6T Halo Fascia FM",
    productFamily: "Halo", productLine: "Halo Fascia FM",
    application: "Stadium Fascia",
    pixelPitch: 6.25,
    cabinetWidthMm: 800, cabinetHeightMm: 900, cabinetDepthMm: 130,
    weightKgPerCabinet: 33,
    maxNits: 7500,
    maxPowerWattsPerCab: 460, typicalPowerWattsPerCab: 184,
    environment: "outdoor", ipRating: "IP66", serviceType: "front",
    costPerSqFt: 228.34,
  },

  // ═════════════════════════════════════════════════════════════
  // INDOOR — Corona / Halo Fascia
  // ═════════════════════════════════════════════════════════════
  {
    modelNumber: "LGEUS-D1.25-MIP",
    displayName: "D1.25 Corona MIP",
    productFamily: "Corona", productLine: "Corona MIP",
    application: "Fixed Installation",
    pixelPitch: 1.25,
    cabinetWidthMm: 600, cabinetHeightMm: 337.5, cabinetDepthMm: null,
    weightKgPerCabinet: 0, weightTBC: true,
    maxNits: 1200,
    maxPowerWattsPerCab: 32.4, typicalPowerWattsPerCab: 12.96,
    environment: "indoor", ipRating: null, serviceType: "front_rear",
    costPerSqFt: 698.61,
  },
  {
    modelNumber: "LGEUS-D1.5-MIP",
    displayName: "D1.5 Corona MIP",
    productFamily: "Corona", productLine: "Corona MIP",
    application: "Fixed Installation",
    pixelPitch: 1.5,
    cabinetWidthMm: 600, cabinetHeightMm: 337.5, cabinetDepthMm: null,
    weightKgPerCabinet: 0, weightTBC: true,
    maxNits: 1200,
    maxPowerWattsPerCab: 32, typicalPowerWattsPerCab: 12.8,
    environment: "indoor", ipRating: null, serviceType: "front_rear",
    costPerSqFt: 560.92,
  },
  {
    modelNumber: "LGEUS-D1.874-MIP",
    displayName: "D1.874 Corona MIP",
    productFamily: "Corona", productLine: "Corona MIP",
    application: "Fixed Installation",
    pixelPitch: 1.875,
    cabinetWidthMm: 600, cabinetHeightMm: 337.5, cabinetDepthMm: null,
    weightKgPerCabinet: 0, weightTBC: true,
    maxNits: 1200,
    maxPowerWattsPerCab: 32, typicalPowerWattsPerCab: 12.8,
    environment: "indoor", ipRating: null, serviceType: "front_rear",
    costPerSqFt: 441.55,
  },
  {
    modelNumber: "LGEUS-C2.5-MIP",
    displayName: "C2.5 Corona MIP",
    productFamily: "Corona", productLine: "Corona MIP",
    application: "Fixed Installation",
    pixelPitch: 2.5,
    cabinetWidthMm: 960, cabinetHeightMm: 960, cabinetDepthMm: 97,
    weightKgPerCabinet: 21,
    maxNits: 2000,
    maxPowerWattsPerCab: 370, typicalPowerWattsPerCab: 148,
    environment: "indoor", ipRating: null, serviceType: "front_rear",
    costPerSqFt: 279.58,
  },
  // C4 — HB (RS, 2000 nits) + regular (FM, 1200 nits)
  {
    modelNumber: "LGEUS-C4-HB",
    displayName: "C4 Corona RS",
    productFamily: "Corona", productLine: "Corona RS",
    application: "Fixed Installation",
    pixelPitch: 4,
    cabinetWidthMm: 960, cabinetHeightMm: 960, cabinetDepthMm: 97,
    weightKgPerCabinet: 19.5,
    maxNits: 2000,
    maxPowerWattsPerCab: 370, typicalPowerWattsPerCab: 148,
    environment: "indoor", ipRating: null, serviceType: "rear",
    costPerSqFt: 197.91,
  },
  {
    modelNumber: "LGEUS-C4",
    displayName: "C4 Corona FM",
    productFamily: "Corona", productLine: "Corona FM",
    application: "Fixed Installation",
    pixelPitch: 4,
    cabinetWidthMm: 960, cabinetHeightMm: 960, cabinetDepthMm: 97,
    weightKgPerCabinet: 19.5,
    maxNits: 1200,
    maxPowerWattsPerCab: 410, typicalPowerWattsPerCab: 164,
    environment: "indoor", ipRating: null, serviceType: "front",
    costPerSqFt: 158.12,
  },
  // C6
  {
    modelNumber: "LGEUS-C6-HB",
    displayName: "C6 Corona RS",
    productFamily: "Corona", productLine: "Corona RS",
    application: "Fixed Installation",
    pixelPitch: 6,
    cabinetWidthMm: 960, cabinetHeightMm: 960, cabinetDepthMm: 97,
    weightKgPerCabinet: 19.5,
    maxNits: 2000,
    maxPowerWattsPerCab: 370, typicalPowerWattsPerCab: 148,
    environment: "indoor", ipRating: null, serviceType: "rear",
    costPerSqFt: 161.40,
  },
  {
    modelNumber: "LGEUS-C6",
    displayName: "C6 Corona FM",
    productFamily: "Corona", productLine: "Corona FM",
    application: "Fixed Installation",
    pixelPitch: 6,
    cabinetWidthMm: 960, cabinetHeightMm: 960, cabinetDepthMm: 97,
    weightKgPerCabinet: 19.5,
    maxNits: 1200,
    maxPowerWattsPerCab: 410, typicalPowerWattsPerCab: 164,
    environment: "indoor", ipRating: null, serviceType: "front",
    costPerSqFt: 146.50,
  },
  // C10
  {
    modelNumber: "LGEUS-C10-HB",
    displayName: "C10 Corona RS",
    productFamily: "Corona", productLine: "Corona RS",
    application: "Fixed Installation",
    pixelPitch: 10,
    cabinetWidthMm: 960, cabinetHeightMm: 960, cabinetDepthMm: 97,
    weightKgPerCabinet: 19.5,
    maxNits: 2000,
    maxPowerWattsPerCab: 370, typicalPowerWattsPerCab: 148,
    environment: "indoor", ipRating: null, serviceType: "rear",
    costPerSqFt: 124.74,
  },
  {
    modelNumber: "LGEUS-C10",
    displayName: "C10 Corona FM",
    productFamily: "Corona", productLine: "Corona FM",
    application: "Fixed Installation",
    pixelPitch: 10,
    cabinetWidthMm: 960, cabinetHeightMm: 960, cabinetDepthMm: 97,
    weightKgPerCabinet: 19.5,
    maxNits: 1200,
    maxPowerWattsPerCab: 410, typicalPowerWattsPerCab: 164,
    environment: "indoor", ipRating: null, serviceType: "front",
    costPerSqFt: 116.54,
  },
  // H6T — Halo Fascia Indoor
  {
    modelNumber: "LGEUS-H6T-HB",
    displayName: "H6T Halo Fascia RS",
    productFamily: "Halo", productLine: "Halo Fascia RS",
    application: "Stadium Fascia",
    pixelPitch: 6,
    cabinetWidthMm: 960, cabinetHeightMm: 960, cabinetDepthMm: 150.8,
    weightKgPerCabinet: 26,
    maxNits: 2000,
    maxPowerWattsPerCab: 370, typicalPowerWattsPerCab: 148,
    environment: "indoor", ipRating: null, serviceType: "rear",
    costPerSqFt: 187.63,
  },
  {
    modelNumber: "LGEUS-H6T",
    displayName: "H6T Halo Fascia FM",
    productFamily: "Halo", productLine: "Halo Fascia FM",
    application: "Stadium Fascia",
    pixelPitch: 6,
    cabinetWidthMm: 960, cabinetHeightMm: 960, cabinetDepthMm: 150.8,
    weightKgPerCabinet: 26,
    maxNits: 1200,
    maxPowerWattsPerCab: 410, typicalPowerWattsPerCab: 164,
    environment: "indoor", ipRating: null, serviceType: "front",
    costPerSqFt: 176.16,
  },
  // H10T
  {
    modelNumber: "LGEUS-H10T-HB",
    displayName: "H10T Halo Fascia RS",
    productFamily: "Halo", productLine: "Halo Fascia RS",
    application: "Stadium Fascia",
    pixelPitch: 10,
    cabinetWidthMm: 960, cabinetHeightMm: 960, cabinetDepthMm: 150.8,
    weightKgPerCabinet: 26,
    maxNits: 2000,
    maxPowerWattsPerCab: 370, typicalPowerWattsPerCab: 148,
    environment: "indoor", ipRating: null, serviceType: "rear",
    costPerSqFt: 129.21,
  },
  {
    modelNumber: "LGEUS-H10T",
    displayName: "H10T Halo Fascia FM",
    productFamily: "Halo", productLine: "Halo Fascia FM",
    application: "Stadium Fascia",
    pixelPitch: 10,
    cabinetWidthMm: 960, cabinetHeightMm: 960, cabinetDepthMm: 150.8,
    weightKgPerCabinet: 26,
    maxNits: 1200,
    maxPowerWattsPerCab: 410, typicalPowerWattsPerCab: 164,
    environment: "indoor", ipRating: null, serviceType: "front",
    costPerSqFt: 122.36,
  },
];

export async function seedLGEUSRateCard() {
  // 1. Retire every row that came from the prior version of this same sheet.
  //    sourceSpreadsheet contains "02.16.26" → those are the stale 13 Yaham rows.
  const retire = await prisma.manufacturerProduct.updateMany({
    where: {
      isActive: true,
      sourceSpreadsheet: { contains: OBSOLETE_SOURCE_MATCH },
    },
    data: { isActive: false, updatedAt: new Date() },
  });

  let created = 0;
  let updated = 0;

  for (const p of products) {
    const extendedSpecs: Record<string, unknown> = {
      productLine: p.productLine,
      importSource: SOURCE,
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
    retired: retire.count,
    created,
    updated,
    total: products.length,
    source: SOURCE,
  };
}

if (require.main === module) {
  seedLGEUSRateCard()
    .then((r) => {
      console.log("LGEUS rate card seeded:", r);
      return prisma.$disconnect();
    })
    .catch(async (e) => {
      console.error(e);
      await prisma.$disconnect();
      process.exit(1);
    });
}
