/**
 * POST /api/rfp/preview-univer
 *
 * Generates the scoping workbook via the SAME code path as the export,
 * then converts it to Univer IWorkbookData for live in-browser rendering.
 *
 * One generator, one source of truth. Online = export.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateScopingWorkbook } from "@/services/rfp/pipeline/generateScopingWorkbook";
import { generateRateCardExcel } from "@/services/rfp/pipeline/generateRateCardExcel";
import { convertWorkbook } from "@/services/rfp/pipeline/excelToUniver";
import type { ExtractedLEDSpec, ExtractedProjectInfo, ExtractedRequirement } from "@/services/rfp/unified/types";
import { log } from "@/lib/logger";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      analysisId,
      clientSpecs,
      zoneClass = "standard",
      installComplexity = "standard",
      includeBond = false,
      currency = "USD",
    } = body;

    if (!analysisId) {
      return NextResponse.json({ error: "analysisId is required" }, { status: 400 });
    }

    const analysis = await prisma.rfpAnalysis.findUnique({ where: { id: analysisId } });
    if (!analysis) {
      return NextResponse.json({ error: "Analysis not found" }, { status: 404 });
    }

    // Use client specs if provided (latest edits), otherwise DB
    const specs = (clientSpecs || analysis.screens) as unknown as ExtractedLEDSpec[] || [];
    const project = (analysis.project as unknown as ExtractedProjectInfo) || {};
    const requirements = (analysis.requirements as unknown as ExtractedRequirement[]) || [];

    if (specs.length === 0) {
      return NextResponse.json({ error: "No LED specs" }, { status: 400 });
    }

    // Price via rate card — SAME as export endpoint. No client pricing mapping.
    let pricedDisplays;
    try {
      const rateCardResult = await generateRateCardExcel({
        project, specs, quotes: [], zoneClass, installComplexity, includeBond, currency,
      });
      pricedDisplays = rateCardResult.pricedDisplays;
    } catch (err) {
      log.warn("[rfp/preview-univer] Rate card failed, proceeding without:", err);
      pricedDisplays = undefined;
    }

    // Generate workbook — SAME call as export endpoint
    const { workbook: wb, displays } = await generateScopingWorkbook({
      project, specs, requirements, pricedDisplays,
      includeAlternatesInBase: true,
      zoneClass, installComplexity, includeBond, currency,
    });

    // Convert to Univer format
    const workbookData = convertWorkbook(wb, "rfp-workbook", "Scoping Workbook");

    const projectTotal = displays.reduce((s, d) => s + (d.sellingPrice || 0), 0);

    // Row map for inline editing
    const displayRowMap: Record<number, number> = {};
    for (let i = 0; i < specs.length; i++) {
      displayRowMap[3 + i] = i;
    }

    return NextResponse.json({ ...workbookData, projectTotal, displayRowMap, displayCount: specs.length });
  } catch (err: any) {
    log.error("[rfp/preview-univer] Error:", err);
    return NextResponse.json({ error: err.message || "Failed to generate preview" }, { status: 500 });
  }
}
