/**
 * POST /api/rfp/pipeline/pricing-preview
 *
 * Preview pricing for all specs without generating Excel.
 * Returns JSON with priced displays for the UI to render.
 *
 * Accepts specs from EITHER:
 *   1. analysisId → loads from DB (existing flow)
 *   2. specs[] + project → inline from client state (fallback when DB save failed)
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

    const { pricedDisplays } = await generateRateCardExcel({
      project,
      specs,
      quotes,
      zoneClass,
      installComplexity,
      includeBond,
    });

    // Honor user product selections: if spec has selectedProductId, use that
    // product instead of the auto-matched one. This preserves manual picks across
    // page refreshes and pricing recalculations.
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

    // Return JSON for UI rendering (strip the buffer)
    const totalCost = pricedDisplays.reduce((s, d) => s + d.totalCost, 0);
    const totalSell = pricedDisplays.reduce((s, d) => s + d.totalSellingPrice, 0);
    const totalMargin = pricedDisplays.reduce((s, d) => s + d.marginDollars, 0);

    return NextResponse.json({
      project: {
        projectName: project.projectName,
        clientName: project.clientName,
        venue: project.venue,
        location: project.location,
      },
      displays: pricedDisplays.map((pd) => {
        // If user manually selected a product, override the auto-match
        const userProduct = pd.spec.selectedProductId
          ? selectedProductMap.get(pd.spec.selectedProductId)
          : null;

        const matchedProduct = userProduct ? {
          manufacturer: userProduct.manufacturer,
          model: userProduct.displayName,
          pitch: userProduct.pixelPitch,
          totalModules: pd.match?.totalModules ?? 0,
          fitScore: 100,
          activeWidthFt: pd.spec.activeWidthFt ?? pd.match?.activeWidthFt,
          activeHeightFt: pd.spec.activeHeightFt ?? pd.match?.activeHeightFt,
          resolutionX: pd.match?.resolutionX ?? 0,
          resolutionY: pd.match?.resolutionY ?? 0,
          weightKgPerCab: userProduct.weightKgPerCabinet,
          maxPowerWPerCab: userProduct.maxPowerWattsPerCab,
          totalWeightKg: pd.match ? Math.round(userProduct.weightKgPerCabinet * pd.match.totalModules * 10) / 10 : 0,
          totalWeightLbs: pd.match ? Math.round(userProduct.weightKgPerCabinet * pd.match.totalModules * 2.205) : 0,
          totalMaxPowerW: pd.match ? userProduct.maxPowerWattsPerCab * pd.match.totalModules : 0,
          nits: userProduct.maxNits,
        } : pd.match ? {
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
        name: pd.spec.name,
        location: pd.spec.location,
        pixelPitch: pd.spec.pixelPitchMm,
        environment: pd.spec.environment,
        quantity: pd.spec.quantity,
        areaSqFt: pd.areaSqFt,
        hardwareCost: pd.hardwareCost,
        processorCost: pd.processorCost,
        shippingCost: pd.shippingCost,
        installCost: pd.installCost,
        pmCost: pd.pmCost,
        engCost: pd.engCost,
        totalCost: pd.totalCost,
        hardwareSellingPrice: pd.hardwareSellingPrice,
        servicesSellingPrice: pd.servicesSellingPrice,
        totalSellingPrice: pd.totalSellingPrice,
        blendedMarginPct: pd.blendedMarginPct,
        costSource: pd.costSource,
        rateCardEstimate: pd.rateCardEstimate,
        leadTimeWeeks: pd.leadTimeWeeks,
        matchedProduct,
        };
      }),
      summary: {
        totalCost,
        totalSellingPrice: totalSell,
        totalMargin,
        blendedMarginPct: totalSell > 0 ? Math.round((totalMargin / totalSell) * 1000) / 10 : 0,
        displayCount: pricedDisplays.length,
        quotedCount: pricedDisplays.filter((d) => d.costSource === "subcontractor_quote").length,
        rateCardCount: pricedDisplays.filter((d) => d.costSource === "rate_card").length,
      },
    });
  } catch (err: any) {
    log.error("[pricing-preview] Error:", err);
    return NextResponse.json({ error: err.message || "Failed to generate pricing preview" }, { status: 500 });
  }
}
