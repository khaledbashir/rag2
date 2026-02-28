/**
 * POST /api/rfp/analyze/drawings — Upload supplementary drawing files
 *
 * Accepts PDF/image files that contain additional LED display drawings
 * not included in the main RFP document. Runs Mistral vision OCR on each
 * page and adds the results to the existing RFP analysis workspace.
 *
 * Body: FormData with:
 *   - file: The PDF or image file
 *   - analysisId: The existing RFP analysis ID
 */

import { NextRequest, NextResponse } from "next/server";
import { mkdir, writeFile, rm } from "fs/promises";
import { randomUUID } from "crypto";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { extractSinglePage } from "@/services/rfp/unified/mistralOcrClient";
import { convertPageToImage } from "@/services/rfp/unified/pdfToImages";
import { prisma } from "@/lib/prisma";
import { ANYTHING_LLM_BASE_URL, ANYTHING_LLM_KEY } from "@/lib/variables";

const execFileAsync = promisify(execFile);

export const maxDuration = 120;
export const dynamic = "force-dynamic";

const UPLOAD_DIR = process.env.RFP_UPLOAD_DIR || "/rfp-data/rfp-uploads";

export async function POST(request: NextRequest) {
  let tempDir: string | null = null;

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const analysisId = formData.get("analysisId") as string | null;

    if (!file || !analysisId) {
      return NextResponse.json({ error: "file and analysisId required" }, { status: 400 });
    }

    // Verify analysis exists
    const analysis = await prisma.rfpAnalysis.findUnique({
      where: { id: analysisId },
      select: { id: true, aiWorkspaceSlug: true },
    });

    if (!analysis) {
      return NextResponse.json({ error: "Analysis not found" }, { status: 404 });
    }

    // Save file to disk
    await mkdir(UPLOAD_DIR, { recursive: true });
    const sessionId = randomUUID();
    const ext = file.name.toLowerCase().endsWith(".pdf") ? ".pdf" : path.extname(file.name) || ".pdf";
    const filePath = path.join(UPLOAD_DIR, `${sessionId}${ext}`);
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(filePath, buffer);

    tempDir = path.join(UPLOAD_DIR, sessionId);
    await mkdir(tempDir, { recursive: true });

    const isImage = /\.(png|jpg|jpeg|tiff?|bmp|webp)$/i.test(file.name);
    const pages: Array<{ pageNumber: number; markdown: string; tables: any[] }> = [];

    if (isImage) {
      // Single image — send directly to Mistral OCR
      const ocrResult = await extractSinglePage(filePath, 1);
      pages.push({ pageNumber: 1, markdown: ocrResult.markdown, tables: ocrResult.tables });
    } else {
      // PDF — get page count, convert each to image, OCR
      let pageCount = 1;
      try {
        const { stdout } = await execFileAsync("pdfinfo", [filePath], { timeout: 15_000 });
        const match = stdout.match(/Pages:\s+(\d+)/);
        pageCount = match ? parseInt(match[1], 10) : 1;
      } catch {}

      // Cap at 20 pages for drawings (they shouldn't be huge)
      const maxPages = Math.min(pageCount, 20);

      for (let p = 1; p <= maxPages; p++) {
        try {
          const pageDir = path.join(tempDir, `p${p}`);
          const imagePath = await convertPageToImage(filePath, p, pageDir);
          const ocrResult = await extractSinglePage(imagePath, p);
          pages.push({ pageNumber: p, markdown: ocrResult.markdown, tables: ocrResult.tables });
        } catch (err: any) {
          console.error(`[Drawings] Page ${p} OCR failed:`, err.message);
        }
      }
    }

    // Add to AnythingLLM workspace if it exists
    if (analysis.aiWorkspaceSlug && ANYTHING_LLM_BASE_URL && ANYTHING_LLM_KEY && pages.length > 0) {
      try {
        const content = pages.map((p) => {
          let text = `\n=== DRAWING PAGE ${p.pageNumber} (${file.name}) ===\n${p.markdown}`;
          if (p.tables.length > 0) {
            text += "\n\nTABLES:\n" + p.tables.map((t: any) => t.content).join("\n");
          }
          return text;
        }).join("\n\n");

        const uploadForm = new FormData();
        const blob = new Blob([content], { type: "text/plain" });
        uploadForm.append("file", blob, `drawings-${file.name.replace(/[^a-z0-9.-]/gi, "_")}.txt`);

        const uploadRes = await fetch(`${ANYTHING_LLM_BASE_URL}/document/upload`, {
          method: "POST",
          headers: { Authorization: `Bearer ${ANYTHING_LLM_KEY}` },
          body: uploadForm,
        });

        if (uploadRes.ok) {
          const uploadData = await uploadRes.json();
          const docPaths = (uploadData?.documents || []).map((d: any) => d.location).filter(Boolean);

          if (docPaths.length > 0) {
            await fetch(`${ANYTHING_LLM_BASE_URL}/workspace/${analysis.aiWorkspaceSlug}/update-embeddings`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${ANYTHING_LLM_KEY}`,
              },
              body: JSON.stringify({ adds: docPaths }),
            });
          }
        }
      } catch (err: any) {
        console.error("[Drawings] Workspace embedding failed:", err.message);
      }
    }

    // Cleanup temp files
    try {
      await rm(tempDir, { recursive: true, force: true });
      await rm(filePath, { force: true });
    } catch {}

    return NextResponse.json({
      success: true,
      filename: file.name,
      pagesProcessed: pages.length,
      addedToWorkspace: !!analysis.aiWorkspaceSlug,
    });
  } catch (err: any) {
    console.error("[Drawings] Error:", err);
    if (tempDir) try { await rm(tempDir, { recursive: true, force: true }); } catch {}
    return NextResponse.json({ error: err.message || "Drawing upload failed" }, { status: 500 });
  }
}
