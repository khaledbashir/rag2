/**
 * Llama Vision — NVIDIA NIM API (OpenAI-compatible)
 *
 * Uses Meta's Llama 3.2 Vision models via NVIDIA NIM as:
 * 1. Fallback when Gemini Vision fails on drawing analysis
 * 2. Fallback when Mistral OCR fails on page extraction
 * 3. Load-split partner for large documents (process pages in parallel)
 *
 * Models:
 *   - meta/llama-3.2-90b-vision-instruct  (heavy — drawing analysis)
 *   - meta/llama-3.2-11b-vision-instruct  (fast — simple table/text OCR)
 *
 * Env vars:
 *   NVIDIA_NIM_API_KEY      — API key
 *   NVIDIA_NIM_BASE_URL     — defaults to https://integrate.api.nvidia.com/v1
 *   NVIDIA_NIM_VISION_MODEL — defaults to meta/llama-3.2-90b-vision-instruct
 */

import type { AnalyzedPage, ExtractedLEDSpec } from "./types";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const NIM_BASE_URL =
  process.env.NVIDIA_NIM_BASE_URL || "https://integrate.api.nvidia.com/v1";
const NIM_API_KEY = process.env.NVIDIA_NIM_API_KEY || "";
const NIM_MODEL_HEAVY =
  process.env.NVIDIA_NIM_VISION_MODEL || "meta/llama-3.2-90b-vision-instruct";
const NIM_MODEL_FAST = "meta/llama-3.2-11b-vision-instruct";

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

export function isLlamaVisionAvailable(): boolean {
  return !!NIM_API_KEY;
}

export async function llamaVisionHealthCheck(): Promise<{
  ok: boolean;
  model?: string;
  error?: string;
}> {
  if (!NIM_API_KEY) {
    return { ok: false, error: "NVIDIA_NIM_API_KEY not configured" };
  }

  try {
    const res = await fetch(`${NIM_BASE_URL}/models`, {
      headers: { Authorization: `Bearer ${NIM_API_KEY}` },
      signal: AbortSignal.timeout(5_000),
    });
    if (res.ok) {
      return { ok: true, model: NIM_MODEL_HEAVY };
    }
    return { ok: false, error: `NIM API returned ${res.status}` };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}

// ---------------------------------------------------------------------------
// Core: send image + prompt to Llama Vision (OpenAI-compatible chat endpoint)
// ---------------------------------------------------------------------------

async function llamaVisionChat(
  imageBase64: string,
  systemPrompt: string,
  userPrompt: string,
  model: string = NIM_MODEL_HEAVY,
  maxTokens: number = 4096,
  temperature: number = 0.0,
): Promise<string> {
  if (!NIM_API_KEY) {
    throw new Error("NVIDIA_NIM_API_KEY not set");
  }

  // Strip data URI prefix if present
  const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
  const dataUrl = `data:image/png;base64,${base64Data}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90_000); // 90s timeout

  try {
    const res = await fetch(`${NIM_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${NIM_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "text", text: userPrompt },
              {
                type: "image_url",
                image_url: { url: dataUrl },
              },
            ],
          },
        ],
        max_tokens: maxTokens,
        temperature,
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`NIM API ${res.status}: ${text.slice(0, 300)}`);
    }

    const data = await res.json();
    return data.choices?.[0]?.message?.content || "";
  } catch (err: any) {
    clearTimeout(timer);
    throw new Error(`Llama Vision failed: ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// Text-only chat (for spec extraction from markdown — no image needed)
// ---------------------------------------------------------------------------

async function llamaTextChat(
  systemPrompt: string,
  userPrompt: string,
  model: string = NIM_MODEL_HEAVY,
  maxTokens: number = 8192,
  temperature: number = 0.0,
): Promise<string> {
  if (!NIM_API_KEY) {
    throw new Error("NVIDIA_NIM_API_KEY not set");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120_000);

  try {
    const res = await fetch(`${NIM_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${NIM_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: maxTokens,
        temperature,
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`NIM API ${res.status}: ${text.slice(0, 300)}`);
    }

    const data = await res.json();
    return data.choices?.[0]?.message?.content || "";
  } catch (err: any) {
    clearTimeout(timer);
    throw new Error(`Llama text chat failed: ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// Drawing Analysis (fallback for Gemini)
// ---------------------------------------------------------------------------

const DRAWING_PROMPT = `You are an expert analyzing architectural/engineering drawings for stadium LED display installations.

For the image provided, determine:
1. What type of drawing is it? (architectural, AV/display layout, electrical, structural, elevation, section, detail, other)
2. Does it show or reference LED displays, video boards, ribbon boards, scoreboards, or fascia boards?
3. If LED displays are shown, extract every display you can identify.

Return ONLY a JSON object (no markdown, no explanation):
{
  "drawing_type": "av_layout",
  "shows_led_displays": true,
  "relevance": 85,
  "description": "Arena bowl AV layout showing LED ribbon board locations",
  "displays_found": [
    {
      "name": "Upper Fascia Ribbon",
      "location": "Upper level fascia",
      "width_ft": 1200,
      "height_ft": 3,
      "pixel_pitch_mm": null,
      "environment": "indoor",
      "quantity": 1,
      "mounting_type": "fascia mount",
      "notes": "Continuous ribbon around upper bowl",
      "confidence": 0.8
    }
  ]
}

RULES:
- Only extract displays you can ACTUALLY SEE or that are clearly labeled
- Convert inches to feet (÷12), mm to feet (÷304.8)
- Set confidence 0-1 based on clarity
- If no LED displays, set shows_led_displays: false and displays_found: []`;

export async function analyzeDrawingWithLlama(
  pageImage: string,
  pageNumber: number,
): Promise<{
  success: boolean;
  drawingType?: string;
  showsLed?: boolean;
  relevance?: number;
  description?: string;
  displays?: ExtractedLEDSpec[];
}> {
  if (!NIM_API_KEY) return { success: false };

  try {
    const response = await llamaVisionChat(
      pageImage,
      DRAWING_PROMPT,
      `Analyze this drawing (Page ${pageNumber}). Return ONLY JSON.`,
    );

    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { success: false };

    const parsed = JSON.parse(jsonMatch[0]);

    const displays: ExtractedLEDSpec[] = (parsed.displays_found || []).map(
      (d: any): ExtractedLEDSpec => ({
        name: d.name || "Unknown Display",
        location: d.location || "",
        widthFt: d.width_ft ?? null,
        heightFt: d.height_ft ?? null,
        widthPx: d.width_px ?? null,
        heightPx: d.height_px ?? null,
        pixelPitchMm: d.pixel_pitch_mm ?? null,
        brightnessNits: d.brightness_nits ?? null,
        environment: d.environment === "outdoor" ? "outdoor" : "indoor",
        quantity: d.quantity || 1,
        serviceType: d.service_type ?? null,
        mountingType: d.mounting_type ?? null,
        maxPowerW: null,
        weightLbs: null,
        specialRequirements: d.special_requirements || [],
        confidence: d.confidence ?? 0.5,
        sourcePages: [pageNumber],
        sourceType: "drawing",
        citation: `[Source: Drawing (Llama Vision), Page ${pageNumber}]`,
        notes: d.notes ?? null,
      }),
    );

    return {
      success: true,
      drawingType: parsed.drawing_type,
      showsLed: parsed.shows_led_displays,
      relevance: parsed.relevance,
      description: parsed.description,
      displays,
    };
  } catch (err) {
    console.error(`[LlamaVision] Drawing analysis page ${pageNumber} failed:`, err);
    return { success: false };
  }
}

// ---------------------------------------------------------------------------
// Spec Extraction from text (fallback for Gemini extractSpecsFromText)
// ---------------------------------------------------------------------------

const SPEC_EXTRACTION_PROMPT = `You are the ANC Digital Signage Expert AI. Extract EVERY LED display/screen requirement from the following RFP text.

Return ONLY a JSON object (no markdown, no explanation):
{
  "project": {
    "client_name": null or string,
    "project_name": null or string,
    "venue": null or string,
    "location": null or string,
    "is_outdoor": boolean,
    "is_union": boolean,
    "bond_required": boolean,
    "special_requirements": []
  },
  "screens": [
    {
      "name": "North Main Videoboard",
      "location": "North End Zone",
      "width_ft": 40,
      "height_ft": 22,
      "pixel_pitch_mm": 10,
      "brightness_nits": 6000,
      "environment": "outdoor",
      "quantity": 1,
      "service_type": "rear",
      "mounting_type": "steel structure",
      "confidence": 0.95,
      "source_pages": [9],
      "citation": "[Source: Page 9]",
      "notes": "Primary videoboard"
    }
  ]
}

RULES:
- Extract every display with at least ONE physical spec (dimensions, pitch, or brightness)
- Convert all dimensions to FEET
- Set confidence 0-1 based on clarity
- Do NOT extract section headers or category groupings as displays`;

export async function extractSpecsWithLlama(
  relevantPages: AnalyzedPage[],
): Promise<{
  screens: ExtractedLEDSpec[];
  project: any;
}> {
  if (!NIM_API_KEY) return { screens: [], project: null };

  const combinedText = relevantPages
    .map((p) => {
      let content = `\n--- PAGE ${p.pageNumber} ---\n${p.markdown}`;
      if (p.tables.length > 0) {
        content += "\n\nTABLES:\n";
        for (const t of p.tables) content += `${t.content}\n`;
      }
      return content;
    })
    .join("\n");

  // Llama 3.2 context is smaller than Gemini — truncate more aggressively
  const maxChars = 60_000;
  const textToSend =
    combinedText.length > maxChars
      ? combinedText.slice(0, maxChars) + "\n\n[TRUNCATED]"
      : combinedText;

  try {
    const response = await llamaTextChat(
      SPEC_EXTRACTION_PROMPT,
      textToSend,
      NIM_MODEL_HEAVY,
    );

    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { screens: [], project: null };

    const parsed = JSON.parse(jsonMatch[0]);

    const screens: ExtractedLEDSpec[] = (parsed.screens || []).map(
      (s: any): ExtractedLEDSpec => ({
        name: s.name || "Unknown Display",
        location: s.location || "",
        widthFt: s.width_ft ?? null,
        heightFt: s.height_ft ?? null,
        widthPx: s.width_px ?? null,
        heightPx: s.height_px ?? null,
        pixelPitchMm: s.pixel_pitch_mm ?? null,
        brightnessNits: s.brightness_nits ?? null,
        environment: s.environment === "outdoor" ? "outdoor" : "indoor",
        quantity: s.quantity || 1,
        serviceType: s.service_type ?? null,
        mountingType: s.mounting_type ?? null,
        maxPowerW: s.max_power_w ?? null,
        weightLbs: s.weight_lbs ?? null,
        specialRequirements: s.special_requirements || [],
        confidence: s.confidence ?? 0.5,
        sourcePages: s.source_pages || [],
        sourceType: "text",
        citation: s.citation || "",
        notes: s.notes ?? null,
      }),
    );

    return { screens, project: parsed.project || null };
  } catch (err) {
    console.error("[LlamaVision] Spec extraction failed:", err);
    return { screens: [], project: null };
  }
}
