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
import { extractWithMistral } from "./mistralOcrClient";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

// AI fallback: Mistral Large (best structured table parsing)
const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY || "";
const MISTRAL_API_BASE = process.env.MISTRAL_API_BASE || "https://api.mistral.ai";
const MISTRAL_MODEL = process.env.MISTRAL_CHAT_MODEL || "mistral-large-latest";

// LED-relevant keywords for page filtering (case-insensitive)
const LED_KEYWORDS = [
  // LED displays
  "led", "videoboard", "pixel pitch", "nits", "brightness",
  "display matrix", "display schedule", "ribbon board", "ribbon display",
  "marquee", "fascia", "centerhung", "center hung", "digital signage",
  "electronic display", "video display", "video board",
  "indoor led", "outdoor led", "entry led",
  // Scoreboards & clocks
  "scoreboard", "game clock", "play clock", "shot clock", "locker room clock",
  "digit clock", "fixed digit", "scoring system", "score controller",
  "scorekeeping", "timing system", "delay of game", "24-second",
  // Control systems
  "display control", "content playback", "content management",
  "control system", "ad control",
  // Vendors
  "oes", "daktronics",
  // CSI section numbers
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
  category: "led_display" | "scoreboard" | "clock" | "control_system" | "other";
  quantity: number;
  notes: string | null;
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

    // Pattern: name, pitch (or blank), nits (4-digit), width (feet/inches), height (feet/inches)
    // pdftotext -layout separates columns with 2+ spaces
    // Groups 4 & 5: non-greedy capture allowing spaces within dimensions (e.g. "20' 5 27/32")
    const tableRowPattern = /^[\s]*([\w][\w\s.()/-]{1,40}?)\s{2,}([\d.]+|)\s{2,}(\d{4})\s{2,}((?:\S+\s?)+?)\s{2,}((?:\S+\s?)*\S+)\s*$/gm;

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
      // Must have at least one real dimension (not just whitespace)
      if (!widthRaw.match(/\d/) && !heightRaw.match(/\d/)) continue;

      displays.push({
        name,
        pixelPitchMm: pitchStr ? parseFloat(pitchStr) || null : null,
        brightnessNits: nits,
        widthRaw,
        heightRaw,
        environment,
        category: "led_display",
        quantity: 1,
        notes: null,
      });
    }
  }

  console.log(`[RFP v2] Regex extraction: ${displays.length} displays found`);
  return displays;
}

// ---------------------------------------------------------------------------
// Step 3a-ii: Bullet/paragraph extraction for clocks, scoreboards, control systems
// Handles RFPs where items are listed as section headers with bullet-point specs
// ---------------------------------------------------------------------------

function extractBulletItems(text: string): RegexDisplay[] {
  const items: RegexDisplay[] = [];

  // Pattern: Section header on its own line, followed by bullet points starting with " -"
  // Example:
  //   Fixed Bowl Play Clock
  //          - 2 fixed digit clocks.
  //          - 1 in North Endzone, 1 in South Endzone.
  const sectionPattern = /^([A-Z][\w\s/–—-]{3,60}?)[\s]*\n((?:\s+-[^\n]+\n?)+)/gm;

  let match;
  while ((match = sectionPattern.exec(text)) !== null) {
    const heading = match[1].trim();
    const bullets = match[2];

    // Classify the item by heading
    const headingLower = heading.toLowerCase();
    let category: RegexDisplay["category"] = "other";
    if (/led|videoboard|ribbon|fascia|marquee|video\s*board|display/i.test(heading) && !/control|playback|content/i.test(heading)) {
      category = "led_display";
    } else if (/scoreboard|fixed.*score/i.test(heading)) {
      category = "scoreboard";
    } else if (/clock|timing/i.test(heading)) {
      category = "clock";
    } else if (/control|playback|content|scorekeep|cms|ad\s+control/i.test(heading)) {
      category = "control_system";
    }

    // Skip if it's not AV/LED/scoring related at all
    if (category === "other") {
      const relevantTerms = /led|display|clock|score|control|playback|ribbon|fascia|video|digit|oes|daktronics/i;
      if (!relevantTerms.test(heading) && !relevantTerms.test(bullets)) continue;
    }

    // LED displays from bullets are kept — the dedup step later removes
    // any that were already found by the table extractor

    // Extract quantity from bullets
    let quantity = 1;
    const qtyMatch = bullets.match(/(\d+)\s+(?:display|clock|location|unit|position)/i)
      || bullets.match(/(\d+)\s+(?:fixed\s+digit)/i)
      || bullets.match(/(\d+)\s+Display/i);
    if (qtyMatch) quantity = parseInt(qtyMatch[1], 10) || 1;

    // Also check heading for quantity
    if (quantity === 1) {
      const headingQty = heading.match(/^(\d+)\s+/);
      if (headingQty) quantity = parseInt(headingQty[1], 10) || 1;
    }

    // Extract dimensions from bullets if present
    let widthRaw = "";
    let heightRaw = "";
    const dimMatch = bullets.match(/([\d''"″\s/]+?)\s*[hH]\s*x\s*([\d''"″\s/]+?)\s*[wW]/i)
      || bullets.match(/([\d''"″\s/]+?)\s*[wW]\s*x\s*([\d''"″\s/]+?)\s*[hH]/i);
    if (dimMatch) {
      // First pattern: HxW, Second pattern: WxH
      if (/h\s*x/i.test(bullets)) {
        heightRaw = dimMatch[1].trim();
        widthRaw = dimMatch[2].trim();
      } else {
        widthRaw = dimMatch[1].trim();
        heightRaw = dimMatch[2].trim();
      }
    }

    // Extract pixel pitch
    let pixelPitchMm: number | null = null;
    const pitchMatch = bullets.match(/([\d.]+)\s*mm\s*(?:pixel\s*)?pitch/i) || bullets.match(/([\d.]+)mm/i);
    if (pitchMatch) pixelPitchMm = parseFloat(pitchMatch[1]) || null;

    // Collect bullet text as notes
    const noteLines = bullets.split("\n").map(l => l.replace(/^\s+-\s*/, "").trim()).filter(Boolean);
    const notes = noteLines.join("; ");

    // Extract model reference if present
    const modelMatch = bullets.match(/(?:OES|Daktronics)\s+(\S+)/i) || bullets.match(/model[:\s]+(\S+)/i);

    items.push({
      name: heading,
      pixelPitchMm,
      brightnessNits: null,
      widthRaw,
      heightRaw,
      environment: "outdoor", // Bullet items in stadium RFPs are typically outdoor
      category,
      quantity,
      notes: notes || null,
    });
  }

  console.log(`[RFP v2] Bullet extraction: ${items.length} items found (${items.filter(i => i.category === "led_display").length} LED, ${items.filter(i => i.category === "clock").length} clocks, ${items.filter(i => i.category === "scoreboard").length} scoreboards, ${items.filter(i => i.category === "control_system").length} control)`);
  return items;
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

  const prompt = `You are an LED display and AV scope extractor for construction RFP documents.

Extract EVERY item the LED/AV vendor needs to provide. This includes:
- LED videoboards, ribbon displays, fascia, marquee, entry LEDs
- Scoreboards (fixed digit, OES, Daktronics)
- Game clocks, play clocks, shot clocks, locker room clocks
- Scoring/timing controllers and systems
- Display control systems, content playback, CMS

Rules:
- Extract every single row from every display matrix/schedule table
- Extract every bullet-point item from specification sections
- Do NOT merge items that share the same name — if "Panthers Den" appears 5 times, return 5 entries
- If a field is missing, set it to null
- Set category to: "led_display", "scoreboard", "clock", "control_system", or "other"

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
      "environment": "indoor" | "outdoor",
      "category": "led_display" | "scoreboard" | "clock" | "control_system" | "other",
      "quantity": number,
      "notes": string | null
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

// Normalize dimensions: ensure landscape displays have W > H
// 95%+ of stadium displays are landscape. Portrait exceptions: columns, towers, vertical fascia
function normalizeDimensions(name: string, w: number | null, h: number | null): { widthFt: number | null; heightFt: number | null } {
  if (w == null || h == null || w === 0 || h === 0) return { widthFt: w, heightFt: h };
  // Already landscape or square — no swap needed
  if (w >= h) return { widthFt: w, heightFt: h };
  // Portrait orientation (H > W) — check if it's intentionally vertical
  const lower = name.toLowerCase();
  const isPortrait = /column|tower|vertical|portrait|pylon|totem/i.test(lower);
  if (isPortrait) return { widthFt: w, heightFt: h }; // Keep as-is, intentionally vertical
  // Default: swap to landscape (most common in stadiums)
  console.log(`[RFP v2] Dimension swap: "${name}" ${w}'W × ${h}'H → ${h}'W × ${w}'H (landscape normalization)`);
  return { widthFt: h, heightFt: w };
}

function regexToSpecs(displays: RegexDisplay[]): ExtractedLEDSpec[] {
  return displays.map((d, idx) => {
    const rawW = parseFeetInches(d.widthRaw);
    const rawH = parseFeetInches(d.heightRaw);
    const { widthFt, heightFt } = normalizeDimensions(d.name, rawW, rawH);
    return {
    name: d.name,
    location: d.name,
    widthFt,
    heightFt,
    widthPx: null,
    heightPx: null,
    pixelPitchMm: d.pixelPitchMm,
    brightnessNits: d.brightnessNits,
    environment: d.environment,
    quantity: d.quantity,
    serviceType: null,
    mountingType: null,
    maxPowerW: null,
    weightLbs: null,
    specialRequirements: [],
    confidence: 1.0,
    sourcePages: [],
    sourceType: "text" as const,
    citation: "regex-extraction-v2",
    notes: d.notes,
    category: d.category,
    isAlternate: false,
    alternateDescription: null,
    selectedProductId: null,
    selectedProductName: null,
  };
  });
}

function aiToSpecs(displays: any[]): ExtractedLEDSpec[] {
  return displays.map((d, idx) => {
    const name = d.name || d.location || `Display ${idx + 1}`;
    const rawW = d.width_ft_decimal ?? parseFeetInches(d.width_ft) ?? null;
    const rawH = d.height_ft_decimal ?? parseFeetInches(d.height_ft) ?? null;
    const { widthFt, heightFt } = normalizeDimensions(name, rawW, rawH);
    return {
    name,
    location: d.location || d.name || "",
    widthFt,
    heightFt,
    widthPx: null,
    heightPx: null,
    pixelPitchMm: d.pixel_pitch_mm ?? null,
    brightnessNits: d.brightness_nits ?? null,
    environment: (d.environment || "indoor").toLowerCase().includes("outdoor") ? "outdoor" : "indoor",
    quantity: d.quantity || 1,
    serviceType: null,
    mountingType: null,
    maxPowerW: null,
    weightLbs: null,
    specialRequirements: [],
    confidence: 0.9,
    sourcePages: [],
    sourceType: "text" as const,
    citation: "mistral-large-fallback",
    notes: d.notes || null,
    category: d.category || "led_display",
    isAlternate: false,
    alternateDescription: null,
    selectedProductId: null,
    selectedProductName: null,
  };
  });
}

// ---------------------------------------------------------------------------
// Main extraction — the v2 pipeline
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Mistral OCR fallback — for image-based PDFs where pdftotext returns nothing
// ---------------------------------------------------------------------------

async function extractViaOcr(
  pdfPath: string,
  onProgress?: (msg: string) => void,
): Promise<{ screens: ExtractedLEDSpec[]; project: ExtractedProjectInfo } | null> {
  const MISTRAL_KEY = process.env.MISTRAL_API_KEY || "";
  if (!MISTRAL_KEY) {
    console.log(`[RFP v2] Mistral OCR unavailable (no API key)`);
    return null;
  }

  try {
    const { readFile } = await import("fs/promises");
    const buffer = await readFile(pdfPath);
    const filename = pdfPath.split("/").pop() || "document.pdf";

    onProgress?.("Running OCR on image-based PDF...");
    console.log(`[RFP v2] Mistral OCR: processing ${filename} (${(buffer.length / 1024 / 1024).toFixed(1)}MB)...`);

    const ocrResult = await extractWithMistral(buffer, filename);
    if (!ocrResult.pages || ocrResult.pages.length === 0) {
      console.log(`[RFP v2] Mistral OCR returned 0 pages`);
      return null;
    }

    console.log(`[RFP v2] Mistral OCR returned ${ocrResult.pages.length} pages`);

    // Combine all page markdown + tables
    const allMarkdown = ocrResult.pages.map(p => p.markdown).join("\n\n");
    const allTables = ocrResult.pages.flatMap(p => p.tables || []);

    // Parse HTML tables for LED displays
    const ocrDisplays: RegexDisplay[] = [];
    for (const tableHtml of allTables) {
      const parsed = parseHtmlTable(tableHtml);
      ocrDisplays.push(...parsed);
    }

    // Also try regex on the OCR markdown (catches bullet-point specs)
    const mdDisplays = extractDisplaysViaRegex(allMarkdown);
    const mdBullets = extractBulletItems(allMarkdown);

    // Combine and dedup
    const allNames = new Set(ocrDisplays.map(d => d.name.toLowerCase()));
    const uniqueMd = mdDisplays.filter(d => !allNames.has(d.name.toLowerCase()));
    const uniqueBullets = mdBullets.filter(d => !allNames.has(d.name.toLowerCase()) && !new Set(uniqueMd.map(m => m.name.toLowerCase())).has(d.name.toLowerCase()));

    const combined = [...ocrDisplays, ...uniqueMd, ...uniqueBullets];
    console.log(`[RFP v2] OCR extraction: ${combined.length} items (${ocrDisplays.length} from tables, ${uniqueMd.length} from text, ${uniqueBullets.length} from bullets)`);

    if (combined.length === 0) return null;

    return {
      screens: regexToSpecs(combined),
      project: extractProjectInfo(allMarkdown),
    };
  } catch (err: any) {
    console.error(`[RFP v2] Mistral OCR failed:`, err.message);
    return null;
  }
}

// Parse an HTML table string into display entries
function parseHtmlTable(html: string): RegexDisplay[] {
  const displays: RegexDisplay[] = [];

  // Check if this table is LED-related by scanning headers
  const headerMatch = html.match(/<th[^>]*>([\s\S]*?)<\/th>/gi);
  const headers = (headerMatch || []).map(h => h.replace(/<[^>]+>/g, "").trim().toLowerCase());
  const isLedTable = headers.some(h =>
    /led|display|pixel|pitch|nits|brightness|videoboard|ribbon|scoreboard|location|av\s+device/i.test(h)
  );
  if (!isLedTable && headers.length > 0) return []; // Skip non-LED tables (speakers, projectors)

  // Extract rows
  const rowMatches = html.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi);
  if (!rowMatches) return [];

  // Find column indices from header row
  let nameCol = -1, pitchCol = -1, nitsCol = -1, widthCol = -1, heightCol = -1, qtyCol = -1, typeCol = -1;
  if (rowMatches.length > 0) {
    const headerCells = rowMatches[0].match(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi);
    if (headerCells) {
      headerCells.forEach((cell, idx) => {
        const text = cell.replace(/<[^>]+>/g, "").trim().toLowerCase();
        if (/name|location|display|device/i.test(text) && nameCol === -1) nameCol = idx;
        if (/pitch/i.test(text)) pitchCol = idx;
        if (/nit|brightness/i.test(text)) nitsCol = idx;
        if (/width|w\b/i.test(text)) widthCol = idx;
        if (/height|h\b/i.test(text)) heightCol = idx;
        if (/qty|quantity|count/i.test(text)) qtyCol = idx;
        if (/type|category/i.test(text) && typeCol === -1) typeCol = idx;
      });
    }
  }

  // Parse data rows (skip first row = header)
  for (let i = 1; i < rowMatches.length; i++) {
    const cells = rowMatches[i].match(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi);
    if (!cells) continue;
    const values = cells.map(c => c.replace(/<[^>]+>/g, "").trim());

    const name = nameCol >= 0 ? values[nameCol] || "" : values[0] || "";
    if (!name || /^(total|subtotal|sum|header)/i.test(name)) continue;

    const pitchStr = pitchCol >= 0 ? values[pitchCol] || "" : "";
    const nitsStr = nitsCol >= 0 ? values[nitsCol] || "" : "";
    const widthStr = widthCol >= 0 ? values[widthCol] || "" : "";
    const heightStr = heightCol >= 0 ? values[heightCol] || "" : "";
    const qtyStr = qtyCol >= 0 ? values[qtyCol] || "" : "";

    // Determine category from type column or name
    let category: RegexDisplay["category"] = "led_display";
    const typeText = typeCol >= 0 ? (values[typeCol] || "").toLowerCase() : name.toLowerCase();
    if (/clock|timing/i.test(typeText)) category = "clock";
    else if (/scoreboard/i.test(typeText)) category = "scoreboard";
    else if (/control|playback|cms/i.test(typeText)) category = "control_system";

    displays.push({
      name,
      pixelPitchMm: pitchStr ? parseFloat(pitchStr.replace(/mm/i, "")) || null : null,
      brightnessNits: nitsStr ? parseInt(nitsStr.replace(/[^\d]/g, ""), 10) || null : null,
      widthRaw: widthStr,
      heightRaw: heightStr,
      environment: /outdoor|exterior/i.test(name) ? "outdoor" : "indoor",
      category,
      quantity: qtyStr ? parseInt(qtyStr, 10) || 1 : 1,
      notes: null,
    });
  }

  return displays;
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

  // Check if pdftotext returned meaningful content
  const hasText = fullText.trim().length > 500;

  if (!hasText || keptPages.length === 0) {
    // Image-based PDF or no LED-relevant text — try Mistral OCR
    const reason = !hasText ? "image-based PDF (pdftotext returned no text)" : "no LED-relevant pages in text";
    console.log(`[RFP v2] ${reason} — trying Mistral OCR fallback`);
    options?.onProgress?.("Document appears to be image-based — running OCR...");

    const ocrResult = await extractViaOcr(pdfPath, options?.onProgress);
    if (ocrResult && ocrResult.screens.length > 0) {
      console.log(`[RFP v2] Mistral OCR SUCCESS: ${ocrResult.screens.length} items found`);
      options?.onProgress?.(`Found ${ocrResult.screens.length} items via OCR`);
      return {
        screens: ocrResult.screens,
        project: ocrResult.project,
        requirements: [],
        source: "glm5",
      };
    }

    console.log(`[RFP v2] Mistral OCR returned 0 items — no displays found in this document`);
    return {
      screens: [],
      project: extractProjectInfo(fullText),
      requirements: [],
      source: "glm5",
    };
  }

  // Step 3a: Regex extraction — tables + bullet points (deterministic, free, instant)
  options?.onProgress?.("Parsing display tables and specifications...");
  const tableDisplays = extractDisplaysViaRegex(filtered);
  const bulletItems = extractBulletItems(filtered);

  // Combine both: table displays (LED specs) + bullet items (clocks, scoreboards, controls)
  // Avoid duplicates: if a bullet item has the same name as a table display, skip it
  const tableNames = new Set(tableDisplays.map(d => d.name.toLowerCase()));
  const uniqueBulletItems = bulletItems.filter(b => !tableNames.has(b.name.toLowerCase()));
  const allRegexItems = [...tableDisplays, ...uniqueBulletItems];

  if (allRegexItems.length > 0) {
    console.log(`[RFP v2] SUCCESS via regex: ${allRegexItems.length} items (${tableDisplays.length} table + ${uniqueBulletItems.length} bullet) (${stats})`);
    options?.onProgress?.(`Found ${allRegexItems.length} items via parsing (${tableDisplays.length} LED displays, ${uniqueBulletItems.length} scoring/timing)`);

    return {
      screens: regexToSpecs(allRegexItems),
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
