/**
 * POST /api/rfp/pipeline/import-scoping-workbook
 *
 * Import an updated scoping workbook Excel and match to analysis specs.
 * Extracts costs, margins, quantities from LED Cost Sheet / Margin Analysis.
 *
 * Body: FormData with 'file' (Excel) + 'analysisId' string
 * Returns: ScopingImportResult JSON
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { importScopingWorkbook } from "@/services/rfp/pipeline/scopingWorkbookImporter";
import type { ExtractedLEDSpec } from "@/services/rfp/unified/types";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const analysisId = formData.get("analysisId") as string | null;

    if (!file) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }
    if (!analysisId) {
      return NextResponse.json({ error: "analysisId is required" }, { status: 400 });
    }

    // Load analysis
    const analysis = await prisma.rfpAnalysis.findUnique({ where: { id: analysisId } });
    if (!analysis) {
      return NextResponse.json({ error: "Analysis not found" }, { status: 404 });
    }

    const specs = (analysis.screens as unknown as ExtractedLEDSpec[]) || [];
    if (specs.length === 0) {
      return NextResponse.json({ error: "No LED specs in this analysis to match against" }, { status: 400 });
    }

    // Read Excel buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const result = await importScopingWorkbook(buffer, specs, file.name);

    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to import scoping workbook";
    console.error("[import-scoping-workbook] Error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
