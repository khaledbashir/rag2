/**
 * POST /api/estimator/ai-reason
 *
 * AI Reasoning Estimate — Uses GLM-5 (Z.AI) with streaming to:
 * 1. Stream reasoning tokens (visible to user as "thinking")
 * 2. Output structured JSON for form filling
 *
 * Input:  { description: string }
 * Output: SSE stream with { reasoning: string } and { content: string } chunks,
 *         final chunk: { done: true, answers: {...}, displays: [...] }
 */

import { NextRequest } from "next/server";

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

        if (!GLM_KEY) {
            return new Response(
                JSON.stringify({
                    error: "AI reasoning model not configured. Set Z_AI_API_KEY env var.",
                }),
                { status: 500, headers: { "Content-Type": "application/json" } }
            );
        }

        console.log(
            `[ai-reason] GLM-5 streaming call, model: ${GLM_MODEL}, desc length: ${description.length}`
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
                    { role: "user", content: description.trim() },
                ],
                stream: true,
                temperature: 0.2,
                max_tokens: 4096,
            }),
        });

        if (!upstreamRes.ok) {
            const errorText = await upstreamRes.text();
            console.error(
                `[ai-reason] GLM error (${upstreamRes.status}):`,
                errorText
            );
            // Surface the actual upstream error so the user sees what went wrong
            let detail = "";
            try {
                const parsed = JSON.parse(errorText);
                detail = parsed?.error?.message || parsed?.message || errorText.slice(0, 200);
            } catch {
                detail = errorText.slice(0, 200);
            }
            return new Response(
                JSON.stringify({ error: `AI model error (${upstreamRes.status}): ${detail}` }),
                {
                    status: upstreamRes.status,
                    headers: { "Content-Type": "application/json" },
                }
            );
        }

        const encoder = new TextEncoder();
        const decoder = new TextDecoder();

        // Accumulate full content to parse JSON at the end
        let fullContent = "";
        let fullReasoning = "";

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
                                        fullReasoning += reasoning;
                                        controller.enqueue(
                                            encoder.encode(
                                                `data: ${JSON.stringify({ type: "reasoning", text: reasoning })}\n\n`
                                            )
                                        );
                                    }
                                    if (content) {
                                        fullContent += content;
                                        // Don't stream raw JSON content — we'll parse it at the end
                                    }
                                }
                            } catch {
                                // skip malformed
                            }
                        }
                    }

                    // Parse the accumulated content as JSON
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

                    // Done signal
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
    } catch (error: any) {
        console.error("[ai-reason] Error:", error);
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
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
