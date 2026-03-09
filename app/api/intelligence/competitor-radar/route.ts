import { NextRequest, NextResponse } from "next/server";
import { analyzeCompetitorSignals } from "@/app/services/CompetitorIntelligenceService";
import { prisma } from "@/lib/prisma";
import { log } from "@/lib/logger";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { rfpText, proposalId } = body;

        if (!rfpText && !proposalId) {
            return NextResponse.json({ error: "Missing rfpText or proposalId" }, { status: 400 });
        }

        let textToAnalyze = rfpText;

        // If proposalId provided but no text, fetch from DB (future optimization to fetch raw doc text if stored)
        // For now, we assume rfpText is passed from the client or extraction context

        if (!textToAnalyze) {
            return NextResponse.json({ error: "RFP Text required for analysis" }, { status: 400 });
        }

        const result = await analyzeCompetitorSignals(textToAnalyze);

        return NextResponse.json(result);

    } catch (error: any) {
        log.error("[Competitor Radar API] Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
