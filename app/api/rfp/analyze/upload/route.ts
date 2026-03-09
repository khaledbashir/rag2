/**
 * POST /api/rfp/analyze/upload — Chunked PDF upload
 *
 * Protocol:
 *   1. Client sends chunks via POST with headers:
 *      - X-Filename: original filename
 *      - X-Session-Id: (optional on first chunk) session UUID
 *      - X-Chunk-Index: 0-based chunk number
 *      - X-Total-Chunks: total number of chunks
 *      - Content-Type: application/octet-stream
 *      - Body: raw chunk bytes (≤10MB each)
 *
 *   2. Server appends each chunk to disk. On the LAST chunk,
 *      runs pdfinfo and returns final metadata.
 *
 *   3. Response always includes { sessionId } so the client
 *      can track the session across chunks.
 *
 * This approach keeps each request under 10MB — no OOM, no 502,
 * no matter how large the PDF is.
 */

import { NextRequest, NextResponse } from "next/server";
import { mkdir, appendFile, stat as fsStat } from "fs/promises";
import { existsSync } from "fs";
import { randomUUID } from "crypto";
import path from "path";
import { log } from "@/lib/logger";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const UPLOAD_DIR = process.env.RFP_UPLOAD_DIR || "/rfp-data/rfp-uploads";

export async function POST(request: NextRequest) {
  try {
    if (!existsSync(UPLOAD_DIR)) {
      await mkdir(UPLOAD_DIR, { recursive: true });
    }

    // Parse headers
    const filename = request.headers.get("x-filename") || "document.pdf";
    const sessionId = request.headers.get("x-session-id") || randomUUID();
    const chunkIndex = parseInt(request.headers.get("x-chunk-index") || "0", 10);
    const totalChunks = parseInt(request.headers.get("x-total-chunks") || "1", 10);

    const filePath = path.join(UPLOAD_DIR, `${sessionId}.pdf`);

    // Read chunk body as ArrayBuffer → Buffer
    const arrayBuf = await request.arrayBuffer();
    const chunkBuffer = Buffer.from(arrayBuf);

    if (chunkBuffer.length === 0 && totalChunks > 1) {
      return NextResponse.json({ error: "Empty chunk" }, { status: 400 });
    }

    // Append chunk to file on disk
    await appendFile(filePath, chunkBuffer);

    const isLastChunk = chunkIndex >= totalChunks - 1;

    // For intermediate chunks, just acknowledge
    if (!isLastChunk) {
      return NextResponse.json({
        sessionId,
        chunk: chunkIndex,
        totalChunks,
        status: "uploading",
      });
    }

    // ---- Last chunk: finalize ----

    const fileInfo = await fsStat(filePath);
    const fileSize = fileInfo.size;

    if (fileSize === 0) {
      return NextResponse.json({ error: "Empty file received" }, { status: 400 });
    }

    const sizeMb = (fileSize / 1024 / 1024).toFixed(1);

    // Get page count using pdfinfo (poppler-utils) — zero memory usage
    let pageCount = 0;
    try {
      const { execFile } = await import("child_process");
      const { promisify } = await import("util");
      const execFileAsync = promisify(execFile);
      const { stdout } = await execFileAsync("pdfinfo", [filePath], { timeout: 30_000 });
      const match = stdout.match(/Pages:\s+(\d+)/);
      pageCount = match ? parseInt(match[1], 10) : 0;
    } catch {
      // Fallback: estimate (~50KB per page average for construction RFPs)
      pageCount = Math.max(1, Math.round(fileSize / 50000));
    }

    return NextResponse.json({
      sessionId,
      filename,
      pageCount,
      sizeBytes: fileSize,
      sizeMb,
      status: "complete",
    });
  } catch (err) {
    log.error("[/api/rfp/analyze/upload] Error:", err);
    return NextResponse.json(
      { error: `Upload failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 },
    );
  }
}
