import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { processPdf } from "@/services/rfp/pdfProcessor";
import {
    extractSchedule,
    extractWarranty,
    extractScheduleWarrantyWithAI,
} from "@/services/rfp/scheduleWarrantyExtractor";
import { log } from "@/lib/logger";

/**
 * POST /api/rfp/extract-schedule
 *
 * Accepts a PDF file (multipart/form-data), extracts text, scores sections,
 * then extracts construction schedule phases and warranty/service terms.
 *
 * Form fields:
 *   - file: PDF file (required)
 */
export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        const file = formData.get("file") as File | null;

        if (!file) {
            return NextResponse.json({ error: "No file provided" }, { status: 400 });
        }

        if (!file.name.toLowerCase().endsWith(".pdf")) {
            return NextResponse.json({ error: "Only PDF files are supported" }, { status: 400 });
        }

        log.info(`[Extract Schedule] Received: ${file.name} (${(file.size / 1024).toFixed(0)} KB)`);

        // Convert File to Buffer
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Step 1: Extract + chunk + score
        const processed = await processPdf(buffer, file.name);

        // Step 2: Filter for schedule and warranty sections
        const scheduleSections = processed.sections.filter(
            s => s.category === "SCHEDULE" && s.relevanceScore >= 4
        );
        const warrantySections = processed.sections.filter(
            s => s.category === "WARRANTY" && s.relevanceScore >= 4
        );

        // Also include SCOPE sections (often contain schedule info)
        const scopeSections = processed.sections.filter(
            s => s.category === "SCOPE" && s.relevanceScore >= 6
        );

        const scheduleText = [...scheduleSections, ...scopeSections]
            .map(s => s.text)
            .join("\n\n");
        const warrantyText = warrantySections
            .map(s => s.text)
            .join("\n\n");

        log.info(`[Extract Schedule] ${file.name}: ${scheduleSections.length} schedule sections, ${warrantySections.length} warranty sections, ${scopeSections.length} scope sections`);

        // Step 3: Regex extraction
        let schedule = extractSchedule(scheduleText);
        let warranty = extractWarranty(warrantyText);
        let method: "regex" | "ai-assisted" = "regex";

        // Step 4: AI fallback if regex confidence is low
        const avgScheduleConfidence = schedule.length > 0
            ? schedule.reduce((sum, p) => sum + p.confidence, 0) / schedule.length
            : 0;

        const needsAI = (schedule.length === 0 && scheduleSections.length > 0)
            || (warranty.confidence < 0.4 && warrantySections.length > 0)
            || avgScheduleConfidence < 0.5;

        if (needsAI) {
            log.info(`[Extract Schedule] Low regex confidence (schedule: ${avgScheduleConfidence.toFixed(2)}, warranty: ${warranty.confidence.toFixed(2)}). Falling back to AI...`);

            try {
                const allRelevantText = [scheduleText, warrantyText].filter(Boolean).join("\n\n---\n\n");
                const aiResult = await extractScheduleWarrantyWithAI(allRelevantText);

                if (aiResult.schedule.length > 0) schedule = aiResult.schedule;
                if (aiResult.warranty.confidence > warranty.confidence) warranty = aiResult.warranty;
                method = "ai-assisted";
            } catch (aiError: any) {
                log.error("[Extract Schedule] AI fallback failed:", aiError.message);
                // Continue with regex results
            }
        }

        return NextResponse.json({
            success: true,
            fileName: processed.fileName,
            totalPages: processed.totalPages,
            method,
            schedule,
            warranty,
            stats: {
                totalSections: processed.stats.totalSections,
                scheduleSectionsFound: scheduleSections.length,
                warrantySectionsFound: warrantySections.length,
                scopeSectionsUsed: scopeSections.length,
                phasesExtracted: schedule.length,
                totalTasks: schedule.reduce((sum, p) => sum + p.tasks.length, 0),
                warrantyFieldsFound: warranty.terms.length,
                scheduleConfidence: schedule.length > 0
                    ? Math.round((schedule.reduce((s, p) => s + p.confidence, 0) / schedule.length) * 100) / 100
                    : 0,
                warrantyConfidence: warranty.confidence,
            },
        });
    } catch (error: any) {
        Sentry.captureException(error, { tags: { area: "rfp-extract-schedule" } });
        log.error("[Extract Schedule] Error:", error);
        return NextResponse.json({
            error: error.message || "Failed to extract schedule and warranty",
        }, { status: 500 });
    }
}
