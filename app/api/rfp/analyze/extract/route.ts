/**
 * POST /api/rfp/analyze/extract — Phase 2: Deep Extraction
 *
 * Takes a session ID + list of selected page numbers.
 * Runs Mistral OCR ONLY on those pages (not all 1300+).
 * Then AI extracts LED specs from the structured markdown.
 * Streams progress via SSE.
 */

import { NextRequest } from "next/server";
import { readFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { extractWithMistral } from "@/services/rfp/unified/mistralOcrClient";
import { extractLEDSpecs } from "@/services/rfp/unified/specExtractor";
import type { AnalyzedPage, ExtractedLEDSpec } from "@/services/rfp/unified/types";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const UPLOAD_DIR = process.env.RFP_UPLOAD_DIR || "/rfp-data/rfp-uploads";

export async function POST(request: NextRequest) {
  let body: { sessionId: string; selectedPages: number[] };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!body.selectedPages || body.selectedPages.length === 0) {
    return new Response(JSON.stringify({ error: "No pages selected" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const filePath = path.join(UPLOAD_DIR, `${body.sessionId}.pdf`);
  if (!existsSync(filePath)) {
    return new Response(JSON.stringify({ error: "Session not found. Upload first." }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (type: string, data: any) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type, ...data })}\n\n`));
      };

      const startTime = Date.now();
      const pageNumbers = body.selectedPages.sort((a, b) => a - b);

      try {
        // =====================================================
        // STEP 1: Extract selected pages into a smaller PDF
        // =====================================================
        send("stage", {
          stage: "preparing",
          message: `Extracting ${pageNumbers.length} selected pages from PDF...`,
        });

        const buffer = await readFile(filePath);

        // Use pdf-lib to build a PDF with only the selected pages
        const { PDFDocument } = await import("pdf-lib");
        const srcDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
        const extractedDoc = await PDFDocument.create();

        for (const pageNum of pageNumbers) {
          const pageIdx = pageNum - 1; // Convert to 0-based
          if (pageIdx >= 0 && pageIdx < srcDoc.getPageCount()) {
            const [copiedPage] = await extractedDoc.copyPages(srcDoc, [pageIdx]);
            extractedDoc.addPage(copiedPage);
          }
        }

        const extractedBuffer = Buffer.from(await extractedDoc.save());

        send("stage", {
          stage: "prepared",
          message: `Built ${pageNumbers.length}-page PDF (${(extractedBuffer.length / 1024 / 1024).toFixed(1)}MB)`,
        });

        // =====================================================
        // STEP 2: Mistral OCR on the extracted pages
        // =====================================================
        send("stage", {
          stage: "mistral",
          message: `Sending ${pageNumbers.length} pages to Mistral OCR for structured extraction...`,
        });

        const ocrResult = await extractWithMistral(extractedBuffer, "selected-pages.pdf");

        send("stage", {
          stage: "mistral_done",
          message: `Mistral OCR complete: ${ocrResult.pages.length} pages with structured markdown`,
          pagesProcessed: ocrResult.pages.length,
        });

        // =====================================================
        // STEP 3: Build analyzed pages
        // =====================================================
        const analyzedPages: AnalyzedPage[] = ocrResult.pages.map((page, i) => ({
          index: i,
          pageNumber: pageNumbers[i] || i + 1,
          category: "led_specs" as const,
          relevance: 90,
          markdown: page.markdown,
          tables: page.tables,
          visionAnalyzed: false,
          summary: page.markdown.split("\n").find((l) => l.trim().length > 10)?.slice(0, 150) || "Page content",
          classifiedBy: "mistral-ocr" as const,
        }));

        // =====================================================
        // STEP 4: AI extraction of LED specs
        // =====================================================
        send("stage", {
          stage: "extracting",
          message: `AI analyzing ${analyzedPages.length} pages for LED display specifications...`,
        });

        const extractResult = await extractLEDSpecs(analyzedPages);

        send("stage", {
          stage: "extracting_done",
          message: `Found ${extractResult.screens.length} LED display(s)`,
          specsFound: extractResult.screens.length,
        });

        // =====================================================
        // STEP 5: Return complete result
        // =====================================================
        send("complete", {
          pages: analyzedPages,
          screens: extractResult.screens,
          project: extractResult.project,
          stats: {
            selectedPages: pageNumbers.length,
            pagesProcessed: ocrResult.pages.length,
            specsFound: extractResult.screens.length,
            processingTimeMs: Date.now() - startTime,
          },
        });
      } catch (err: any) {
        send("error", { message: err.message || "Extraction failed" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
