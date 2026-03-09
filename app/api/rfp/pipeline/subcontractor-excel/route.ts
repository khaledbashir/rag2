/**
 * POST /api/rfp/pipeline/subcontractor-excel
 *
 * Generate subcontractor quote request Excel from an RFP analysis.
 *
 * Body: {
 *   analysisId: string,
 *   specs?: ExtractedLEDSpec[],  // Optional override — user-edited specs from preview
 *   requestedBy?: string,
 *   dueDate?: string,
 *   notes?: string,
 * }
 * Returns: Excel file download
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateSubcontractorExcel } from "@/services/rfp/pipeline/generateSubcontractorExcel";
import type { ExtractedLEDSpec, ExtractedProjectInfo } from "@/services/rfp/unified/types";
import { log } from "@/lib/logger";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { analysisId, specs: overrideSpecs, requestedBy, dueDate, notes } = body;

    if (!analysisId) {
      return NextResponse.json({ error: "analysisId is required" }, { status: 400 });
    }

    // Load analysis from DB
    const analysis = await prisma.rfpAnalysis.findUnique({ where: { id: analysisId } });
    if (!analysis) {
      return NextResponse.json({ error: "Analysis not found" }, { status: 404 });
    }

    // Use override specs (from editable preview) or fall back to DB
    const screens = (overrideSpecs as ExtractedLEDSpec[]) || (analysis.screens as unknown as ExtractedLEDSpec[]) || [];
    const project = (analysis.project as unknown as ExtractedProjectInfo) || {};

    if (screens.length === 0) {
      return NextResponse.json({ error: "No LED specs found in this analysis" }, { status: 400 });
    }

    const buffer = await generateSubcontractorExcel({
      project,
      specs: screens,
      requestedBy,
      dueDate,
      notes,
    });

    const filename = `Quote_Request_${(project.projectName || project.venue || "Project").replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.xlsx`;

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err: any) {
    log.error("[subcontractor-excel] Error:", err);
    return NextResponse.json({ error: err.message || "Failed to generate Excel" }, { status: 500 });
  }
}
