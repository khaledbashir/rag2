/**
 * GET /api/rfp/analyses/:id/pdf — Serve the stored PDF for split-panel view
 *
 * Returns the persisted PDF file if available. Falls back to /tmp if the
 * persistent copy doesn't exist (pre-migration analyses).
 */

import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { existsSync } from "fs";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const analysis = await prisma.rfpAnalysis.findUnique({
    where: { id },
    select: { pdfFilePath: true, pdfData: true, filename: true },
  });

  if (!analysis) {
    return NextResponse.json({ error: "Analysis not found" }, { status: 404 });
  }

  const filename = analysis.filename || "rfp.pdf";
  const headers = {
    "Content-Type": "application/pdf",
    "Content-Disposition": `inline; filename="${filename}"`,
    "Cache-Control": "private, max-age=3600",
  };

  // Try persistent file path first
  const pdfPath = analysis.pdfFilePath;
  if (pdfPath && existsSync(pdfPath)) {
    const buffer = await readFile(pdfPath);
    return new NextResponse(buffer, { headers });
  }

  // Fall back to database-stored PDF
  if (analysis.pdfData) {
    return new NextResponse(analysis.pdfData, { headers });
  }

  return NextResponse.json(
    { error: "PDF file not available. The original file may have been removed after a container restart." },
    { status: 410 },
  );
}
