/**
 * POST /api/estimator/ai-chat
 *
 * Follow-up chat within an existing AnythingLLM thread.
 * Used after the initial AI extraction — user can refine specs,
 * ask questions, or modify the estimate through conversation.
 *
 * The AI has full thread context from the initial extraction,
 * so it knows the project details and can update them.
 *
 * Input:  { message: string, threadSlug: string }
 * Output: SSE stream with text/extraction/done events
 */

import { NextRequest } from "next/server";

const PRIMARY_WORKSPACE = process.env.ANYTHING_LLM_REASONING_WORKSPACE || process.env.ANYTHING_LLM_WORKSPACE || "ancdashboard";

const CHAT_SYSTEM = `You are ANC's LED display project estimator assistant. The user has already described their project and you extracted initial specifications. Now they want to refine or ask follow-up questions.

When the user asks to modify the estimate (add displays, change dimensions, update specs), respond conversationally AND output an updated JSON block with the FULL updated project data using the same schema:

{
  "clientName": "string",
  "projectName": "string",
  "location": "string",
  "docType": "budget",
  "currency": "USD",
  "isIndoor": true/false,
  "isNewInstall": true/false,
  "isUnion": true/false,
  "displays": [...]
}

Rules:
- If the user asks a general question (not a change request), just answer conversationally. No JSON needed.
- If the user asks to change something, include the FULL updated JSON (not just the changed field).
- Wrap JSON in \`\`\`json code blocks so it can be parsed.
- Keep conversational responses concise and helpful.
- displayType must be one of: main-scoreboard, center-hung, ribbon-board, fascia-board, concourse-display, end-zone, marquee, auxiliary, custom
- locationType must be one of: wall, fascia, scoreboard, ribbon, freestanding, outdoor
- installComplexity must be one of: simple, standard, complex, heavy`;

const OPEN_TAG = "<think>";
const CLOSE_TAG = "</think>";

export async function POST(req: NextRequest) {
    try {
        const { message, threadSlug } = await req.json();

        if (!message || typeof message !== "string" || message.trim().length < 1) {
            return new Response(
                JSON.stringify({ error: "Message is required" }),
                { status: 400, headers: { "Content-Type": "application/json" } }
            );
        }

        if (!threadSlug || typeof threadSlug !== "string") {
            return new Response(
                JSON.stringify({ error: "Thread slug is required for follow-up chat" }),
                { status: 400, headers: { "Content-Type": "application/json" } }
            );
        }

        const rawUrl = (process.env.ANYTHING_LLM_URL || process.env.ANYTHING_LLM_BASE_URL || "").trim();
        const ALLM_KEY = process.env.ANYTHING_LLM_KEY || "";
        const normalizedBase = !rawUrl ? "" : rawUrl.endsWith("/api/v1")
            ? rawUrl
            : `${rawUrl.replace(/\/+$/, "")}/api/v1`;

        if (!normalizedBase || !ALLM_KEY) {
            return new Response(
                JSON.stringify({ error: "AI service not configured" }),
                { status: 503, headers: { "Content-Type": "application/json" } }
            );
        }

        const streamUrl = `${normalizedBase}/workspace/${PRIMARY_WORKSPACE}/thread/${threadSlug}/stream-chat`;

        const upstreamRes = await fetch(streamUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${ALLM_KEY}`,
            },
            body: JSON.stringify({
                message: `${CHAT_SYSTEM}\n\nUser message:\n${message.trim()}`,
                mode: "chat",
            }),
        });

        if (!upstreamRes.ok) {
            const errText = await upstreamRes.text();
            console.error(`[ai-chat] Stream error (${upstreamRes.status}):`, errText);
            return new Response(
                JSON.stringify({ error: "AI chat failed" }),
                { status: 502, headers: { "Content-Type": "application/json" } }
            );
        }

        const encoder = new TextEncoder();
        const decoder = new TextDecoder();
        let fullText = "";

        const readable = new ReadableStream({
            async start(controller) {
                const send = (data: any) => {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
                };

                const reader = upstreamRes.body?.getReader();
                if (!reader) {
                    send({ type: "error", message: "No stream body" });
                    controller.close();
                    return;
                }

                let sseBuffer = "";
                let streamBuf = "";
                let state: "waiting" | "thinking" | "answer" = "waiting";

                try {
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;

                        sseBuffer += decoder.decode(value, { stream: true });
                        const lines = sseBuffer.split("\n");
                        sseBuffer = lines.pop() || "";

                        for (const line of lines) {
                            const trimmed = line.trim();
                            if (!trimmed || !trimmed.startsWith("data: ")) continue;

                            let chunk: any;
                            try {
                                chunk = JSON.parse(trimmed.slice(6));
                            } catch {
                                continue;
                            }

                            if (chunk.close) {
                                if (state === "thinking" && streamBuf) {
                                    // Flush remaining thinking
                                    streamBuf = "";
                                }
                                break;
                            }
                            if (chunk.error) {
                                send({ type: "error", message: "AI returned an error" });
                                break;
                            }

                            if (chunk.type !== "textResponseChunk" || !chunk.textResponse) continue;

                            const text = chunk.textResponse as string;
                            fullText += text;
                            streamBuf += text;

                            // Skip <think> blocks silently, stream everything else as text
                            if (state === "waiting") {
                                if (streamBuf.includes(OPEN_TAG)) {
                                    state = "thinking";
                                    streamBuf = "";
                                } else if (OPEN_TAG.startsWith(streamBuf.trimStart())) {
                                    // Could still become <think>
                                } else {
                                    // Not a think tag — stream as answer text
                                    state = "answer";
                                    send({ type: "text", text: streamBuf });
                                    streamBuf = "";
                                }
                                continue;
                            }

                            if (state === "thinking") {
                                if (streamBuf.includes(CLOSE_TAG)) {
                                    state = "answer";
                                    const afterClose = streamBuf.split(CLOSE_TAG).pop() || "";
                                    if (afterClose) send({ type: "text", text: afterClose });
                                    streamBuf = "";
                                }
                                continue;
                            }

                            if (state === "answer") {
                                send({ type: "text", text: text });
                                streamBuf = "";
                            }
                        }
                    }

                    // Try to extract updated JSON from the full response
                    const jsonUpdate = tryExtractUpdate(fullText);
                    if (jsonUpdate) {
                        send({ type: "extraction", ...jsonUpdate });
                    }

                    send({ type: "done" });
                } catch (err: unknown) {
                    const message = err instanceof Error ? err.message : "Stream failed";
                    send({ type: "error", message });
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
    } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : "Unknown error";
        console.error("[ai-chat] Error:", errMsg);
        return new Response(
            JSON.stringify({ error: errMsg }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }
}

/** Try to extract an updated JSON spec from chat response */
function tryExtractUpdate(
    raw: string
): { answers: Record<string, any>; displays: any[] } | null {
    try {
        // Strip think blocks
        let cleaned = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

        // Look for ```json ... ``` blocks
        const codeBlockMatch = cleaned.match(/```json\s*([\s\S]*?)```/);
        const jsonStr = codeBlockMatch ? codeBlockMatch[1] : null;
        if (!jsonStr) return null;

        const parsed = JSON.parse(jsonStr.trim());

        // Must have displays array to be a valid update
        if (!Array.isArray(parsed.displays)) return null;

        const answers: Record<string, any> = {};
        if (parsed.clientName) answers.clientName = String(parsed.clientName);
        if (parsed.projectName) answers.projectName = String(parsed.projectName);
        if (parsed.location) answers.location = String(parsed.location);
        if (["budget", "proposal", "loi"].includes(parsed.docType)) answers.docType = parsed.docType;
        if (["USD", "CAD", "EUR", "GBP"].includes(parsed.currency)) answers.currency = parsed.currency;
        if (typeof parsed.isIndoor === "boolean") answers.isIndoor = parsed.isIndoor;
        if (typeof parsed.isNewInstall === "boolean") answers.isNewInstall = parsed.isNewInstall;
        if (typeof parsed.isUnion === "boolean") answers.isUnion = parsed.isUnion;

        const displays = parsed.displays.map((d: any) => ({
            displayName: String(d.displayName || "Display"),
            displayType: String(d.displayType || "custom"),
            locationType: String(d.locationType || "wall"),
            widthFt: clampNumber(d.widthFt, 1, 500, 20),
            heightFt: clampNumber(d.heightFt, 1, 200, 12),
            pixelPitch: String(d.pixelPitch || "4"),
            installComplexity: String(d.installComplexity || "standard"),
            serviceType: String(d.serviceType || "Front/Rear"),
            isReplacement: Boolean(d.isReplacement),
        }));

        if (displays.length === 0) return null;

        return { answers, displays };
    } catch {
        return null;
    }
}

function clampNumber(val: any, min: number, max: number, fallback: number): number {
    const n = typeof val === "number" ? val : parseFloat(val);
    if (isNaN(n)) return fallback;
    return Math.max(min, Math.min(max, n));
}
