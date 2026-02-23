/**
 * POST /api/rfp/pipeline/fill-bid-form
 *
 * Auto-fill a client-provided bid form Excel with extracted RFP specs.
 *
 * Body: FormData with:
 *   - analysisId: string (RFP analysis ID to pull specs from)
 *   - bidForm: File (the blank bid form .xlsx)
 *   - specs?: JSON string of ExtractedLEDSpec[] (optional override — user-edited specs)
 *
 * Returns: Filled Excel file download + match metadata in headers
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fillBidForm } from "@/services/rfp/pipeline/bidFormFiller";
import type { ExtractedLEDSpec } from "@/services/rfp/unified/types";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const analysisId = formData.get("analysisId") as string;
    const bidFormFile = formData.get("bidForm") as File | null;
    const specsOverride = formData.get("specs") as string | null;

    if (!analysisId) {
      return NextResponse.json(
        { error: "analysisId is required" },
        { status: 400 }
      );
    }

    if (!bidFormFile) {
      return NextResponse.json(
        { error: "bidForm file is required" },
        { status: 400 }
      );
    }

    // Validate file type
    if (
      !bidFormFile.name.endsWith(".xlsx") &&
      !bidFormFile.name.endsWith(".xls")
    ) {
      return NextResponse.json(
        { error: "Bid form must be an Excel file (.xlsx)" },
        { status: 400 }
      );
    }

    // Load analysis from DB
    const analysis = await prisma.rfpAnalysis.findUnique({
      where: { id: analysisId },
    });
    if (!analysis) {
      return NextResponse.json(
        { error: "Analysis not found" },
        { status: 404 }
      );
    }

    // Use override specs or fall back to DB
    let screens: ExtractedLEDSpec[];
    if (specsOverride) {
      screens = JSON.parse(specsOverride) as ExtractedLEDSpec[];
    } else {
      screens =
        (analysis.screens as unknown as ExtractedLEDSpec[]) || [];
    }

    if (screens.length === 0) {
      return NextResponse.json(
        { error: "No LED specs found in this analysis. Run extraction first." },
        { status: 400 }
      );
    }

    // Read the bid form file into a buffer
    const bidFormArrayBuffer = await bidFormFile.arrayBuffer();
    const bidFormBuffer = Buffer.from(bidFormArrayBuffer);

    // Fill the bid form
    const result = await fillBidForm(bidFormBuffer, screens);

    console.log(
      `[fill-bid-form] Matched ${result.matches.length}/${result.totalBlocks} blocks, ` +
        `${result.unmatchedBlocks.length} unmatched blocks, ` +
        `${result.unmatchedScreens.length} unmatched screens`
    );

    // Build filename
    const originalName = bidFormFile.name.replace(/\.xlsx?$/i, "");
    const filename = `${originalName}_FILLED_${new Date().toISOString().slice(0, 10)}.xlsx`;

    // Return the filled Excel with match metadata in custom headers
    const response = new NextResponse(result.buffer, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Bid-Form-Matches": JSON.stringify(result.matches),
        "X-Bid-Form-Unmatched-Blocks": JSON.stringify(
          result.unmatchedBlocks
        ),
        "X-Bid-Form-Unmatched-Screens": JSON.stringify(
          result.unmatchedScreens
        ),
        "X-Bid-Form-Total-Blocks": String(result.totalBlocks),
        "X-Bid-Form-Total-Screens": String(result.totalScreens),
      },
    });

    return response;
  } catch (err: any) {
    console.error("[fill-bid-form] Error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to fill bid form" },
      { status: 500 }
    );
  }
}
