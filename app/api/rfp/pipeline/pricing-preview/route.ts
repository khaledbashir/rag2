/**
 * POST /api/rfp/pipeline/pricing-preview
 *
 * Preview pricing for all specs without generating Excel.
 * Returns JSON with priced displays for the UI to render.
 *
 * Uses the SAME cost computation as the Excel export (computeDisplays)
 * so web and Excel numbers match exactly.
 *
 * Body: {
 *   analysisId?: string,
 *   specs?: ExtractedLEDSpec[],
 *   project?: ExtractedProjectInfo,
 *   quotes?: QuotedSpec[],
 *   zoneClass?: string,
 *   installComplexity?: string,
 *   includeBond?: boolean,
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateRateCardExcel } from "@/services/rfp/pipeline/generateRateCardExcel";
import { computeDisplays, type ProductResolver } from "@/services/rfp/pipeline/computeDisplayCosts";
import { getProduct } from "@/services/rfp/productCatalog";
import { preloadRateCard } from "@/services/rfp/rateCardLoader";
import type { ExtractedLEDSpec, ExtractedProjectInfo } from "@/services/rfp/unified/types";
import { log } from "@/lib/logger";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      analysisId,
      quotes = [],
      zoneClass = "standard",
      installComplexity = "standard",
      includeBond = false,
    } = body;

    let specs: ExtractedLEDSpec[] = [];
    let project: ExtractedProjectInfo = {} as ExtractedProjectInfo;

    // Priority 1: Load from DB by analysisId
    if (analysisId) {
      const analysis = await prisma.rfpAnalysis.findUnique({ where: { id: analysisId } });
      if (analysis) {
        specs = (analysis.screens as unknown as ExtractedLEDSpec[]) || [];
        project = (analysis.project as unknown as ExtractedProjectInfo) || {};
      } else {
        log.warn(`[pricing-preview] Analysis ${analysisId} not found in DB`);
      }
    }

    // Priority 2: Use inline specs from client state (fallback)
    if (specs.length === 0 && body.specs?.length > 0) {
      log.info("[pricing-preview] Using inline specs from client state");
      specs = body.specs;
      project = body.project || {};
    }

    if (specs.length === 0) {
      return NextResponse.json({ error: "No LED specs found" }, { status: 400 });
    }

    log.info(`[pricing-preview] Pricing ${specs.length} specs (source: ${analysisId ? "db" : "inline"})`);

    // Step 1: Run generateRateCardExcel for product matching metadata
    // (matched products, cost source, lead times, fit scores)
    const { pricedDisplays } = await generateRateCardExcel({
      project,
      specs,
      quotes,
      zoneClass,
      installComplexity,
      includeBond,
    });

    // Step 2: Load user-selected products from DB
    const selectedIds = specs
      .map((s) => s.selectedProductId)
      .filter((id): id is string => !!id);
    const selectedProductMap = new Map<string, any>();
    if (selectedIds.length > 0) {
      try {
        const dbProducts = await prisma.manufacturerProduct.findMany({
          where: { id: { in: selectedIds } },
        });
        for (const p of dbProducts) {
          selectedProductMap.set(p.id, p);
        }
        log.info(`[pricing-preview] Loaded ${selectedProductMap.size} user-selected products`);
      } catch (err) {
        log.warn("[pricing-preview] Failed to load user-selected products:", err);
      }
    }

    // Step 3: Populate cabinet-snapped dims from product matches onto specs
    // computeDisplayCosts uses spec.activeWidthFt/activeHeightFt for area calculations.
    // Without this, it falls back to raw RFP dims and costs/SqFt diverge from the preview.
    for (let i = 0; i < specs.length; i++) {
      const pd = pricedDisplays[i];
      const match = pd?.match;
      if (match?.activeWidthFt && match?.activeHeightFt) {
        if (!specs[i].activeWidthFt) specs[i].activeWidthFt = match.activeWidthFt;
        if (!specs[i].activeHeightFt) specs[i].activeHeightFt = match.activeHeightFt;
      }
    }

    // Step 4: Compute authoritative costs using the SAME logic as the Excel export
    // This ensures web $/SqFt, Total Cost, and Selling Price match Excel exactly.
    await preloadRateCard();
    const resolveProduct: ProductResolver = (id) => {
      if (!id) return null;
      const catalogProduct = getProduct(id);
      if (catalogProduct) return catalogProduct;
      const dbP = selectedProductMap.get(id);
      if (dbP) return dbP;
      return null;
    };

    const computedDisplays = computeDisplays(
      specs,
      pricedDisplays,
      installComplexity as any,
      resolveProduct,
    );

    // Step 4: Build response — LED Cost Sheet totals from computeDisplays
    // LED Cost Sheet Total = hw + spares + processor bundle + shipping (NOT install/PM/eng/travel)
    // LED Margin Override = 15% (flat, from Excel's yellow cell V2)
    // LED Margin Override = 15% (flat, from Excel's yellow cell V2)
    const LED_MARGIN = 0.15;

    // Compute per-display LED Cost Sheet Total:
    // Display Cost = ledHardwareCost + sparePartsCost (no round-trip through $/SqFt)
    // Total Cost = Display Cost + Processor bundle + Shipping
    const perDisplayTotals = computedDisplays.map(d => {
      const displayCost = Math.round((d.ledHardwareCost + d.sparePartsCost) * 100) / 100;
      const bundleEquip = d.sendingCardCost + d.signalCableCost + d.upsCost + d.backupProcessorCost + d.weatherproofCost;
      const tc = Math.round((displayCost + bundleEquip + d.shippingCost) * 100) / 100;
      const sell = Math.round(tc / (1 - LED_MARGIN) * 100) / 100;
      return { cost: tc, sell };
    });
    const totalCost = Math.round(perDisplayTotals.reduce((s, d) => s + d.cost, 0) * 100) / 100;
    const totalSell = Math.round(perDisplayTotals.reduce((s, d) => s + d.sell, 0) * 100) / 100;
    const totalMargin = Math.round((totalSell - totalCost) * 100) / 100;

    return NextResponse.json({
      project: {
        projectName: project.projectName,
        clientName: project.clientName,
        venue: project.venue,
        location: project.location,
      },
      displays: computedDisplays.map((cd, idx) => {
        const pd = pricedDisplays[idx];

        // Build matched product info from pricedDisplays (product matching metadata)
        const userProduct = cd.spec.selectedProductId
          ? selectedProductMap.get(cd.spec.selectedProductId)
          : null;

        const matchedProduct = userProduct ? {
          manufacturer: userProduct.manufacturer,
          model: userProduct.displayName,
          pitch: userProduct.pixelPitch,
          totalModules: pd?.match?.totalModules ?? 0,
          fitScore: 100,
          activeWidthFt: cd.spec.activeWidthFt ?? pd?.match?.activeWidthFt,
          activeHeightFt: cd.spec.activeHeightFt ?? pd?.match?.activeHeightFt,
          resolutionX: pd?.match?.resolutionX ?? 0,
          resolutionY: pd?.match?.resolutionY ?? 0,
          weightKgPerCab: userProduct.weightKgPerCabinet,
          maxPowerWPerCab: userProduct.maxPowerWattsPerCab,
          totalWeightKg: pd?.match ? Math.round(userProduct.weightKgPerCabinet * pd.match.totalModules * 10) / 10 : 0,
          totalWeightLbs: pd?.match ? Math.round(userProduct.weightKgPerCabinet * pd.match.totalModules * 2.205) : 0,
          totalMaxPowerW: pd?.match ? userProduct.maxPowerWattsPerCab * pd.match.totalModules : 0,
          nits: userProduct.maxNits,
        } : pd?.match ? {
          manufacturer: pd.match.module.manufacturer,
          model: pd.match.module.name,
          pitch: pd.match.module.pitch,
          totalModules: pd.match.totalModules,
          fitScore: pd.match.fitScore,
          activeWidthFt: pd.match.activeWidthFt,
          activeHeightFt: pd.match.activeHeightFt,
          resolutionX: pd.match.resolutionX,
          resolutionY: pd.match.resolutionY,
          weightKgPerCab: pd.match.module.weightKg,
          maxPowerWPerCab: pd.match.module.maxPowerWatts,
          totalWeightKg: Math.round(pd.match.module.weightKg * pd.match.totalModules * 10) / 10,
          totalWeightLbs: Math.round(pd.match.module.weightKg * pd.match.totalModules * 2.205),
          totalMaxPowerW: pd.match.module.maxPowerWatts * pd.match.totalModules,
          nits: pd.match.module.nits,
        } : null;

        return {
          name: cd.spec.name,
          location: cd.spec.location,
          pixelPitch: cd.spec.pixelPitchMm,
          environment: cd.spec.environment,
          quantity: cd.spec.quantity,
          areaSqFt: cd.areaSqFt,
          // Cost fields — use computed values directly, no round-trip through $/SqFt
          hardwareCost: Math.round((cd.ledHardwareCost + cd.sparePartsCost) * 100) / 100,
          processorCost: cd.sendingCardCost + cd.signalCableCost + cd.upsCost + cd.backupProcessorCost + cd.weatherproofCost,
          shippingCost: cd.shippingCost,
          installCost: cd.structuralMaterialsCost + cd.structuralLaborCost + cd.electricalCost,
          pmCost: cd.pmCost,
          engCost: cd.engCost,
          travelCost: cd.travelCost,
          // LED Cost Sheet Total = Display Cost + Processor bundle + Shipping
          totalCost: (() => {
            const displayCost = Math.round((cd.ledHardwareCost + cd.sparePartsCost) * 100) / 100;
            const bundleEquip = cd.sendingCardCost + cd.signalCableCost + cd.upsCost + cd.backupProcessorCost + cd.weatherproofCost;
            return Math.round((displayCost + bundleEquip + cd.shippingCost) * 100) / 100;
          })(),
          // Selling price = Total Cost / (1 - 15%)
          hardwareSellingPrice: 0,
          servicesSellingPrice: 0,
          totalSellingPrice: (() => {
            const displayCost = Math.round((cd.ledHardwareCost + cd.sparePartsCost) * 100) / 100;
            const bundleEquip = cd.sendingCardCost + cd.signalCableCost + cd.upsCost + cd.backupProcessorCost + cd.weatherproofCost;
            const tc = Math.round((displayCost + bundleEquip + cd.shippingCost) * 100) / 100;
            return Math.round(tc / (1 - LED_MARGIN) * 100) / 100;
          })(),
          blendedMarginPct: LED_MARGIN,
          // Metadata from pricedDisplays
          costSource: pd?.costSource ?? "rate_card",
          rateCardEstimate: pd?.rateCardEstimate ?? null,
          leadTimeWeeks: pd?.leadTimeWeeks ?? null,
          matchedProduct,
        };
      }),
      summary: {
        totalCost,
        totalSellingPrice: totalSell,
        totalMargin,
        blendedMarginPct: totalSell > 0 ? Math.round((totalMargin / totalSell) * 1000) / 10 : 0,
        displayCount: computedDisplays.length,
        quotedCount: pricedDisplays.filter((d) => d.costSource === "subcontractor_quote").length,
        rateCardCount: pricedDisplays.filter((d) => d.costSource === "rate_card").length,
      },
    });
  } catch (err: any) {
    log.error("[pricing-preview] Error:", err);
    return NextResponse.json({ error: err.message || "Failed to generate pricing preview" }, { status: 500 });
  }
}
