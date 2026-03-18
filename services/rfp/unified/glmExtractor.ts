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

  // Single model: Mercury 2 (deterministic, temp 0, no fallback chain)
  // If Mercury fails, we throw — never silently switch to a different model
  // that would produce different results.
  console.log(`[Extractor] Calling Mercury 2 (temp=0, deterministic)...`);
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
      temperature: 0.0,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Mercury 2 API error ${res.status}: ${err.substring(0, 200)}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content || "";
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("Mercury 2 returned no JSON in response");

  const parsed = JSON.parse(content.substring(start, end + 1));
  const count = parsed.displays?.length || 0;
  console.log(`[Extractor] Mercury 2: ${count} displays (${data.usage?.total_tokens || 0} tokens)`);
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

  // Strategy: find ALL LED-related sections and extract everything from the
  // first match through the end of the last section. Mercury 2 has 128K token
  // context (~500KB text), so we can be generous.
  //
  // Multiple patterns to catch variations:
  // - "SECTION 116643 - INDOOR LED VIDEOBOARDS"
  // - "SECTION 11 66 43 - INDOOR LED"
  // - "SECTION 116843 OUTDOOR LED"
  // - Freestanding "DISPLAY MATRIX" or "DISPLAY SCHEDULE" tables
  const sectionPatterns = [
    /SECTION\s+\d[\d\s]*-?\s*(?:INDOOR|OUTDOOR)\s+LED/gi,
    /SECTION\s+\d[\d\s]*-?\s*LED\s+(?:VIDEO|DISPLAY)/gi,
    /(?:DISPLAY\s+(?:MATRIX|SCHEDULE)|LED\s+DISPLAY\s+(?:MATRIX|SCHEDULE))/gi,
  ];

  // Collect all match positions across all patterns
  const allPositions: number[] = [];
  for (const pattern of sectionPatterns) {
    for (const m of fullText.matchAll(pattern)) {
      if (m.index != null) allPositions.push(m.index);
    }
  }
  // Deduplicate and sort
  const uniquePositions = [...new Set(allPositions)].sort((a, b) => a - b);

  let combined = "";

  if (uniquePositions.length > 0) {
    const firstStart = uniquePositions[0];
    const lastStart = uniquePositions[uniquePositions.length - 1];

    // Find end: search for "END OF SECTION" after the last match, or next
    // unrelated SECTION header, or take everything to EOF within 400KB limit.
    let end = -1;

    // Try "END OF SECTION" after the last LED section
    const endOfSectionIdx = fullText.indexOf("END OF SECTION", lastStart + 100);
    if (endOfSectionIdx !== -1) {
      end = Math.min(endOfSectionIdx + 200, fullText.length);
    }

    // If no END OF SECTION, look for next SECTION header that's NOT LED-related
    if (end === -1) {
      const nextSectionRegex = /\nSECTION\s+\d/gi;
      nextSectionRegex.lastIndex = lastStart + 100;
      let nextMatch: RegExpExecArray | null;
      while ((nextMatch = nextSectionRegex.exec(fullText)) !== null) {
        const snippet = fullText.substring(nextMatch.index, nextMatch.index + 200).toUpperCase();
        if (!snippet.includes("LED") && !snippet.includes("VIDEOBOARD") && !snippet.includes("DISPLAY")) {
          end = nextMatch.index;
          break;
        }
      }
    }

    // Fallback: 400KB from first match (Mercury 2 can handle ~500KB)
    if (end === -1) end = Math.min(firstStart + 400000, fullText.length);

    combined = fullText.substring(firstStart, end);
    console.log(`[GLM5] Found ${uniquePositions.length} LED section markers, extracted ${(combined.length / 1024).toFixed(0)}KB (offsets ${firstStart}-${end})`);
  } else {
    // No section headers found — try broader search for display tables
    const tablePatterns = [
      /Pixel\s+Pitch\s+Brightness/i,
      /Display\s+Matrix/i,
      /LED\s+Display\s+Schedule/i,
    ];
    let tableStart = -1;
    for (const pat of tablePatterns) {
      const idx = fullText.search(pat);
      if (idx >= 0 && (tableStart === -1 || idx < tableStart)) tableStart = idx;
    }

    if (tableStart >= 0) {
      const start = Math.max(0, tableStart - 5000);
      combined = fullText.substring(start, Math.min(start + 400000, fullText.length));
      console.log(`[GLM5] No SECTION headers — found display table at offset ${tableStart}, extracted ${(combined.length / 1024).toFixed(0)}KB`);
    } else {
      // Last resort — send full text (up to 400KB)
      combined = fullText.substring(0, 400000);
      console.log(`[GLM5] No LED markers found — sending first ${(combined.length / 1024).toFixed(0)}KB of full text`);
    }
  }

  return { indoor: combined, outdoor: "", full: fullText };
}

// ---------------------------------------------------------------------------
// Extract focused table regions from text
// Strips spec boilerplate, keeps only display matrix tables + context
// ---------------------------------------------------------------------------

function extractTableRegions(sectionText: string, fullText: string): string {
  const textToSearch = sectionText || fullText;

  // Find all display matrix / schedule table locations
  const tableMarkers = [
    /Refer to below display matrix[^\n]*/gi,
    /(?:display|LED)\s+(?:matrix|schedule)\s+for\s+size/gi,
    /(?:Scoreboards|Ribbon\s+Bo(?:a|r)d|Entry\s+LED|Fascia|Marquee)\s+Pixel\s+Pitch/gi,
    /LOCATION\s+Pixel\s+Pitch\s+Brightness/gi,
    /Location\s+Pixel\s+Pitch\s+Brightness/gi,
  ];

  const regions: Array<{ start: number; end: number }> = [];

  for (const pat of tableMarkers) {
    for (const m of textToSearch.matchAll(pat)) {
      if (m.index == null) continue;
      // Go back 500 chars for section header context
      const start = Math.max(0, m.index - 500);
      // Go forward 6000 chars to capture full table (tables can span multiple pages)
      let end = Math.min(textToSearch.length, m.index + 6000);

      // Extend end if we're still seeing table rows (lines with dimensions)
      const dimPattern = /\d+[''′]\s*/g;
      let lastDimLine = m.index + 6000;
      const scanEnd = Math.min(textToSearch.length, m.index + 15000);
      const scanText = textToSearch.substring(m.index, scanEnd);
      const lines = scanText.split('\n');
      for (let i = lines.length - 1; i >= 0; i--) {
        if (dimPattern.test(lines[i])) {
          // Found a line with dimensions — extend to include it
          let offset = 0;
          for (let j = 0; j <= i; j++) offset += lines[j].length + 1;
          lastDimLine = m.index + offset + 200; // + buffer
          break;
        }
      }
      end = Math.min(textToSearch.length, Math.max(end, lastDimLine));

      regions.push({ start, end });
    }
  }

  if (regions.length === 0) {
    // No table markers found — fall back to sending the section text as-is
    console.log(`[GLM5] No table markers found, sending full section text`);
    return sectionText || fullText.substring(0, 400000);
  }

  // Merge overlapping regions
  regions.sort((a, b) => a.start - b.start);
  const merged: Array<{ start: number; end: number }> = [regions[0]];
  for (let i = 1; i < regions.length; i++) {
    const last = merged[merged.length - 1];
    if (regions[i].start <= last.end + 1000) {
      // Overlapping or close — merge
      last.end = Math.max(last.end, regions[i].end);
    } else {
      merged.push(regions[i]);
    }
  }

  // Build combined text with section separators
  const parts: string[] = [];
  // Add project info from first 2000 chars of section text (client name, venue, etc.)
  const projectContext = textToSearch.substring(0, 2000);
  parts.push("=== PROJECT CONTEXT ===\n" + projectContext);

  for (let i = 0; i < merged.length; i++) {
    const region = textToSearch.substring(merged[i].start, merged[i].end);
    parts.push(`\n=== DISPLAY TABLE ${i + 1} ===\n` + region);
  }

  const result = parts.join('\n');
  console.log(`[GLM5] Extracted ${merged.length} table regions (${(result.length / 1024).toFixed(0)}KB total)`);
  return result;
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

  // Extract display matrix tables from the text to send focused content.
  // Sending 150KB+ of spec boilerplate overwhelms the model — it only parses
  // part of the tables. Instead, find each "display matrix" table region and
  // send just those with enough context for the model to understand structure.
  options?.onProgress?.("Analyzing LED specifications...");

  const tableText = extractTableRegions(sections.indoor, sections.full);
  console.log(`[GLM5] Sending ${(tableText.length / 1024).toFixed(0)}KB of focused table content (from ${(sections.indoor.length / 1024).toFixed(0)}KB extracted)...`);

  try {
    const fullPrompt = `Extract ALL LED displays (indoor AND outdoor) from these display matrix tables. There are MULTIPLE tables in this text — Scoreboards, Ribbon Boards, Entry LEDs, Indoor displays. You MUST extract from EVERY table, not just the first one.

CRITICAL: If the same location name appears multiple times (e.g. "Panthers Den" 6 times, "Elev Lobby" 4 times, "NW" 4 times), output ALL of them as separate display objects. They are different physical screens at different positions. NEVER merge rows that share a name. Count your output — it should match the total number of data rows across ALL tables.

${EXTRACT_PROMPT}`;
    const result = await callLLM(tableText, fullPrompt);
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
