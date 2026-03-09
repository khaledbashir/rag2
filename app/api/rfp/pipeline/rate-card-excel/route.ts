/**
 * POST /api/rfp/pipeline/rate-card-excel
 *
 * Step 6: Generate the final rate card / pricing Excel.
 * Combines extracted specs + subcontractor quotes + ANC rate card.
 *
 * Body: {
 *   analysisId: string,
 *   quotes?: QuotedSpec[],           // from step 5 import (or manual entry)
 *   zoneClass?: "standard"|"medium"|"large"|"complex",
 *   installComplexity?: "simple"|"standard"|"complex"|"heavy",
 *   includeBond?: boolean,
 *   currency?: string,
 * }
 *
 * Returns: Excel file download
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
      currency = "USD",
    } = body;

    if (!analysisId) {
      return NextResponse.json({ error: "analysisId is required" }, { status: 400 });
    }

    // Load analysis
    const analysis = await prisma.rfpAnalysis.findUnique({ where: { id: analysisId } });
    if (!analysis) {
      return NextResponse.json({ error: "Analysis not found" }, { status: 404 });
    }

    const specs = (analysis.screens as unknown as ExtractedLEDSpec[]) || [];
    const project = (analysis.project as unknown as ExtractedProjectInfo) || {};

    if (specs.length === 0) {
      return NextResponse.json({ error: "No LED specs found in this analysis" }, { status: 400 });
    }

    const { buffer, pricedDisplays } = await generateRateCardExcel({
      project,
      specs,
      quotes,
      zoneClass,
      installComplexity,
      includeBond,
      currency,
    });

    const filename = `Rate_Card_${(project.projectName || project.venue || "Project").replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.xlsx`;

    // Also return pricing summary as JSON header for the UI
    const pricingSummary = {
      totalCost: pricedDisplays.reduce((s, d) => s + d.totalCost, 0),
      totalSellingPrice: pricedDisplays.reduce((s, d) => s + d.totalSellingPrice, 0),
      totalMargin: pricedDisplays.reduce((s, d) => s + d.marginDollars, 0),
      displayCount: pricedDisplays.length,
      quotedCount: pricedDisplays.filter((d) => d.costSource === "subcontractor_quote").length,
    };

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Pricing-Summary": JSON.stringify(pricingSummary),
      },
    });
  } catch (err: any) {
    log.error("[rate-card-excel] Error:", err);
    return NextResponse.json({ error: err.message || "Failed to generate rate card" }, { status: 500 });
  }
}
