/**
 * POST /api/revision/compare
 *
 * Accepts two Excel files (multipart/form-data: "original" + "revised")
 * and returns a delta comparison of their Margin Analysis sheets.
 */

import { NextRequest, NextResponse } from "next/server";
import { compareWorkbooks } from "@/services/revision/deltaScanner";
import { log } from "@/lib/logger";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const originalFile = formData.get("original") as File | null;
    const revisedFile = formData.get("revised") as File | null;

    if (!originalFile || !revisedFile) {
      return NextResponse.json(
        { error: "Both 'original' and 'revised' Excel files are required" },
        { status: 400 }
      );
    }

    // Validate file types
    const validTypes = [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
    ];
    const validExts = [".xlsx", ".xls"];
    for (const file of [originalFile, revisedFile]) {
      const hasValidType = validTypes.includes(file.type);
      const hasValidExt = validExts.some((ext) => file.name.toLowerCase().endsWith(ext));
      if (!hasValidType && !hasValidExt) {
        return NextResponse.json(
          { error: `Invalid file type: ${file.name}. Only .xlsx and .xls files are accepted.` },
          { status: 400 }
        );
      }
    }

    const xlsx = require("xlsx");

    // Parse both workbooks
    const originalBuffer = Buffer.from(await originalFile.arrayBuffer());
    const revisedBuffer = Buffer.from(await revisedFile.arrayBuffer());

    const originalWorkbook = xlsx.read(originalBuffer, { type: "buffer", cellStyles: true });
    const revisedWorkbook = xlsx.read(revisedBuffer, { type: "buffer", cellStyles: true });

    const result = compareWorkbooks(
      originalWorkbook,
      revisedWorkbook,
      originalFile.name,
      revisedFile.name
    );

    return NextResponse.json({ result });
  } catch (err: any) {
    log.error("[REVISION COMPARE]", err);
    return NextResponse.json(
      { error: err.message || "Failed to compare workbooks" },
      { status: 500 }
    );
  }
}
