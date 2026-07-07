/**
 * POST /api/rfp/bid-form — Save bid form Excel for an analysis
 * GET  /api/rfp/bid-form?analysisId=xxx — Check if a bid form exists
 *
 * Stores bid form files on the persistent volume so the history page
 * can access them after the live page redirects away.
 */

import { NextRequest, NextResponse } from "next/server";
import { writeFile, stat, readFile } from "fs/promises";
import path from "path";

const BID_FORM_DIR = "/rfp-data/bid-forms";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const analysisId = formData.get("analysisId") as string;
    const file = formData.get("bidForm") as File;

    if (!analysisId || !file) {
      return NextResponse.json({ error: "analysisId and bidForm required" }, { status: 400 });
    }

    // Ensure directory exists
    const { mkdir } = await import("fs/promises");
    await mkdir(BID_FORM_DIR, { recursive: true });

    const filePath = path.join(BID_FORM_DIR, `${analysisId}.xlsx`);
    const metaPath = path.join(BID_FORM_DIR, `${analysisId}.json`);
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(filePath, buffer);
    await writeFile(metaPath, JSON.stringify({
      filename: file.name,
      size: file.size,
      savedAt: new Date().toISOString(),
    }));

    return NextResponse.json({ saved: true, filename: file.name });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

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
      let filename: string | null = null;
      try {
        const meta = JSON.parse(await readFile(metaPath, "utf8"));
        filename = typeof meta.filename === "string" ? meta.filename : null;
      } catch {}
      return NextResponse.json({ exists: true, filename });
    } catch {
      return NextResponse.json({ exists: false });
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
