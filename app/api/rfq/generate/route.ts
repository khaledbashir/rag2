import { NextRequest, NextResponse } from "next/server";
import { generateRfq } from "@/services/rfq/rfqGenerator";
import { log } from "@/lib/logger";

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();

        const { answers, manufacturer, options } = body;

        if (!answers) {
            return NextResponse.json(
                { error: "answers object is required" },
                { status: 400 }
            );
        }
        if (!answers.clientName || !answers.projectName) {
            return NextResponse.json(
                { error: "answers must include clientName and projectName" },
                { status: 400 }
            );
        }
        if (!answers.displays || !Array.isArray(answers.displays) || answers.displays.length === 0) {
            return NextResponse.json(
                { error: "answers must include at least one display" },
                { status: 400 }
            );
        }
        if (!manufacturer || typeof manufacturer !== "string") {
            return NextResponse.json(
                { error: "manufacturer is required" },
                { status: 400 }
            );
        }

        const rfq = generateRfq(answers, manufacturer, options);

        return NextResponse.json({ rfq });
    } catch (error) {
        log.error("[rfq/generate] POST error:", error);
        return NextResponse.json(
            { error: "Failed to generate RFQ" },
            { status: 500 }
        );
    }
}
