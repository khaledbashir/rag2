/**
 * Extract QA Agent — Reviews and fixes extraction results automatically.
 *
 * Runs after every extraction. Compares extracted displays against the
 * source PDF text, fixes wrong values, adds missing displays, removes
 * duplicates. Reports every change.
 *
 * This is the last line of defense before Natalia sees the data.
 */

import type { ExtractedLEDSpec } from "./unified/types";

// QA uses a DIFFERENT model than extraction — different architecture catches different errors
// Primary: GLM-5 Turbo via Z.AI. Fallback: MiMo-V2-Omni.
const QA_API_KEY = process.env.Z_AI_API_KEY || "";
const QA_MODEL = process.env.QA_MODEL || "glm-5-turbo";
const QA_BASE_URL = process.env.Z_AI_BASE_URL || "https://api.z.ai/api/coding/paas/v4";
const MIMO_QA_KEY = process.env.MIMO_API_KEY || "";
const MIMO_QA_MODEL = process.env.MIMO_MODEL || "mimo-v2-omni";
const MIMO_QA_BASE = process.env.MIMO_API_BASE || "https://api.xiaomimimo.com/v1";

// ── PHASE 1: Scout — find LED pages in large documents ──

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
  if (!QA_API_KEY || sourceText.length < 100) {
    return { ledPages: [], totalPages, reason: "No API key or no text" };
  }

  onProgress?.("Extract: scanning for LED pages...");

  // Build page summaries — first 300 chars per page
  const pages = sourceText.split("\f").filter(p => p.trim());
  const summaries = pages.map((p, i) => `Page ${i + 1}: ${p.trim().substring(0, 300).replace(/\n/g, " ")}`).join("\n");

  const prompt = `You are Extract — scanning a ${totalPages}-page construction document to find LED display pages.

Which pages contain LED display specification TABLES with dimensions, pixel pitch, brightness values? Not pages that just mention "LED" in passing — pages with actual data tables.

Return ONLY JSON: {"ledPages": [page numbers], "reason": "brief explanation"}

Page summaries:
${summaries.substring(0, 60000)}`;

  try {
    const res = await fetch(`${QA_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${QA_API_KEY}` },
      body: JSON.stringify({ model: QA_MODEL, messages: [{ role: "user", content: prompt }], temperature: 0, max_tokens: 2048 }),
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

// ── PHASE 2: QA — review and fix extraction results ──

export interface QAResult {
  correctedDisplays: ExtractedLEDSpec[];
  changes: string[];
  verified: boolean;
  message: string;
}

export async function runExtractQA(
  displays: ExtractedLEDSpec[],
  sourceText: string,
  filename: string,
  onProgress?: (msg: string) => void,
): Promise<QAResult> {
  if (!QA_API_KEY || displays.length === 0 || sourceText.length < 100) {
    return {
      correctedDisplays: displays,
      changes: [],
      verified: false,
      message: "QA skipped — no API key, no displays, or no source text",
    };
  }

  onProgress?.("Extract QA: reviewing all displays against source...");

  // Build the display list for review
  const displayList = displays.map((d, i) =>
    `${i + 1}. ${d.name} | ${d.widthFt ?? "?"}' x ${d.heightFt ?? "?"}' | ${d.pixelPitchMm ?? "?"}mm | ${d.brightnessNits ?? "?"} nits | ${d.environment}`
  ).join("\n");

  const prompt = `You are Extract — the QA manager for LED display extraction. Review EVERY row against the source text and fix anything wrong.

FILENAME: ${filename}
EXTRACTED DISPLAYS (${displays.length}):
${displayList}

SOURCE TEXT:
${sourceText.substring(0, 60000)}

TASKS:
1. Check every display name matches the source exactly
2. Check every dimension matches the source exactly
3. Check pixel pitch and brightness match
4. Check environment (indoor/outdoor) is correct
5. Find any displays in the source that are MISSING from the extracted list
6. Find any DUPLICATE or FABRICATED rows in the extracted list

Return ONLY a JSON object:
{
  "corrections": [
    {"index": 0, "field": "name", "from": "OPS UNIT", "to": "DEF UNIT", "reason": "Source says DEF UNIT not OPS UNIT"},
    {"index": 2, "field": "widthFt", "from": 16, "to": 200, "reason": "Source shows 200' x 3' for FIELD RIBBON WEST, 16 is North Club's width"},
  ],
  "missing": [
    {"name": "LARGE ADMIN ROOM", "widthFt": 28, "heightFt": 8, "pixelPitchMm": 3.9, "brightnessNits": 4000, "environment": "indoor", "reason": "Present in source at LED.200.D.01 but not in extracted list"}
  ],
  "duplicates": [3],
  "verified": true,
  "totalExpected": 47,
  "message": "Fixed 2 values, added 1 missing display, removed 0 duplicates. 47/47 verified."
}

If everything is correct, return:
{"corrections": [], "missing": [], "duplicates": [], "verified": true, "totalExpected": 47, "message": "All 47 displays verified against source. Ready for Natalia."}`;

  const QA_TIMEOUT_MS = 120_000; // 2 minutes max — don't let QA hang the pipeline

  try {
    const res = await fetch(`${QA_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${QA_API_KEY}`,
      },
      body: JSON.stringify({
        model: QA_MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0,
        max_tokens: 8192,
      }),
      signal: AbortSignal.timeout(QA_TIMEOUT_MS),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error(`[ExtractQA] ${QA_MODEL} error ${res.status}:`, err.substring(0, 200));
      return { correctedDisplays: displays, changes: [], verified: false, message: `QA API error: ${res.status}` };
    }

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || "";
    const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
    const si = cleaned.indexOf("{");
    const ei = cleaned.lastIndexOf("}") + 1;

    if (si < 0 || ei <= si) {
      return { correctedDisplays: displays, changes: [], verified: false, message: "QA returned no valid JSON" };
    }

    const qa = JSON.parse(cleaned.substring(si, ei));
    const changes: string[] = [];
    const corrected = [...displays];

    // Apply corrections
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

    // Add missing displays
    if (qa.missing && Array.isArray(qa.missing)) {
      for (const missing of qa.missing) {
        corrected.push({
          name: missing.name || "Unknown",
          location: missing.name || "",
          widthFt: missing.widthFt ?? null,
          heightFt: missing.heightFt ?? null,
          widthPx: null,
          heightPx: null,
          pixelPitchMm: missing.pixelPitchMm ?? null,
          brightnessNits: missing.brightnessNits ?? null,
          environment: missing.environment === "outdoor" ? "outdoor" : "indoor",
          quantity: 1,
          serviceType: null,
          mountingType: null,
          maxPowerW: null,
          weightLbs: null,
          specialRequirements: [],
          confidence: 0.9,
          sourcePages: [],
          sourceType: "text",
          citation: "Extract QA — added missing display",
          notes: `QA: ${missing.reason}`,
          isAlternate: false,
          alternateDescription: null,
          selectedProductId: null,
          selectedProductName: null,
        });
        changes.push(`Added missing: "${missing.name}" (${missing.reason})`);
      }
    }

    // Remove duplicates (process in reverse order to keep indices stable)
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

    console.log(`[ExtractQA] ${message}`);
    onProgress?.(`QA: ${message}`);

    return {
      correctedDisplays: corrected,
      changes,
      verified: qa.verified ?? changes.length === 0,
      message,
    };
  } catch (err: any) {
    console.error(`[ExtractQA] Failed:`, err.message);
    return { correctedDisplays: displays, changes: [], verified: false, message: `QA failed: ${err.message}` };
  }
}
