/**
 * POST /api/estimator/ai-reason
 *
 * AI Reasoning Estimate
 * Primary: AnythingLLM workspace (reasoning model that thinks natively)
 * Fallback: GLM (Z.AI) streaming if primary fails
 *
 * Input:  { description: string }
 * Output: SSE stream with reasoning/extraction/fallback events
 */

import { NextRequest } from "next/server";

const GLM_BASE =
    process.env.Z_AI_BASE_URL ||
    "https://api.z.ai/api/coding/paas/v4";
const GLM_KEY = process.env.Z_AI_API_KEY || "";
const GLM_MODEL = process.env.Z_AI_MODEL_NAME || "glm-4.7";

// Keep the prompt focused on JSON output only.
// The reasoning model already thinks on its own — don't tell it to reason.
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

export async function POST(req: NextRequest) {
    try {
        const { description } = await req.json();

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
        const primaryResult = await tryAnythingLLM(description.trim());

        if (primaryResult) {
            return primaryResult;
        }

        // Primary failed — try fallback: GLM streaming
        if (GLM_KEY) {
            console.log("[ai-reason] AnythingLLM unavailable, falling back to GLM");
            const glmResult = await tryGLMFallback(description.trim());
            if (glmResult) return glmResult;
        }

        // Both failed
        console.error("[ai-reason] All models unavailable");
        return new Response(
            JSON.stringify({ error: "AI models are unavailable. Please try again later." }),
            { status: 503, headers: { "Content-Type": "application/json" } }
        );
    } catch (error: any) {
        console.error("[ai-reason] Error:", error);
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }
}

/** Primary: AnythingLLM — the model reasons natively, we just forward everything */
async function tryAnythingLLM(description: string): Promise<Response | null> {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    console.log(`[ai-reason] Primary: AnythingLLM '${PRIMARY_WORKSPACE}', desc length: ${description.length}`);

    const rawUrl = (process.env.ANYTHING_LLM_URL || process.env.ANYTHING_LLM_BASE_URL || "").trim();
    const ALLM_KEY = process.env.ANYTHING_LLM_KEY || "";
    const normalizedBase = !rawUrl ? "" : rawUrl.endsWith("/api/v1")
        ? rawUrl
        : `${rawUrl.replace(/\/+$/, "")}/api/v1`;

    if (!normalizedBase || !ALLM_KEY) {
        console.error("[ai-reason] AnythingLLM not configured");
        return null;
    }

    const streamUrl = `${normalizedBase}/workspace/${PRIMARY_WORKSPACE}/stream-chat`;

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
            console.error(`[ai-reason] AnythingLLM stream error (${upstreamRes.status}):`, errText);
            return null;
        }
    } catch (err: any) {
        console.error("[ai-reason] AnythingLLM stream fetch failed:", err.message);
        return null;
    }

    // fullText = everything the model outputs (thinking + JSON)
    let fullText = "";
    // jsonStarted = we've detected the JSON output beginning, stop streaming reasoning
    let jsonStarted = false;

    const readable = new ReadableStream({
        async start(controller) {
            const send = (data: any) => {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
            };

            const reader = upstreamRes.body?.getReader();
            if (!reader) {
                send({ type: "error", message: "No stream body from AI service" });
                controller.close();
                return;
            }

            let buffer = "";
            let chunkCount = 0;

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

                        try {
                            const chunk = JSON.parse(trimmed.slice(6));

                            // Log first chunks so we can debug the format
                            if (chunkCount < 3) {
                                console.log("[ai-reason] chunk:", JSON.stringify(chunk).slice(0, 200));
                                chunkCount++;
                            }

                            // AnythingLLM streams text as textResponseChunk
                            if (chunk.type === "textResponseChunk" && chunk.textResponse) {
                                const token = chunk.textResponse;
                                fullText += token;

                                if (!jsonStarted) {
                                    // Check if we've hit the JSON output boundary
                                    // The model's reasoning comes first, then JSON
                                    // Detect: <think> close, ```json, or a bare { followed by "clientName"
                                    if (token.includes("</think>")) {
                                        jsonStarted = true;
                                        // Send any text before the tag as final reasoning
                                        const before = token.split("</think>")[0];
                                        if (before) send({ type: "reasoning", text: before });
                                    } else if (token.includes("<think>")) {
                                        // Strip the tag, send the rest
                                        const after = token.replace("<think>", "");
                                        if (after) send({ type: "reasoning", text: after });
                                    } else if (fullText.includes("```json")) {
                                        jsonStarted = true;
                                    } else if (fullText.includes('"clientName"') || fullText.includes('"displays"')) {
                                        // Model jumped straight to JSON without thinking
                                        jsonStarted = true;
                                    } else {
                                        // This is reasoning text — forward it live
                                        send({ type: "reasoning", text: token });
                                    }
                                }
                                // After jsonStarted, tokens accumulate silently for parsing
                            }

                            if (chunk.close) break;
                            if (chunk.error) {
                                console.error("[ai-reason] AnythingLLM chunk error:", chunk.error);
                                send({ type: "error", message: "AI returned an error" });
                                break;
                            }
                        } catch {
                            // Skip malformed chunks
                        }
                    }
                }

                // Parse the accumulated text for JSON extraction
                console.log(`[ai-reason] Done. Length: ${fullText.length}, jsonStarted: ${jsonStarted}, has <think>: ${fullText.includes("<think>")}`);
                const parsed = parseExtraction(fullText);

                if (parsed) {
                    send({ type: "extraction", ...parsed });
                    send({ type: "done" });
                } else {
                    console.error("[ai-reason] Parse failed. Last 500 chars:", fullText.slice(-500));
                    send({ type: "error", message: "AI couldn't extract project data. Try being more specific." });
                }
            } catch (err: any) {
                console.error("[ai-reason] Stream error:", err.message);
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
        console.log(`[ai-reason] Fallback: GLM model=${GLM_MODEL}, desc length: ${description.length}`);

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
            console.error(`[ai-reason] GLM fallback error (${upstreamRes.status}):`, errorText);
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

                // Tell client this is fallback
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
        console.error("[ai-reason] GLM fallback exception:", err.message);
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
