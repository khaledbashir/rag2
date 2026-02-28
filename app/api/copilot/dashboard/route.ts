import { NextRequest, NextResponse } from "next/server";
import { ANYTHING_LLM_BASE_URL, ANYTHING_LLM_KEY } from "@/lib/variables";

const DASHBOARD_WORKSPACE_SLUG = process.env.ANYTHING_LLM_WORKSPACE || "ancdashboard";

/**
 * POST /api/copilot/dashboard
 * Dashboard-level AI chat — talks to the shared AnythingLLM workspace
 * with pipeline context injected as a system prefix.
 *
 * Body: { message: string, pipelineContext: string }
 */
export async function POST(req: NextRequest) {
    try {
        const { message, pipelineContext } = await req.json();

        if (!message) {
            return NextResponse.json({ error: "Message is required" }, { status: 400 });
        }

        if (!ANYTHING_LLM_BASE_URL || !ANYTHING_LLM_KEY) {
            return NextResponse.json({
                error: "AnythingLLM not configured",
                response: "The AI backend is not configured. Set ANYTHING_LLM_URL and ANYTHING_LLM_KEY.",
            }, { status: 500 });
        }

        const SYSTEM_GUARD = `[SYSTEM INSTRUCTIONS]
You are Lux, the ANC Proposal Engine AI assistant on the dashboard.
You ONLY have access to pipeline-level summary data: project counts, total pipeline value, status breakdowns, and project names.
You CANNOT access individual project details like margins, pricing, screen specs, cost breakdowns, or line items.
If the user asks about a specific project's data (e.g. "what's the margin on X" or "how much is the hardware for Y"), respond:
"I don't have access to individual project details from the dashboard. Open that project and ask me there — I'll have full access to all the pricing and spec data."
Never guess or estimate project-specific numbers you don't have. It is better to say you don't know than to give a wrong number.`;

        const contextPrefix = pipelineContext
            ? `${SYSTEM_GUARD}\n\n[DASHBOARD CONTEXT]\n${pipelineContext}\n\n[USER QUESTION]\n${message}`
            : `${SYSTEM_GUARD}\n\n[USER QUESTION]\n${message}`;

        const chatUrl = `${ANYTHING_LLM_BASE_URL}/workspace/${DASHBOARD_WORKSPACE_SLUG}/chat`;

        console.log(`[Dashboard Copilot] → workspace "${DASHBOARD_WORKSPACE_SLUG}"`);

        const response = await fetch(chatUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${ANYTHING_LLM_KEY}`,
            },
            body: JSON.stringify({
                message: contextPrefix,
                mode: "chat",
                sessionId: "dashboard-copilot",
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[Dashboard Copilot] AnythingLLM error (${response.status}):`, errorText);
            return NextResponse.json({
                error: `AnythingLLM returned ${response.status}`,
                response: `AI workspace error: ${errorText}`,
            }, { status: response.status });
        }

        const data = await response.json();

        return NextResponse.json({
            success: true,
            response: data.textResponse || data.response || "No response received.",
            sources: data.sources || [],
        });
    } catch (error: any) {
        console.error("[Dashboard Copilot] Error:", error);
        return NextResponse.json({
            error: error.message,
            response: `Dashboard Copilot error: ${error.message}`,
        }, { status: 500 });
    }
}
