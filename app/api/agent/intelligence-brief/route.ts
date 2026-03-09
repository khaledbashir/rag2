export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { queryAgent } from "@/lib/anything-llm";
import { extractJson } from "@/lib/json-utils";
import { prisma } from "@/lib/prisma";
import { log } from "@/lib/logger";

type BriefRequest = {
    clientName: string;
    address: string;
    screenCount: number;
    totalAmount: number;
    screenSummary: string[];
    proposalId: string;
};

export async function POST(req: NextRequest) {
    try {
        const body: BriefRequest = await req.json();
        const { clientName, address, screenCount, totalAmount, screenSummary, proposalId } = body;

        if (!clientName || !proposalId) {
            return NextResponse.json({ error: "clientName and proposalId are required" }, { status: 400 });
        }

        // Check for existing cached brief
        if (proposalId && proposalId !== "new") {
            const existing = await prisma.proposal.findUnique({
                where: { id: proposalId },
                select: { intelligenceBrief: true },
            });
            if (existing?.intelligenceBrief && !req.headers.get("x-refresh")) {
                return NextResponse.json({
                    ok: true,
                    brief: existing.intelligenceBrief,
                    cached: true,
                });
            }
        }

        // Determine workspace
        let workspace = process.env.ANYTHING_LLM_WORKSPACE || "researcher";
        if (proposalId && proposalId !== "new") {
            const proposal = await prisma.proposal.findUnique({
                where: { id: proposalId },
                select: { aiWorkspaceSlug: true },
            });
            if (proposal?.aiWorkspaceSlug) workspace = proposal.aiWorkspaceSlug;
        }

        const screenList = screenSummary.length > 0
            ? screenSummary.map((s, i) => `  ${i + 1}. ${s}`).join("\n")
            : "  No screens configured yet";

        const formattedTotal = totalAmount > 0
            ? `$${totalAmount.toLocaleString("en-US", { minimumFractionDigits: 0 })}`
            : "Not yet calculated";

        const prompt = `You are a senior business intelligence analyst at ANC, a leading LED display company. A sales team member is about to work on a proposal. Give them a quick intelligence briefing about the client and project.

PROJECT DATA:
- Client: ${clientName}
- Location: ${address || "Not specified"}
- Number of screens: ${screenCount}
- Project value: ${formattedTotal}
- Screen details:
${screenList}

INSTRUCTIONS:
Research this client using web search and your knowledge base. Return a JSON object with this EXACT structure:

{
  "clientSummary": "One sentence about who this client is",
  "insights": [
    {
      "type": "market" | "warning" | "opportunity" | "strategic",
      "emoji": "relevant emoji",
      "headline": "Short bold headline (max 8 words)",
      "text": "2-3 sentence insight with specific details"
    }
  ],
  "bottomLine": "One compelling sentence summarizing the strategic opportunity or key consideration"
}

RULES:
- Return 4-6 insights
- Types: "market" for market intel, "warning" for risks/concerns, "opportunity" for upsell/advantage, "strategic" for competitive positioning
- Be specific — mention real facts, recent events, venue details, competitors if relevant
- If you cannot find information about the client, provide general insights about the LED display market and the type of venue
- Each insight should be actionable — something the salesperson can use in the meeting
- Do NOT include any text outside the JSON object
- Return ONLY valid JSON`;

        const textResponse = await queryAgent(workspace, prompt);

        // Extract and parse JSON
        const jsonText = extractJson(textResponse);
        if (!jsonText) {
            return NextResponse.json({ error: "AI did not return structured data" }, { status: 502 });
        }

        let parsed: any;
        const safeJson = jsonText.replace(/[\u201C\u201D]/g, '"').replace(/[\u2018\u2019]/g, "'");
        try {
            parsed = JSON.parse(safeJson);
        } catch {
            try {
                parsed = JSON.parse(safeJson + "}");
            } catch {
                try {
                    parsed = JSON.parse(safeJson + "]}");
                } catch {
                    return NextResponse.json({ error: "Failed to parse AI response" }, { status: 502 });
                }
            }
        }

        // Validate structure
        if (!parsed?.insights || !Array.isArray(parsed.insights)) {
            return NextResponse.json({ error: "Invalid brief structure" }, { status: 502 });
        }

        const brief = {
            clientSummary: String(parsed.clientSummary || ""),
            insights: parsed.insights.slice(0, 6).map((ins: any) => ({
                type: ["market", "warning", "opportunity", "strategic"].includes(ins.type) ? ins.type : "market",
                emoji: String(ins.emoji || "\u{1F4A1}"),
                headline: String(ins.headline || ""),
                text: String(ins.text || ""),
            })),
            bottomLine: String(parsed.bottomLine || ""),
            generatedAt: new Date().toISOString(),
        };

        // Persist to database
        if (proposalId && proposalId !== "new") {
            await prisma.proposal.update({
                where: { id: proposalId },
                data: { intelligenceBrief: brief as any },
            }).catch((err) => log.error("[IntelligenceBrief] Failed to persist:", err));
        }

        return NextResponse.json({ ok: true, brief, cached: false });
    } catch (err) {
        log.error("[IntelligenceBrief] Error:", err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Intelligence brief failed" },
            { status: 500 },
        );
    }
}
