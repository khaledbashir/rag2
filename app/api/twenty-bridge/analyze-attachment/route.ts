/**
 * POST /api/twenty-bridge/analyze-attachment
 *
 * Bridge endpoint called by Twenty CRM's rfp-auto-on-attach logic function.
 * Receives a PDF (base64), runs the GLM5 extractor, persists to RfpAnalysis,
 * and returns the extracted display specs in the shape Twenty expects.
 *
 * Public (no rag2 auth): Twenty is ANC-internal and this is a narrow bridge.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { log } from "@/lib/logger";
import {
  extractWithGLM5,
  isGLM5Available,
} from "@/services/rfp/unified/glmExtractor";
import path from "path";
import fs from "fs/promises";
import os from "os";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export const dynamic = "force-dynamic";
export const maxDuration = 180;

interface RequestBody {
  pdfBase64: string;
  estimateId: string;
  filename?: string;
}

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  let tempPath = "";

  try {
    const body: RequestBody = await req.json();
    const { pdfBase64, estimateId, filename = "attachment.pdf" } = body;

    if (!pdfBase64 || !estimateId) {
      return NextResponse.json(
        { error: "pdfBase64 and estimateId are required" },
        { status: 400 },
      );
    }

    if (!isGLM5Available()) {
      return NextResponse.json(
        { error: "GLM5 extractor not available — check NVIDIA_API_KEY env" },
        { status: 503 },
      );
    }

    const pdfBuffer = Buffer.from(pdfBase64, "base64");
    const fileSize = pdfBuffer.length;

    tempPath = path.join(os.tmpdir(), `twenty-rfp-${estimateId}-${Date.now()}.pdf`);
    await fs.writeFile(tempPath, pdfBuffer);

    let totalPages = 0;
    try {
      const { stdout: info } = await execFileAsync("pdfinfo", [tempPath], {
        timeout: 30_000,
      });
      const match = info.match(/Pages:\s+(\d+)/);
      totalPages = match ? parseInt(match[1], 10) : 0;
    } catch {
      totalPages = 0;
    }

    log.info(
      `[twenty-bridge/analyze-attachment] Starting GLM5 extraction: ${filename} (${totalPages} pages, ${Math.round(fileSize / 1024)}KB) for estimate ${estimateId}`,
    );

    const glmResult = await extractWithGLM5(tempPath, { timeout: 150 });

    const screens = glmResult.screens || [];
    const project = glmResult.project || {};
    const requirements = glmResult.requirements || [];
    const warnings = glmResult.warnings || [];

    const displays = screens.map((s: any) => ({
      name:
        s.name || s.location || s.description || "Display",
      widthFt: s.widthFt || 0,
      heightFt: s.heightFt || 0,
      pitchMm: s.pitchMm || s.pitch || 0,
      quantity: s.quantity || 1,
      sqFt:
        Math.round(
          (s.widthFt || 0) * (s.heightFt || 0) * (s.quantity || 1) * 100,
        ) / 100,
    }));

    const analysis = await prisma.rfpAnalysis.create({
      data: {
        filename,
        fileSize,
        pageCount: totalPages,
        projectName: project.projectName || project.name || null,
        clientName: project.clientName || project.client || null,
        venue: project.venue || project.venueName || null,
        location: project.location || null,
        specsFound: displays.length,
        processingTimeMs: Date.now() - startTime,
        screens: displays as any,
        project: project as any,
        requirements: requirements as any,
        status: "complete",
        createdBy: `twenty-bridge:${estimateId}`,
      },
    });

    log.info(
      `[twenty-bridge/analyze-attachment] Done: ${displays.length} displays, analysisId=${analysis.id}, ${Date.now() - startTime}ms`,
    );

    return NextResponse.json({
      ok: true,
      analysisId: analysis.id,
      estimateId,
      displays,
      project,
      warnings,
      stats: {
        totalPages,
        specsFound: displays.length,
        processingTimeMs: Date.now() - startTime,
        source: "glm5",
      },
    });
  } catch (err: any) {
    log.error(
      "[twenty-bridge/analyze-attachment]",
      err?.message || err,
    );
    return NextResponse.json(
      { error: err?.message || "extraction failed", stack: err?.stack?.slice(0, 500) },
      { status: 500 },
    );
  } finally {
    if (tempPath) {
      fs.unlink(tempPath).catch(() => {});
    }
  }
}
