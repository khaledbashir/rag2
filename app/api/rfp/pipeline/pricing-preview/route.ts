/**
 * POST /api/rfp/pipeline/pricing-preview
 *
 * Preview pricing for all specs without generating Excel.
 * Returns JSON with priced displays for the UI to render.
 *
 * Body: {
 *   analysisId: string,
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

    if (!analysisId) {
      return NextResponse.json({ error: "analysisId is required" }, { status: 400 });
    }

    const analysis = await prisma.rfpAnalysis.findUnique({ where: { id: analysisId } });
    if (!analysis) {
      return NextResponse.json({ error: "Analysis not found" }, { status: 404 });
    }

    const specs = (analysis.screens as unknown as ExtractedLEDSpec[]) || [];
    const project = (analysis.project as unknown as ExtractedProjectInfo) || {};

    if (specs.length === 0) {
      return NextResponse.json({ error: "No LED specs found in this analysis" }, { status: 400 });
    }

    const { pricedDisplays } = await generateRateCardExcel({
      project,
      specs,
      quotes,
      zoneClass,
      installComplexity,
      includeBond,
    });

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
      displays: pricedDisplays.map((pd) => ({
        name: pd.spec.name,
        location: pd.spec.location,
        pixelPitch: pd.spec.pixelPitchMm,
        environment: pd.spec.environment,
        quantity: pd.spec.quantity,
        areaSqFt: pd.areaSqFt,
        hardwareCost: pd.hardwareCost,
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
        matchedProduct: pd.match ? {
          manufacturer: pd.match.module.manufacturer,
          model: pd.match.module.name,
          pitch: pd.match.module.pitch,
          totalModules: pd.match.totalModules,
          fitScore: pd.match.fitScore,
          activeWidthFt: pd.match.activeWidthFt,
          activeHeightFt: pd.match.activeHeightFt,
          resolutionX: pd.match.resolutionX,
          resolutionY: pd.match.resolutionY,
        } : null,
      })),
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
    console.error("[pricing-preview] Error:", err);
    return NextResponse.json({ error: err.message || "Failed to generate pricing preview" }, { status: 500 });
  }
}
