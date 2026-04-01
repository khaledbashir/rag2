/**
 * POST /api/rfp/preview-univer
 *
 * Generates the scoping workbook via the SAME code path as the export,
 * then converts it to Univer IWorkbookData for live in-browser rendering.
 *
 * This ensures the online preview shows EXACTLY the same numbers as the
 * downloaded Excel — one generator, one source of truth.
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
      clientDisplays,
      quotes = [],
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

    const specs = (clientSpecs || analysis.screens) as unknown as ExtractedLEDSpec[] || [];
    const project = (analysis.project as unknown as ExtractedProjectInfo) || {};
    const requirements = (analysis.requirements as unknown as ExtractedRequirement[]) || [];

    if (specs.length === 0) {
      return NextResponse.json({ error: "No LED specs" }, { status: 400 });
    }

    // Map client-side pricing displays to PricedDisplay format if provided.
    // This ensures the preview uses the EXACT same products shown in the UI.
    let pricedDisplays;
    if (clientDisplays && Array.isArray(clientDisplays) && clientDisplays.length > 0) {
      pricedDisplays = clientDisplays.map((d: any, i: number) => {
        const spec = specs[i] || {};
        const hw = d.hardwareCost || 0;
        const spare = 0;
        const proc = d.processorCost || 0;
        const ship = d.shippingCost || 0;
        const inst = d.installCost || 0;
        const pm = d.pmCost || 0;
        const eng = d.engCost || 0;
        const total = d.totalCost || 0;
        const margin = d.blendedMarginPct || 0.15;
        const selling = d.totalSellingPrice || (margin < 1 ? total / (1 - margin) : total);
        return {
          spec,
          match: d.matchedProduct ? {
            module: {
              manufacturer: d.matchedProduct.manufacturer || "",
              name: d.matchedProduct.model || "",
              pitch: d.matchedProduct.pitch || 0,
              nits: d.matchedProduct.nits || d.nits || 0,
            },
            fitScore: d.matchedProduct.fitScore || 100,
            activeWidthFt: d.matchedProduct.activeWidthFt,
            activeHeightFt: d.matchedProduct.activeHeightFt,
          } : null,
          quote: null,
          areaSqFt: d.areaSqFt || 0,
          hardwareCost: hw,
          sparePartsCost: spare,
          processorCost: proc,
          shippingCost: ship,
          installCost: inst,
          pmCost: pm,
          engCost: eng,
          totalCost: total,
          sellingPrice: selling,
        };
      });
    } else {
      try {
        const rateCardResult = await generateRateCardExcel({
          project, specs, quotes, zoneClass, installComplexity, includeBond, currency,
        });
        pricedDisplays = rateCardResult.pricedDisplays;
      } catch {
        pricedDisplays = undefined;
      }
    }

    // Generate workbook — SAME call as export endpoint
    const { workbook: wb, displays } = await generateScopingWorkbook({
      project, specs, requirements, pricedDisplays,
      includeAlternatesInBase: true,
      zoneClass, installComplexity, includeBond, currency,
    });

    // Convert to Univer format
    const workbookData = convertWorkbook(wb, "rfp-workbook", "Scoping Workbook");

    // Summary for bottom bar
    const projectTotal = displays.reduce((s, d) => s + (d.sellingPrice || 0), 0);

    // Row map for inline editing (LED Cost Sheet: header at row 2, data starts at row 3)
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
