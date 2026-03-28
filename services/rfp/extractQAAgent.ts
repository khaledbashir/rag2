/**
 * Extract QA Agent — Reviews and fixes extraction results.
 *
 * Pipeline: OpenClaw → MiMo → Z.AI → skip (non-blocking)
 * No single model dependency. If one fails, try the next.
 * 30s timeout per attempt. Never hangs the pipeline.
 */

import type { ExtractedLEDSpec } from "./unified/types";

const OPENCLAW_BRIDGE_URL = process.env.OPENCLAW_BRIDGE_URL || "http://172.17.0.1:18790";
const OPENCLAW_TOKEN = process.env.OPENCLAW_TOKEN || "";
const Z_AI_API_KEY = process.env.Z_AI_API_KEY || "";
const Z_AI_MODEL = process.env.QA_MODEL || "glm-5-turbo";
const Z_AI_BASE_URL = process.env.Z_AI_BASE_URL || "https://api.z.ai/api/coding/paas/v4";
const MIMO_API_KEY = process.env.MIMO_API_KEY || "";
const MIMO_MODEL = process.env.MIMO_MODEL || "mimo-v2-pro";
const MIMO_BASE_URL = process.env.MIMO_API_BASE || "https://api.xiaomimimo.com/v1";

const QA_TIMEOUT_MS = 30_000;

// ── Scout: find LED pages in large documents ──

export interface ScoutResult {
  ledPages: number[];
  totalPages: number;
  reason: string;
}

export async function scoutLedPages(
  sourceText: string,
  totalPages: number,
  onProgress?: (msg: string) => void,
): Promise<ScoutResult> {
  if (!Z_AI_API_KEY || sourceText.length < 100) {
    return { ledPages: [], totalPages, reason: "No API key or no text" };
  }

  onProgress?.("Extract: scanning for LED pages...");

  const pages = sourceText.split("\f").filter(p => p.trim());
  const summaries = pages.map((p, i) => `Page ${i + 1}: ${p.trim().substring(0, 300).replace(/\n/g, " ")}`).join("\n");

  const prompt = `You are Extract — scanning a ${totalPages}-page construction document to find LED display pages.

Which pages contain LED display specification TABLES with dimensions, pixel pitch, brightness values? Not pages that just mention "LED" in passing — pages with actual data tables.

Return ONLY JSON: {"ledPages": [page numbers], "reason": "brief explanation"}

Page summaries:
${summaries.substring(0, 60000)}`;

  try {
    const res = await fetch(`${Z_AI_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${Z_AI_API_KEY}` },
      body: JSON.stringify({ model: Z_AI_MODEL, messages: [{ role: "user", content: prompt }], temperature: 0, max_tokens: 2048 }),
      signal: AbortSignal.timeout(QA_TIMEOUT_MS),
    });

    if (!res.ok) return { ledPages: [], totalPages, reason: `API error ${res.status}` };

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || "";
    const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
    const si = cleaned.indexOf("{");
    const ei = cleaned.lastIndexOf("}") + 1;
    if (si < 0 || ei <= si) return { ledPages: [], totalPages, reason: "No JSON returned" };

    const result = JSON.parse(cleaned.substring(si, ei));
    const ledPages = result.ledPages || [];

    console.log(`[ExtractScout] Found ${ledPages.length} LED pages out of ${totalPages}: ${ledPages.join(", ")}`);
    onProgress?.(`Extract: found ${ledPages.length} LED pages out of ${totalPages}`);

    return { ledPages, totalPages, reason: result.reason || "" };
  } catch (err: any) {
    console.error(`[ExtractScout] Failed:`, err.message);
    return { ledPages: [], totalPages, reason: err.message };
  }
}

// ── QA: review and fix extraction results ──

export interface QAResult {
  correctedDisplays: ExtractedLEDSpec[];
  changes: string[];
  verified: boolean;
  message: string;
}

function buildQAPrompt(displays: ExtractedLEDSpec[], sourceText: string, filename: string): string {
  const displayList = displays.map((d, i) =>
    `${i + 1}. ${d.name} | ${d.widthFt ?? "?"}' x ${d.heightFt ?? "?"}' | ${d.pixelPitchMm ?? "?"}mm | ${d.brightnessNits ?? "?"} nits | ${d.environment}`
  ).join("\n");

  return `You are Extract — the QA manager for LED display extraction. Review EVERY row against the source text and fix anything wrong.

FILENAME: ${filename}
EXTRACTED DISPLAYS (${displays.length}):
${displayList}

SOURCE TEXT:
${sourceText.substring(0, 60000)}

TASKS:
1. Check every display name matches the source exactly
2. Check every dimension matches the source exactly (watch for width/height swaps — ribbons are wide and short)
3. Check pixel pitch and brightness match
4. Check environment (indoor/outdoor) is correct
5. Find any displays in the source that are MISSING from the extracted list
6. Find any DUPLICATE rows — BUT BE VERY CAREFUL:
   - A TRUE duplicate is the EXACT SAME physical display listed twice (same name, same dimensions, same specs)
   - Multiple displays with the SAME NAME but DIFFERENT dimensions are NOT duplicates — they are different screens (e.g., 7 different "Panthers Den" screens of different sizes)
   - Multiple displays with the SAME NAME and SAME dimensions ARE legitimate if the source lists them separately (e.g., 4x "Elev Lobby" at 6'x4' each)
   - When in doubt, KEEP the row. It is far worse to remove a real display than to leave a duplicate.
   - Count how many unique displays the source document describes. Your final count should MATCH that number.

Return ONLY a JSON object:
{
  "corrections": [
    {"index": 0, "field": "name", "from": "OPS UNIT", "to": "DEF UNIT", "reason": "Source says DEF UNIT not OPS UNIT"},
    {"index": 2, "field": "widthFt", "from": 16, "to": 200, "reason": "Source shows 200' x 3' for FIELD RIBBON WEST, 16 is North Club's width"}
  ],
  "missing": [
    {"name": "LARGE ADMIN ROOM", "widthFt": 28, "heightFt": 8, "pixelPitchMm": 3.9, "brightnessNits": 4000, "environment": "indoor", "reason": "Present in source but not in extracted list"}
  ],
  "duplicates": [3],
  "verified": true,
  "totalExpected": 47,
  "message": "Fixed 2 values, added 1 missing display, removed 0 duplicates. 47/47 verified."
}

IMPORTANT: Only put indices in "duplicates" if you are 100% certain that row is an exact copy of another row already in the list. If the source says there are N unique displays, your final count (extracted - duplicates + missing) must equal N. Never remove rows that would make the count go BELOW what the source document describes.

If everything is correct, return:
{"corrections": [], "missing": [], "duplicates": [], "verified": true, "totalExpected": 47, "message": "All 47 displays verified against source. Ready for Natalia."}`;
}

function parseQAResponse(text: string, displays: ExtractedLEDSpec[]): QAResult | null {
  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const si = cleaned.indexOf("{");
  const ei = cleaned.lastIndexOf("}") + 1;
  if (si < 0 || ei <= si) return null;

  try {
    const qa = JSON.parse(cleaned.substring(si, ei));
    const changes: string[] = [];
    const corrected = [...displays];

    if (qa.corrections && Array.isArray(qa.corrections)) {
      for (const fix of qa.corrections) {
        if (fix.index >= 0 && fix.index < corrected.length && fix.field && fix.to != null) {
          const spec = corrected[fix.index] as any;
          const oldVal = spec[fix.field];
          spec[fix.field] = fix.to;
          changes.push(`Fixed row ${fix.index + 1} "${corrected[fix.index].name}": ${fix.field} ${oldVal} → ${fix.to} (${fix.reason})`);
        }
      }
    }

    if (qa.missing && Array.isArray(qa.missing)) {
      for (const missing of qa.missing) {
        corrected.push({
          name: missing.name || "Unknown",
          location: missing.name || "",
          widthFt: missing.widthFt ?? null,
          heightFt: missing.heightFt ?? null,
          widthPx: null, heightPx: null,
          pixelPitchMm: missing.pixelPitchMm ?? null,
          brightnessNits: missing.brightnessNits ?? null,
          environment: missing.environment === "outdoor" ? "outdoor" : "indoor",
          quantity: 1,
          serviceType: null, mountingType: null, maxPowerW: null, weightLbs: null,
          specialRequirements: [], confidence: 0.9, sourcePages: [],
          sourceType: "text", citation: "Extract QA — added missing display",
          notes: `QA: ${missing.reason}`, isAlternate: false, alternateDescription: null,
          selectedProductId: null, selectedProductName: null,
        });
        changes.push(`Added missing: "${missing.name}" (${missing.reason})`);
      }
    }

    if (qa.duplicates && Array.isArray(qa.duplicates)) {
      const dupeIndices = [...qa.duplicates].sort((a, b) => b - a);
      for (const idx of dupeIndices) {
        if (idx >= 0 && idx < corrected.length) {
          changes.push(`Removed duplicate row ${idx + 1}: "${corrected[idx].name}"`);
          corrected.splice(idx, 1);
        }
      }
    }

    const message = qa.message || (changes.length > 0
      ? `Extract QA: ${changes.length} changes applied. ${corrected.length} displays.`
      : `Extract QA: verified ${corrected.length} displays. No changes needed.`);

    return { correctedDisplays: corrected, changes, verified: qa.verified ?? changes.length === 0, message };
  } catch {
    return null;
  }
}

async function callOpenClawQA(prompt: string): Promise<string | null> {
  try {
    const res = await fetch(`${OPENCLAW_BRIDGE_URL}/qa`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENCLAW_TOKEN}` },
      body: JSON.stringify({ prompt }),
      signal: AbortSignal.timeout(QA_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.text || data.content || data.response || null;
  } catch {
    return null;
  }
}

async function callMiMoQA(prompt: string): Promise<string | null> {
  if (!MIMO_API_KEY) return null;
  try {
    const res = await fetch(`${MIMO_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${MIMO_API_KEY}` },
      body: JSON.stringify({ model: MIMO_MODEL, messages: [{ role: "user", content: prompt }], temperature: 0, max_tokens: 8192, response_format: { type: "json_object" } }),
      signal: AbortSignal.timeout(QA_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.choices?.[0]?.message?.content || null;
  } catch {
    return null;
  }
}

async function callZAIQA(prompt: string): Promise<string | null> {
  if (!Z_AI_API_KEY) return null;
  try {
    const res = await fetch(`${Z_AI_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${Z_AI_API_KEY}` },
      body: JSON.stringify({ model: Z_AI_MODEL, messages: [{ role: "user", content: prompt }], temperature: 0, max_tokens: 8192 }),
      signal: AbortSignal.timeout(QA_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.choices?.[0]?.message?.content || null;
  } catch {
    return null;
  }
}

export async function runExtractQA(
  displays: ExtractedLEDSpec[],
  sourceText: string,
  filename: string,
  onProgress?: (msg: string) => void,
): Promise<QAResult> {
  if (displays.length === 0 || sourceText.length < 100) {
    return { correctedDisplays: displays, changes: [], verified: false, message: "QA skipped — no displays or no source text" };
  }

  onProgress?.("Extract QA: reviewing all displays against source...");

  const prompt = buildQAPrompt(displays, sourceText, filename);

  // Try OpenClaw → MiMo → Z.AI
  const openclawResult = await callOpenClawQA(prompt);
  if (openclawResult) {
    console.log("[ExtractQA] OpenClaw QA responded");
    const parsed = parseQAResponse(openclawResult, displays);
    if (parsed) {
      onProgress?.(`QA: ${parsed.message}`);
      return parsed;
    }
  }

  const mimoResult = await callMiMoQA(prompt);
  if (mimoResult) {
    console.log("[ExtractQA] MiMo QA responded");
    const parsed = parseQAResponse(mimoResult, displays);
    if (parsed) {
      onProgress?.(`QA: ${parsed.message}`);
      return parsed;
    }
  }

  const zaiResult = await callZAIQA(prompt);
  if (zaiResult) {
    console.log("[ExtractQA] Z.AI QA responded");
    const parsed = parseQAResponse(zaiResult, displays);
    if (parsed) {
      onProgress?.(`QA: ${parsed.message}`);
      return parsed;
    }
  }

  console.log("[ExtractQA] All QA models unavailable — skipping");
  return { correctedDisplays: displays, changes: [], verified: false, message: "QA skipped — no AI model available" };
}
