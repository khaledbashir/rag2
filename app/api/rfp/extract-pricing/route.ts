import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { processPdf } from "@/services/rfp/pdfProcessor";
import { extractAlternates } from "@/services/rfp/alternatesExtractor";
import {
    mapPricingSections,
    mapPricingSectionsWithAI,
} from "@/services/rfp/pricingSectionMapper";
import { log } from "@/lib/logger";

/**
 * POST /api/rfp/extract-pricing
 *
 * Accepts a PDF file (multipart/form-data), extracts text, scores sections,
 * then extracts pricing sections and alternates.
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

        log.info(`[Extract Pricing] Received: ${file.name} (${(file.size / 1024).toFixed(0)} KB)`);

        // Convert File to Buffer
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Step 1: Extract + chunk + score
        const processed = await processPdf(buffer, file.name);

        // Step 2: Filter for pricing sections
        const pricingSections = processed.sections.filter(
            s => s.category === "PRICING" && s.relevanceScore >= 4
        );

        // Also include high-value SCOPE sections (often contain pricing context)
        const scopeSections = processed.sections.filter(
            s => s.category === "SCOPE" && s.relevanceScore >= 7
        );

        const pricingText = [...pricingSections, ...scopeSections]
            .map(s => s.text)
            .join("\n\n");

        log.info(`[Extract Pricing] ${file.name}: ${pricingSections.length} pricing sections, ${scopeSections.length} scope sections`);

        // Step 3: Regex extraction
        let sections = mapPricingSections(pricingText);
        let allAlternates = extractAlternates(pricingText);
        let method: "regex" | "ai-assisted" = "regex";

        // Step 4: AI fallback if regex confidence is low
        const avgConfidence = sections.length > 0
            ? sections.reduce((sum, s) => sum + s.confidence, 0) / sections.length
            : 0;

        const needsAI = (sections.length === 0 && pricingSections.length > 0)
            || avgConfidence < 0.5;

        if (needsAI) {
            log.info(`[Extract Pricing] Low regex confidence (${avgConfidence.toFixed(2)}). Falling back to AI...`);

            try {
                const aiSections = await mapPricingSectionsWithAI(pricingText);
                if (aiSections.length > 0) {
                    sections = aiSections;
                    // Collect alternates from AI sections
                    allAlternates = aiSections.flatMap(s => s.alternates);
                    method = "ai-assisted";
                }
            } catch (aiError: any) {
                log.error("[Extract Pricing] AI fallback failed:", aiError.message);
            }
        }

        // Deduplicate alternates
        const seenAlts = new Set<string>();
        const uniqueAlternates = allAlternates.filter(a => {
            const key = a.description.toLowerCase();
            if (seenAlts.has(key)) return false;
            seenAlts.add(key);
            return true;
        });

        return NextResponse.json({
            success: true,
            fileName: processed.fileName,
            totalPages: processed.totalPages,
            method,
            sections,
            alternates: uniqueAlternates,
            stats: {
                totalSections: processed.stats.totalSections,
                pricingSectionsFound: pricingSections.length,
                pricingGroupsDetected: sections.length,
                totalLineItems: sections.reduce((sum, s) => sum + s.lineItemCount, 0),
                alternatesFound: uniqueAlternates.length,
                estimatedProjectTotal: sections.reduce((sum, s) => sum + (s.estimatedTotal || 0), 0) || null,
                avgConfidence: sections.length > 0
                    ? Math.round((sections.reduce((s, p) => s + p.confidence, 0) / sections.length) * 100) / 100
                    : 0,
            },
        });
    } catch (error: any) {
        Sentry.captureException(error, { tags: { area: "rfp-extract-pricing" } });
        log.error("[Extract Pricing] Error:", error);
        return NextResponse.json({
            error: error.message || "Failed to extract pricing sections",
        }, { status: 500 });
    }
}
