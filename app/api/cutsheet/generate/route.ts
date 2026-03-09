/**
 * POST /api/cutsheet/generate
 *
 * Generates cut-sheet documents for one or all displays in a project.
 * Pure computation — no DB, no AI.
 */

import { NextRequest, NextResponse } from "next/server";
import { generateCutSheets, cutSheetToText, type CutSheetInput } from "@/services/cutsheet/cutSheetGenerator";
import { log } from "@/lib/logger";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const { projectName, clientName, location, displays } = body as CutSheetInput;

    if (!displays || !Array.isArray(displays) || displays.length === 0) {
      return NextResponse.json(
        { error: "At least one display is required" },
        { status: 400 }
      );
    }

    const doc = generateCutSheets({ projectName, clientName, location, displays });

    // Generate text versions for each display
    const textSheets = doc.displays.map((_, i) => cutSheetToText(doc, i));

    return NextResponse.json({
      cutSheet: doc,
      textSheets,
    });
  } catch (err: any) {
    log.error("[CUTSHEET GENERATE]", err);
    return NextResponse.json(
      { error: err.message || "Failed to generate cut sheet" },
      { status: 500 }
    );
  }
}
