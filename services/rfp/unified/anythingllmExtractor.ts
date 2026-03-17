/**
 * AnythingLLM Agent Extractor (Fallback)
 *
 * Uploads PDF to AnythingLLM, embeds it, then uses @agent mode
 * to extract LED displays. Uses whatever LLM is configured in
 * AnythingLLM (currently GLM 4.7 via Z.AI).
 *
 * Proven to get 43/43 on BOA Stadium RFP.
 */

import type { ExtractedLEDSpec, ExtractedProjectInfo } from "./types";
import { ANYTHING_LLM_BASE_URL, ANYTHING_LLM_KEY } from "@/lib/variables";
import { readFile } from "fs/promises";
import path from "path";

const INTERNAL_ALM_URL = "http://basheer_anything-llm:3001/api/v1";

// ---------------------------------------------------------------------------
// Resolve AnythingLLM URL
// ---------------------------------------------------------------------------

let resolvedUrl: string | null = null;

async function getAlmUrl(): Promise<string> {
  if (resolvedUrl) return resolvedUrl;
  try {
    const res = await fetch(`${INTERNAL_ALM_URL}/auth`, {
      method: "GET",
      headers: { Authorization: `Bearer ${ANYTHING_LLM_KEY}` },
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) { resolvedUrl = INTERNAL_ALM_URL; return resolvedUrl; }
  } catch {}
  resolvedUrl = ANYTHING_LLM_BASE_URL!;
  return resolvedUrl;
}

// ---------------------------------------------------------------------------
// System prompt for the workspace
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are an expert AV/Construction RFP Data Extraction Engine. Your sole purpose is to parse bid documents and extract LED display specifications.

CRITICAL DIRECTIVES:
1. END-TO-END EXHAUSTIVE SEARCH: Scan the ENTIRE document. Do not stop after finding the first table. Indoor and Outdoor sections may share the same section number — parse ALL of them.
2. ZERO HALLUCINATION: Only extract data that explicitly exists. Use null for missing values.
3. CONTINUOUS TABLE PARSING: Connect rows across page breaks.
4. NO DEDUPLICATION: Identical names on different rows = separate physical displays.
5. STRICT JSON ONLY: Return only valid JSON. No markdown, no explanations.

You MUST complete the _extraction_log first, then the displays array must match total_displays_counted_in_text.`;

// ---------------------------------------------------------------------------
// Main extraction
// ---------------------------------------------------------------------------

export async function extractWithAnythingLLM(
  pdfPath: string,
  options?: {
    timeout?: number;
    onProgress?: (message: string) => void;
  },
): Promise<{
  screens: ExtractedLEDSpec[];
  project: ExtractedProjectInfo;
  requirements: any[];
  source: "anythingllm";
}> {
  if (!ANYTHING_LLM_BASE_URL || !ANYTHING_LLM_KEY) {
    throw new Error("AnythingLLM not configured");
  }

  const baseUrl = await getAlmUrl();
  const headers = {
    Authorization: `Bearer ${ANYTHING_LLM_KEY}`,
    "Content-Type": "application/json",
  };

  const fileName = path.basename(pdfPath);
  const slug = process.env.ALLM_RFP_WORKSPACE_SLUG || "rfp";

  try {
    console.log(`[ALLMExtractor] Using existing workspace: ${slug}`);

    // 2. Upload PDF
    options?.onProgress?.("Uploading PDF to workspace...");
    const pdfBuffer = await readFile(pdfPath);
    const formData = new FormData();
    const blob = new Blob([pdfBuffer], { type: "application/pdf" });
    formData.append("file", blob, fileName);

    const uploadRes = await fetch(`${baseUrl}/document/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${ANYTHING_LLM_KEY}` },
      body: formData,
    });

    if (!uploadRes.ok) throw new Error(`Upload failed: ${uploadRes.status}`);
    const uploadData = await uploadRes.json();
    const docLocation = uploadData.documents?.[0]?.location;
    if (!docLocation) throw new Error("No document location returned");
    console.log(`[ALLMExtractor] Uploaded: ${docLocation}`);

    // 3. Embed document into workspace
    options?.onProgress?.("Embedding document...");
    const embedRes = await fetch(`${baseUrl}/workspace/${slug}/update-embeddings`, {
      method: "POST",
      headers,
      body: JSON.stringify({ adds: [docLocation] }),
    });

    if (!embedRes.ok) throw new Error(`Embed failed: ${embedRes.status}`);
    console.log(`[ALLMExtractor] Document embedded`);

    // Wait a moment for embedding to complete
    await new Promise((r) => setTimeout(r, 3000));

    // 4. Chat with @agent to extract
    options?.onProgress?.("AI agent analyzing document...");

    const chatPrompt = `@agent Extract ALL LED displays and requirements from the embedded document. Return JSON with this schema:

{
  "_extraction_log": {
    "sections_found": [],
    "anomalies_detected": [],
    "total_displays_counted_in_text": 0,
    "reached_end_of_document": true,
    "step_by_step_verification": ""
  },
  "project": { "name": "", "client": "", "venue": "", "address": "" },
  "displays": [{ "name": "", "location": "", "pixel_pitch_mm": 0, "brightness_nits": 0, "width_ft": "", "height_ft": "", "width_ft_decimal": 0, "height_ft_decimal": 0, "environment": "indoor", "application": "Indoor" }],
  "requirements": [{ "description": "", "category": "technical", "status": "critical" }]
}`;

    const chatRes = await fetch(`${baseUrl}/workspace/${slug}/chat`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        message: chatPrompt,
        mode: "chat",
      }),
      signal: AbortSignal.timeout((options?.timeout || 300) * 1000),
    });

    if (!chatRes.ok) throw new Error(`Chat failed: ${chatRes.status}`);
    const chatData = await chatRes.json();
    const responseText = chatData.textResponse || "";

    // Parse JSON from response
    const jsonStart = responseText.indexOf("{");
    const jsonEnd = responseText.lastIndexOf("}");
    if (jsonStart === -1 || jsonEnd === -1) {
      throw new Error("No JSON in AnythingLLM response");
    }

    const parsed = JSON.parse(responseText.substring(jsonStart, jsonEnd + 1));

    if (parsed._extraction_log) {
      console.log(`[ALLMExtractor] Sections: ${parsed._extraction_log.sections_found?.join(", ")}`);
      console.log(`[ALLMExtractor] Total counted: ${parsed._extraction_log.total_displays_counted_in_text}`);
    }

    const displays = Array.isArray(parsed.displays) ? parsed.displays : [];
    const requirements = Array.isArray(parsed.requirements) ? parsed.requirements : [];

    console.log(`[ALLMExtractor] Extracted ${displays.length} displays, ${requirements.length} requirements`);
    options?.onProgress?.(`Extracted ${displays.length} displays, ${requirements.length} requirements`);

    // Keep workspace alive — it's a permanent workspace, not ephemeral

    return {
      screens: mapToSpecs(displays),
      project: {
        clientName: parsed.project?.client || null,
        projectName: parsed.project?.name || null,
        venue: parsed.project?.venue || null,
        location: parsed.project?.address || null,
        isOutdoor: false,
        isUnionLabor: false,
        bondRequired: false,
        specialRequirements: [],
        schedulePhases: [],
      },
      requirements: requirements.map((r: any) => ({
        description: r.description || "",
        category: r.category || "technical",
        status: r.status || "info",
        date: null,
        sourcePages: [],
        rawText: r.description || "",
      })),
      source: "anythingllm",
    };
  } catch (err: any) {
    console.error(`[ALLMExtractor] Failed:`, err.message);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Map to ExtractedLEDSpec
// ---------------------------------------------------------------------------

function parseFeetInches(str: string): number | null {
  if (!str) return null;
  const match = str.match(/(\d+)[''′]\s*(\d+(?:\s+\d+\/\d+)?)?/);
  if (match) {
    const feet = parseInt(match[1], 10);
    let inches = 0;
    if (match[2]) {
      const parts = match[2].trim().split(/\s+/);
      inches = parseInt(parts[0], 10) || 0;
      if (parts[1]) {
        const frac = parts[1].split("/");
        if (frac.length === 2) inches += parseInt(frac[0], 10) / parseInt(frac[1], 10);
      }
    }
    return Math.round((feet + inches / 12) * 100) / 100;
  }
  const num = parseFloat(str);
  return isNaN(num) ? null : num;
}

function mapToSpecs(displays: any[]): ExtractedLEDSpec[] {
  return displays.map((d, idx) => ({
    name: d.name || `Display ${idx + 1}`,
    location: d.location || d.name || "",
    widthFt: d.width_ft_decimal ?? parseFeetInches(d.width_ft) ?? null,
    heightFt: d.height_ft_decimal ?? parseFeetInches(d.height_ft) ?? null,
    widthPx: null,
    heightPx: null,
    pixelPitchMm: d.pixel_pitch_mm ?? null,
    brightnessNits: d.brightness_nits ?? null,
    environment: (d.environment || "indoor").toLowerCase().includes("outdoor") ? "outdoor" : "indoor",
    quantity: 1,
    serviceType: null,
    mountingType: null,
    maxPowerW: null,
    weightLbs: null,
    specialRequirements: [],
    confidence: 0.9,
    sourcePages: [],
    sourceType: "text" as const,
    citation: "AnythingLLM Agent",
    notes: null,
    isAlternate: false,
    alternateDescription: null,
    selectedProductId: null,
    selectedProductName: null,
  }));
}

export function isAnythingLLMAvailable(): boolean {
  return !!(ANYTHING_LLM_BASE_URL && ANYTHING_LLM_KEY);
}
