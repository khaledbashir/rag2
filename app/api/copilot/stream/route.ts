import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ANYTHING_LLM_BASE_URL, ANYTHING_LLM_KEY } from "@/lib/variables";

/**
 * POST /api/copilot/stream
 *
 * Streaming chat via AnythingLLM's stream-chat endpoint.
 * Returns Server-Sent Events (SSE) for real-time text generation.
 * Uses thread-scoped endpoint when aiThreadId exists.
 *
 * Body: { projectId: string, message: string, useAgent?: boolean }
 */
export async function POST(req: NextRequest) {
    try {
        const { projectId, message, useAgent } = await req.json();

        if (!message || !projectId) {
            return new Response(
                JSON.stringify({ error: "projectId and message are required" }),
                { status: 400, headers: { "Content-Type": "application/json" } }
            );
        }

        if (!ANYTHING_LLM_BASE_URL || !ANYTHING_LLM_KEY) {
            return new Response(
                JSON.stringify({ error: "AnythingLLM not configured" }),
                { status: 500, headers: { "Content-Type": "application/json" } }
            );
        }

        // Look up workspace slug + thread
        const proposal = await prisma.proposal.findUnique({
            where: { id: projectId },
            select: {
                aiWorkspaceSlug: true,
                aiThreadId: true,
                workspace: { select: { aiWorkspaceSlug: true } },
            },
        });

        const workspaceSlug =
            proposal?.aiWorkspaceSlug ||
            proposal?.workspace?.aiWorkspaceSlug ||
            null;
        const threadSlug = proposal?.aiThreadId || null;

        if (!workspaceSlug) {
            return new Response(
                JSON.stringify({ error: "No AI workspace for this project" }),
                { status: 404, headers: { "Content-Type": "application/json" } }
            );
        }

        // Build stream-chat URL — thread-scoped when available
        const streamPath = threadSlug
            ? `${ANYTHING_LLM_BASE_URL}/workspace/${workspaceSlug}/thread/${threadSlug}/stream-chat`
            : `${ANYTHING_LLM_BASE_URL}/workspace/${workspaceSlug}/stream-chat`;

        console.log(`[Copilot/Stream] Project ${projectId} → ${streamPath}`);

        // Call AnythingLLM stream-chat (60s timeout to prevent hanging)
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 60_000);
        let upstreamRes: Response;
        try {
            upstreamRes = await fetch(streamPath, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${ANYTHING_LLM_KEY}`,
                },
                body: JSON.stringify({
                    message: useAgent ? `@agent ${message}` : message,
                    mode: "chat",
                    sessionId: `copilot-${projectId}`,
                }),
                signal: controller.signal,
            });
        } catch (fetchErr: any) {
            clearTimeout(timeout);
            const isTimeout = fetchErr?.name === "AbortError";
            console.error(`[Copilot/Stream] ${isTimeout ? "Timeout" : "Fetch error"}:`, fetchErr?.message);
            return new Response(
                JSON.stringify({ error: isTimeout ? "AI took too long to respond. Try a simpler question." : "AI service unavailable" }),
                { status: 504, headers: { "Content-Type": "application/json" } }
            );
        }
        clearTimeout(timeout);

        if (!upstreamRes.ok) {
            const errorText = await upstreamRes.text();
            console.error(`[Copilot/Stream] AnythingLLM error (${upstreamRes.status}):`, errorText);
            return new Response(
                JSON.stringify({ error: "AI workspace error", details: errorText }),
                { status: upstreamRes.status, headers: { "Content-Type": "application/json" } }
            );
        }

        // Pipe the SSE stream from AnythingLLM to the client
        // Transform: strip <think> tags, forward textResponse chunks
        const encoder = new TextEncoder();
        const decoder = new TextDecoder();

        const readable = new ReadableStream({
            async start(controller) {
                const reader = upstreamRes.body?.getReader();
                if (!reader) {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", textResponse: "No stream body" })}\n\n`));
                    controller.close();
                    return;
                }

                let buffer = "";
                let chunkCount = 0;

                try {
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) {
                            console.log(`[Copilot/Stream] Stream ended. Total chunks forwarded: ${chunkCount}`);
                            break;
                        }

                        const rawText = decoder.decode(value, { stream: true });
                        buffer += rawText;

                        // Log first chunk for debugging
                        if (chunkCount === 0) {
                            console.log(`[Copilot/Stream] First raw chunk: ${rawText.slice(0, 200)}`);
                        }

                        // Process complete lines from the buffer
                        const lines = buffer.split("\n");
                        buffer = lines.pop() || ""; // Keep incomplete line in buffer

                        for (const line of lines) {
                            const trimmed = line.trim();
                            if (!trimmed) continue;

                            // AnythingLLM sends JSON lines or SSE data: lines
                            let jsonStr = trimmed;
                            if (trimmed.startsWith("data: ")) {
                                jsonStr = trimmed.slice(6);
                            }

                            try {
                                const chunk = JSON.parse(jsonStr);

                                // Pass raw chunks to client — including <think> tags
                                // Client-side state machine handles thinking UI
                                controller.enqueue(
                                    encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`)
                                );
                                chunkCount++;

                                if (chunk.close) {
                                    console.log(`[Copilot/Stream] Close chunk received after ${chunkCount} chunks`);
                                    break;
                                }
                            } catch {
                                // Not valid JSON — could be SSE comment or partial data
                                if (chunkCount === 0) {
                                    console.log(`[Copilot/Stream] Non-JSON line: ${trimmed.slice(0, 100)}`);
                                }
                            }
                        }
                    }

                    // If we got zero chunks, forward the actual error
                    if (chunkCount === 0) {
                        const remainder = buffer.slice(0, 500);
                        console.error("[Copilot/Stream] No chunks parsed from upstream. Buffer remainder:", remainder);
                        controller.enqueue(
                            encoder.encode(`data: ${JSON.stringify({
                                type: "textResponseChunk",
                                textResponse: "",
                                close: true,
                                error: `Stream returned no parseable chunks. Raw: ${remainder.slice(0, 200)}`,
                                sources: [],
                            })}\n\n`)
                        );
                    }
                } catch (err: any) {
                    console.error("[Copilot/Stream] Stream error:", err);
                    controller.enqueue(
                        encoder.encode(`data: ${JSON.stringify({ type: "error", textResponse: "", error: `Stream error: ${err?.message || String(err)}`, close: true })}\n\n`)
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
        console.error("[Copilot/Stream] Error:", error);
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }
}
