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

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || "";
const GEMINI_MODEL = process.env.GEMINI_EXTRACTION_MODEL || "gemini-2.5-flash";
// Note: Gemini also supports inline base64 for smaller PDFs (<20MB)
// For larger PDFs, the File API upload is used (uploadToGemini)

// ---------------------------------------------------------------------------
// System prompt — proven to extract all 43 displays from BOA Stadium RFP
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are an expert AV/Construction RFP Data Extraction Engine. Your sole purpose is to parse massive bid documents, project manuals, and RFPs to extract LED display specifications and project requirements.

CRITICAL DIRECTIVES - READ BEFORE PROCEEDING:

1. END-TO-END EXHAUSTIVE SEARCH: Bid documents frequently contain typos, duplicate section numbers, out-of-order pages, and fragmented tables. You MUST evaluate the text from the very first word to the absolute final word of the document. Do not stop parsing or assume you are finished just because a section appears to end, a header repeats, or a new division begins.
2. ZERO HALLUCINATION: You must ONLY extract data that explicitly exists in the provided text. If a value is missing, use null. Do not guess, infer, or create data.
3. CONTINUOUS TABLE PARSING: Display matrices often span across multiple pages or are interrupted by other text. You must connect rows across page breaks and scan the entire document to ensure no matrix fragments are left behind.
4. NO DEDUPLICATION: Identical names or specs on different rows mean separate physical displays. Extract every single row as an independent object.
5. STRICT JSON ONLY: Your entire response must be a single, valid JSON object. No markdown formatting, no preamble, no explanations.
6. MULTIPLE TABLES PER PAGE: AV schedule drawings often contain MULTIPLE separate LED schedule tables on a SINGLE page. You MUST extract displays from EVERY table. Common table names include: Interior LED Board Schedule, Scoreboard & Ribbon Board Schedule, Entry LED Schedule, Exterior LED Schedule, Outdoor LED Schedule, Indoor LED Schedule. Do NOT stop after the first table — scan the entire document for all tables.

EXTRACTION PROTOCOL:
Step 1: Locate Project Details (Name, Client, Venue, Address).
Step 2: Inventory ALL tables in the document. AV schedule drawings typically have 3-6 separate tables (indoor displays, outdoor displays, scoreboards, ribbons, entry displays). List every table you find before extracting. If you find fewer than 3 tables, re-scan — you likely missed some.
Step 3: Extract Every Display from EVERY table. For every row in EVERY matrix found anywhere in the document:
- Name/Location: Extract EXACTLY as written in the RFP. Do NOT add numbers, suffixes, or disambiguation (e.g., do NOT write "Panthers Den 1", "Panthers Den 2" — write "Panthers Den" for each row exactly as it appears in the source table).
- Pixel Pitch / Brightness: Extract numbers. If a range is given, use the highest value.
- Dimensions: Convert feet and fractional inches into a pure decimal format for width_ft_decimal and height_ft_decimal (e.g., 7' 9" = 7.75; 2' 10 7/16" = 2.87). Round to two decimal places.
Step 4: Extract Requirements. Scan equipment specs for technical, compliance, and financial mandates.

OUTPUT FORMAT:
Return ONLY a JSON object matching the exact schema. You MUST complete the _extraction_log first to guarantee you have reached the end of the file.`;

const USER_PROMPT = `Extract ALL LED displays and requirements from this RFP document.

CRITICAL — name field: Use the ACTUAL room/location name from the document for each display (e.g., "Panthers Den", "Elev Lobby", "North Cor", "Field Ribbon North"). Do NOT use generic names like "LED Display" or "Display 1". If the table has a Location/Room column, use that value verbatim.

CRITICAL — pixel_pitch_mm: If a display's pixel pitch is not explicitly stated but every other display in the same table/section has the same pitch (e.g., all 3.9mm), use that same pitch value. Do NOT leave it null when the context makes it obvious.

Return ONLY a JSON object with this schema:

{
  "_extraction_log": {
    "sections_found": ["List all specific section names/numbers found"],
    "anomalies_detected": ["List formatting errors you ignored"],
    "total_displays_counted_in_text": 0,
    "reached_end_of_document": true,
    "step_by_step_verification": "How you ensured you scanned the entire document"
  },
  "project": {
    "name": "Actual project name from document",
    "client": "Actual client/owner name",
    "venue": "Actual venue name",
    "address": "City, State"
  },
  "displays": [
    {
      "name": "Actual location/room name from the table (e.g., Panthers Den, Elev Lobby, North Cor)",
      "location": "Same as name — the room/area name",
      "pixel_pitch_mm": 3.9,
      "brightness_nits": 8000,
      "width_ft": "14'",
      "height_ft": "8'",
      "width_ft_decimal": 14.0,
      "height_ft_decimal": 8.0,
      "environment": "indoor",
      "category": "led_display",
      "quantity": 1,
      "notes": null
    }
  ],
  "requirements": [
    {
      "description": "Requirement text",
      "category": "compliance",
      "status": "critical"
    }
  ]
}

IMPORTANT: Only include actual LED video displays, ribbon boards, fascia boards, and videoboards in the displays array. Do NOT include game clocks, play clocks, scoring controllers, headend racks, spare parts, cable packages, audio systems, or other non-LED equipment. Those belong in requirements.`;

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
      quantity: d.quantity || 1,
      serviceType: null,
      mountingType: null,
      maxPowerW: null,
      weightLbs: null,
      specialRequirements: [],
      confidence: 0.95,
      sourcePages: [],
      sourceType: "text" as const,
      citation: `${GEMINI_MODEL} — Direct PDF extraction`,
      notes: d.notes || null,
      category: d.category || "led_display",
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
// Upload file to Gemini File API (resumable upload)
// ---------------------------------------------------------------------------

async function uploadToGemini(pdfPath: string): Promise<string> {
  const pdfBuffer = await readFile(pdfPath);
  const fileName = pdfPath.split("/").pop() || "document.pdf";
  const sizeMb = (pdfBuffer.length / 1024 / 1024).toFixed(1);

  console.log(`[GeminiExtractor] Uploading ${fileName} (${sizeMb}MB)...`);

  // Use multipart upload (simpler than resumable)
  const boundary = "----GeminiUploadBoundary" + Date.now();
  const metadata = JSON.stringify({ file: { displayName: fileName } });

  const parts = [
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`,
    `--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`,
  ];

  const prefix = Buffer.from(parts[0] + parts[1]);
  const suffix = Buffer.from(`\r\n--${boundary}--\r\n`);
  const body = Buffer.concat([prefix, pdfBuffer, suffix]);

  const uploadRes = await fetch(
    `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: {
        "Content-Type": `multipart/related; boundary=${boundary}`,
        "Content-Length": String(body.length),
      },
      body,
    },
  );

  if (!uploadRes.ok) {
    const err = await uploadRes.text();
    throw new Error(`File upload failed (${uploadRes.status}): ${err}`);
  }

  const uploadData = await uploadRes.json();
  const fileUri = uploadData.file?.uri;
  if (!fileUri) throw new Error("No file URI returned from upload");

  console.log(`[GeminiExtractor] Uploaded → ${fileUri}`);

  // Wait for file to be ACTIVE
  const fileResource = uploadData.file?.name;
  if (fileResource) {
    for (let i = 0; i < 30; i++) {
      const statusRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/${fileResource}?key=${GEMINI_API_KEY}`,
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
  warnings: string[];
  source: "gemini";
}> {
  const pdfBuffer = await readFile(pdfPath);
  const sizeMb = pdfBuffer.length / 1024 / 1024;

  console.log(`[GeminiExtractor] Key present: ${GEMINI_API_KEY.length > 0}, model: ${GEMINI_MODEL}, PDF: ${sizeMb.toFixed(1)}MB`);

  // For PDFs under 15MB, use inline base64 (simpler, no File API roundtrip)
  // For larger PDFs, use the File API upload
  let filePart: any;
  if (sizeMb < 15) {
    options?.onProgress?.("Sending PDF to Gemini Flash...");
    const b64 = pdfBuffer.toString("base64");
    filePart = { inlineData: { mimeType: "application/pdf", data: b64 } };
    console.log(`[GeminiExtractor] Using inline base64 (${sizeMb.toFixed(1)}MB)`);
  } else {
    options?.onProgress?.("Uploading large PDF to Gemini...");
    const fileUri = await uploadToGemini(pdfPath);
    filePart = { fileData: { mimeType: "application/pdf", fileUri } };
    console.log(`[GeminiExtractor] Using File API (${sizeMb.toFixed(1)}MB) → ${fileUri}`);
  }

  options?.onProgress?.("AI analyzing document...");

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

  const body = {
    systemInstruction: {
      parts: [{ text: SYSTEM_PROMPT }],
    },
    contents: [
      {
        parts: [
          filePart,
          { text: USER_PROMPT },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.0,
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
      const elog = parsed._extraction_log;
      console.log(`[GeminiExtractor] Sections found: ${elog.sections_found?.join(", ")}`);
      console.log(`[GeminiExtractor] Anomalies: ${elog.anomalies_detected?.join(", ") || "none"}`);
      console.log(`[GeminiExtractor] Displays counted in text: ${elog.total_displays_counted_in_text}`);
      console.log(`[GeminiExtractor] Reached EOF: ${elog.reached_end_of_document}`);
      console.log(`[GeminiExtractor] Verification: ${elog.step_by_step_verification}`);
    }

    const displays = Array.isArray(parsed.displays) ? parsed.displays : [];
    const requirements = Array.isArray(parsed.requirements) ? parsed.requirements : [];
    const project = parsed.project || null;
    const warnings: string[] = [];

    // Validate extraction count against document's own total
    const elog = parsed._extraction_log;
    const docCount = elog?.total_displays_counted_in_text;
    if (docCount && typeof docCount === "number" && docCount > 0) {
      const extractedCount = displays.length;
      if (extractedCount < docCount) {
        const missing = docCount - extractedCount;
        const msg = `Document mentions ${docCount} displays but we extracted ${extractedCount} — ${missing} may be missing`;
        warnings.push(msg);
        console.warn(`[GeminiExtractor] COUNT MISMATCH: ${msg}`);
      } else if (extractedCount > docCount) {
        const extra = extractedCount - docCount;
        const msg = `Extracted ${extractedCount} displays but document mentions ${docCount} — ${extra} extra items (may include non-LED equipment)`;
        warnings.push(msg);
        console.warn(`[GeminiExtractor] COUNT MISMATCH: ${msg}`);
      } else {
        console.log(`[GeminiExtractor] Count validated: ${extractedCount} extracted = ${docCount} in document`);
      }
    }

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
      warnings,
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
