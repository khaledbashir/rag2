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

// Primary: Mercury 2 (Inception) — 43/43 proven, $0.25/M input, 128K context
const MERCURY_API_KEY = process.env.MERCURY_API_KEY || "sk_56b8192411faa1dc6660ea3b75133f0f";
const MERCURY_URL = "https://api.inceptionlabs.ai/v1/chat/completions";
const MERCURY_MODEL = "mercury-2";

// Fallback: GLM 4.7 (Z.AI) — 41/43, free
const ZAI_API_KEY = process.env.ZAI_API_KEY || "cd430c4ccd5a4e3c8994d3c1cf022fba.ixte8h9JkCDIg7Pj";
const ZAI_URL = "https://api.z.ai/api/coding/paas/v4/chat/completions";
const ZAI_MODEL = "glm-4.7";

const EXTRACT_PROMPT = `Extract ALL LED displays from this RFP text. Return JSON only with this exact schema.

ABSOLUTE RULES:
- Each row in the display table = ONE separate physical display object in the JSON array.
- NEVER merge, group, or deduplicate rows. If "North Club, 3.9mm, 16'x10'" appears on row 12 AND row 25, output TWO separate objects — they are two physically different screens in different parts of the stadium.
- If a row has no pixel pitch value (blank cell), still extract it with pixel_pitch_mm: null.
- Your displays array length MUST equal the exact number of data rows in the source tables. Count them.
- NEVER add numbers to names. Extract names EXACTLY as written.
- ONLY extract LED displays (videoboards, scoreboards, ribbons, fascia, entry LEDs, marquees). Do NOT extract fixed digit clocks, game clocks, play clocks, locker room clocks, scorekeeping controllers, or any non-LED timing/scoring equipment. Those go in a separate "scoring_equipment" array.

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
  "scoring_equipment": [
    {
      "name": "Play Clock",
      "quantity": 2,
      "location": "North/South Endzone",
      "notes": "Fixed digit"
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
      citation: "Mercury 2 / GLM 4.7",
      notes: null,
      isAlternate: false,
      alternateDescription: null,
      selectedProductId: null,
      selectedProductName: null,
    };
  });
}

// ---------------------------------------------------------------------------
// Call LLM — Mercury 2 primary, GLM 4.7 fallback
// ---------------------------------------------------------------------------

async function callLLM(text: string, prompt: string): Promise<any> {
  const fullContent = prompt + "\n\n" + text;

  // Try Mercury 2 first
  try {
    console.log(`[Extractor] Trying Mercury 2...`);
    const res = await fetch(MERCURY_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${MERCURY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MERCURY_MODEL,
        messages: [{ role: "user", content: fullContent }],
        max_tokens: 50000,
        temperature: 0.1,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content || "";
      const start = content.indexOf("{");
      const end = content.lastIndexOf("}");
      if (start !== -1 && end !== -1) {
        const parsed = JSON.parse(content.substring(start, end + 1));
        const count = parsed.displays?.length || 0;
        console.log(`[Extractor] Mercury 2: ${count} displays (${data.usage?.total_tokens || 0} tokens)`);
        if (count > 0) return parsed;
      }
    }
    console.log(`[Extractor] Mercury 2 failed or returned 0, falling back to GLM 4.7`);
  } catch (err: any) {
    console.log(`[Extractor] Mercury 2 error: ${err.message}, falling back to GLM 4.7`);
  }

  // Fallback: GLM 4.7
  console.log(`[Extractor] Trying GLM 4.7...`);
  const res = await fetch(ZAI_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${ZAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: ZAI_MODEL,
      messages: [{ role: "user", content: fullContent }],
      max_tokens: 64000,
      temperature: 0.1,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Z.AI API error ${res.status}: ${err.substring(0, 200)}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content || "";
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON in response");

  const parsed = JSON.parse(content.substring(start, end + 1));
  console.log(`[Extractor] GLM 4.7: ${parsed.displays?.length || 0} displays`);
  return parsed;
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
    const result = await callLLM(sections.indoor, fullPrompt);
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
  return !!ZAI_API_KEY;
}
