/**
 * POST /api/estimator/ai-reason
 *
 * AI Reasoning Estimate
 * Primary: AnythingLLM "reasoning" workspace (self-hosted, always available)
 * Fallback: GLM (Z.AI) streaming if primary fails
 *
 * Input:  { description: string }
 * Output: SSE stream with reasoning/extraction/fallback events
 */

import { NextRequest } from "next/server";
import { queryVault } from "@/lib/anything-llm";

const GLM_BASE =
    process.env.Z_AI_BASE_URL ||
    "https://api.z.ai/api/coding/paas/v4";
const GLM_KEY = process.env.Z_AI_API_KEY || "";
const GLM_MODEL = process.env.Z_AI_MODEL_NAME || "glm-4.7";

const SYSTEM_PROMPT = `You are ANC's LED display project estimator. You analyze project descriptions and extract structured data for cost estimation.

IMPORTANT: Think step by step. In your reasoning, analyze:
1. Identify the client/organization name
2. Determine the venue/project name
3. Extract location (city, state)
4. For each display mentioned, extract: name, type, dimensions (width x height in feet), pixel pitch (mm), installation type
5. Determine environment (indoor/outdoor), installation type (new/replacement), labor type (union/non-union)

After reasoning, output ONLY a JSON object (no markdown, no explanation) with this exact schema:

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

const PRIMARY_WORKSPACE = "reasoning";

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

        // Try primary: AnythingLLM "reasoning" workspace
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

/** Primary: AnythingLLM reasoning workspace — streams progress steps + extraction */
async function tryAnythingLLM(description: string): Promise<Response | null> {
    const encoder = new TextEncoder();

    console.log(`[ai-reason] Primary: AnythingLLM '${PRIMARY_WORKSPACE}', desc length: ${description.length}`);

    // Return the SSE stream immediately — queryVault runs inside it
    const readable = new ReadableStream({
        async start(controller) {
            const send = (data: any) => {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
            };

            const steps = [
                "Reading project description...",
                "Identifying venue type and client details...",
                "Extracting display specifications (dimensions, pixel pitch, type)...",
                "Determining environment, installation type, and labor requirements...",
                "Mapping display types to standard categories...",
                "Building structured estimate data...",
            ];

            // Start the AnythingLLM call in the background
            const llmPromise = queryVault(PRIMARY_WORKSPACE, description, "chat");

            // Stream progress steps while waiting
            let stepIndex = 0;
            const stepInterval = setInterval(() => {
                if (stepIndex < steps.length) {
                    send({ type: "reasoning", text: steps[stepIndex] + "\n" });
                    stepIndex++;
                }
            }, 800);

            try {
                const response = await llmPromise;

                // Done waiting — flush remaining steps quickly
                clearInterval(stepInterval);
                while (stepIndex < steps.length) {
                    send({ type: "reasoning", text: steps[stepIndex] + "\n" });
                    stepIndex++;
                    await sleep(100);
                }

                if (!response || response.startsWith("Error")) {
                    console.error("[ai-reason] AnythingLLM error:", response);
                    send({ type: "error", message: "AI service returned an error. Retrying with backup..." });
                    controller.close();
                    return;
                }

                // Extract the REAL reasoning from the response
                // The model outputs reasoning text THEN a JSON block
                const realReasoning = extractReasoning(response);
                if (realReasoning) {
                    // Clear the generic steps, send real reasoning
                    send({ type: "clear_reasoning" });
                    // Stream the real reasoning in chunks for typewriter effect
                    const chunks = realReasoning.match(/.{1,80}/gs) || [realReasoning];
                    for (const chunk of chunks) {
                        send({ type: "reasoning", text: chunk });
                        await sleep(30);
                    }
                    send({ type: "reasoning", text: "\n" });
                }

                send({ type: "reasoning", text: "\n---\nParsing extraction results...\n" });
                await sleep(200);

                const parsed = parseExtraction(response);

                if (parsed) {
                    send({ type: "reasoning", text: "Extraction complete.\n" });
                    send({ type: "extraction", ...parsed });
                    send({ type: "done" });
                } else {
                    send({ type: "reasoning", text: "Could not parse structured data from AI response.\n" });
                    send({ type: "error", message: "AI couldn't extract project data. Try being more specific." });
                }
            } catch (err: any) {
                clearInterval(stepInterval);
                console.error("[ai-reason] AnythingLLM exception:", err.message);
                send({ type: "error", message: "AI service error: " + (err.message || "unknown") });
            } finally {
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
                    { role: "system", content: SYSTEM_PROMPT },
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

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Extract the reasoning text from before the JSON block in the response */
function extractReasoning(raw: string): string | null {
    try {
        let cleaned = raw
            .replace(/```json\s*/gi, "")
            .replace(/```\s*/g, "")
            .trim();

        // Find the JSON block start
        const jsonStart = cleaned.search(/\{[\s\S]*"clientName"/);
        if (jsonStart <= 0) return null;

        // Everything before the JSON is reasoning
        const reasoning = cleaned.slice(0, jsonStart).trim();
        if (reasoning.length < 20) return null; // Too short to be real reasoning

        return reasoning;
    } catch {
        return null;
    }
}

/** Parse the model's content output into structured answers + displays */
function parseExtraction(
    raw: string
): { answers: Record<string, any>; displays: any[] } | null {
    try {
        let cleaned = raw
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
