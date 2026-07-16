/**
 * POST /api/twenty-bridge/analyze-attachment
 *
 * Push-model endpoint: Twenty CRM fires attachment.created, its logic function
 * sends us the IDs. We do everything: download the PDF from Twenty, run GLM5,
 * persist to RfpAnalysis, write EstimateLines back to Twenty.
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

const TWENTY_API_KEY = process.env.TWENTY_API_KEY || "";

interface RequestBody {
  attachmentId?: string;
  estimateId?: string;
  opportunityId?: string;
  fileId: string;
  fileName?: string;
  serverUrl?: string;
  pdfBase64?: string;
}

async function downloadFromTwenty(serverUrl: string, fileId: string): Promise<Buffer> {
  const fileUrl = `${serverUrl}/files/${fileId}`;
  const res = await fetch(fileUrl, {
    headers: { Authorization: `Bearer ${TWENTY_API_KEY}` },
  });
  if (!res.ok) {
    throw new Error(`File download failed: ${res.status} from ${fileUrl}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Resolve the Twenty opportunity this analysis belongs to.
 *
 * Prefers the explicit opportunityId the caller sent. When only an estimateId
 * is available (the common case — the attachment.created logic function fires
 * from the Estimate record), read the opportunity off the estimate itself.
 *
 * Persisting this is what makes RfpAnalysis reachable from an opportunity via
 * /api/twenty-bridge/opportunity/{id}/estimate. Fail-soft: a null link only
 * costs discoverability, so it must never fail the analysis itself.
 */
async function resolveOpportunityId(
  serverUrl: string,
  explicitOpportunityId: string | undefined,
  estimateId: string | undefined,
): Promise<string | null> {
  if (explicitOpportunityId) return explicitOpportunityId;
  if (!estimateId || !serverUrl) return null;
  try {
    const res = await fetch(
      `${serverUrl}/rest/estimates/${encodeURIComponent(estimateId)}`,
      { headers: { Authorization: `Bearer ${TWENTY_API_KEY}` } },
    );
    if (!res.ok) return null;
    const json: any = await res.json().catch(() => ({}));
    return json?.data?.estimate?.opportunityId || null;
  } catch (err: any) {
    log.warn(
      `[twenty-bridge/analyze-attachment] opportunity resolve failed for estimate ${estimateId}: ${err?.message}`,
    );
    return null;
  }
}

async function writeEstimateLines(
  serverUrl: string,
  estimateId: string,
  displays: any[],
  fileName: string,
): Promise<string[]> {
  const created: string[] = [];
  for (const d of displays) {
    const res = await fetch(`${serverUrl}/rest/estimateLines`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TWENTY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        displayName: d.name,
        widthFt: d.widthFt,
        heightFt: d.heightFt,
        pitchMm: d.pitchMm || 10,
        quantity: d.quantity,
        totalSqFt: d.sqFt,
        marginPct: 30,
        lineNotes: `Auto-extracted from ${fileName}`,
        estimateId,
      }),
    });
    const json: any = await res.json().catch(() => ({}));
    const lineId =
      json?.data?.createEstimateLine?.id ??
      json?.data?.estimateLine?.id ??
      json?.data?.id;
    if (lineId) created.push(lineId);
  }
  return created;
}

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  let tempPath = "";

  try {
    const body: RequestBody = await req.json();
    const {
      estimateId,
      opportunityId,
      fileId,
      fileName = "attachment.pdf",
      serverUrl,
      pdfBase64,
    } = body;

    if (!fileId && !pdfBase64) {
      return NextResponse.json(
        { error: "fileId or pdfBase64 required" },
        { status: 400 },
      );
    }

    if (!isGLM5Available()) {
      return NextResponse.json(
        { error: "GLM5 extractor not available — check NVIDIA_API_KEY env" },
        { status: 503 },
      );
    }

    const crmUrl = serverUrl || process.env.TWENTY_API_URL || "";

    let pdfBuffer: Buffer;
    if (pdfBase64) {
      pdfBuffer = Buffer.from(pdfBase64, "base64");
    } else {
      if (!crmUrl) {
        return NextResponse.json(
          { error: "serverUrl required when not sending pdfBase64" },
          { status: 400 },
        );
      }
      log.info(`[twenty-bridge/analyze-attachment] Downloading file ${fileId} from ${crmUrl}`);
      pdfBuffer = await downloadFromTwenty(crmUrl, fileId);
    }

    const fileSize = pdfBuffer.length;
    tempPath = path.join(os.tmpdir(), `twenty-rfp-${estimateId || "unknown"}-${Date.now()}.pdf`);
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
      `[twenty-bridge/analyze-attachment] GLM5 extraction: ${fileName} (${totalPages} pages, ${Math.round(fileSize / 1024)}KB) estimate=${estimateId}`,
    );

    const glmResult = await extractWithGLM5(tempPath, { timeout: 150 });

    const screens = glmResult.screens || [];
    const project = glmResult.project || {};
    const requirements = glmResult.requirements || [];
    const warnings = glmResult.warnings || [];

    const displays = screens.map((s: any) => ({
      name: s.name || s.location || s.description || "Display",
      widthFt: s.widthFt || 0,
      heightFt: s.heightFt || 0,
      pitchMm: s.pitchMm || s.pitch || 0,
      quantity: s.quantity || 1,
      sqFt:
        Math.round(
          (s.widthFt || 0) * (s.heightFt || 0) * (s.quantity || 1) * 100,
        ) / 100,
    }));

    // `screens` must hold canonical ExtractedLEDSpec so the cost engine can read
    // it back. The `displays` shape above is the Twenty EstimateLine payload
    // (pitchMm/sqFt) and is NOT interchangeable — it lacks pixelPitchMm and
    // environment, which computeDisplays() needs to resolve a rate.
    const specs = screens.map((s: any) => ({
      ...s,
      name: s.name || s.location || s.description || "Display",
      widthFt: s.widthFt || 0,
      heightFt: s.heightFt || 0,
      pixelPitchMm: s.pixelPitchMm || s.pitchMm || s.pitch || 0,
      quantity: s.quantity || 1,
      environment:
        s.environment || (project.isOutdoor ? "outdoor" : "indoor"),
    }));

    const twentyOpportunityId = await resolveOpportunityId(
      crmUrl,
      opportunityId,
      estimateId,
    );

    const analysis = await prisma.rfpAnalysis.create({
      data: {
        filename: fileName,
        fileSize,
        pageCount: totalPages,
        projectName: project.projectName || project.name || null,
        clientName: project.clientName || project.client || null,
        venue: project.venue || project.venueName || null,
        location: project.location || null,
        specsFound: displays.length,
        processingTimeMs: Date.now() - startTime,
        screens: specs as any,
        twentyOpportunityId,
        twentySyncedAt: twentyOpportunityId ? new Date() : null,
        project: project as any,
        requirements: requirements as any,
        status: "complete",
        createdBy: `twenty-bridge:${estimateId || "no-estimate"}`,
      },
    });

    let linesCreated = 0;
    let lineIds: string[] = [];
    if (estimateId && displays.length > 0 && crmUrl) {
      lineIds = await writeEstimateLines(crmUrl, estimateId, displays, fileName);
      linesCreated = lineIds.length;
      log.info(
        `[twenty-bridge/analyze-attachment] Wrote ${linesCreated} estimate lines to ${crmUrl}`,
      );
    }

    log.info(
      `[twenty-bridge/analyze-attachment] Done: ${displays.length} displays, ${linesCreated} lines written, analysisId=${analysis.id}, ${Date.now() - startTime}ms`,
    );

    return NextResponse.json({
      ok: true,
      analysisId: analysis.id,
      estimateId,
      displays,
      linesCreated,
      lineIds,
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
    log.error("[twenty-bridge/analyze-attachment]", err?.message || err);
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
