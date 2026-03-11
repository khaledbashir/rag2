/**
 * Gemini Vision — Drawing Analysis + LED Spec Extraction
 *
 * Uses Gemini 2.0 Flash for two purposes:
 * 1. Analyze drawing pages (what type of drawing, is it relevant?)
 * 2. Extract LED display specs from visual content
 *
 * Only called for pages classified as "drawing" or low-text-high-relevance.
 * Text-heavy pages are handled by the Mistral OCR markdown directly.
 */

import type { AnalyzedPage, ExtractedLEDSpec } from "./types";

const GEMINI_MODEL = "gemini-2.0-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const MAX_IMAGES_PER_BATCH = 10; // Gemini 2.0 Flash handles larger batches fine
const MAX_CONCURRENT_BATCHES = 6; // More parallelism for faster processing

// ---------------------------------------------------------------------------
// Drawing Analysis Prompt
// ---------------------------------------------------------------------------

const DRAWING_ANALYSIS_PROMPT = `You are an ANC Digital LED Display expert analyzing architectural/engineering drawings for stadium and arena LED display installations.

For each image, determine:
1. What type of drawing is it? (architectural, AV/display layout, electrical, structural, elevation, section, detail, other)
2. Does it show or reference LED displays, video boards, ribbon boards, scoreboards, or fascia boards?
3. If LED displays are shown, extract every display you can identify.

Return a JSON array with one object per image:
[
  {
    "image_index": 0,
    "drawing_type": "av_layout",
    "shows_led_displays": true,
    "relevance": 85,
    "description": "Arena bowl AV layout showing LED ribbon board locations around upper fascia",
    "displays_found": [
      {
        "name": "Upper Fascia Ribbon",
        "location": "Upper level fascia, full perimeter",
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
]

RULES:
- Only extract displays you can ACTUALLY SEE or that are clearly labeled in the drawing
- If dimensions are in inches, convert to feet (divide by 12)
- If dimensions are in mm, convert to feet (divide by 304.8)
- Set confidence based on how clearly the display is shown (0-1)
- If a drawing doesn't show LED displays, set shows_led_displays: false and displays_found: []
- Don't guess or fabricate specs that aren't visible`;

// ---------------------------------------------------------------------------
// Analyze drawing pages with Gemini
// ---------------------------------------------------------------------------

export async function analyzeDrawings(
  pages: AnalyzedPage[],
  pageImages: Map<number, string>, // pageIndex → base64 PNG
): Promise<AnalyzedPage[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn("[GeminiVision] GEMINI_API_KEY not set, skipping vision analysis");
    return pages;
  }

  if (pages.length === 0) return pages;

  // Split into batches
  const batches: AnalyzedPage[][] = [];
  for (let i = 0; i < pages.length; i += MAX_IMAGES_PER_BATCH) {
    batches.push(pages.slice(i, i + MAX_IMAGES_PER_BATCH));
  }

  // Process batches with concurrency limit
  const results: AnalyzedPage[] = [];
  for (let i = 0; i < batches.length; i += MAX_CONCURRENT_BATCHES) {
    const concurrent = batches
      .slice(i, i + MAX_CONCURRENT_BATCHES)
      .map((batch) => processBatch(batch, pageImages, apiKey));
    const batchResults = await Promise.all(concurrent);
    results.push(...batchResults.flat());
  }

  return results;
}

async function processBatch(
  pages: AnalyzedPage[],
  pageImages: Map<number, string>,
  apiKey: string,
): Promise<AnalyzedPage[]> {
  // Build Gemini request with interleaved text + images
  const userParts: Array<
    { text: string } | { inlineData: { mimeType: string; data: string } }
  > = [];

  const pagesWithImages: AnalyzedPage[] = [];

  for (let idx = 0; idx < pages.length; idx++) {
    const page = pages[idx];
    const base64 = pageImages.get(page.index);
    if (!base64) {
      // No image available, skip vision for this page
      continue;
    }

    pagesWithImages.push(page);
    userParts.push({ text: `Image ${pagesWithImages.length - 1} (Page ${page.pageNumber}):` });

    // Strip data URI if present
    const data = base64.replace(/^data:image\/\w+;base64,/, "");
    userParts.push({
      inlineData: { mimeType: "image/png", data },
    });
  }

  if (pagesWithImages.length === 0) return pages;

  userParts.push({
    text: `Analyze these ${pagesWithImages.length} drawing(s). Return a JSON array with one object per image.`,
  });

  const GEMINI_TIMEOUT_MS = 120_000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

  try {
    const response = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: DRAWING_ANALYSIS_PROMPT }] },
        contents: [{ role: "user", parts: userParts }],
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 16384, // Larger output for bigger batches
          responseMimeType: "text/plain",
        },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const err = await response.text();
      console.error(`[GeminiVision] API error ${response.status}: ${err.slice(0, 200)}`);
      return pages;
    }

    const json = await response.json();
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text || "[]";

    // Parse JSON from response
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.error("[GeminiVision] No JSON array in response:", text.slice(0, 200));
      return pages;
    }

    const parsed: any[] = JSON.parse(jsonMatch[0]);

    // Merge vision results back into pages
    const updatedPages = [...pages];
    for (const item of parsed) {
      const idx = typeof item.image_index === "number" ? item.image_index : 0;
      const page = pagesWithImages[idx];
      if (!page) continue;

      // Find this page in the full array
      const fullIdx = updatedPages.findIndex((p) => p.index === page.index);
      if (fullIdx === -1) continue;

      updatedPages[fullIdx] = {
        ...updatedPages[fullIdx],
        visionAnalyzed: true,
        visionSummary: item.description || undefined,
        relevance: item.shows_led_displays
          ? Math.max(updatedPages[fullIdx].relevance, item.relevance || 80)
          : Math.min(updatedPages[fullIdx].relevance, 20),
        classifiedBy: "gemini-vision",
        extractedSpecs: (item.displays_found || []).map(
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
            sourcePages: [page.pageNumber],
            sourceType: "drawing",
            citation: `[Source: Drawing, Page ${page.pageNumber}]`,
            notes: d.notes ?? null,
          }),
        ),
      };
    }

    return updatedPages;
  } catch (err: any) {
    const isTimeout = err.name === "AbortError";
    console.error(`[GeminiVision] ${isTimeout ? "TIMEOUT" : "Error"}:`, err);
    return pages;
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------
// Extract LED specs from text-heavy pages using Gemini
// ---------------------------------------------------------------------------

const TEXT_EXTRACTION_PROMPT = `You are the ANC Digital Signage Expert AI. Extract EVERY LED display/screen requirement from the following RFP text.

PRIORITY SECTIONS (search for these):
1. "SECTION 11 06 60" — Display Schedule (MASTER TRUTH for quantities/dimensions)
2. "SECTION 11 63 10" — LED Display Systems (technical specs)
3. Any section mentioning: scoreboard, ribbon, fascia, marquee, video board, LED display

Return a JSON object:
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
      "width_px": null,
      "height_px": null,
      "pixel_pitch_mm": 10,
      "brightness_nits": 6000,
      "environment": "outdoor",
      "quantity": 1,
      "service_type": "rear",
      "mounting_type": "steel structure",
      "max_power_w": null,
      "weight_lbs": null,
      "special_requirements": ["weatherproof"],
      "confidence": 0.95,
      "source_pages": [9, 15],
      "citation": "[Source: Section 11 06 60, Page 9]",
      "notes": "Primary videoboard, requires HDR processing"
    }
  ]
}

WHAT IS NOT A DISPLAY (skip these):
- Section headers or category groupings (e.g., "LED Ribbon Displays" as a section title — extract the individual ribbon boards instead)
- Assembly/mounting structures (e.g., "Center Hung Display Assembly" is the structure — extract the individual boards on it)
- Generic references like "All LED displays shall..." — this is a requirement, not a display
- Systems without their own LED panel (scoring system, control system, display processor)

MINIMUM DATA RULE:
- Each display MUST have at least ONE physical spec: dimensions (width OR height), pixel pitch, OR brightness
- Do NOT extract entries that have only a name with zero measurable specs

RULES:
- Extract every display that has at least one measurable spec
- Convert all dimensions to FEET (120" = 10ft, 3048mm = 10ft)
- If pixel pitch/brightness not specified, set to null
- Quantity defaults to 1 if not stated
- Set confidence 0-1 based on how clearly specs are stated
- Include source page numbers for traceability`;

export async function extractSpecsFromText(
  relevantPages: AnalyzedPage[],
): Promise<{
  screens: ExtractedLEDSpec[];
  project: any;
}> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn("[GeminiVision] GEMINI_API_KEY not set, skipping text extraction");
    return { screens: [], project: null };
  }

  // Combine markdown from relevant pages
  const combinedText = relevantPages
    .map((p) => {
      let content = `\n--- PAGE ${p.pageNumber} ---\n${p.markdown}`;
      // Include table HTML for context
      if (p.tables.length > 0) {
        content += "\n\nTABLES ON THIS PAGE:\n";
        for (const t of p.tables) {
          content += `${t.content}\n`;
        }
      }
      return content;
    })
    .join("\n");

  // Truncate if too long (Gemini input limit)
  const maxChars = 120_000;
  const textToSend =
    combinedText.length > maxChars
      ? combinedText.slice(0, maxChars) + "\n\n[TRUNCATED — document too large]"
      : combinedText;

  const GEMINI_TIMEOUT_MS = 120_000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

  try {
    const response = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: TEXT_EXTRACTION_PROMPT }] },
        contents: [{ role: "user", parts: [{ text: textToSend }] }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 8192,
          responseMimeType: "text/plain",
        },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const err = await response.text();
      const isRateLimit = response.status === 429;
      console.error(`[GeminiExtract] API error ${response.status}${isRateLimit ? " (RATE LIMITED)" : ""}: ${err.slice(0, 200)}`);
      const error = new Error(`Gemini API ${response.status}${isRateLimit ? " rate limit" : ""}: ${err.slice(0, 100)}`);
      (error as any).statusCode = response.status;
      (error as any).isRateLimit = isRateLimit;
      throw error;
    }

    const json = await response.json();
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text || "{}";

    // Parse JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("[GeminiExtract] No JSON in response");
      return { screens: [], project: null };
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Map to our unified type
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
  } catch (err: any) {
    const isTimeout = err.name === "AbortError";
    console.error(`[GeminiExtract] ${isTimeout ? "TIMEOUT" : "Error"}:`, err);
    const error = new Error(isTimeout ? `Gemini timed out after ${GEMINI_TIMEOUT_MS / 1000}s` : err.message);
    (error as any).statusCode = err.statusCode || (isTimeout ? 408 : undefined);
    (error as any).isRateLimit = err.isRateLimit || false;
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
