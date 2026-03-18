/**
 * RFP LED Display Extractor v2
 *
 * Architecture: 3 steps, no tricks.
 *
 * Step 1: pdftotext → full text (free, instant, deterministic)
 * Step 2: Keyword filter → keep only LED-relevant pages (no AI, deterministic)
 * Step 3a: Regex table extraction → parse display matrix tables directly (no AI)
 * Step 3b: AI fallback → Mistral Large at temp 0 if regex finds 0 (structured data)
 *
 * No fallback chains. No vision. No TOC scanners. No page classifiers.
 * Same input → same output → every time.
 */

import type { ExtractedLEDSpec, ExtractedProjectInfo } from "./types";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

// AI fallback: Mistral Large (best structured table parsing)
const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY || "";
const MISTRAL_API_BASE = process.env.MISTRAL_API_BASE || "https://api.mistral.ai";
const MISTRAL_MODEL = process.env.MISTRAL_CHAT_MODEL || "mistral-large-latest";

// LED-relevant keywords for page filtering (case-insensitive)
const LED_KEYWORDS = [
  "led", "videoboard", "pixel pitch", "nits", "brightness",
  "display matrix", "display schedule", "scoreboard", "ribbon board",
  "marquee", "fascia", "centerhung", "center hung", "digital signage",
  "electronic display", "video display", "video board",
  "indoor led", "outdoor led", "entry led",
  // Common CSI section numbers for LED/electronic displays
  "116643", "116843", "110660", "116600", "116800",
];

// ---------------------------------------------------------------------------
// Step 1: pdftotext → full text, split by page (form-feed separated)
// ---------------------------------------------------------------------------

async function extractFullText(pdfPath: string): Promise<{ pages: string[]; fullText: string }> {
  const tmpFile = `/tmp/rfp-v2-${Date.now()}.txt`;
  await execFileAsync("pdftotext", ["-layout", pdfPath, tmpFile], { timeout: 120_000 });

  const { readFile, unlink } = await import("fs/promises");
  const fullText = await readFile(tmpFile, "utf-8");
  unlink(tmpFile).catch(() => {});

  // pdftotext inserts form feed (0x0C) between pages
  const pages = fullText.split("\f").filter(p => p.trim().length > 0);
  console.log(`[RFP v2] pdftotext: ${pages.length} pages, ${(fullText.length / 1024).toFixed(0)}KB total`);
  return { pages, fullText };
}

// ---------------------------------------------------------------------------
// Step 2: Keyword filter → keep only LED-relevant pages
// ---------------------------------------------------------------------------

function filterLedPages(pages: string[]): { filtered: string; keptPages: number[]; stats: string } {
  const kept: string[] = [];
  const keptPages: number[] = [];

  for (let i = 0; i < pages.length; i++) {
    const lower = pages[i].toLowerCase();
    const isRelevant = LED_KEYWORDS.some(kw => lower.includes(kw));
    if (isRelevant) {
      kept.push(pages[i]);
      keptPages.push(i + 1); // 1-indexed page numbers
    }
  }

  const filtered = kept.join("\n\n--- PAGE BREAK ---\n\n");
  const stats = `${keptPages.length}/${pages.length} pages kept (${(filtered.length / 1024).toFixed(0)}KB)`;
  console.log(`[RFP v2] Keyword filter: ${stats}`);
  return { filtered, keptPages, stats };
}

// ---------------------------------------------------------------------------
// Step 3a: Regex table extraction (no AI, 100% deterministic)
// Parses display matrix tables directly from pdftotext output
// ---------------------------------------------------------------------------

interface RegexDisplay {
  name: string;
  pixelPitchMm: number | null;
  brightnessNits: number | null;
  widthRaw: string;
  heightRaw: string;
  environment: "indoor" | "outdoor";
}

function extractDisplaysViaRegex(text: string): RegexDisplay[] {
  const displays: RegexDisplay[] = [];

  // Determine environment from surrounding section headers
  // Split text into chunks around section boundaries
  const sectionSplitPattern = /(?=(?:INDOOR|OUTDOOR)\s+LED\s+VIDEOBOARD)/gi;
  const chunks = text.split(sectionSplitPattern);

  for (const chunk of chunks) {
    // Detect environment from section header in this chunk
    const envMatch = chunk.match(/^(INDOOR|OUTDOOR)\s+LED/i);
    let environment: "indoor" | "outdoor" = "indoor"; // default
    if (envMatch) {
      environment = envMatch[1].toLowerCase() as "indoor" | "outdoor";
    } else {
      // Check if chunk contains outdoor indicators
      const hasOutdoor = /outdoor|scoreboard|ribbon\s+bo/i.test(chunk.substring(0, 2000));
      if (hasOutdoor) environment = "outdoor";
    }

    // Pattern: name (with spaces/dots/parens), pitch (number or blank), nits (4-digit), width (feet/inches), height (feet/inches)
    // This handles the pdftotext -layout format where columns are separated by multiple spaces
    const tableRowPattern = /^[\s]*([\w][\w\s.()/-]{1,40}?)\s{2,}([\d.]+|)\s{2,}(\d{4})\s{2,}([\d''"″\s/]+?)\s{2,}([\d''"″\s/]+)/gm;

    let match;
    while ((match = tableRowPattern.exec(chunk)) !== null) {
      const name = match[1].trim();
      const pitchStr = match[2].trim();
      const nitsStr = match[3].trim();
      const widthRaw = match[4].trim();
      const heightRaw = match[5].trim();

      // Skip header rows and noise
      if (/^(location|pixel|brightness|width|height|display|section|part\s)/i.test(name)) continue;
      if (/^(WORK|PRICING|ITEM|QTY|TOTAL|COST)/i.test(name)) continue;
      // Must have at least nits to be a display row
      const nits = parseInt(nitsStr, 10);
      if (isNaN(nits) || nits < 100) continue;

      displays.push({
        name,
        pixelPitchMm: pitchStr ? parseFloat(pitchStr) || null : null,
        brightnessNits: nits,
        widthRaw,
        heightRaw,
        environment,
      });
    }
  }

  console.log(`[RFP v2] Regex extraction: ${displays.length} displays found`);
  return displays;
}

// ---------------------------------------------------------------------------
// Parse feet/inches strings to decimal
// ---------------------------------------------------------------------------

function parseFeetInches(str: string): number | null {
  if (!str) return null;
  // Handle: 14', 22'8", 252', 20' 5 27/32", 3'2", 7'9", etc.
  const match = str.match(/(\d+)[''′][\s]*([\d]+(?:\s+\d+\/\d+)?)?[""″]?/);
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
// Step 3b: AI fallback — Mistral Large at temp 0 (only if regex finds 0)
// ---------------------------------------------------------------------------

async function extractDisplaysViaAI(filteredText: string): Promise<any> {
  if (!MISTRAL_API_KEY) {
    throw new Error("MISTRAL_API_KEY not set and regex extraction found 0 displays — cannot fallback to AI");
  }

  const prompt = `You are an LED display specification extractor for construction RFP documents.

Extract EVERY LED display from the document text below. The text contains one or more
display matrix tables and specification sections.

Rules:
- Extract every single row from every display matrix/schedule table
- Do NOT merge rows that share the same location name — if "Panthers Den" appears 5 times
  with different dimensions, return 5 separate entries
- Do NOT skip rows even if they look like duplicates
- If a field is missing, set it to null
- ONLY extract LED displays (videoboards, scoreboards, ribbons, fascia, entry LEDs, marquees)
- Do NOT extract clocks, scoring controllers, or non-LED equipment

Return JSON only:
{
  "project": { "name": string, "client": string, "venue": string, "address": string },
  "displays": [
    {
      "name": string,
      "location": string,
      "pixel_pitch_mm": number | null,
      "brightness_nits": number | null,
      "width_ft": string | null,
      "height_ft": string | null,
      "environment": "indoor" | "outdoor"
    }
  ],
  "requirements": [
    { "description": string, "category": string, "status": string }
  ]
}`;

  // Truncate to 400KB if needed (Mistral Large handles ~128K tokens)
  const textToSend = filteredText.length > 400000 ? filteredText.substring(0, 400000) : filteredText;

  console.log(`[RFP v2] AI fallback: calling Mistral Large (${(textToSend.length / 1024).toFixed(0)}KB, temp=0)...`);

  const res = await fetch(`${MISTRAL_API_BASE}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${MISTRAL_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MISTRAL_MODEL,
      messages: [
        { role: "user", content: prompt + "\n\n" + textToSend },
      ],
      temperature: 0.0,
      max_tokens: 65536,
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Mistral API error ${res.status}: ${err.substring(0, 300)}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content || "";
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("Mistral returned no JSON");

  const parsed = JSON.parse(content.substring(start, end + 1));
  console.log(`[RFP v2] AI fallback: ${parsed.displays?.length || 0} displays (${data.usage?.total_tokens || 0} tokens)`);
  return parsed;
}

// ---------------------------------------------------------------------------
// Extract project info from text (no AI — uses repeated header detection)
// ---------------------------------------------------------------------------

function extractProjectInfo(fullText: string): ExtractedProjectInfo {
  // Strategy: Construction documents have running headers that repeat on most
  // pages. The project name appears hundreds of times. The client name (with
  // LLC/Inc/etc.) appears many times. Find them by frequency counting.
  const lines = fullText.split("\n");
  const lineCounts = new Map<string, number>();

  for (const raw of lines) {
    const cleaned = raw.trim();
    // Only consider substantive lines (not too short, not too long)
    if (cleaned.length < 10 || cleaned.length > 120) continue;
    // Skip obvious non-header lines
    if (/^\d+$|^Page\s|^SECTION\s|^PART\s|^©|^\d+\.\d+|^[A-Z]\.\s{2,}/i.test(cleaned)) continue;
    // Strip trailing date/project-number columns (separated by lots of spaces)
    const stripped = cleaned.replace(/\s{3,}.*$/, "").trim();
    if (stripped.length < 10) continue;
    lineCounts.set(stripped, (lineCounts.get(stripped) || 0) + 1);
  }

  // Sort by frequency
  const sorted = [...lineCounts.entries()].sort((a, b) => b[1] - a[1]);

  // Project name: most-repeated non-trivial line (usually appears on every page)
  let projectName: string | null = null;
  for (const [line, count] of sorted) {
    if (count < 3) break;
    // Skip generic boilerplate
    if (/^(Existing|Provide|Section|Proceed|Related|Product)/i.test(line)) continue;
    if (/LLC|Inc|Corp|LP|Ltd/i.test(line)) continue; // That's the client
    if (/^\d+\s+\w/.test(line) && /\d{5}/.test(line)) continue; // Address line
    projectName = line;
    break;
  }

  // Client name: most-repeated line containing LLC/Inc/Corp/etc.
  let clientName: string | null = null;
  for (const [line, count] of sorted) {
    if (count < 2) break;
    if (/LLC|Inc|Corp|LP|Ltd|Authority|Department|District/i.test(line)) {
      clientName = line;
      break;
    }
  }

  // Location: look for "City, STATE" or address pattern in first page
  const firstPage = fullText.substring(0, 3000);
  const location = firstPage.match(/(\d+\s+[\w\s.]+,\s*[A-Z][a-z]+,\s*[A-Z]{2}\s+\d{5})/)?.[1]?.trim()
    || firstPage.match(/([A-Z][a-z]+,\s*[A-Z][a-z]+\s*[A-Z][a-z]*)/)?.[1]?.trim()
    || firstPage.match(/([A-Z][A-Z\s]+,\s*[A-Z][A-Z\s]+)\s*\n/)?.[1]?.trim()
    || null;

  // Venue: often the project name minus "Modernization" / "Renovation" etc.
  const venue = projectName?.replace(/\s+(Modernization|Renovation|Expansion|Improvement|Upgrade|Phase\s+\w+)\s*$/i, "").trim() || projectName;

  console.log(`[RFP v2] Project: "${projectName}", Client: "${clientName}", Location: "${location}"`);

  return {
    clientName,
    projectName,
    venue,
    location,
    isOutdoor: false,
    isUnionLabor: false,
    bondRequired: false,
    specialRequirements: [],
    schedulePhases: [],
  };
}

// ---------------------------------------------------------------------------
// Map regex results to ExtractedLEDSpec
// ---------------------------------------------------------------------------

function regexToSpecs(displays: RegexDisplay[]): ExtractedLEDSpec[] {
  return displays.map((d, idx) => ({
    name: d.name,
    location: d.name,
    widthFt: parseFeetInches(d.widthRaw),
    heightFt: parseFeetInches(d.heightRaw),
    widthPx: null,
    heightPx: null,
    pixelPitchMm: d.pixelPitchMm,
    brightnessNits: d.brightnessNits,
    environment: d.environment,
    quantity: 1,
    serviceType: null,
    mountingType: null,
    maxPowerW: null,
    weightLbs: null,
    specialRequirements: [],
    confidence: 1.0, // Regex = deterministic = max confidence
    sourcePages: [],
    sourceType: "text" as const,
    citation: "regex-extraction-v2",
    notes: null,
    isAlternate: false,
    alternateDescription: null,
    selectedProductId: null,
    selectedProductName: null,
  }));
}

function aiToSpecs(displays: any[]): ExtractedLEDSpec[] {
  return displays.map((d, idx) => ({
    name: d.name || d.location || `Display ${idx + 1}`,
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
    citation: "mistral-large-fallback",
    notes: null,
    isAlternate: false,
    alternateDescription: null,
    selectedProductId: null,
    selectedProductName: null,
  }));
}

// ---------------------------------------------------------------------------
// Main extraction — the v2 pipeline
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
  // Step 1: pdftotext the entire document
  options?.onProgress?.("Extracting text from PDF...");
  const { pages, fullText } = await extractFullText(pdfPath);

  // Step 2: Keyword filter — keep only LED-relevant pages
  options?.onProgress?.("Filtering for LED specifications...");
  const { filtered, keptPages, stats } = filterLedPages(pages);

  if (keptPages.length === 0) {
    console.log(`[RFP v2] No LED-relevant pages found in ${pages.length} pages`);
    return {
      screens: [],
      project: extractProjectInfo(fullText),
      requirements: [],
      source: "glm5",
    };
  }

  // Step 3a: Try regex extraction first (deterministic, free, instant)
  options?.onProgress?.("Parsing display tables...");
  const regexDisplays = extractDisplaysViaRegex(filtered);

  if (regexDisplays.length > 0) {
    // Regex got results — use them directly, no AI needed
    console.log(`[RFP v2] SUCCESS via regex: ${regexDisplays.length} displays (${stats})`);
    options?.onProgress?.(`Found ${regexDisplays.length} LED displays via table parsing`);

    return {
      screens: regexToSpecs(regexDisplays),
      project: extractProjectInfo(fullText),
      requirements: [],
      source: "glm5",
    };
  }

  // Step 3b: Regex found nothing — AI fallback (Mistral Large, temp 0)
  console.log(`[RFP v2] Regex found 0 displays — falling back to Mistral Large AI`);
  options?.onProgress?.("Table parsing found no displays — using AI extraction...");

  try {
    const aiResult = await extractDisplaysViaAI(filtered);
    const displays = aiResult.displays || [];
    console.log(`[RFP v2] AI fallback: ${displays.length} displays`);
    options?.onProgress?.(`Found ${displays.length} LED displays via AI extraction`);

    const project = aiResult.project || {};

    return {
      screens: aiToSpecs(displays),
      project: {
        clientName: project.client || null,
        projectName: project.name || null,
        venue: project.venue || null,
        location: project.address || null,
        isOutdoor: false,
        isUnionLabor: false,
        bondRequired: false,
        specialRequirements: [],
        schedulePhases: [],
      },
      requirements: (aiResult.requirements || []).map((r: any) => ({
        description: r.description || "",
        category: r.category || "technical",
        status: r.status || "info",
        date: null,
        sourcePages: [],
        rawText: r.description || "",
      })),
      source: "glm5",
    };
  } catch (err: any) {
    console.error(`[RFP v2] AI fallback failed:`, err.message);
    throw err;
  }
}

export function isGLM5Available(): boolean {
  // v2 only needs pdftotext (always available) + optionally MISTRAL_API_KEY for fallback
  return true;
}
