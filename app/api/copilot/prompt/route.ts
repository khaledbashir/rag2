import { NextRequest, NextResponse } from "next/server";
import { ANYTHING_LLM_BASE_URL, ANYTHING_LLM_KEY } from "@/lib/variables";
import { getPromptById, ANC_SYSTEM_PROMPT } from "@/lib/ai-prompts";
import { requireAuth } from "@/lib/apiAuth";
import { log } from "@/lib/logger";

const DASHBOARD_WORKSPACE_SLUG = process.env.ANYTHING_LLM_WORKSPACE || "ancdashboard";

/**
 * POST /api/copilot/prompt
 * Execute a prompt from the ANC AI Operations library against AnythingLLM.
 *
 * Body: { promptId: string, userInput?: string, pipelineContext?: string }
 */
export async function POST(req: NextRequest) {
    try {
        const [, authError] = await requireAuth();
        if (authError) return authError;
        const { promptId, userInput, pipelineContext } = await req.json();

        if (!promptId) {
            return NextResponse.json({ error: "promptId is required" }, { status: 400 });
        }

        const prompt = getPromptById(promptId);
        if (!prompt) {
            return NextResponse.json({ error: `Unknown prompt: ${promptId}` }, { status: 400 });
        }

        if (!ANYTHING_LLM_BASE_URL || !ANYTHING_LLM_KEY) {
            return NextResponse.json({
                error: "AnythingLLM not configured",
                response: "The AI backend is not configured. Set ANYTHING_LLM_URL and ANYTHING_LLM_KEY.",
            }, { status: 500 });
        }

        // Build the full message: system context + prompt template + user input
        const parts: string[] = [];

        if (pipelineContext) {
            parts.push(`[DASHBOARD CONTEXT]\n${pipelineContext}`);
        }

        parts.push(`[ANC AI OPERATIONS — ${prompt.name.toUpperCase()}]`);
        parts.push(prompt.prompt);

        if (userInput?.trim()) {
            parts.push(`[USER INPUT]\n${userInput.trim()}`);
        }

        const fullMessage = parts.join("\n\n");

        const chatUrl = `${ANYTHING_LLM_BASE_URL}/workspace/${DASHBOARD_WORKSPACE_SLUG}/chat`;

        log.info(`[Prompt API] Running "${prompt.id}" → workspace "${DASHBOARD_WORKSPACE_SLUG}"`);

        const response = await fetch(chatUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${ANYTHING_LLM_KEY}`,
            },
            body: JSON.stringify({
                message: fullMessage,
                mode: "chat",
                sessionId: `prompt-${prompt.id}`,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            log.error(`[Prompt API] AnythingLLM error (${response.status}):`, errorText);
            return NextResponse.json({
                error: `AnythingLLM returned ${response.status}`,
                response: `AI error: ${errorText}`,
            }, { status: response.status });
        }

        const data = await response.json();

        return NextResponse.json({
            success: true,
            promptId: prompt.id,
            promptName: prompt.name,
            response: data.textResponse || data.response || "No response received.",
            sources: data.sources || [],
        });
    } catch (error: any) {
        log.error("[Prompt API] Error:", error);
        return NextResponse.json({
            error: error.message,
            response: `Prompt execution error: ${error.message}`,
        }, { status: 500 });
    }
}
