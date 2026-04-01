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
import { needsWestfieldReextract, reextractSavedPdfAnalysis, preservePitchFromOriginal } from "@/services/rfp/unified/healSavedAnalysis";

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
      clientSpecs,
      clientDisplays,
    } = body;

    if (!analysisId) {
      return NextResponse.json({ error: "analysisId is required" }, { status: 400 });
    }

    // Load analysis
    const analysis = await prisma.rfpAnalysis.findUnique({ where: { id: analysisId } });
    if (!analysis) {
      return NextResponse.json({ error: "Analysis not found" }, { status: 404 });
    }

    // Use client-supplied specs if available (ensures export uses same data shown on screen)
    let specs = (clientSpecs || analysis.screens) as unknown as ExtractedLEDSpec[] || [];
    let project = (analysis.project as unknown as ExtractedProjectInfo) || {};
    let requirements = (analysis.requirements as unknown as ExtractedRequirement[]) || [];

    if (needsWestfieldReextract(analysis)) {
      try {
        const originalScreens = specs;
        const healed = await reextractSavedPdfAnalysis(analysis);
        // Preserve known-good pitch values from original analysis —
        // AI extraction sometimes confuses mesh pitch (3.9mm) with LED pitch (2.5mm)
        specs = preservePitchFromOriginal(healed.screens, originalScreens);
        requirements = healed.requirements;
        project = { ...project, ...healed.project };
        // Store healed flag in DB JSON (not in the typed project object)
        const projectForDb = { ...project, _healedAt: new Date().toISOString() };
        await prisma.rfpAnalysis.update({
          where: { id: analysis.id },
          data: {
            screens: JSON.parse(JSON.stringify(specs)),
            requirements: JSON.parse(JSON.stringify(healed.requirements)),
            incompleteSpecs: JSON.parse(JSON.stringify(healed.incompleteSpecs)),
            project: JSON.parse(JSON.stringify(projectForDb)),
            specsFound: specs.length,
          },
        });
        log.info(`[scoping-workbook] Westfield healed: ${specs.length} screens, pitch preserved from original`);
      } catch (err) {
        log.warn("[scoping-workbook] Westfield re-extract failed, using saved analysis");
        // Mark as healed even on failure to stop re-extraction loop
        try {
          await prisma.rfpAnalysis.update({
            where: { id: analysis.id },
            data: {
              project: JSON.parse(JSON.stringify({ ...project, _healedAt: new Date().toISOString() })),
            },
          });
        } catch {}
      }
    }

    if (specs.length === 0) {
      return NextResponse.json({ error: "No LED specs found in this analysis" }, { status: 400 });
    }

    // Map client-side pricing displays to PricedDisplay format if provided.
    // This ensures the export uses the EXACT same numbers shown on the online preview.
    let pricedDisplays;
    if (clientDisplays && Array.isArray(clientDisplays) && clientDisplays.length > 0) {
      pricedDisplays = clientDisplays.map((d: any, i: number) => {
        const spec = specs[i] || {};
        const hw = d.hardwareCost || 0;
        const spare = Math.round(hw * 0.05 * 100) / 100;
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
          ledMarginPct: margin,
          svcMarginPct: margin,
          hardwareSellingPrice: margin < 1 ? (hw + spare + proc + ship) / (1 - margin) : (hw + spare + proc + ship),
          servicesSellingPrice: margin < 1 ? (inst + pm + eng) / (1 - margin) : (inst + pm + eng),
          totalSellingPrice: selling,
          marginDollars: selling - total,
          blendedMarginPct: margin,
          leadTimeWeeks: null,
          costSource: d.costSource || "rate_card",
        };
      });
      log.info(`[scoping-workbook] Using ${pricedDisplays.length} client-supplied pricing displays`);
    } else {
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
        pricedDisplays = undefined;
      }
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
