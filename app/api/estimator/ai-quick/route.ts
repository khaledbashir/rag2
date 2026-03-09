/**
 * POST /api/estimator/ai-quick
 *
 * AI Quick Estimate — User describes a project in plain English,
 * AnythingLLM (anc-estimator workspace) extracts structured EstimatorAnswers.
 *
 * Input:  { description: string }
 * Output: { answers: Partial<EstimatorAnswers>, displays: DisplayAnswers[] }
 */

import { NextRequest, NextResponse } from "next/server";
import { queryVault } from "@/lib/anything-llm";
import { log } from "@/lib/logger";

const WORKSPACE = "anc-estimator";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { description } = body;

        if (!description || typeof description !== "string" || description.trim().length < 10) {
            return NextResponse.json(
                { error: "Please provide a project description (at least 10 characters)" },
                { status: 400 }
            );
        }

        // The workspace system prompt handles extraction rules.
        // We just pass the user's description directly.
        const response = await queryVault(WORKSPACE, description.trim(), "chat");

        if (!response || response.startsWith("Error")) {
            log.error("[ai-quick] AnythingLLM error:", response);
            return NextResponse.json(
                { error: "AI service unavailable. Please try again." },
                { status: 502 }
            );
        }

        return parseAndRespond(response);
    } catch (error) {
        log.error("[ai-quick] Error:", error);
        return NextResponse.json(
            { error: "Failed to process description" },
            { status: 500 }
        );
    }
}

function parseAndRespond(rawResponse: string): NextResponse {
    try {
        // Strip markdown code fences if present
        let cleaned = rawResponse
            .replace(/```json\s*/gi, "")
            .replace(/```\s*/g, "")
            .trim();

        // Extract JSON object from response
        const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            log.error("[ai-quick] No JSON found in response:", rawResponse.slice(0, 500));
            return NextResponse.json(
                { error: "AI couldn't extract project data. Try being more specific." },
                { status: 422 }
            );
        }

        const parsed = JSON.parse(jsonMatch[0]);

        // Validate and sanitize
        const answers: Record<string, any> = {};
        if (parsed.clientName) answers.clientName = String(parsed.clientName);
        if (parsed.projectName) answers.projectName = String(parsed.projectName);
        if (parsed.location) answers.location = String(parsed.location);
        if (["budget", "proposal", "loi"].includes(parsed.docType)) answers.docType = parsed.docType;
        if (["USD", "CAD", "EUR", "GBP"].includes(parsed.currency)) answers.currency = parsed.currency;
        if (typeof parsed.isIndoor === "boolean") answers.isIndoor = parsed.isIndoor;
        if (typeof parsed.isNewInstall === "boolean") answers.isNewInstall = parsed.isNewInstall;
        if (typeof parsed.isUnion === "boolean") answers.isUnion = parsed.isUnion;

        const displays = Array.isArray(parsed.displays)
            ? parsed.displays.map((d: any) => ({
                  displayName: String(d.displayName || "Display"),
                  displayType: String(d.displayType || "custom"),
                  locationType: String(d.locationType || "wall"),
                  widthFt: clampNumber(d.widthFt, 1, 500, 20),
                  heightFt: clampNumber(d.heightFt, 1, 200, 12),
                  pixelPitch: String(d.pixelPitch || "4"),
                  installComplexity: String(d.installComplexity || "standard"),
                  serviceType: String(d.serviceType || "Front/Rear"),
                  isReplacement: Boolean(d.isReplacement),
              }))
            : [];

        if (displays.length === 0 && Object.keys(answers).length === 0) {
            return NextResponse.json(
                { error: "AI couldn't extract project data. Try being more specific." },
                { status: 422 }
            );
        }

        return NextResponse.json({
            answers,
            displays,
            fieldsExtracted: Object.keys(answers).length + displays.length,
        });
    } catch (parseError) {
        log.error("[ai-quick] JSON parse error:", parseError, "Raw:", rawResponse.slice(0, 500));
        return NextResponse.json(
            { error: "AI returned invalid data. Try rephrasing your description." },
            { status: 422 }
        );
    }
}

function clampNumber(val: any, min: number, max: number, fallback: number): number {
    const n = typeof val === "number" ? val : parseFloat(val);
    if (isNaN(n)) return fallback;
    return Math.max(min, Math.min(max, n));
}
