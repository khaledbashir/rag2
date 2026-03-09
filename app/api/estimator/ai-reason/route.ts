/**
 * POST /api/estimator/ai-reason
 *
 * AI Reasoning Estimate with AnythingLLM Thread Tracking
 * Primary: AnythingLLM workspace (reasoning model that thinks natively)
 * Fallback: GLM (Z.AI) streaming if primary fails
 *
 * AnythingLLM SSE format (the ONLY format):
 *   { id, type: "textResponseChunk", textResponse: "...", sources: [], close: false, error: null }
 * No reasoning_content, no thinking field. Everything is in textResponse.
 * If the model uses <think> tags, they arrive inside textResponse.
 *
 * Threading:
 *   - Each "Describe your project" session creates a new AnythingLLM thread
 *   - Thread slug returned in the SSE stream so client can use it for follow-up chat
 *   - If threadSlug is provided, reuses existing thread
 *
 * Input:  { description: string, threadSlug?: string, sessionName?: string }
 * Output: SSE stream with reasoning/extraction/fallback/thread events
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/apiAuth";
import { log } from "@/lib/logger";

const GLM_BASE =
    process.env.Z_AI_BASE_URL ||
    "https://api.z.ai/api/coding/paas/v4";
const GLM_KEY = process.env.Z_AI_API_KEY || "";
const GLM_MODEL = process.env.Z_AI_MODEL_NAME || "glm-4.7";

// The reasoning model thinks on its own. Just ask for JSON.
const EXTRACTION_PROMPT = `You are ANC's LED display project estimator. Analyze the project description and output a JSON object with this exact schema:

{
  "clientName": "string",
  "projectName": "string",
  "location": "string (City, ST format)",
  "docType": "budget",
  "currency": "USD",
  "isIndoor": true/false,
  "isNewInstall": true/false,
  "isUnion": true/false,
  "displays": [
    {
      "displayName": "string (e.g., Main Scoreboard)",
      "displayType": "main-scoreboard|center-hung|ribbon-board|fascia-board|concourse-display|end-zone|marquee|auxiliary|custom",
      "locationType": "wall|fascia|scoreboard|ribbon|freestanding|outdoor",
      "widthFt": number,
      "heightFt": number,
      "pixelPitch": "string (e.g., 4)",
      "installComplexity": "simple|standard|complex|heavy",
      "serviceType": "Front/Rear|Top",
      "isReplacement": false
    }
  ]
}

Rules:
- displayType must be one of: main-scoreboard, center-hung, ribbon-board, fascia-board, concourse-display, end-zone, marquee, auxiliary, custom
- locationType must be one of: wall, fascia, scoreboard, ribbon, freestanding, outdoor
- installComplexity must be one of: simple, standard, complex, heavy
- pixelPitch should be a string number like "4" or "6" or "10"
- If multiple identical displays, create one entry per display (e.g., "two ribbon boards" = 2 separate entries)
- Default to budget docType and USD currency unless specified
- Infer installComplexity from context (center-hung = complex, wall mount = simple, etc.)`;

const PRIMARY_WORKSPACE = process.env.ANYTHING_LLM_REASONING_WORKSPACE || process.env.ANYTHING_LLM_WORKSPACE || "ancdashboard";

const OPEN_TAG = "<think>";
const CLOSE_TAG = "</think>";

/**
 * Create a new thread in AnythingLLM workspace.
 * Returns the thread slug or null if creation fails.
 */
async function createAnythingLLMThread(
    normalizedBase: string,
    apiKey: string,
    sessionName?: string
): Promise<{ slug: string; name: string } | null> {
    try {
        const threadName = sessionName || `Estimator - ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}`;
        const res = await fetch(`${normalizedBase}/workspace/${PRIMARY_WORKSPACE}/thread/new`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({ name: threadName }),
        });

        if (!res.ok) {
            const errText = await res.text();
            log.error(`[ai-reason] Thread creation failed (${res.status}):`, errText);
            return null;
        }

        const data = await res.json();
        const thread = data.thread || data;
        log.info(`[ai-reason] Created thread: ${thread.slug} (${threadName})`);
        return { slug: thread.slug, name: threadName };
    } catch (err: any) {
        log.error("[ai-reason] Thread creation error:", err.message);
        return null;
    }
}

export async function POST(req: NextRequest) {
    try {
        const [, authError] = await requireAuth();
        if (authError) return authError;
        const { description, threadSlug, sessionName } = await req.json();

        if (
            !description ||
            typeof description !== "string" ||
            description.trim().length < 10
        ) {
            return new Response(
                JSON.stringify({
                    error: "Please provide a project description (at least 10 characters)",
                }),
                { status: 400, headers: { "Content-Type": "application/json" } }
            );
        }

        // Try primary: AnythingLLM workspace (reasoning model)
        const primaryResult = await tryAnythingLLM(description.trim(), threadSlug, sessionName);

        if (primaryResult) {
            return primaryResult;
        }

        // Primary failed — try fallback: GLM streaming
        if (GLM_KEY) {
            log.info("[ai-reason] AnythingLLM unavailable, falling back to GLM");
            const glmResult = await tryGLMFallback(description.trim());
            if (glmResult) return glmResult;
        }

        // Both failed
        log.error("[ai-reason] All models unavailable");
        return new Response(
            JSON.stringify({ error: "AI models are unavailable. Please try again later." }),
            { status: 503, headers: { "Content-Type": "application/json" } }
        );
    } catch (error: any) {
        log.error("[ai-reason] Error:", error);
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }
}

/**
 * Primary: AnythingLLM stream-chat
 *
 * Sliding window buffer approach:
 * - All text arrives in chunk.textResponse — nothing else.
 * - We buffer incoming text and check for <think>/<​/think> tags on the
 *   buffer (not per-token) so partial splits like "<th" + "ink>" are handled.
 * - State: waiting → thinking → answer
 *   waiting: haven't seen <think> yet. Could be the start, or model might
 *            skip thinking entirely and go straight to JSON.
 *   thinking: inside <think> block, stream everything as reasoning.
 *   answer: after </think>, accumulate silently for JSON parsing.
 */
async function tryAnythingLLM(
    description: string,
    existingThreadSlug?: string,
    sessionName?: string
): Promise<Response | null> {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    log.info(`[ai-reason] Primary: AnythingLLM '${PRIMARY_WORKSPACE}', desc length: ${description.length}`);

    const rawUrl = (process.env.ANYTHING_LLM_URL || process.env.ANYTHING_LLM_BASE_URL || "").trim();
    const ALLM_KEY = process.env.ANYTHING_LLM_KEY || "";
    const normalizedBase = !rawUrl ? "" : rawUrl.endsWith("/api/v1")
        ? rawUrl
        : `${rawUrl.replace(/\/+$/, "")}/api/v1`;

    if (!normalizedBase || !ALLM_KEY) {
        log.error("[ai-reason] AnythingLLM not configured");
        return null;
    }

    // Create or reuse thread
    let threadSlug = existingThreadSlug;
    let threadName = "";
    if (!threadSlug) {
        const thread = await createAnythingLLMThread(normalizedBase, ALLM_KEY, sessionName);
        if (thread) {
            threadSlug = thread.slug;
            threadName = thread.name;
        }
        // If thread creation fails, fall through to workspace-level chat (no thread)
    }

    // Use thread-specific endpoint if we have a thread, otherwise workspace-level
    const streamUrl = threadSlug
        ? `${normalizedBase}/workspace/${PRIMARY_WORKSPACE}/thread/${threadSlug}/stream-chat`
        : `${normalizedBase}/workspace/${PRIMARY_WORKSPACE}/stream-chat`;

    log.info(`[ai-reason] Stream URL: ${streamUrl}`);

    let upstreamRes: Response;
    try {
        upstreamRes = await fetch(streamUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${ALLM_KEY}`,
            },
            body: JSON.stringify({
                message: `${EXTRACTION_PROMPT}\n\nProject description:\n${description}`,
                mode: "chat",
            }),
        });

        if (!upstreamRes.ok) {
            const errText = await upstreamRes.text();
            log.error(`[ai-reason] AnythingLLM stream error (${upstreamRes.status}):`, errText);
            return null;
        }
    } catch (err: any) {
        log.error("[ai-reason] AnythingLLM stream fetch failed:", err.message);
        return null;
    }

    // Full accumulated text (everything the model outputs)
    let fullText = "";

    const readable = new ReadableStream({
        async start(controller) {
            const send = (data: any) => {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
            };

            // Send thread info to client as first event
            if (threadSlug) {
                send({ type: "thread", threadSlug, threadName });
            }

            const reader = upstreamRes.body?.getReader();
            if (!reader) {
                send({ type: "error", message: "No stream body from AI service" });
                controller.close();
                return;
            }

            let sseBuffer = ""; // SSE line buffer
            let chunkCount = 0;

            // ── Sliding window state machine ──
            // streamBuf: text received but not yet emitted/classified
            // state: "waiting" | "thinking" | "answer"
            let streamBuf = "";
            let state: "waiting" | "thinking" | "answer" = "waiting";

            const flushThinking = (text: string) => {
                if (text) send({ type: "reasoning", text });
            };

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
                            continue; // skip malformed
                        }

                        // Log first chunks for diagnostics
                        if (chunkCount < 5) {
                            log.info("[ai-reason] chunk:", JSON.stringify(chunk).slice(0, 300));
                            chunkCount++;
                        }

                        // close=true: final chunk. Flush remaining buffer.
                        if (chunk.close) {
                            if (state === "thinking" && streamBuf) {
                                flushThinking(streamBuf);
                                streamBuf = "";
                            }
                            break;
                        }
                        if (chunk.error) {
                            log.error("[ai-reason] chunk error:", chunk.error);
                            send({ type: "error", message: "AI returned an error" });
                            break;
                        }

                        // The ONLY field we read from AnythingLLM
                        if (chunk.type !== "textResponseChunk" || !chunk.textResponse) continue;

                        const text = chunk.textResponse as string;
                        fullText += text;
                        streamBuf += text;

                        // ── State: WAITING ──
                        // We don't know yet if the model will use <think> tags.
                        // Hold text in streamBuf until we can decide.
                        if (state === "waiting") {
                            if (streamBuf.includes(OPEN_TAG)) {
                                // Model is using think tags
                                state = "thinking";
                                const afterTag = streamBuf.split(OPEN_TAG).pop() || "";
                                flushThinking(afterTag);
                                streamBuf = "";
                            } else if (OPEN_TAG.startsWith(streamBuf.trimStart())) {
                                // Buffer could still become "<think>" — hold
                                // e.g. streamBuf is "<" or "<th" or "<thin"
                            } else {
                                // Not a think tag. Model isn't using <think>.
                                // Check if it jumped straight to JSON
                                if (fullText.includes('"clientName"') || fullText.includes('"displays"')) {
                                    state = "answer";
                                    streamBuf = "";
                                }
                            }
                            continue;
                        }

                        // ── State: THINKING ──
                        // Stream reasoning live, but keep last 8 chars in buffer
                        // as guardrail so "</think>" split across chunks doesn't
                        // get flushed as reasoning text.
                        if (state === "thinking") {
                            if (streamBuf.includes(CLOSE_TAG)) {
                                // Thinking is done
                                state = "answer";
                                const parts = streamBuf.split(CLOSE_TAG);
                                flushThinking(parts[0]);
                                streamBuf = "";
                            } else if (streamBuf.length > CLOSE_TAG.length) {
                                // Flush everything except the last 8 chars
                                // (length of "</think>") to protect against splits
                                const safe = streamBuf.slice(0, -CLOSE_TAG.length);
                                const held = streamBuf.slice(-CLOSE_TAG.length);
                                flushThinking(safe);
                                streamBuf = held;
                            }
                            // If streamBuf.length <= 8, hold — could be partial </think>
                            continue;
                        }

                        // ── State: ANSWER ──
                        // After </think>. Accumulate silently for JSON parsing.
                        if (state === "answer") {
                            streamBuf = "";
                        }
                    }
                }

                // ── Handle models that don't use <think> tags ──
                // If we're still in "waiting" state after all chunks,
                // the model output everything as plain text (no think tags).
                // The entire fullText is both the reasoning AND the JSON.
                // We can't retroactively stream the reasoning, but we can
                // still parse the JSON. This happens with non-reasoning models.
                if (state === "waiting") {
                    log.info("[ai-reason] Model did not use <think> tags. Treating as direct output.");
                }

                // Parse JSON from the full accumulated text
                log.info(`[ai-reason] Done. length: ${fullText.length}, state: ${state}`);
                const parsed = parseExtraction(fullText);

                if (parsed) {
                    send({ type: "extraction", ...parsed });
                    send({ type: "done" });
                } else {
                    log.error("[ai-reason] Parse failed. Last 500 chars:", fullText.slice(-500));
                    send({ type: "error", message: "AI couldn't extract project data. Try being more specific." });
                }
            } catch (err: any) {
                log.error("[ai-reason] Stream error:", err.message);
                send({ type: "error", message: "AI stream error: " + (err.message || "unknown") });
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
}

/** Fallback: GLM streaming with amber fallback indicator */
async function tryGLMFallback(description: string): Promise<Response | null> {
    try {
        log.info(`[ai-reason] Fallback: GLM model=${GLM_MODEL}, desc length: ${description.length}`);

        const upstreamRes = await fetch(`${GLM_BASE}/chat/completions`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${GLM_KEY}`,
            },
            body: JSON.stringify({
                model: GLM_MODEL,
                messages: [
                    { role: "system", content: EXTRACTION_PROMPT },
                    { role: "user", content: description },
                ],
                stream: true,
                temperature: 0.2,
                max_tokens: 4096,
            }),
        });

        if (!upstreamRes.ok) {
            const errorText = await upstreamRes.text();
            log.error(`[ai-reason] GLM fallback error (${upstreamRes.status}):`, errorText);
            return null;
        }

        const encoder = new TextEncoder();
        const decoder = new TextDecoder();
        let fullContent = "";

        const readable = new ReadableStream({
            async start(controller) {
                const send = (data: any) => {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
                };

                send({ type: "fallback", message: "Primary AI unavailable — using backup reasoning model" });

                const reader = upstreamRes.body?.getReader();
                if (!reader) {
                    send({ type: "error", message: "No stream body" });
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
                            if (payload === "[DONE]") break;

                            try {
                                const chunk = JSON.parse(payload);
                                const delta = chunk.choices?.[0]?.delta;
                                if (delta) {
                                    // GLM uses OpenAI-compatible format with reasoning_content
                                    const reasoning = delta.reasoning_content || "";
                                    const content = delta.content || "";

                                    if (reasoning) {
                                        send({ type: "reasoning", text: reasoning });
                                    }
                                    if (content) {
                                        fullContent += content;
                                    }
                                }
                            } catch {
                                // skip malformed
                            }
                        }
                    }

                    const parsed = parseExtraction(fullContent);

                    if (parsed) {
                        send({ type: "extraction", ...parsed });
                    } else {
                        send({ type: "error", message: "Could not parse AI output. Try rephrasing." });
                    }

                    send({ type: "done" });
                } catch (err: any) {
                    send({ type: "error", message: err?.message || "Stream failed" });
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
    } catch (err: any) {
        log.error("[ai-reason] GLM fallback exception:", err.message);
        return null;
    }
}

/** Parse the model's content output into structured answers + displays */
function parseExtraction(
    raw: string
): { answers: Record<string, any>; displays: any[] } | null {
    try {
        // Strip <think>...</think> blocks — JSON lives AFTER reasoning
        let cleaned = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

        cleaned = cleaned
            .replace(/```json\s*/gi, "")
            .replace(/```\s*/g, "")
            .trim();

        const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
        if (!jsonMatch) return null;

        const parsed = JSON.parse(jsonMatch[0]);

        const answers: Record<string, any> = {};
        if (parsed.clientName) answers.clientName = String(parsed.clientName);
        if (parsed.projectName)
            answers.projectName = String(parsed.projectName);
        if (parsed.location) answers.location = String(parsed.location);
        if (["budget", "proposal", "loi"].includes(parsed.docType))
            answers.docType = parsed.docType;
        if (["USD", "CAD", "EUR", "GBP"].includes(parsed.currency))
            answers.currency = parsed.currency;
        if (typeof parsed.isIndoor === "boolean")
            answers.isIndoor = parsed.isIndoor;
        if (typeof parsed.isNewInstall === "boolean")
            answers.isNewInstall = parsed.isNewInstall;
        if (typeof parsed.isUnion === "boolean")
            answers.isUnion = parsed.isUnion;

        const displays = Array.isArray(parsed.displays)
            ? parsed.displays.map((d: any) => ({
                  displayName: String(d.displayName || "Display"),
                  displayType: String(d.displayType || "custom"),
                  locationType: String(d.locationType || "wall"),
                  widthFt: clampNumber(d.widthFt, 1, 500, 20),
                  heightFt: clampNumber(d.heightFt, 1, 200, 12),
                  pixelPitch: String(d.pixelPitch || "4"),
                  installComplexity: String(
                      d.installComplexity || "standard"
                  ),
                  serviceType: String(d.serviceType || "Front/Rear"),
                  isReplacement: Boolean(d.isReplacement),
              }))
            : [];

        if (displays.length === 0 && Object.keys(answers).length === 0)
            return null;

        return { answers, displays };
    } catch {
        return null;
    }
}

function clampNumber(
    val: any,
    min: number,
    max: number,
    fallback: number
): number {
    const n = typeof val === "number" ? val : parseFloat(val);
    if (isNaN(n)) return fallback;
    return Math.max(min, Math.min(max, n));
}
