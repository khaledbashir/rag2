import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { processPdf } from "@/services/rfp/pdfProcessor";
import { analyzeRfp } from "@/services/rfp/rfpAnalyzer";
import { log } from "@/lib/logger";

/**
 * POST /api/rfp/process
 *
 * Accepts a PDF file (multipart/form-data), extracts text, scores sections,
 * filters out low-value content, and sends high-value sections to AnythingLLM
 * for structured extraction.
 *
 * Form fields:
 *   - file: PDF file (required)
 *   - mode: "scan" | "full" (default: "full")
 *     - "scan": Structure + scoring only (no AI call, instant)
 *     - "full": Structure + scoring + AI extraction
 */
export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        const file = formData.get("file") as File | null;
        const mode = (formData.get("mode") as string) || "full";

        if (!file) {
            return NextResponse.json({ error: "No file provided" }, { status: 400 });
        }

        if (!file.name.toLowerCase().endsWith(".pdf")) {
            return NextResponse.json({ error: "Only PDF files are supported" }, { status: 400 });
        }

        log.info(`[RFP Process] Received: ${file.name} (${(file.size / 1024).toFixed(0)} KB), mode: ${mode}`);

        // Convert File to Buffer
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Step 1: Extract + chunk + score (no AI, instant)
        const processed = await processPdf(buffer, file.name);

        log.info(`[RFP Process] ${file.name}: ${processed.stats.totalSections} sections, ${processed.stats.highValueCount} high-value, ${processed.stats.filteredOutPercent}% filtered out`);

        // If scan-only mode, return structure without AI analysis
        if (mode === "scan") {
            return NextResponse.json({
                success: true,
                mode: "scan",
                fileName: processed.fileName,
                totalPages: processed.totalPages,
                stats: processed.stats,
                sections: processed.sections.map(s => ({
                    heading: s.heading,
                    page: s.pageStart,
                    category: s.category,
                    score: s.relevanceScore,
                    wordCount: s.wordCount,
                    skipReason: s.skipReason,
                })),
            });
        }

        // Step 2: Send high-value sections to AnythingLLM for extraction
        const analysis = await analyzeRfp(processed);

        return NextResponse.json({
            success: true,
            mode: "full",
            fileName: processed.fileName,
            totalPages: processed.totalPages,
            stats: processed.stats,
            structure: analysis.structure,
            extraction: analysis.extraction,
            sources: analysis.sources,
            sections: processed.sections.map(s => ({
                heading: s.heading,
                page: s.pageStart,
                category: s.category,
                score: s.relevanceScore,
                wordCount: s.wordCount,
                skipReason: s.skipReason,
            })),
            content: processed.highValueText,
        });
    } catch (error: any) {
        Sentry.captureException(error, { tags: { area: "rfp-process" } });
        log.error("[RFP Process] Error:", error);
        return NextResponse.json({
            error: error.message || "Failed to process RFP",
        }, { status: 500 });
    }
}

export const config = {
    api: {
        bodyParser: false,
    },
};
