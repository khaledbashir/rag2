/**
 * POST /api/rfp/pipeline/scoping-workbook
 *
 * Generates the full multi-sheet scoping workbook (Toyota Center format).
 * Up to 15+ sheets: Margin Analysis, LED Cost Sheet, per-zone Install sheets,
 * P&L, Cash Flow, PO's, Processor Count, Resp Matrix, Travel, CMS.
 *
 * Body: {
 *   analysisId: string,
 *   quotes?: QuotedSpec[],
 *   zoneClass?: "standard"|"medium"|"large"|"complex",
 *   installComplexity?: "simple"|"standard"|"complex"|"heavy",
 *   includeBond?: boolean,
 *   currency?: string,
 *   paymentTerms?: string,       // e.g. "50/20/20/10"
 *   contractDate?: string,
 *   completionDate?: string,
 * }
 *
 * Returns: Excel file download
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateScopingWorkbook } from "@/services/rfp/pipeline/generateScopingWorkbook";
import { generateRateCardExcel } from "@/services/rfp/pipeline/generateRateCardExcel";
import type { ExtractedLEDSpec, ExtractedProjectInfo, ExtractedRequirement } from "@/services/rfp/unified/types";
import { log } from "@/lib/logger";
import { needsWestfieldReextract, reextractSavedPdfAnalysis } from "@/services/rfp/unified/healSavedAnalysis";

export const maxDuration = 60;

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
      paymentTerms = "50/20/20/10",
      contractDate,
      completionDate,
    } = body;

    if (!analysisId) {
      return NextResponse.json({ error: "analysisId is required" }, { status: 400 });
    }

    // Load analysis
    const analysis = await prisma.rfpAnalysis.findUnique({ where: { id: analysisId } });
    if (!analysis) {
      return NextResponse.json({ error: "Analysis not found" }, { status: 404 });
    }

    let specs = (analysis.screens as unknown as ExtractedLEDSpec[]) || [];
    let project = (analysis.project as unknown as ExtractedProjectInfo) || {};
    let requirements = (analysis.requirements as unknown as ExtractedRequirement[]) || [];

    if (needsWestfieldReextract(analysis)) {
      try {
        const healed = await reextractSavedPdfAnalysis(analysis);
        specs = healed.screens;
        requirements = healed.requirements;
        project = { ...project, ...healed.project };
        await prisma.rfpAnalysis.update({
          where: { id: analysis.id },
          data: {
            screens: JSON.parse(JSON.stringify(healed.screens)),
            requirements: JSON.parse(JSON.stringify(healed.requirements)),
            incompleteSpecs: JSON.parse(JSON.stringify(healed.incompleteSpecs)),
            project: JSON.parse(JSON.stringify(project)),
            specsFound: healed.screens.length,
          },
        });
      } catch (err) {
        log.warn("[scoping-workbook] Westfield re-extract failed, using saved analysis");
      }
    }

    if (specs.length === 0) {
      return NextResponse.json({ error: "No LED specs found in this analysis" }, { status: 400 });
    }

    // Get priced displays from rate card generator for accurate pricing
    let pricedDisplays;
    try {
      const rateCardResult = await generateRateCardExcel({
        project,
        specs,
        quotes,
        zoneClass,
        installComplexity,
        includeBond,
        currency,
      });
      pricedDisplays = rateCardResult.pricedDisplays;
    } catch {
      // If rate card fails, scoping workbook still works with its own calculations
      pricedDisplays = undefined;
    }

    const { buffer, displays } = await generateScopingWorkbook({
      project,
      specs,
      requirements,
      pricedDisplays,
      includeAlternatesInBase: true,
      zoneClass,
      installComplexity,
      includeBond,
      currency,
      paymentTerms,
      contractDate,
      completionDate,
    });

    const projectLabel = (project.projectName || project.venue || "Project").replace(/[^a-zA-Z0-9\s-]/g, "").replace(/\s+/g, "_");
    const filename = `Scoping_Workbook_${projectLabel}_${new Date().toISOString().slice(0, 10)}.xlsx`;

    const summary = {
      totalCost: displays.reduce((s, d) => s + d.totalCost, 0),
      totalSellingPrice: displays.reduce((s, d) => s + d.sellingPrice, 0),
      totalMargin: displays.reduce((s, d) => s + d.marginDollars, 0),
      displayCount: displays.length,
      sheetCount: 6 + displays.length, // base sheets + per-zone install sheets
    };

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Scoping-Summary": JSON.stringify(summary),
      },
    });
  } catch (err: any) {
    log.error("[scoping-workbook] Error:", err);
    return NextResponse.json({ error: err.message || "Failed to generate scoping workbook" }, { status: 500 });
  }
}
