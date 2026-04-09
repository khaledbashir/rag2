/**
 * POST /api/rfp/analyze — RFP Analysis Pipeline
 *
 * 1. pdftotext → extract text from ALL pages (free, local, instant)
 * 2. Keyword triage → strict filter, keeps LED-relevant pages
 * 3. Smart split:
 *    - Text pages (pdftotext ≥ 150 chars) → use pdftotext output directly
 *    - Drawing pages (pdftotext < 150 chars) → Mistral vision OCR
 * 4. Batched AI extraction → LED specs from combined text
 *
 * Streams real-time progress via SSE.
 */

import { NextRequest } from "next/server";
import { stat, readFile } from "fs/promises";
import { existsSync } from "fs";
import { randomUUID, createHash } from "crypto";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";


import { extractSinglePage } from "@/services/rfp/unified/mistralOcrClient";
import { extractLEDSpecsBatched, deduplicateScreens } from "@/services/rfp/unified/specExtractor";
import { convertPageToImage } from "@/services/rfp/unified/pdfToImages";
import { provisionRfpWorkspace } from "@/services/rfp/unified/rfpWorkspaceProvisioner";
import { ensureAnythingLlmUser } from "@/services/anythingllm/userProvisioner";
import { extractWithOpenClaw, isOpenClawAvailable } from "@/services/rfp/unified/openclawExtractor";
import { extractWithGLM5, isGLM5Available } from "@/services/rfp/unified/glmExtractor";
import { extractWithAnythingLLM, isAnythingLLMAvailable } from "@/services/rfp/unified/anythingllmExtractor";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { syncToTwenty } from "@/lib/twenty-crm";

/** OpenClaw is primary for ALL PDFs. Mistral/Gemini only as fallback. */
const OPENCLAW_PAGE_THRESHOLD = 1;

const execFileAsync = promisify(execFile);
import type {
  AnalyzedPage,
  ExtractedLEDSpec,
  PageCategory,
} from "@/services/rfp/unified/types";
import { log } from "@/lib/logger";

export const maxDuration = 1800; // 30 min — large RFPs need time
export const dynamic = "force-dynamic";

const UPLOAD_DIR = process.env.RFP_UPLOAD_DIR || "/rfp-data/rfp-uploads";

// ---------------------------------------------------------------------------
// Keyword banks
// ---------------------------------------------------------------------------

// STRONG LED signals — terms that ONLY appear on LED display pages
const LED_STRONG = [
  "led", "videoboard", "video board", "ribbon board", "fascia board",
  "scoreboard", "pixel pitch", "nits", "brightness",
  "dvled", "direct view", "viewing distance", "led panel", "led screen",
  "video wall", "media mesh", "transparent led", "led display",
  "11 06 60", "11 63 10", "11 63 11", "display schedule",
  "pixel", "candela", "led module", "led cabinet",
];

// WEAK LED signals — appear on LED pages BUT also on non-LED pages
// Only count these if a STRONG signal is also present
const LED_WEAK = [
  "display", "screen", "marquee", "signage", "digital display",
  "resolution", "cabinet", "module", "av system", "audio visual",
  "division 11",
];

const SUPPORTING_KEYWORDS = [
  "mounting", "structural", "steel frame", "rigging", "catenary",
  "control system", "signal processing", "video processor",
];

const NOISE_KEYWORDS = [
  "insurance", "indemnif", "liability", "warranty", "bond",
  "liquidated damages", "termination", "dispute", "arbitration",
  "terms and conditions", "general conditions", "table of contents",
  "appendix", "certification", "biography", "qualifications",
  "references", "company profile", "leed", "leed certification",
  "fire alarm", "plumbing", "hvac", "mechanical", "elevator",
  "landscaping", "concrete", "masonry", "roofing", "flooring",
  "painting", "drywall", "insulation", "waterproofing",
];

export async function POST(request: NextRequest) {
  // Resolve authenticated user's AnythingLLM ID
  let anythingLlmUserId: number | null = null;
  const session = await auth();
  console.log(`[RFP Analyze] Session: user=${session?.user?.name || "(no name)"}, email=${session?.user?.email || "(no email)"}, id=${session?.user?.id || "(no id)"}`);
  if (session?.user?.id && session?.user?.email) {
    anythingLlmUserId = await ensureAnythingLlmUser(session.user.id, session.user.email).catch(() => null);
  }

  let body: { sessionId: string; filename?: string; mergeSessionIds?: string[] };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON — send { sessionId }" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Multi-file merge: combine PDFs with pdfunite before analysis
  if (body.mergeSessionIds && body.mergeSessionIds.length > 1) {
    const inputPaths = body.mergeSessionIds.map((sid) => path.join(UPLOAD_DIR, `${sid}.pdf`));
    const missing = inputPaths.filter((p) => !existsSync(p));
    if (missing.length > 0) {
      return new Response(JSON.stringify({ error: `Missing uploaded files: ${missing.length} session(s) not found` }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }
    // Use a fresh ID for the merged file (can't overwrite an input file)
    const mergedId = randomUUID();
    const mergedPath = path.join(UPLOAD_DIR, `${mergedId}.pdf`);
    try {
      await execFileAsync("pdfunite", [...inputPaths, mergedPath], { timeout: 120_000 });
    } catch (err) {
      log.error("[/api/rfp/analyze] pdfunite merge failed:", err);
      return new Response(JSON.stringify({ error: "Failed to merge uploaded PDFs" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
    // Point the session to the merged file
    body.sessionId = mergedId;
  }

  const filePath = path.join(UPLOAD_DIR, `${body.sessionId}.pdf`);
  if (!existsSync(filePath)) {
    return new Response(JSON.stringify({ error: "Session not found. Upload first." }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const imageDir = path.join(UPLOAD_DIR, body.sessionId);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let streamClosed = false;
      const pipelineLog: Array<{ timestamp: string; message: string }> = [];
      const send = (type: string, data: any) => {
        // Collect progress messages for persistence
        if (type === "progress" && data.message) {
          pipelineLog.push({ timestamp: new Date().toISOString(), message: data.message });
        }
        if (streamClosed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type, ...data })}\n\n`));
        } catch {
          streamClosed = true;
        }
      };

      // Global heartbeat — keeps SSE alive across ALL phases.
      // Without this, EasyPanel's Caddy proxy kills idle connections after ~120s,
      // causing "network error" on large files where pdftotext/pdfimages can run 2+ min.
      const HEARTBEAT_INTERVAL_MS = 20_000;
      let lastHeartbeatStage = "initializing";
      const globalHeartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "heartbeat", stage: lastHeartbeatStage, elapsed: Date.now() - startTime })}\n\n`));
        } catch { /* stream already closed */ }
      }, HEARTBEAT_INTERVAL_MS);

      const startTime = Date.now();

      try {
        // =============================================================
        // STEP 1: Get file info
        // =============================================================
        lastHeartbeatStage = "reading";
        send("stage", { stage: "reading", message: "Loading PDF..." });
        const fileStat = await stat(filePath);
        const sizeMb = (fileStat.size / 1024 / 1024).toFixed(1);

        // Compute file hash for DB storage (used for traceability, NOT caching)
        const pdfBytesForHash = await readFile(filePath);
        const fileHash = createHash("sha256").update(pdfBytesForHash).digest("hex");

        // =============================================================
        // STEP 1.5: GLM5 PRIMARY extraction (via NVIDIA API)
        // Uses pdftotext + GLM5 for reliable extraction.
        // Two calls (indoor + outdoor) for full coverage.
        // =============================================================
        if (isGLM5Available()) {
          lastHeartbeatStage = "extracting";
          send("stage", {
            stage: "extracting",
            message: `Analyzing PDF with AI (${sizeMb}MB)...`,
          });

          // Real progress — every step in the pipeline sends its own message.
          // No fake thinking steps. The user sees exactly what's happening.
          let progressStep = 0;

          try {
            const glmResult = await extractWithGLM5(filePath, {
              timeout: 300,
              customKeywords: body.customKeywords || undefined,
              onProgress: (msg) => {
                progressStep++;
                send("progress", { stage: "extracting", step: progressStep, message: msg });
              },
              onProductMatch: (event) => {
                send("product_match", event);
              },
            });

            if (glmResult.screens.length > 0) {
              log.info(`[Pipeline] GLM5 extracted ${glmResult.screens.length} displays — skipping Mistral`);
            } else {
              log.warn("[Pipeline] GLM5 returned 0 displays — saving partial result");
            }

            // Get page count for stats (needed for both success and partial paths)
            let totalPages = 0;
            try {
              const { stdout: info } = await execFileAsync("pdfinfo", [filePath], { timeout: 30_000 });
              const match = info.match(/Pages:\s+(\d+)/);
              totalPages = match ? parseInt(match[1], 10) : 0;
            } catch { totalPages = 0; }

            const finalProject = glmResult.project;
            const screens = glmResult.screens;
            const glmRequirements = glmResult.requirements || [];

            send("stage", {
              stage: "extracted",
              message: screens.length > 0
                ? `Found ${screens.length} LED display(s)`
                : `No display specs found — saving project info and requirements`,
              specsFound: screens.length,
              requirementsFound: glmRequirements.length,
              extractionSource: "glm5",
            });

            // Provision AnythingLLM workspace
            let workspaceSlug: string | null = null;
            try {
              const ws = await provisionRfpWorkspace(
                filePath,
                body.filename || "RFP",
                body.sessionId,
                anythingLlmUserId,
              );
              workspaceSlug = ws?.slug || null;
            } catch { /* workspace provisioning is optional */ }

            // Save to DB (always — even for 0-screen results, project info is useful)
            let analysisId: string | null = null;
            try {
              const fileStat2 = await stat(filePath).catch(() => ({ size: 0 }));
              const pdfBuffer = await readFile(filePath).catch(() => null);
              const analysis = await prisma.rfpAnalysis.create({
                data: {
                  filename: body.filename || "RFP",
                  fileSize: fileStat2.size,
                  pageCount: totalPages,
                  fileHash,
                  pdfFilePath: filePath,
                  pdfData: pdfBuffer,
                  projectName: finalProject.projectName,
                  clientName: finalProject.clientName,
                  venue: finalProject.venue,
                  location: finalProject.location,
                  specsFound: screens.length,
                  relevantPages: totalPages,
                  processingTimeMs: Date.now() - startTime,
                  project: finalProject as any,
                  screens: screens as any,
                  requirements: glmRequirements as any,
                  triage: pipelineLog as any,
                  aiWorkspaceSlug: workspaceSlug,
                  createdBy: session?.user?.name || session?.user?.email || null,
                },
              });
              analysisId = analysis.id;

              // Sync to Twenty CRM — fire-and-forget, retries + persists state
              // to the analysis row so a cold Twenty can be caught by replay.
              syncToTwenty({
                action: 'rfp_analyzed',
                companyName: finalProject.clientName || '',
                venueName: finalProject.venue || '',
                dealName: `${finalProject.projectName || finalProject.clientName || 'Untitled'} - RFP`,
                ledSqFt: screens.reduce((sum: number, s: any) => sum + ((s.widthFt || 0) * (s.heightFt || 0) * (s.quantity || 1)), 0) || undefined,
              }, { analysisId: analysis.id }).catch(() => {});
            } catch (dbErr: any) {
              log.error("[Pipeline] GLM5 DB save failed (non-fatal):", dbErr.message?.slice(0, 200));
            }

            // Surface count mismatch warnings from Gemini validation
            const extractionWarnings = glmResult.warnings || [];
            if (screens.length === 0) {
              extractionWarnings.push("No LED display specifications with dimensions were found in this document. This may be a high-level RFP or scope document without a detailed display schedule. The requirements above capture what was found.");
            }
            if (extractionWarnings.length > 0) {
              send("warning", { warnings: extractionWarnings });
            }

            send("complete", {
              result: {
                id: analysisId,
                project: finalProject,
                screens,
                requirements: glmRequirements,
                warnings: extractionWarnings,
                pipelineLog,
                stats: { totalPages, extractionSource: "glm5", durationMs: Date.now() - startTime },
                aiWorkspaceSlug: workspaceSlug,
                confidence: glmResult.validation?.status || (screens.length > 0 ? "verified" : "untrusted_input"),
              },
            });

            clearInterval(globalHeartbeat);
            try { controller.close() } catch { streamClosed = true };
            return; // DONE
          } catch (glmErr: any) {
            // Credit/billing errors — stop immediately, don't fallback
            if (glmErr.message?.includes("credits exhausted") || glmErr.message?.includes("top up")) {
              send("error", {
                message: glmErr.message,
              });
              clearInterval(globalHeartbeat);
              try { controller.close() } catch { streamClosed = true };
              return;
            }
            log.warn("[Pipeline] GLM5 failed:", glmErr.message);
          }
        }

        // GLM5 unavailable or threw a non-credit error — report clearly.
        send("error", {
          message: "Document analysis failed. The AI pipeline could not process this document. Please try re-uploading.",
        });
        clearInterval(globalHeartbeat);
        try { controller.close() } catch { streamClosed = true };
        return;

        // =============================================================
        // STEP 2 (FALLBACK): Local pdftotext — extract text from ALL pages
        // Only runs if OpenClaw failed or is unavailable.
        // =============================================================
        lastHeartbeatStage = "ocr";
        send("stage", {
          stage: "ocr",
          message: `Extracting text from all pages (${sizeMb}MB)...`,
        });

        // Get page count
        let totalPages = 0;
        try {
          const { stdout: info } = await execFileAsync("pdfinfo", [filePath], { timeout: 30_000 });
          const match = info.match(/Pages:\s+(\d+)/);
          totalPages = match ? parseInt(match[1], 10) : 0;
        } catch {
          totalPages = 0;
        }

        if (totalPages === 0) {
          send("error", { message: "Could not read PDF page count" });
          return;
        }

        // Extract ALL text in one pdftotext call, split by form-feed (\f)
        // 1,380 pages: ~5-10s in one call vs ~2+ min with 1,380 separate calls
        const ocrPages: Array<{ pageNumber: number; text: string }> = [];
        let totalChars = 0;

        send("progress", {
          stage: "ocr",
          current: 0,
          total: totalPages,
          message: `Running pdftotext on ${totalPages.toLocaleString()} pages...`,
        });

        try {
          const { stdout: allText } = await execFileAsync(
            "pdftotext",
            ["-layout", filePath, "-"],
            { timeout: 120_000, maxBuffer: 200 * 1024 * 1024 }, // 200MB buffer, 2min timeout
          );

          // pdftotext separates pages with form-feed character \f
          const pageTexts = allText.split("\f");
          for (let p = 1; p <= totalPages; p++) {
            const text = pageTexts[p - 1] || "";
            ocrPages.push({ pageNumber: p, text });
            totalChars += text.length;
          }
        } catch (bulkErr: any) {
          // Fallback: per-page extraction if bulk fails (e.g., corrupt PDF)
          log.warn("[Pipeline] Bulk pdftotext failed, falling back to per-page:", bulkErr.message);
          for (let p = 1; p <= totalPages; p++) {
            try {
              const { stdout: pageText } = await execFileAsync(
                "pdftotext",
                ["-f", String(p), "-l", String(p), "-layout", filePath, "-"],
                { timeout: 10_000, maxBuffer: 1024 * 1024 },
              );
              ocrPages.push({ pageNumber: p, text: pageText });
              totalChars += pageText.length;
            } catch {
              ocrPages.push({ pageNumber: p, text: "" });
            }

            if (p % 100 === 0 || p === totalPages) {
              send("progress", {
                stage: "ocr",
                current: p,
                total: totalPages,
                message: `Text extraction (fallback): ${p.toLocaleString()}/${totalPages.toLocaleString()} pages`,
              });
            }
          }
        }

        send("progress", {
          stage: "ocr",
          current: totalPages,
          total: totalPages,
          message: `Text extracted: ${totalPages.toLocaleString()} pages, ${(totalChars / 1024).toFixed(0)}KB`,
        });

        const ocrResult = { totalPages, text: "", pages: ocrPages };

        send("stage", {
          stage: "ocr_done",
          message: `${totalPages.toLocaleString()} pages scanned`,
          totalPages,
          totalChars,
        });

        // =============================================================
        // STEP 3: Keyword triage — generous, keeps anything relevant
        // =============================================================
        lastHeartbeatStage = "triaging";
        send("stage", {
          stage: "triaging",
          message: `Classifying ${ocrResult.totalPages.toLocaleString()} pages...`,
        });

        // 3a: Detect pages with embedded images (scanned drawings)
        // pdfimages -list gives one line per image with page number
        const pagesWithImages = new Set<number>();
        try {
          const { stdout: imgList } = await execFileAsync(
            "pdfimages",
            ["-list", filePath],
            { timeout: 60_000, maxBuffer: 50 * 1024 * 1024 },
          );
          // Output format: "page  num  type  width  height ..."
          // Skip header lines (first 2), parse page number from each line
          for (const line of imgList.split("\n").slice(2)) {
            const match = line.trim().match(/^\s*(\d+)/);
            if (match) pagesWithImages.add(parseInt(match[1], 10));
          }
          log.info(`[Pipeline] pdfimages found images on ${pagesWithImages.size} pages`);
        } catch (err: any) {
          log.warn("[Pipeline] pdfimages failed (non-fatal):", err.message);
        }

        // 3b: Drawing sheet regex — matches AV2.04, TL2.04, E5.01, etc.
        const DRAWING_SHEET_PATTERN = /\b[A-Z]{1,3}\d+\.\d{2}\b/;
        const FORCE_VISION_KEYWORDS = ["key plan", "keynotes", "detail", "elevation", "nts", "scale:"];

        const classifiedPages: Array<{
          pageNumber: number;
          text: string;
          category: PageCategory;
          relevance: number;
          isDrawing: boolean;
        }> = [];

        for (const page of ocrResult.pages) {
          const text = page.text.toLowerCase();
          const rawText = page.text; // preserve case for regex
          const textLength = page.text.trim().length;

          // Drawing detection: 3 signals (any one triggers)
          let isDrawing = textLength < 200;                              // Low text = visual page
          if (!isDrawing && pagesWithImages.has(page.pageNumber)) isDrawing = true; // Embedded images
          if (!isDrawing && DRAWING_SHEET_PATTERN.test(rawText)) isDrawing = true;  // Sheet number (AV2.04)
          if (!isDrawing && FORCE_VISION_KEYWORDS.some((k) => text.includes(k))) isDrawing = true; // Drawing keywords

          // Count STRONG LED signals (terms that only appear on LED pages)
          let strongLedScore = 0;
          for (const kw of LED_STRONG) {
            if (text.includes(kw)) strongLedScore++;
          }

          // Count WEAK LED signals (generic terms like "display", "screen")
          let weakLedScore = 0;
          for (const kw of LED_WEAK) {
            if (text.includes(kw)) weakLedScore++;
          }

          let supportScore = 0;
          for (const kw of SUPPORTING_KEYWORDS) {
            if (text.includes(kw)) supportScore++;
          }

          let noiseScore = 0;
          for (const kw of NOISE_KEYWORDS) {
            if (text.includes(kw)) noiseScore++;
          }

          let category: PageCategory = "unknown";
          let relevance = 5;

          // STRICT triage. A 1380-page RFP has maybe 30-80 LED-relevant pages.
          // Text pages use pdftotext (free) but still need strict filtering
          // to keep AI extraction batches focused and accurate.
          //
          // Rule: only keep pages with STRONG LED signals.
          // Generic words like "display" or "screen" alone don't count.

          if (isDrawing) {
            // Drawings: only keep if they mention LED-specific terms
            category = "drawing";
            relevance = strongLedScore >= 1 ? 70 : 5;
          } else if (strongLedScore >= 3) {
            // Multiple strong signals — definitely an LED spec page
            category = "led_specs";
            relevance = Math.min(100, 85 + strongLedScore * 3);
          } else if (strongLedScore >= 2) {
            // Two strong signals — very likely relevant
            category = "led_specs";
            relevance = 75;
          } else if (strongLedScore >= 1 && weakLedScore >= 1) {
            // One strong + one weak — likely relevant
            category = "led_specs";
            relevance = 65;
          } else if (strongLedScore >= 1 && supportScore >= 1 && noiseScore === 0) {
            // One strong + supporting technical context, no noise
            category = "technical";
            relevance = 55;
          } else if (noiseScore >= 2) {
            category = "legal";
            relevance = 5;
          } else if (textLength < 100) {
            category = "boilerplate";
            relevance = 5;
          } else {
            // No strong LED signal → noise. Period.
            // This is the key change: weak signals alone (display, screen, module)
            // do NOT qualify a page. There must be at least 1 STRONG signal.
            category = "unknown";
            relevance = 5;
          }

          classifiedPages.push({ pageNumber: page.pageNumber, text: page.text, category, relevance, isDrawing });
        }

        // Neighbor-page boosting: if page N-1 and N+1 are both high-relevance,
        // boost page N. Prevents losing pages sandwiched between LED spec pages.
        for (let i = 1; i < classifiedPages.length - 1; i++) {
          const prev = classifiedPages[i - 1];
          const curr = classifiedPages[i];
          const next = classifiedPages[i + 1];
          if (curr.relevance < 50 && prev.relevance >= 65 && next.relevance >= 65) {
            curr.relevance = Math.max(curr.relevance, 55);
            if (curr.category === "unknown" || curr.category === "boilerplate") {
              curr.category = curr.isDrawing ? "drawing" : "technical";
            }
          }
        }

        // Threshold: 50+ = relevant. STRICT. Should yield 30-80 pages from a 1380-page RFP.
        const MAX_VISION_PAGES = 200; // Hard cap — never send more than this to Mistral
        let relevantPages = classifiedPages
          .filter((p) => p.relevance >= 50)
          .sort((a, b) => b.relevance - a.relevance); // Best pages first

        const totalRelevant = relevantPages.length;
        if (relevantPages.length > MAX_VISION_PAGES) {
          relevantPages = relevantPages.slice(0, MAX_VISION_PAGES);
        }

        const noisePages = classifiedPages.filter((p) => p.relevance < 50);

        send("stage", {
          stage: "triaged",
          message: totalRelevant > MAX_VISION_PAGES
            ? `Found ${totalRelevant} relevant pages, capped to top ${MAX_VISION_PAGES} by relevance`
            : `Kept ${relevantPages.length} pages, filtered ${noisePages.length}`,
          relevant: relevantPages.length,
          noise: noisePages.length,
          led: relevantPages.filter((p) => p.category === "led_specs").length,
          drawings: relevantPages.filter((p) => p.isDrawing).length,
          capped: totalRelevant > MAX_VISION_PAGES,
        });

        // =============================================================
        // STEP 4: Smart split — text pages use pdftotext, only drawings hit Mistral
        // =============================================================

        const analyzedPages: AnalyzedPage[] = [];

        if (relevantPages.length > 0) {
          // Split into text pages vs drawing pages
          const textPages = relevantPages.filter((p) => !p.isDrawing);
          const drawingPages = relevantPages.filter((p) => p.isDrawing);

          // 4a: Text pages — use pdftotext output directly (FREE, instant)
          send("stage", {
            stage: "processing_text",
            message: `${textPages.length} text pages ready (pdftotext), ${drawingPages.length} drawings need vision...`,
          });

          for (let i = 0; i < textPages.length; i++) {
            const rp = textPages[i];
            analyzedPages.push({
              index: i,
              pageNumber: rp.pageNumber,
              category: rp.category,
              relevance: rp.relevance,
              markdown: rp.text,
              tables: [],
              visionAnalyzed: false,
              summary: rp.text.split("\n").find((l) => l.trim().length > 10)?.slice(0, 150) || "",
              classifiedBy: "text-heuristic" as const,
            });
          }

          // 4b: Drawing pages — convert to JPEG + Mistral vision OCR (PARALLEL)
          if (drawingPages.length > 0) {
            lastHeartbeatStage = "vision";
            send("stage", {
              stage: "vision",
              message: `Vision model reading ${drawingPages.length} drawing pages (parallel)...`,
            });

            const VISION_CONCURRENCY = 5; // Process 5 drawing pages at a time
            let visionCompleted = 0;

            const processDrawingPage = async (rp: typeof drawingPages[0], i: number): Promise<AnalyzedPage> => {
              try {
                const pageDir = path.join(imageDir, `p${rp.pageNumber}`);
                const imagePath = await convertPageToImage(filePath, rp.pageNumber, pageDir);
                const ocrPage = await extractSinglePage(imagePath, rp.pageNumber);

                // Document AI annotations: specs extracted directly from OCR (no separate LLM call)
                const annotationSpecs = ocrPage.annotationSpecs || [];
                if (annotationSpecs.length > 0) {
                  log.info(`[Pipeline] Page ${rp.pageNumber}: Mistral Document AI found ${annotationSpecs.length} LED specs directly`);
                }

                return {
                  index: textPages.length + i,
                  pageNumber: rp.pageNumber,
                  category: rp.category,
                  relevance: annotationSpecs.length > 0 ? Math.max(rp.relevance, 85) : rp.relevance,
                  markdown: ocrPage.markdown,
                  tables: ocrPage.tables.map((t) => ({
                    id: t.id,
                    content: t.content,
                    format: t.format,
                  })),
                  visionAnalyzed: true,
                  extractedSpecs: annotationSpecs.length > 0 ? annotationSpecs : undefined,
                  summary: ocrPage.markdown.split("\n").find((l) => l.trim().length > 10)?.slice(0, 150) || "",
                  classifiedBy: "mistral-ocr" as const,
                };
              } catch (err: any) {
                log.error(`[Pipeline] Drawing page ${rp.pageNumber} vision failed:`, err.message);
                send("warning", {
                  message: `Drawing page ${rp.pageNumber}: vision failed, using text fallback`,
                });
                return {
                  index: textPages.length + i,
                  pageNumber: rp.pageNumber,
                  category: rp.category,
                  relevance: rp.relevance,
                  markdown: rp.text,
                  tables: [],
                  visionAnalyzed: false,
                  summary: rp.text.split("\n").find((l) => l.trim().length > 10)?.slice(0, 150) || "",
                  classifiedBy: "text-heuristic" as const,
                };
              }
            };

            // Concurrency pool — process VISION_CONCURRENCY pages at a time
            const drawingQueue = drawingPages.map((rp, i) => ({ rp, i }));
            const drawingResults: AnalyzedPage[] = new Array(drawingPages.length);
            const workers = Array.from({ length: Math.min(VISION_CONCURRENCY, drawingPages.length) }, async () => {
              while (drawingQueue.length > 0) {
                const item = drawingQueue.shift()!;
                drawingResults[item.i] = await processDrawingPage(item.rp, item.i);
                visionCompleted++;
                send("progress", {
                  stage: "vision",
                  current: visionCompleted,
                  total: drawingPages.length,
                  message: `Drawing page ${item.rp.pageNumber} — Mistral vision OCR (${visionCompleted}/${drawingPages.length})`,
                });
              }
            });
            await Promise.all(workers);
            analyzedPages.push(...drawingResults.filter(Boolean));
          }

          // Sort by page number for consistent batching
          analyzedPages.sort((a, b) => a.pageNumber - b.pageNumber);

          const docAiSpecCount = analyzedPages
            .filter((p) => p.extractedSpecs && p.extractedSpecs.length > 0)
            .reduce((sum, p) => sum + p.extractedSpecs!.length, 0);

          send("stage", {
            stage: "vision_done",
            message: `Processed ${analyzedPages.length} pages (${textPages.length} text + ${drawingPages.length} drawings)${docAiSpecCount > 0 ? ` — Document AI found ${docAiSpecCount} specs` : ""}`,
            pagesProcessed: analyzedPages.length,
            textPages: textPages.length,
            visionPages: drawingPages.length,
            visionSuccess: analyzedPages.filter((p) => p.visionAnalyzed).length,
            tables: analyzedPages.reduce((s, p) => s + p.tables.length, 0),
            annotationSpecs: docAiSpecCount,
          });
        }

        // =============================================================
        // STEP 5: AI extraction — OpenClaw for large PDFs, Mistral for small
        // =============================================================

        let screens: ExtractedLEDSpec[] = [];
        let projectInfo: any = null;
        let requirements: any[] = [];
        let extractionWarnings: string[] = [];
        let extractionFailed = false;
        let incompleteSpecs: any[] = [];

        // --- OpenClaw extraction for large PDFs ---
        // OpenClaw has ANC-specific skills with Natalia's extraction rules.
        // For large construction manuals (>80 pages), it's more reliable than
        // the Mistral→Gemini pipeline because it handles the full document.
        const useOpenClaw = totalPages >= OPENCLAW_PAGE_THRESHOLD && isOpenClawAvailable();

        if (useOpenClaw) {
          lastHeartbeatStage = "extracting";
          send("stage", {
            stage: "extracting",
            message: `Using OpenClaw AI agent for extraction (${totalPages} pages)...`,
          });

          const clawHeartbeat = setInterval(() => {
            send("progress", {
              stage: "extracting",
              current: 0,
              total: 1,
              message: "OpenClaw agent analyzing document...",
            });
          }, 15_000);

          try {
            const clawResult = await extractWithOpenClaw(filePath, {
              timeout: 300,
              onProgress: (msg) => {
                send("progress", { stage: "extracting", current: 0, total: 1, message: msg });
              },
            });

            screens = clawResult.screens;
            projectInfo = clawResult.project;
            log.info(`[Pipeline] OpenClaw extracted ${screens.length} displays`);

            send("stage", {
              stage: "extracted",
              message: `OpenClaw found ${screens.length} LED display(s)`,
              specsFound: screens.length,
              requirementsFound: 0,
              extractionSource: "openclaw",
            });
          } catch (clawErr: any) {
            log.error("[Pipeline] OpenClaw extraction failed, falling back to Mistral pipeline:", clawErr.message);
            extractionWarnings.push(`OpenClaw failed: ${clawErr.message} — falling back to standard extraction.`);
            // Fall through to standard extraction below
          } finally {
            clearInterval(clawHeartbeat);
          }
        }

        // --- Standard Mistral extraction (small PDFs or OpenClaw fallback) ---
        if (screens.length === 0 && analyzedPages.length > 0) {
          lastHeartbeatStage = "extracting";
          send("stage", {
            stage: "extracting",
            message: `AI extracting LED specs from ${analyzedPages.length} pages...`,
          });

          // Heartbeat keeps SSE alive during long Mistral batch calls (up to 2min each).
          // Without this, EasyPanel's reverse proxy may close the idle connection.
          let heartbeatBatch = 0;
          let heartbeatTotal = 0;
          const heartbeat = setInterval(() => {
            send("progress", {
              stage: "extracting",
              current: heartbeatBatch,
              total: heartbeatTotal,
              message: heartbeatBatch > 0
                ? `Extraction batch ${heartbeatBatch}/${heartbeatTotal} — still processing...`
                : "AI extraction in progress...",
            });
          }, 15_000);

          try {
            const result = await extractLEDSpecsBatched(
              analyzedPages,
              (batch, totalBatches) => {
                heartbeatBatch = batch;
                heartbeatTotal = totalBatches;
                send("progress", {
                  stage: "extracting",
                  current: batch,
                  total: totalBatches,
                  message: `Extraction batch ${batch}/${totalBatches}...`,
                });
              },
            );

            screens = result.screens;
            projectInfo = result.project;
            requirements = result.requirements;
            extractionWarnings = result.warnings;
            extractionFailed = result.extractionFailed;
            incompleteSpecs = result.incompleteSpecs;
          } finally {
            clearInterval(heartbeat);
          }

          // Merge annotation specs from drawing pages (extracted directly by Mistral Document AI)
          const annotationSpecs: ExtractedLEDSpec[] = analyzedPages
            .filter((p) => p.extractedSpecs && p.extractedSpecs.length > 0)
            .flatMap((p) => p.extractedSpecs!);

          if (annotationSpecs.length > 0) {
            log.info(`[Pipeline] Mistral Document AI annotations found ${annotationSpecs.length} specs from drawings`);
            screens = deduplicateScreens([...screens, ...annotationSpecs]);
            log.info(`[Pipeline] After dedup: ${screens.length} unique display(s)`);
          }

          send("stage", {
            stage: "extracted",
            message: extractionFailed && annotationSpecs.length === 0
              ? "Extraction failed — AI providers returned no data. Try again or contact support."
              : `Found ${screens.length} LED display(s), ${requirements.length} requirement(s)${annotationSpecs.length > 0 ? ` (${annotationSpecs.length} from Document AI)` : ""}`,
            specsFound: screens.length,
            requirementsFound: requirements.length,
            extractionFailed: extractionFailed && annotationSpecs.length === 0,
          });
        }

        // =============================================================
        // STEP 6: Done
        // =============================================================

        const finalProject = projectInfo ?? {
          clientName: null, projectName: null, venue: null, location: null,
          isOutdoor: false, isUnionLabor: false, bondRequired: false,
          specialRequirements: [], schedulePhases: [],
        };

        const annotationSpecCount = analyzedPages
          .filter((p) => p.extractedSpecs && p.extractedSpecs.length > 0)
          .reduce((sum, p) => sum + p.extractedSpecs!.length, 0);

        const finalStats = {
          totalPages: ocrResult.totalPages,
          relevantPages: relevantPages.length,
          noisePages: noisePages.length,
          drawingPages: classifiedPages.filter((p) => p.isDrawing).length,
          specsFound: screens.length,
          annotationSpecs: annotationSpecCount,
          processingTimeMs: Date.now() - startTime,
          visionPagesProcessed: analyzedPages.filter((p) => p.visionAnalyzed).length,
        };

        const triageData = classifiedPages.map((p) => ({
          pageNumber: p.pageNumber,
          category: p.category,
          relevance: p.relevance,
          isDrawing: p.isDrawing,
        }));

        lastHeartbeatStage = "saving";
        let analysisId: string | null = null;
        let persistentPdfPath: string | null = null;
        try {
          const fileStat = await stat(filePath);

          // PDF is already in persistent storage (UPLOAD_DIR = /rfp-data/rfp-uploads)
          persistentPdfPath = filePath;
          log.info(`[Pipeline] PDF persisted at ${persistentPdfPath}`);

          const pdfBuffer2 = await readFile(filePath).catch(() => null);
          const saved = await prisma.rfpAnalysis.create({
            data: {
              projectName: finalProject.projectName,
              clientName: finalProject.clientName,
              venue: finalProject.venue,
              location: finalProject.location,
              filename: body.filename || "document.pdf",
              fileSize: fileStat.size,
              pageCount: ocrResult.totalPages,
              fileHash,
              pdfFilePath: persistentPdfPath,
              pdfData: pdfBuffer2,
              relevantPages: relevantPages.length,
              noisePages: noisePages.length,
              drawingPages: classifiedPages.filter((p) => p.isDrawing).length,
              specsFound: screens.length,
              processingTimeMs: Date.now() - startTime,
              visionPages: analyzedPages.filter((p) => p.visionAnalyzed).length,
              screens: JSON.parse(JSON.stringify(screens)),
              requirements: JSON.parse(JSON.stringify(requirements)),
              incompleteSpecs: JSON.parse(JSON.stringify(incompleteSpecs)),
              project: JSON.parse(JSON.stringify(finalProject)),
              triage: JSON.parse(JSON.stringify(triageData)),
              pages: [], // Don't store full page markdown (too big)
              status: "complete",
              createdBy: session?.user?.name || session?.user?.email || null,
            },
          });
          analysisId = saved.id;

          // Sync to Twenty CRM — fire-and-forget, retries + persists state
          // to the analysis row so a cold Twenty can be caught by replay.
          syncToTwenty({
            action: 'rfp_analyzed',
            companyName: finalProject.clientName || '',
            venueName: finalProject.venue || '',
            dealName: `${finalProject.projectName || finalProject.clientName || 'Untitled'} - RFP`,
            ledSqFt: screens.reduce((sum: number, s: any) => sum + ((s.widthFt || 0) * (s.heightFt || 0) * (s.quantity || 1)), 0) || undefined,
          }, { analysisId: saved.id }).catch(() => {});
        } catch (dbErr: any) {
          log.error("[Pipeline] Failed to save to DB:", dbErr.message);
        }

        // =============================================================
        // STEP 7: Provision AnythingLLM workspace for verification chat
        // Non-blocking — don't delay the response. Updates DB in background.
        // =============================================================
        let aiWorkspaceSlug: string | null = null;
        if (analysisId && analyzedPages.length > 0) {
          send("stage", {
            stage: "provisioning_workspace",
            message: "Creating AI verification workspace...",
          });

          try {
            aiWorkspaceSlug = await provisionRfpWorkspace({
              analysisId,
              projectName: finalProject.projectName,
              venue: finalProject.venue,
              relevantPages: analyzedPages,
              anythingLlmUserId,
              screens,
              requirements,
              project: finalProject,
            });

            if (aiWorkspaceSlug) {
              await prisma.rfpAnalysis.update({
                where: { id: analysisId },
                data: { aiWorkspaceSlug },
              });
            }
          } catch (wsErr: any) {
            log.error("[Pipeline] Workspace provisioning failed:", wsErr.message);
          }
        }

        send("complete", {
          result: {
            id: analysisId,
            screens,
            requirements,
            incompleteSpecs: incompleteSpecs.length > 0 ? incompleteSpecs : undefined,
            project: finalProject,
            pages: analyzedPages,
            stats: finalStats,
            triage: triageData,
            aiWorkspaceSlug,
            warnings: extractionWarnings.length > 0 ? extractionWarnings : undefined,
            extractionFailed,
          },
        });

        // Cleanup images (fire and forget)
        try {
          const { rm } = await import("fs/promises");
          await rm(imageDir, { recursive: true, force: true });
        } catch { /* ignore */ }
      } catch (err: any) {
        send("error", { message: err.message || "Pipeline failed" });
      } finally {
        clearInterval(globalHeartbeat);
        try { controller.close() } catch { streamClosed = true };
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
