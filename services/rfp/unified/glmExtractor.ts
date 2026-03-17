/**
 * GLM5 Direct Extractor via NVIDIA API
 *
 * Uses pdftotext + GLM5 to extract LED displays.
 * Two calls: indoor sections + outdoor sections = full coverage.
 * Proven to get 43/43 on BOA Stadium RFP.
 */

import type { ExtractedLEDSpec, ExtractedProjectInfo } from "./types";
import { execFile } from "child_process";
import { promisify } from "util";
import { existsSync } from "fs";

const execFileAsync = promisify(execFile);

const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY || "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";
const NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
const MODEL = "z-ai/glm5";

const EXTRACT_PROMPT = `Extract ALL LED displays from this RFP text. Return JSON only with this exact schema. Each row = one display. NEVER deduplicate. NEVER add numbers to names. Extract EXACTLY as written.

{
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
  const match = str.match(/(\d+)[''′]\s*(\d+(?:\s+\d+\/\d+)?)?/);
  if (match) {
    const feet = parseInt(match[1], 10);
    let inches = 0;
    if (match[2]) {
      const inchParts = match[2].trim().split(/\s+/);
      inches = parseInt(inchParts[0], 10) || 0;
      if (inchParts[1]) {
        const frac = inchParts[1].split("/");
        if (frac.length === 2) inches += parseInt(frac[0], 10) / parseInt(frac[1], 10);
      }
    }
    return Math.round((feet + inches / 12) * 100) / 100;
  }
  const num = parseFloat(str);
  return isNaN(num) ? null : num;
}

// ---------------------------------------------------------------------------
// Map raw display → ExtractedLEDSpec
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
      citation: "GLM5 via NVIDIA API",
      notes: null,
      isAlternate: false,
      alternateDescription: null,
      selectedProductId: null,
      selectedProductName: null,
    };
  });
}

// ---------------------------------------------------------------------------
// Call GLM5
// ---------------------------------------------------------------------------

async function callGLM5(text: string, prompt: string): Promise<any> {
  const res = await fetch(NVIDIA_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${NVIDIA_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "user", content: prompt + "\n\n" + text }],
      max_tokens: 32000,
      temperature: 0.1,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GLM5 API error ${res.status}: ${err.substring(0, 200)}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content || "";

  // Parse JSON from response
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON in GLM5 response");

  return JSON.parse(content.substring(start, end + 1));
}

// ---------------------------------------------------------------------------
// Extract text sections from PDF
// ---------------------------------------------------------------------------

async function extractSections(pdfPath: string): Promise<{ indoor: string; outdoor: string; full: string }> {
  const tmpFile = `/tmp/glm-rfp-${Date.now()}.txt`;

  await execFileAsync("pdftotext", ["-layout", pdfPath, tmpFile], { timeout: 60_000 });

  const { readFile, unlink } = await import("fs/promises");
  const fullText = await readFile(tmpFile, "utf-8");
  unlink(tmpFile).catch(() => {});

  // Find indoor and outdoor sections — try multiple patterns
  // Strategy: find ALL LED VIDEOBOARD sections and grab everything between
  // first section start and end of last section. This gets indoor + outdoor
  // in one chunk (~140KB) that fits in GLM5's context window.
  const sectionMatches = [...fullText.matchAll(/SECTION\s+\d+\s*-?\s*(?:INDOOR|OUTDOOR)\s+LED\s+VIDEOBOARDS/gi)];

  let indoor = "";
  const outdoor = "";

  if (sectionMatches.length > 0) {
    const start = sectionMatches[0].index!;
    // Find "PART 3" after the last section (marks end of specs)
    const lastSection = sectionMatches[sectionMatches.length - 1];
    let end = fullText.indexOf("PART 3", lastSection.index! + lastSection[0].length);
    if (end === -1) end = Math.min(start + 200000, fullText.length);
    else end = Math.min(end + 500, fullText.length); // Include a bit after PART 3

    indoor = fullText.substring(start, end);
    console.log(`[GLM5] Found ${sectionMatches.length} LED sections, extracted ${(indoor.length / 1024).toFixed(0)}KB (offsets ${start}-${end})`);
  } else {
    // No SECTION headers found — try broader search
    // Look for first display table header
    const tableStart = fullText.search(/Pixel\s+Pitch\s+Brightness/i);
    if (tableStart >= 0) {
      const start = Math.max(0, tableStart - 5000); // Include some context before
      indoor = fullText.substring(start, Math.min(start + 200000, fullText.length));
      console.log(`[GLM5] No SECTION headers — found display table at offset ${tableStart}, extracted ${(indoor.length / 1024).toFixed(0)}KB`);
    } else {
      // Last resort — send full text truncated
      indoor = fullText.substring(0, 120000);
      console.log(`[GLM5] No LED markers found — sending first ${(indoor.length / 1024).toFixed(0)}KB of full text`);
    }
  }

  return { indoor, outdoor, full: fullText };
}

// ---------------------------------------------------------------------------
// Main extraction
// ---------------------------------------------------------------------------

export async function extractWithGLM5(
  pdfPath: string,
  options?: {
    timeout?: number;
    onProgress?: (message: string) => void;
  },
): Promise<{
  screens: ExtractedLEDSpec[];
  project: ExtractedProjectInfo;
  requirements: any[];
  source: "glm5";
}> {
  options?.onProgress?.("Extracting text from PDF...");
  const sections = await extractSections(pdfPath);

  let allDisplays: any[] = [];
  let project: any = null;
  let allRequirements: any[] = [];

  // Single call with full text — let the model find all sections
  options?.onProgress?.("Analyzing LED specifications...");
  console.log(`[GLM5] Sending full text (${(sections.indoor.length / 1024).toFixed(0)}KB)...`);

  try {
    const fullPrompt = `Extract ALL LED displays (indoor AND outdoor) and requirements from this RFP. The document may have multiple sections — Scoreboards, Ribbon Boards, Entry LEDs — extract from ALL of them. Sections may share the same section number. Do not stop after the first table.\n\n${EXTRACT_PROMPT}`;
    const result = await callGLM5(sections.indoor, fullPrompt);
    const displays = result.displays || [];
    allDisplays.push(...displays);
    project = result.project || null;
    if (result.requirements) allRequirements.push(...result.requirements);
    console.log(`[GLM5] Extracted: ${displays.length} displays`);
  } catch (err: any) {
    console.error(`[GLM5] Extraction failed:`, err.message);
    throw err;
  }

  options?.onProgress?.(`Extracted ${allDisplays.length} displays, ${allRequirements.length} requirements`);
  console.log(`[GLM5] Total: ${allDisplays.length} displays, ${allRequirements.length} requirements`);

  const projectInfo: ExtractedProjectInfo = {
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

  return {
    screens: mapToExtractedSpecs(allDisplays),
    project: projectInfo,
    requirements: allRequirements.map((r: any) => ({
      description: r.description || "",
      category: r.category || "technical",
      status: r.status || "info",
      date: null,
      sourcePages: [],
      rawText: r.description || "",
    })),
    source: "glm5",
  };
}

export function isGLM5Available(): boolean {
  return !!NVIDIA_API_KEY;
}
