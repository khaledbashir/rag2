/**
 * POST /api/estimator/ai-reason
 *
 * AI Reasoning Estimate — Primary: GLM (Z.AI) with streaming reasoning.
 * Fallback: AnythingLLM (self-hosted) if primary fails.
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

const FALLBACK_WORKSPACE = "anc-estimator";

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

        // Try primary model (GLM streaming)
        const primaryResult = GLM_KEY
            ? await tryPrimaryModel(description.trim())
            : null;

        if (primaryResult) {
            return primaryResult;
        }

        // Primary failed or not configured — fall back to AnythingLLM
        console.log("[ai-reason] Primary model unavailable, falling back to AnythingLLM");
        return buildFallbackStream(description.trim());
    } catch (error: any) {
        console.error("[ai-reason] Error:", error);
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }
}

/** Try the primary GLM streaming model. Returns Response on success, null on failure. */
async function tryPrimaryModel(description: string): Promise<Response | null> {
    try {
        console.log(
            `[ai-reason] Primary model call, model: ${GLM_MODEL}, desc length: ${description.length}`
        );

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
            console.error(
                `[ai-reason] Primary model error (${upstreamRes.status}):`,
                errorText
            );
            return null; // Signal to use fallback
        }

        const encoder = new TextEncoder();
        const decoder = new TextDecoder();
        let fullContent = "";

        const readable = new ReadableStream({
            async start(controller) {
                const reader = upstreamRes.body?.getReader();
                if (!reader) {
                    controller.enqueue(
                        encoder.encode(
                            `data: ${JSON.stringify({ type: "error", message: "No stream body" })}\n\n`
                        )
                    );
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
                            if (!trimmed || !trimmed.startsWith("data: "))
                                continue;

                            const payload = trimmed.slice(6);
                            if (payload === "[DONE]") break;

                            try {
                                const chunk = JSON.parse(payload);
                                const delta = chunk.choices?.[0]?.delta;
                                if (delta) {
                                    const reasoning =
                                        delta.reasoning_content || "";
                                    const content = delta.content || "";

                                    if (reasoning) {
                                        controller.enqueue(
                                            encoder.encode(
                                                `data: ${JSON.stringify({ type: "reasoning", text: reasoning })}\n\n`
                                            )
                                        );
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
                        controller.enqueue(
                            encoder.encode(
                                `data: ${JSON.stringify({ type: "extraction", ...parsed })}\n\n`
                            )
                        );
                    } else {
                        controller.enqueue(
                            encoder.encode(
                                `data: ${JSON.stringify({ type: "error", message: "Could not parse AI output. Try rephrasing." })}\n\n`
                            )
                        );
                    }

                    controller.enqueue(
                        encoder.encode(
                            `data: ${JSON.stringify({ type: "done" })}\n\n`
                        )
                    );
                } catch (err: any) {
                    controller.enqueue(
                        encoder.encode(
                            `data: ${JSON.stringify({ type: "error", message: err?.message || "Stream failed" })}\n\n`
                        )
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
    } catch (err: any) {
        console.error("[ai-reason] Primary model exception:", err.message);
        return null;
    }
}

/** Build a fallback SSE stream using AnythingLLM (non-streaming, but we simulate progress steps) */
async function buildFallbackStream(description: string): Promise<Response> {
    const encoder = new TextEncoder();

    const readable = new ReadableStream({
        async start(controller) {
            const send = (data: any) => {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
            };

            // Tell the client this is fallback mode
            send({ type: "fallback", message: "Primary AI model unavailable — using fallback extraction" });

            // Stream progress steps so the user sees activity
            const steps = [
                "Reading project description...",
                "Identifying venue type and client details...",
                "Extracting display specifications (dimensions, pixel pitch, type)...",
                "Determining environment, installation type, and labor requirements...",
                "Mapping display types to standard categories...",
                "Building structured estimate data...",
            ];

            for (const step of steps) {
                send({ type: "reasoning", text: step + "\n" });
                // Small delay between steps so it doesn't flash instantly
                await sleep(400);
            }

            try {
                // Call AnythingLLM for the actual extraction
                const response = await queryVault(FALLBACK_WORKSPACE, description, "chat");

                if (!response || response.startsWith("Error")) {
                    send({ type: "reasoning", text: "\nFallback model also failed to respond.\n" });
                    send({ type: "error", message: "Both AI models are unavailable. Please try again later." });
                    controller.close();
                    return;
                }

                send({ type: "reasoning", text: "Parsing extraction results...\n" });

                const parsed = parseExtraction(response);

                if (parsed) {
                    send({ type: "reasoning", text: "Extraction complete.\n" });
                    send({ type: "extraction", ...parsed });
                } else {
                    send({ type: "reasoning", text: "Could not parse a structured result from the fallback model.\n" });
                    send({ type: "error", message: "Fallback AI couldn't extract project data. Try being more specific." });
                }

                send({ type: "done" });
            } catch (err: any) {
                send({ type: "error", message: err?.message || "Fallback extraction failed" });
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

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
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
