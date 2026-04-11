/**
 * POST /api/agent-skill/analyze-workbook
 *
 * Bridge endpoint that lets an AnythingLLM agent skill run the SAME RFP
 * analysis pipeline the rag2 platform uses, without touching the frozen
 * RFP code. Imports analyzeRfp() as a library — no modifications.
 *
 * Accepts three input modes, all bypass NextAuth middleware because
 * this path is under /api/agent-skill/:
 *
 *   1. multipart/form-data with a "file" field (preferred, handles big
 *      files without base64 overhead)
 *   2. JSON body: { file_url: "https://..." }  (skill downloads it first)
 *   3. JSON body: { file_base64: "...", filename: "x.pdf" }
 *
 * Auth: x-api-key header matching AGENT_SKILL_API_KEY
 * (write-ish workload — analyzer hits upstream LLM/OCR APIs and logs,
 *  so gated even though it's read-only on the rag2 side).
 *
 * Supported file types today: PDF (uses the vision pipeline).
 * Excel support will be added in a follow-up bridge.
 *
 * Response (on success, 200):
 *   {
 *     filename: string,
 *     result: RFPAnalysisResult  // same shape the platform UI uses
 *   }
 */

import { NextRequest, NextResponse } from "next/server";
import { analyzeRfp } from "@/services/rfp/unified/analyzeRfp";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const maxDuration = 300; // RFP analysis can take a while (Mistral OCR + vision)

function authorize(request: NextRequest): NextResponse | null {
  const expected = process.env.AGENT_SKILL_API_KEY;
  if (!expected) {
    return NextResponse.json(
      { error: "Service not configured: AGENT_SKILL_API_KEY missing" },
      { status: 503 },
    );
  }
  const provided = request.headers.get("x-api-key");
  if (!provided || provided !== expected) {
    return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
  }
  return null;
}

async function readInput(
  request: NextRequest,
): Promise<
  { buffer: Buffer; filename: string } | { error: string; status: number }
> {
  const contentType = request.headers.get("content-type") || "";

  // --- Mode 1: multipart upload ---
  if (contentType.includes("multipart/form-data")) {
    try {
      const form = await request.formData();
      const file = form.get("file");
      if (!file || typeof file === "string") {
        return { error: "multipart 'file' field is required", status: 400 };
      }
      const buffer = Buffer.from(await file.arrayBuffer());
      return { buffer, filename: (file as File).name || "upload.pdf" };
    } catch (e) {
      return {
        error: "Failed to parse multipart body: " + (e as Error).message,
        status: 400,
      };
    }
  }

  // --- Mode 2 / 3: JSON body ---
  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    return { error: "Body must be multipart or JSON", status: 400 };
  }

  // Mode 2: file_url
  if (typeof body.file_url === "string" && body.file_url) {
    try {
      const res = await fetch(body.file_url);
      if (!res.ok) {
        return {
          error: `Could not fetch file_url: HTTP ${res.status}`,
          status: 400,
        };
      }
      const buffer = Buffer.from(await res.arrayBuffer());
      const urlFilename =
        (body.filename as string | undefined) ||
        new URL(body.file_url).pathname.split("/").pop() ||
        "download.pdf";
      return { buffer, filename: urlFilename };
    } catch (e) {
      return {
        error: "Failed to download file_url: " + (e as Error).message,
        status: 400,
      };
    }
  }

  // Mode 3: file_base64
  if (typeof body.file_base64 === "string" && body.file_base64) {
    try {
      const raw = body.file_base64.replace(/^data:[^;]+;base64,/, "");
      const buffer = Buffer.from(raw, "base64");
      const filename =
        (body.filename as string | undefined) || "upload.pdf";
      return { buffer, filename };
    } catch (e) {
      return {
        error: "Failed to decode file_base64: " + (e as Error).message,
        status: 400,
      };
    }
  }

  return {
    error:
      "Provide one of: multipart 'file' upload, JSON { file_url }, or JSON { file_base64, filename }",
    status: 400,
  };
}

export async function POST(request: NextRequest) {
  const authError = authorize(request);
  if (authError) return authError;

  const input = await readInput(request);
  if ("error" in input) {
    return NextResponse.json({ error: input.error }, { status: input.status });
  }

  const { buffer, filename } = input;
  const lower = filename.toLowerCase();
  const isPdf = lower.endsWith(".pdf");
  const isExcel = lower.endsWith(".xlsx") || lower.endsWith(".xls");

  if (!isPdf && !isExcel) {
    return NextResponse.json(
      {
        error:
          "Unsupported file type. Send a .pdf (full pipeline) or .xlsx/.xls (coming soon).",
      },
      { status: 415 },
    );
  }

  if (isExcel) {
    // Excel bridge is tracked separately. Rather than duplicate the 580-line
    // parser in app/api/rfp/analyze/excel/route.ts, we'll expose a second
    // bridge route once that parser is refactored into a library function.
    return NextResponse.json(
      {
        error:
          "Excel analysis via the bridge is not enabled yet. Send a PDF, or use the platform UI for scoping workbooks.",
      },
      { status: 501 },
    );
  }

  // PDF path — call the frozen analyzer as a library
  try {
    log.info(
      `[agent-skill/analyze-workbook] analyzing ${filename} (${buffer.length} bytes)`,
    );
    const result = await analyzeRfp(
      [{ buffer, filename }],
      {
        skipVision: false,
        generateThumbnails: false, // skill caller doesn't need thumbnails in the JSON
      },
    );
    return NextResponse.json({ filename, result }, { status: 200 });
  } catch (err) {
    log.error("[agent-skill/analyze-workbook] failed:", err);
    return NextResponse.json(
      {
        error: "Analysis failed",
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
