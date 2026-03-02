/**
 * POST /api/rfp/pipeline/vendor-quote-sheet
 *
 * Generate a vendor-specific quote request Excel for electricians, installers,
 * or LED suppliers.
 *
 * Body: {
 *   analysisId: string,
 *   vendorType: "electrician" | "installer" | "led_supplier",
 *   specs?: ExtractedLEDSpec[],       // Optional override (user-edited)
 *   pricingDisplays?: PricingDisplay[], // Optional enrichment (matched products)
 *   requestedBy?: string,
 *   dueDate?: string,
 *   notes?: string,
 * }
 * Returns: Excel file download
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateVendorQuoteSheet, type VendorType } from "@/services/rfp/pipeline/generateVendorQuoteSheets";
import type { ExtractedLEDSpec, ExtractedProjectInfo } from "@/services/rfp/unified/types";

const VALID_VENDOR_TYPES = ["electrician", "installer", "led_supplier"];

const VENDOR_LABELS: Record<string, string> = {
  electrician: "Electrical",
  installer: "Install",
  led_supplier: "LED_Supply",
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { analysisId, vendorType, specs: overrideSpecs, pricingDisplays, requestedBy, dueDate, notes } = body;

    if (!analysisId) {
      return NextResponse.json({ error: "analysisId is required" }, { status: 400 });
    }
    if (!vendorType || !VALID_VENDOR_TYPES.includes(vendorType)) {
      return NextResponse.json({ error: `vendorType must be one of: ${VALID_VENDOR_TYPES.join(", ")}` }, { status: 400 });
    }

    const analysis = await prisma.rfpAnalysis.findUnique({ where: { id: analysisId } });
    if (!analysis) {
      return NextResponse.json({ error: "Analysis not found" }, { status: 404 });
    }

    const screens = (overrideSpecs as ExtractedLEDSpec[]) || (analysis.screens as unknown as ExtractedLEDSpec[]) || [];
    const project = (analysis.project as unknown as ExtractedProjectInfo) || {};

    if (screens.length === 0) {
      return NextResponse.json({ error: "No LED specs found in this analysis" }, { status: 400 });
    }

    const buffer = await generateVendorQuoteSheet({
      project,
      specs: screens,
      vendorType: vendorType as VendorType,
      pricingDisplays,
      requestedBy,
      dueDate,
      notes,
    });

    const label = VENDOR_LABELS[vendorType] || vendorType;
    const projectSlug = (project.projectName || project.venue || "Project").replace(/\s+/g, "_");
    const filename = `${label}_Quote_${projectSlug}_${new Date().toISOString().slice(0, 10)}.xlsx`;

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to generate vendor sheet";
    console.error("[vendor-quote-sheet] Error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
