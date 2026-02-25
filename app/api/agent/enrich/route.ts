import { NextRequest, NextResponse } from "next/server";
import { queryAgent } from "@/lib/anything-llm";
import { extractJson } from "@/lib/json-utils";
import { searchVenueAddress } from "@/lib/serper";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { query, targetFields, proposalId } = body;

        const fields = Array.isArray(targetFields)
            ? targetFields.filter((f: unknown): f is string => typeof f === "string" && f.trim().length > 0)
            : [];

        if (typeof query !== "string" || query.trim().length === 0) {
            return NextResponse.json({ error: "Query is required" }, { status: 400 });
        }

        if (fields.length === 0) {
            return NextResponse.json({ error: "targetFields is required" }, { status: 400 });
        }

        // Use per-project workspace if proposalId provided, else fallback
        let workspace = process.env.ANYTHING_LLM_WORKSPACE || "researcher";
        
        if (proposalId) {
            try {
                const { prisma } = await import("@/lib/prisma");
                const proposal = await prisma.proposal.findUnique({
                    where: { id: proposalId },
                    select: { aiWorkspaceSlug: true }
                });
                if (proposal?.aiWorkspaceSlug) {
                    workspace = proposal.aiWorkspaceSlug;
                    console.log(`[AI Wand] Using project workspace: ${workspace}`);
                } else {
                    console.log(`[AI Wand] No project workspace found for ${proposalId}, using fallback: ${workspace}`);
                }
            } catch (e) {
                console.warn(`[AI Wand] Failed to lookup project workspace for ${proposalId}: ${e instanceof Error ? e.message : String(e)}`);
            }
        }

        const getByPath = (obj: unknown, path: string) => {
            if (!obj || typeof obj !== "object") return undefined;
            return path.split(".").reduce<unknown>((acc, key) => {
                if (!acc || typeof acc !== "object") return undefined;
                return (acc as Record<string, unknown>)[key];
            }, obj);
        };

        const normalizeQuery = (input: string) => {
            const tokens = input
                .toLowerCase()
                .replace(/\s+/g, " ")
                .trim()
                .split(" ")
                .map((t) => t.trim())
                .filter(Boolean)
                .map((t) => {
                    if (t === "kin") return "king";
                    if (t === "staduim") return "stadium";
                    if (t === "stadim") return "stadium";
                    if (t === "staduim,") return "stadium";
                    return t;
                });
            return tokens.join(" ");
        };

        const normalizedQuery = normalizeQuery(query);



        // ---- FAST PATH: Serper web search first (< 2 seconds) ----
        // This is the primary path. LLM @agent mode is slow (15-30s+) and often times out.
        console.log("[Enrich] Trying fast Serper search first for:", normalizedQuery);
        const serperResults = await searchVenueAddress(normalizedQuery, fields);
        if (serperResults && Object.keys(serperResults).length > 0) {
            const candidate = {
                label: normalizedQuery,
                confidence: 0.85,
                notes: "Found via web search",
                results: serperResults,
            };
            console.log("[Enrich] Serper returned results:", Object.keys(serperResults).join(", "));
            return NextResponse.json({
                ok: true,
                correctedQuery: normalizedQuery,
                candidates: [candidate],
                results: serperResults,
            });
        }

        // ---- SLOW PATH: LLM @agent mode (only if Serper fails or no API key) ----
        console.log("[Enrich] Serper returned nothing, falling back to LLM agent for:", normalizedQuery);

        const keysJson = JSON.stringify(fields);

        const prompt = `The user provided a venue/client query that may contain typos: "${query}".

Use web search to find the official address and venue information, then cross-reference with any RFP documents in this workspace.

Return ONLY valid JSON with this exact shape:
{
  "correctedQuery": "string",
  "candidates": [
    {
      "label": "string",
      "confidence": 0.0,
      "notes": "string",
      "results": { ${fields.map((f) => `"${f}": ""`).join(", ")} }
    }
  ]
}

Rules:
- Use these exact keys inside results: ${keysJson}
- Each results value must be a string (or empty string if unknown)
- If ambiguous (multiple similarly named venues), include multiple candidates
- Do not include any text outside JSON
- Cite your sources (web search results or RFP documents)

Search target: "${normalizedQuery}"`;

        const ask = async (p: string) => {
            // Use @agent mode for web search + RAG capabilities
            const textResponse = await queryAgent(workspace, p);
            const jsonText = extractJson(textResponse);
            return jsonText;
        };

        const jsonText = (await ask(prompt)) ?? (await ask(`${prompt}\n\nReturn JSON only. No markdown. No analysis.`));

        try {
            if (!jsonText) {
                return NextResponse.json({ ok: false, error: "Could not find venue details" }, { status: 404 });
            }

            // Attempt to repair truncated JSON if it looks like a tool call or just broken
            let safeJsonText = jsonText
                .replace(/[“”]/g, '"')
                .replace(/[‘’]/g, "'");

            // Simple repair: if it ends with " or similar, try to close it
            // (This is a basic heuristic, better to rely on robust AI response)

            let parsed: unknown;
            try {
                parsed = JSON.parse(safeJsonText);
            } catch (e) {
                console.warn(`[Enrich] JSON parse failed (${e instanceof Error ? e.message : 'unknown'}), trying to repair. First 200 chars: ${safeJsonText.slice(0, 200)}`);
                // Try appending braces if it looks like it's missing them
                try {
                    parsed = JSON.parse(safeJsonText + "}");
                } catch (e2) {
                    try {
                        parsed = JSON.parse(safeJsonText + "}}");
                    } catch (e3) {
                        throw e; // Original error
                    }
                }
            }

            if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
                // Check if it's a tool call response that we should ignore or handle
                if ((parsed as any)?.name && (parsed as any)?.arguments) {
                    return NextResponse.json({ ok: false, error: "AI is performing a search, please try again in a moment." }, { status: 404 });
                }
                return NextResponse.json({ ok: false, error: "AI response was not an object" }, { status: 404 });
            }

            const payload = parsed as Record<string, unknown>;
            const correctedQuery = typeof payload.correctedQuery === "string" && payload.correctedQuery.trim().length > 0
                ? payload.correctedQuery.trim()
                : normalizedQuery;

            const rawCandidates = Array.isArray(payload.candidates) ? payload.candidates : [];
            const candidates = rawCandidates
                .filter((c) => c && typeof c === "object" && !Array.isArray(c))
                .map((c: any) => {
                    const resultsObj = (c?.results && typeof c.results === "object" && !Array.isArray(c.results)) ? c.results : {};
                    const cleanedResults: Record<string, string> = {};
                    for (const field of fields) {
                        const direct = resultsObj[field];
                        const nested = getByPath(resultsObj, field);
                        const lastKey = field.includes(".") ? field.split(".").at(-1) : undefined;
                        const shallow = lastKey ? resultsObj[lastKey] : undefined;

                        const value = direct ?? nested ?? shallow;
                        if (value === undefined || value === null) continue;
                        const normalized = typeof value === "string" ? value.trim() : String(value).trim();
                        if (normalized.length === 0) continue;
                        cleanedResults[field] = normalized;
                    }

                    const label = typeof c?.label === "string" && c.label.trim().length > 0 ? c.label.trim() : correctedQuery;
                    const confidence = Number(c?.confidence);
                    const notes = typeof c?.notes === "string" ? c.notes.trim() : "";
                    return {
                        label,
                        confidence: Number.isFinite(confidence) ? confidence : 0,
                        notes,
                        results: cleanedResults,
                    };
                })
                .filter((c) => Object.keys(c.results).length > 0)
                .sort((a, b) => b.confidence - a.confidence)
                .slice(0, 5);

            if (candidates.length === 0) {
                // LLM returned no usable candidates - try Serper fallback
                console.log("[Enrich] LLM returned no candidates, trying Serper fallback for:", normalizedQuery);
                const serperResults = await searchVenueAddress(normalizedQuery, fields);
                if (serperResults && Object.keys(serperResults).length > 0) {
                    const candidate = {
                        label: normalizedQuery,
                        confidence: 0.75,
                        notes: "Found via web search",
                        results: serperResults,
                    };
                    return NextResponse.json({
                        ok: true,
                        correctedQuery: normalizedQuery,
                        candidates: [candidate],
                        results: serperResults,
                    });
                }
                return NextResponse.json({ ok: false, error: "Could not find venue details" }, { status: 404 });
            }

            const response: any = { ok: true, correctedQuery, candidates };
            if (candidates.length === 1) response.results = candidates[0].results;
            return NextResponse.json(response);
        } catch (e) {
            console.error("AI Enrichment JSON Parse Error:", e);
            // JSON parsing failed - try Serper fallback
            console.log("[Enrich] JSON parse failed, trying Serper fallback for:", normalizedQuery);
            const serperResults = await searchVenueAddress(normalizedQuery, fields);
            if (serperResults && Object.keys(serperResults).length > 0) {
                const candidate = {
                    label: normalizedQuery,
                    confidence: 0.70,
                    notes: "Found via web search (LLM parsing failed)",
                    results: serperResults,
                };
                return NextResponse.json({
                    ok: true,
                    correctedQuery: normalizedQuery,
                    candidates: [candidate],
                    results: serperResults,
                });
            }
        }

        return NextResponse.json({ ok: false, error: "Could not find venue details" }, { status: 404 });
    } catch (error: any) {
        console.error("Enrichment API error:", error);
        return NextResponse.json({ error: error?.message || String(error) }, { status: 500 });
    }
}
