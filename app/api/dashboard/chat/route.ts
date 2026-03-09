import { NextRequest, NextResponse } from "next/server";
import { ANYTHING_LLM_BASE_URL, ANYTHING_LLM_KEY } from "@/lib/variables";
import { updateWorkspaceSettings } from "@/lib/anything-llm";
import { requireAuth } from "@/lib/apiAuth";
import { log } from "@/lib/logger";

/**
 * Dashboard Chat API Route - Intelligence Core
 * Connects to the unified "dashboard-vault" workspace
 * Auto-creates workspace if it doesn't exist
 * Supports @agent mode for web search + RAG
 */
export async function POST(req: NextRequest) {
    try {
        const [, authError] = await requireAuth();
        if (authError) return authError;
        const { message, workspace, useAgent } = await req.json();

        if (!message) {
            return NextResponse.json({ error: "Message is required" }, { status: 400 });
        }

        // Always use dashboard-vault for cross-project intelligence
        const targetWorkspace = workspace || "dashboard-vault";

        if (!ANYTHING_LLM_BASE_URL || !ANYTHING_LLM_KEY) {
            return NextResponse.json({
                error: "AnythingLLM not configured",
                response: "The Intelligence Core is offline. Please configure ANYTHING_LLM credentials."
            }, { status: 500 });
        }

        const SYSTEM_GUARD = `[SYSTEM INSTRUCTIONS]
You are Lux, the ANC Proposal Engine AI assistant on the dashboard.
You ONLY have access to pipeline-level summary data: project counts, total pipeline value, status breakdowns, and project names.
You CANNOT access individual project details like margins, pricing, screen specs, cost breakdowns, or line items.
If the user asks about a specific project's data (e.g. "what's the margin on X" or "how much is the hardware for Y"), respond:
"I don't have access to individual project details from the dashboard. Open that project and ask me there — I'll have full access to all the pricing and spec data."
Never guess or estimate project-specific numbers you don't have. It is better to say you don't know than to give a wrong number.`;

        const guardedMessage = `${SYSTEM_GUARD}\n\n[USER QUESTION]\n${message}`;

        log.info(`[Intelligence Core] Querying workspace: ${targetWorkspace} (Agent: ${useAgent ? 'YES' : 'NO'})`);

        let response = await fetch(`${ANYTHING_LLM_BASE_URL}/workspace/${targetWorkspace}/chat`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${ANYTHING_LLM_KEY}`,
            },
            body: JSON.stringify({
                message: useAgent ? `@agent ${guardedMessage}` : guardedMessage,
                mode: "chat",
                sessionId: `dashboard-${targetWorkspace}`,
            }),
        });

        // If workspace doesn't exist, create it
        if (response.status === 404 || response.status === 400) {
            const errorText = await response.text();
            if (errorText.includes("not a valid workspace") || errorText.includes("not found")) {
                log.info(`[Intelligence Core] Workspace ${targetWorkspace} not found, creating...`);
                
                // Create the workspace
                const createRes = await fetch(`${ANYTHING_LLM_BASE_URL}/workspace/new`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${ANYTHING_LLM_KEY}`,
                    },
                    body: JSON.stringify({
                        name: targetWorkspace,
                        slug: targetWorkspace,
                        chatMode: "chat"
                    }),
                });

                if (createRes.ok) {
                    const created = await createRes.json();
                    const newSlug = created?.workspace?.slug || created?.slug || targetWorkspace;
                    
                    // Do NOT set chatProvider/chatModel — leave null so workspace
                    // inherits the system default from AnythingLLM admin UI.
                    await updateWorkspaceSettings(newSlug, {
                        chatMode: "chat",
                    }).catch(e => log.error("[Intelligence Core] Settings update failed:", e));

                    // Retry the chat call
                    response = await fetch(`${ANYTHING_LLM_BASE_URL}/workspace/${newSlug}/chat`, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            "Authorization": `Bearer ${ANYTHING_LLM_KEY}`,
                        },
                        body: JSON.stringify({
                            message: useAgent ? `@agent ${guardedMessage}` : guardedMessage,
                            mode: "chat",
                            sessionId: `dashboard-${newSlug}`,
                        }),
                    });
                } else {
                    log.error("[Intelligence Core] Failed to create workspace:", await createRes.text());
                }
            }
        }

        if (!response.ok) {
            const errorText = await response.text();
            log.error("AnythingLLM error:", errorText);
            return NextResponse.json({
                error: "Failed to get response from AI",
                response: `AnythingLLM error (${response.status}): ${errorText.slice(0, 200)}`
            }, { status: response.status });
        }

        const data = await response.json();

        return NextResponse.json({
            success: true,
            response: data.textResponse || data.response || "No response received.",
            sources: data.sources || [],
            thinking: data.thinking || null,
            workspace: targetWorkspace,
        });

    } catch (error: any) {
        log.error("Dashboard chat error:", error);
        return NextResponse.json({
            error: error.message,
            response: `Dashboard chat error: ${error.message}`
        }, { status: 500 });
    }
}
