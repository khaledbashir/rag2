import { NextRequest } from "next/server";

/**
 * POST /api/chat/stream
 *
 * Direct streaming chat to GLM-5 via Z.AI OpenAI-compatible API.
 * No AnythingLLM middleman — calls the model directly.
 *
 * Body: { message: string, history?: Array<{role, content}>, systemPrompt?: string }
 */

const GLM_BASE = process.env.Z_AI_BASE_URL || process.env.GLM_API_BASE || "https://api.z.ai/api/coding/paas/v4";
const GLM_KEY = process.env.Z_AI_API_KEY || process.env.GLM_API_KEY || "";
const GLM_MODEL = process.env.Z_AI_MODEL_NAME || process.env.GLM_MODEL || "glm-5";

export async function POST(req: NextRequest) {
    try {
        const { message, history, systemPrompt } = await req.json();

        if (!message) {
            return new Response(
                JSON.stringify({ error: "message is required" }),
                { status: 400, headers: { "Content-Type": "application/json" } }
            );
        }

        if (!GLM_KEY) {
            return new Response(
                JSON.stringify({ error: "GLM API key not configured. Set GLM_API_KEY env var." }),
                { status: 500, headers: { "Content-Type": "application/json" } }
            );
        }

        // Build messages array
        const messages: Array<{ role: string; content: string }> = [];

        if (systemPrompt) {
            messages.push({ role: "system", content: systemPrompt });
        }

        // Add conversation history (cap at 50 messages, 10K chars each to prevent DoS)
        if (history && Array.isArray(history)) {
            const MAX_HISTORY = 50;
            const MAX_MSG_LEN = 10000;
            for (const h of history.slice(-MAX_HISTORY)) {
                if (h.role && h.content) {
                    messages.push({ role: h.role, content: String(h.content).slice(0, MAX_MSG_LEN) });
                }
            }
        }

        messages.push({ role: "user", content: message });

        console.log(`[Chat/Stream] GLM-5 direct call, ${messages.length} messages, model: ${GLM_MODEL}`);

        const upstreamRes = await fetch(`${GLM_BASE}/chat/completions`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${GLM_KEY}`,
            },
            body: JSON.stringify({
                model: GLM_MODEL,
                messages,
                stream: true,
                temperature: 0.3,
                max_tokens: 8192,
            }),
        });

        if (!upstreamRes.ok) {
            const errorText = await upstreamRes.text();
            console.error(`[Chat/Stream] GLM error (${upstreamRes.status}):`, errorText);
            return new Response(
                JSON.stringify({ error: "GLM API error", details: errorText }),
                { status: upstreamRes.status, headers: { "Content-Type": "application/json" } }
            );
        }

        const encoder = new TextEncoder();
        const decoder = new TextDecoder();

        const readable = new ReadableStream({
            async start(controller) {
                const reader = upstreamRes.body?.getReader();
                if (!reader) {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", content: "No stream body" })}\n\n`));
                    controller.close();
                    return;
                }

                let buffer = "";

                try {
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;

                        buffer += decoder.decode(value, { stream: true });
                        const lines = buffer.split("\n");
                        buffer = lines.pop() || "";

                        for (const line of lines) {
                            const trimmed = line.trim();
                            if (!trimmed || !trimmed.startsWith("data: ")) continue;

                            const payload = trimmed.slice(6);
                            if (payload === "[DONE]") {
                                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
                                break;
                            }

                            try {
                                const chunk = JSON.parse(payload);
                                const delta = chunk.choices?.[0]?.delta;
                                if (delta) {
                                    // Forward: content text, reasoning_content for thinking
                                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                                        content: delta.content || "",
                                        reasoning: delta.reasoning_content || "",
                                    })}\n\n`));
                                }
                            } catch {
                                // skip malformed chunks
                            }
                        }
                    }

                    // Final done signal
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
                } catch (err: any) {
                    controller.enqueue(
                        encoder.encode(`data: ${JSON.stringify({ error: err?.message, done: true })}\n\n`)
                    );
                } finally {
                    reader.releaseLock();
                    controller.close();
                }
            },
        });

        return new Response(readable, {
            headers: {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
                Connection: "keep-alive",
            },
        });
    } catch (error: any) {
        console.error("[Chat/Stream] Error:", error);
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }
}
