/**
 * GET /api/rfp/bid-form/file?analysisId=xxx — Download saved bid form Excel
 */

import { NextRequest, NextResponse } from "next/server";
import { readFile, stat } from "fs/promises";
import path from "path";

const BID_FORM_DIR = "/rfp-data/bid-forms";

export async function GET(request: NextRequest) {
  try {
    const analysisId = request.nextUrl.searchParams.get("analysisId");
    if (!analysisId) {
      return NextResponse.json({ error: "analysisId required" }, { status: 400 });
    }

    const filePath = path.join(BID_FORM_DIR, `${analysisId}.xlsx`);
    const metaPath = path.join(BID_FORM_DIR, `${analysisId}.json`);
    try {
      await stat(filePath);
    } catch {
      return NextResponse.json({ error: "Bid form not found" }, { status: 404 });
    }

    let filename = "bid-form.xlsx";
    try {
      const meta = JSON.parse(await readFile(metaPath, "utf8"));
      if (typeof meta.filename === "string" && meta.filename.trim()) {
        filename = meta.filename.replace(/"/g, "");
      }
    } catch {}

    const buffer = await readFile(filePath);
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
