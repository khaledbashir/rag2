/**
 * Gemini Direct PDF Extractor
 *
 * Sends the full PDF to Gemini's native vision API for LED display extraction.
 * No pdftotext, no OpenClaw bridge, no intermediate steps.
 *
 * Architecture: Next.js → Gemini File API → Gemini generateContent → JSON
 */

import type { ExtractedLEDSpec, ExtractedProjectInfo } from "./types";
import { readFile } from "fs/promises";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "AQ.Ab8RN6JwV9a4iFiNkS8ugjS3IPLG3etdk-AcFq_3Cr9imNsUDw";
const GEMINI_MODEL = "gemini-3.1-pro-preview";

// ---------------------------------------------------------------------------
// System prompt — proven to extract all 43 displays from BOA Stadium RFP
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are an expert AV/Construction RFP Data Extraction Engine. Your sole purpose is to parse massive bid documents, project manuals, and RFPs to extract LED display specifications and project requirements.

CRITICAL DIRECTIVES - READ BEFORE PROCEEDING:
1. EXHAUSTIVE SEARCH: Project manuals split displays across multiple sections (e.g., Indoor, Outdoor, Ribbon, Scoreboard, Fascia, Entry LED). You MUST scan the Table of Contents first to identify ALL relevant sections before extracting. Do not stop after finding the first table.
2. ZERO HALLUCINATION: You must ONLY extract data that explicitly exists in the provided text. If a value is missing, use null. Do not guess, infer, or create data.
3. CONTINUOUS PARSING: Tables often span across multiple pages. You must connect rows across page breaks.
4. NO DEDUPLICATION: Identical names or specs on different rows mean separate physical displays. Extract every single row as an independent object.
5. STRICT JSON ONLY: Your entire response must be a single, valid JSON object. No markdown formatting, no preamble, no explanations.

EXTRACTION PROTOCOL:
Step 1: Locate Project Details (Name, Client, Venue, Address).
Step 2: Inventory Sections. Search the text for "LED Videoboards", "Display Matrix", "Scoreboard", "Ribbon", "Entry LED", "Fascia", and sections like 116643 (Indoor) or 116843 (Outdoor).
Step 3: Extract Every Display. For every row in EVERY matrix found:
- Name/Location: Extract exactly as written.
- Pixel Pitch / Brightness: Extract numbers. If a range is given, use the highest value.
- Dimensions: Convert feet and fractional inches into a pure decimal format for width_ft_decimal and height_ft_decimal (e.g., 7' 9" = 7.75; 2' 10 7/16" = 2.87). Round to two decimal places.
Step 4: Extract Requirements. Scan equipment specs for technical, compliance, and financial mandates.

OUTPUT FORMAT:
Return ONLY a JSON object matching the exact schema. You MUST complete the "_extraction_log" first to guarantee you have found all screens.`;

const USER_PROMPT = `Extract ALL LED displays and requirements from this RFP document. Return JSON with this exact schema:

{
  "_extraction_log": {
    "sections_found": ["List the specific section names/numbers you found (e.g., Indoor 116643, Outdoor 116843)"],
    "total_displays_counted_in_text": 0,
    "step_by_step_verification": "Briefly state how you ensured you didn't miss any tables across page breaks."
  },
  "project": {
    "name": "Project Name",
    "client": "Client Name",
    "venue": "Venue Name",
    "address": "City, State"
  },
  "displays": [
    {
      "name": "Screen Name",
      "location": "Screen Name",
      "pixel_pitch_mm": 3.9,
      "brightness_nits": 8000,
      "width_ft": "14'",
      "height_ft": "8'",
      "width_ft_decimal": 14.0,
      "height_ft_decimal": 8.0,
      "environment": "indoor",
      "application": "Indoor"
    }
  ],
  "requirements": [
    {
      "description": "Requirement text",
      "category": "compliance",
      "status": "critical"
    }
  ]
}`;

// ---------------------------------------------------------------------------
// Parse feet/inches strings to decimal
// ---------------------------------------------------------------------------

function parseFeetInches(str: string): number | null {
  if (!str) return null;
  // "22'8"" → 22.67, "14'" → 14, "185' 6"" → 185.5
  const match = str.match(/(\d+)[''′]\s*(\d+(?:\s+\d+\/\d+)?)?/);
  if (match) {
    const feet = parseInt(match[1], 10);
    let inches = 0;
    if (match[2]) {
      // Handle fractional inches like "5 27/32"
      const inchParts = match[2].trim().split(/\s+/);
      inches = parseInt(inchParts[0], 10) || 0;
      if (inchParts[1]) {
        const frac = inchParts[1].split("/");
        if (frac.length === 2) {
          inches += parseInt(frac[0], 10) / parseInt(frac[1], 10);
        }
      }
    }
    return Math.round((feet + inches / 12) * 100) / 100;
  }
  const num = parseFloat(str);
  return isNaN(num) ? null : num;
}

// ---------------------------------------------------------------------------
// Map Gemini output → ExtractedLEDSpec
// ---------------------------------------------------------------------------

function mapToExtractedSpecs(displays: any[]): ExtractedLEDSpec[] {
  return displays.map((d, idx) => {
    const widthFt = d.width_ft_decimal ?? parseFeetInches(d.width_ft) ?? null;
    const heightFt = d.height_ft_decimal ?? parseFeetInches(d.height_ft) ?? null;
    const env = (d.environment || d.application || "indoor").toLowerCase();

    return {
      name: d.name || `Display ${idx + 1}`,
      location: d.location || d.name || "",
      widthFt,
      heightFt,
      widthPx: null,
      heightPx: null,
      pixelPitchMm: d.pixel_pitch_mm ?? null,
      brightnessNits: d.brightness_nits ?? null,
      environment: env.includes("outdoor") ? "outdoor" : "indoor",
      quantity: 1,
      serviceType: null,
      mountingType: null,
      maxPowerW: null,
      weightLbs: null,
      specialRequirements: [],
      confidence: 0.95,
      sourcePages: [],
      sourceType: "text" as const,
      citation: "Gemini 3.1 Pro Preview — Direct PDF extraction",
      notes: null,
      isAlternate: false,
      alternateDescription: null,
      selectedProductId: null,
      selectedProductName: null,
    };
  });
}

function mapToProjectInfo(project: any): ExtractedProjectInfo {
  return {
    clientName: project?.client || null,
    projectName: project?.name || null,
    venue: project?.venue || null,
    location: project?.address || null,
    isOutdoor: false,
    isUnionLabor: false,
    bondRequired: false,
    specialRequirements: [],
    schedulePhases: [],
  };
}

// ---------------------------------------------------------------------------
// Upload file to Gemini File API
// ---------------------------------------------------------------------------

async function uploadToGemini(pdfPath: string): Promise<string> {
  const pdfBuffer = await readFile(pdfPath);
  const fileName = pdfPath.split("/").pop() || "document.pdf";

  // Step 1: Start resumable upload
  const initRes = await fetch(
    `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: {
        "X-Goog-Upload-Protocol": "resumable",
        "X-Goog-Upload-Command": "start",
        "X-Goog-Upload-Header-Content-Length": String(pdfBuffer.length),
        "X-Goog-Upload-Header-Content-Type": "application/pdf",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ file: { displayName: fileName } }),
    },
  );

  const uploadUrl = initRes.headers.get("x-goog-upload-url");
  if (!uploadUrl) throw new Error("Failed to get upload URL from Gemini File API");

  // Step 2: Upload the file
  const uploadRes = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
      "Content-Length": String(pdfBuffer.length),
    },
    body: pdfBuffer,
  });

  if (!uploadRes.ok) {
    const err = await uploadRes.text();
    throw new Error(`File upload failed: ${err}`);
  }

  const uploadData = await uploadRes.json();
  const fileUri = uploadData.file?.uri;
  if (!fileUri) throw new Error("No file URI returned from upload");

  console.log(`[GeminiExtractor] Uploaded ${fileName} (${(pdfBuffer.length / 1024 / 1024).toFixed(1)}MB) → ${fileUri}`);

  // Step 3: Wait for file to be ACTIVE
  const fileName2 = uploadData.file?.name;
  if (fileName2) {
    for (let i = 0; i < 30; i++) {
      const statusRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/${fileName2}?key=${GEMINI_API_KEY}`,
      );
      const statusData = await statusRes.json();
      if (statusData.state === "ACTIVE") {
        console.log(`[GeminiExtractor] File is ACTIVE`);
        break;
      }
      console.log(`[GeminiExtractor] File state: ${statusData.state}, waiting...`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  return fileUri;
}

// ---------------------------------------------------------------------------
// Main extraction
// ---------------------------------------------------------------------------

export async function extractWithGemini(
  pdfPath: string,
  options?: {
    timeout?: number;
    onProgress?: (message: string) => void;
  },
): Promise<{
  screens: ExtractedLEDSpec[];
  project: ExtractedProjectInfo;
  requirements: any[];
  source: "gemini";
}> {
  options?.onProgress?.("Uploading PDF to Gemini...");

  // Upload PDF
  const fileUri = await uploadToGemini(pdfPath);
  options?.onProgress?.("AI analyzing document...");

  // Call Gemini with the uploaded file
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

  const body = {
    systemInstruction: {
      parts: [{ text: SYSTEM_PROMPT }],
    },
    contents: [
      {
        parts: [
          {
            fileData: {
              mimeType: "application/pdf",
              fileUri,
            },
          },
          { text: USER_PROMPT },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 65536,
      responseMimeType: "application/json",
    },
  };

  const controller = new AbortController();
  const timeout = (options?.timeout || 300) * 1000;
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Gemini API error ${res.status}: ${err}`);
    }

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      throw new Error("Gemini returned empty response");
    }

    // Parse JSON — handle potential markdown wrapping
    let parsed: any;
    try {
      const cleaned = text.replace(/^```json\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
      parsed = JSON.parse(cleaned);
    } catch (e) {
      console.error("[GeminiExtractor] Failed to parse JSON:", text.substring(0, 500));
      throw new Error("Gemini returned invalid JSON");
    }

    // Log the extraction log (chain-of-thought) for debugging
    if (parsed._extraction_log) {
      console.log(`[GeminiExtractor] Extraction log:`, JSON.stringify(parsed._extraction_log));
      console.log(`[GeminiExtractor] Sections found: ${parsed._extraction_log.sections_found?.join(", ")}`);
      console.log(`[GeminiExtractor] Total displays counted in text: ${parsed._extraction_log.total_displays_counted_in_text}`);
    }

    const displays = Array.isArray(parsed.displays) ? parsed.displays : [];
    const requirements = Array.isArray(parsed.requirements) ? parsed.requirements : [];
    const project = parsed.project || null;

    options?.onProgress?.(`Extracted ${displays.length} displays, ${requirements.length} requirements`);
    console.log(`[GeminiExtractor] Extracted ${displays.length} displays, ${requirements.length} requirements`);

    return {
      screens: mapToExtractedSpecs(displays),
      project: mapToProjectInfo(project),
      requirements: requirements.map((r: any) => ({
        description: r.description || "",
        category: r.category || "technical",
        status: r.status || "info",
        date: r.date || null,
        sourcePages: [],
        rawText: r.description || "",
      })),
      source: "gemini",
    };
  } catch (err: any) {
    clearTimeout(timer);
    console.error("[GeminiExtractor] Failed:", err.message);
    throw new Error(`Gemini extraction failed: ${err.message}`);
  }
}

export function isGeminiAvailable(): boolean {
  return !!GEMINI_API_KEY;
}
