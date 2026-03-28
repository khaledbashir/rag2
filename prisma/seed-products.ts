/**
 * Seed ManufacturerProduct from hardcoded catalogs.
 *
 * Merges data from:
 *   1. services/rfp/productCatalog.ts  (23 products — cabinet mm, nits, basic specs)
 *   2. data/catalogs/led-products.ts   (37 modules — cabinet ft, NX pricing, module data)
 *
 * Run: npx tsx prisma/seed-products.ts
 * Safe to re-run: uses upsert on modelNumber.
 */

import { PrismaClient } from "@prisma/client";
import { getAllProducts } from "../services/rfp/productCatalog";
import { LED_MODULES } from "../data/catalogs/led-products";

const prisma = new PrismaClient();

async function main() {
  console.log("=== Seeding ManufacturerProduct ===\n");

  // ── Source 1: productCatalog.ts ──
  const catalogProducts = getAllProducts();
  let catalogCount = 0;

  for (const p of catalogProducts) {
    const cab = p.defaultCabinet;
    if (!cab) continue;

    const env = p.environment.toLowerCase();
    const environment =
      env === "outdoor" ? "outdoor" : env === "both" ? "indoor_outdoor" : "indoor";

    const family = p.name.match(/(GSQA|LAA|Corona|Radiance|Aura|Halo|Mesh|LSCA|LSCB|LSGA|LSCC|GSCF)/i)?.[1] || p.manufacturer;

    await prisma.manufacturerProduct.upsert({
      where: { modelNumber: p.id },
      create: {
        manufacturer: p.manufacturer,
        productFamily: family,
        modelNumber: p.id,
        displayName: `${p.manufacturer} ${p.name}`,
        productType: "led",
        pixelPitch: p.pitchMm,
        cabinetWidthMm: cab.widthMm,
        cabinetHeightMm: cab.heightMm,
        cabinetDepthMm: cab.depthMm ?? null,
        weightKgPerCabinet: cab.weightKg,
        maxNits: p.brightnessNits,
        maxPowerWattsPerCab: cab.maxPowerW,
        environment,
        supportsHalfModule: false,
        serviceType: "front",
        sourceSpreadsheet: "productCatalog.ts",
      },
      update: {
        manufacturer: p.manufacturer,
        displayName: `${p.manufacturer} ${p.name}`,
        pixelPitch: p.pitchMm,
        cabinetWidthMm: cab.widthMm,
        cabinetHeightMm: cab.heightMm,
        cabinetDepthMm: cab.depthMm ?? null,
        weightKgPerCabinet: cab.weightKg,
        maxNits: p.brightnessNits,
        maxPowerWattsPerCab: cab.maxPowerW,
        environment,
      },
    });
    catalogCount++;
    console.log(`  [catalog] ${p.id.padEnd(25)} → ${p.name}`);
  }

  console.log(`\n  Catalog: ${catalogCount} products upserted\n`);

  // ── Source 2: led-products.ts (NX rate card with cabinet packing + pricing) ──
  let moduleCount = 0;

  for (const [key, m] of Object.entries(LED_MODULES)) {
    if (key === "DEFAULT") continue;

    const env = m.environment || (m.nits >= 5000 ? "outdoor" : "indoor");
    const cabWidthMm = m.cabinetWidthMm ?? (m.cabinetWidthFt ? m.cabinetWidthFt * 304.8 : m.widthMm);
    const cabHeightMm = m.cabinetHeightMm ?? (m.cabinetHeightFt ? m.cabinetHeightFt * 304.8 : m.heightMm);
    const modWidthMm = m.moduleWidthFt ? m.moduleWidthFt * 304.8 : m.widthMm;
    const modHeightMm = m.moduleHeightFt ? m.moduleHeightFt * 304.8 : m.heightMm;

    const family = m.productLine
      || m.name.match(/(GSQA|LAA|Corona|Radiance|Aura|Halo|Mesh|S3|UTV|A Series|LSCC|GSCF)/i)?.[1]
      || m.manufacturer;

    await prisma.manufacturerProduct.upsert({
      where: { modelNumber: key },
      create: {
        manufacturer: m.manufacturer,
        productFamily: family,
        modelNumber: key,
        displayName: `${m.manufacturer} ${m.name}`,
        productType: "led",
        pixelPitch: m.pitch,
        cabinetWidthMm: Math.round(cabWidthMm),
        cabinetHeightMm: Math.round(cabHeightMm),
        weightKgPerCabinet: Math.round((m.weightLbs / 2.205) * 100) / 100,
        maxNits: m.nits,
        maxPowerWattsPerCab: m.maxPowerWatts,
        environment: env,
        supportsHalfModule: m.supportsHalfModule,
        serviceType: m.serviceType?.toLowerCase() || "front",
        moduleWidthMm: Math.round(modWidthMm),
        moduleHeightMm: Math.round(modHeightMm),
        modulesPerCabinetW: m.modulesPerCabinetW ?? null,
        modulesPerCabinetH: m.modulesPerCabinetH ?? null,
        standardPricePerSqft: m.standardPricePerSqft ?? null,
        customPricePerSqft: m.customPricePerSqft ?? null,
        productLine: m.productLine ?? null,
        application: m.application ?? null,
        sourceSpreadsheet: "led-products.ts",
      },
      update: {
        manufacturer: m.manufacturer,
        displayName: `${m.manufacturer} ${m.name}`,
        pixelPitch: m.pitch,
        cabinetWidthMm: Math.round(cabWidthMm),
        cabinetHeightMm: Math.round(cabHeightMm),
        weightKgPerCabinet: Math.round((m.weightLbs / 2.205) * 100) / 100,
        maxNits: m.nits,
        maxPowerWattsPerCab: m.maxPowerWatts,
        environment: env,
        supportsHalfModule: m.supportsHalfModule,
        moduleWidthMm: Math.round(modWidthMm),
        moduleHeightMm: Math.round(modHeightMm),
        modulesPerCabinetW: m.modulesPerCabinetW ?? null,
        modulesPerCabinetH: m.modulesPerCabinetH ?? null,
        standardPricePerSqft: m.standardPricePerSqft ?? null,
        customPricePerSqft: m.customPricePerSqft ?? null,
        productLine: m.productLine ?? null,
        application: m.application ?? null,
      },
    });
    moduleCount++;
    const priceStr = m.standardPricePerSqft ? `$${m.standardPricePerSqft}/sqft` : "no pricing";
    console.log(`  [module]  ${key.padEnd(25)} → ${m.name.padEnd(40)} ${priceStr}`);
  }

  console.log(`\n  Modules: ${moduleCount} products upserted`);

  const total = await prisma.manufacturerProduct.count({ where: { isActive: true } });
  console.log(`\n=== Done. ${total} active products in DB ===`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  });
