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
import { extractWithGemini, isGeminiAvailable } from "./geminiExtractor";
import { matchProductsWithAI } from "../aiProductMatcher";
import { validateExtraction, detectTableHeaders } from "../extractionValidator";
import { runExtractQA } from "../extractQAAgent";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

// Primary reasoning: GLM-4.7 via Z.AI (best structured extraction)
const Z_AI_API_KEY = process.env.Z_AI_API_KEY || "";
const Z_AI_BASE_URL = process.env.Z_AI_BASE_URL || "https://api.z.ai/api/coding/paas/v4";
const Z_AI_MODEL = process.env.Z_AI_MODEL_NAME || process.env.Z_AI_EXTRACTION_MODEL || "glm-4.7";
// Fallback 1: Gemini via OpenRouter-compatible API (native PDF vision)
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "";
const OPENROUTER_BASE_URL = process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1";
const GEMINI_MODEL = process.env.GEMINI_EXTRACTION_MODEL || "google/gemini-3-flash-preview";
// Fallback 2: Mercury 2 via OpenRouter (fast diffusion LLM)
const MERCURY_MODEL = process.env.MERCURY_EXTRACTION_MODEL || "inception/mercury-2";
// Fallback 3: Mistral Large
const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY || "";
const MISTRAL_API_BASE = process.env.MISTRAL_API_BASE_URL || process.env.MISTRAL_API_BASE || "https://api.mistral.ai";
const MISTRAL_MODEL = process.env.MISTRAL_CHAT_MODEL || "mistral-large-latest";
// Mistral OCR — text extraction step
const MISTRAL_OCR_MODEL = process.env.MISTRAL_OCR_MODEL || "mistral-ocr-latest";

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
// Step 1: Mistral OCR → structured text with tables preserved
// Falls back to pdftotext if Mistral OCR fails or no API key
// ---------------------------------------------------------------------------

async function extractFullText(pdfPath: string): Promise<{ pages: string[]; fullText: string }> {
  // Try Mistral OCR first — preserves tables, structure, layout
  if (MISTRAL_API_KEY) {
    try {
      const { readFile: readPdf } = await import("fs/promises");
      const pdfBuffer = await readPdf(pdfPath);
      const b64 = pdfBuffer.toString("base64");
      const sizeMb = (pdfBuffer.length / 1024 / 1024).toFixed(1);

      console.log(`[RFP v2] Mistral OCR: sending PDF (${sizeMb}MB) to ${MISTRAL_OCR_MODEL}...`);

      const ocrRes = await fetch(`${MISTRAL_API_BASE}/v1/ocr`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${MISTRAL_API_KEY}`,
        },
        body: JSON.stringify({
          model: MISTRAL_OCR_MODEL,
          document: {
            type: "document_url",
            document_url: `data:application/pdf;base64,${b64}`,
          },
          include_image_base64: false,
        }),
      });

      if (ocrRes.ok) {
        const ocrData = await ocrRes.json();
        const ocrPages: string[] = (ocrData.pages || []).map((p: any) => p.markdown || "");
        const fullText = ocrPages.join("\n\n---PAGE BREAK---\n\n");
        console.log(`[RFP v2] Mistral OCR: ${ocrPages.length} pages, ${(fullText.length / 1024).toFixed(0)}KB total`);
        return { pages: ocrPages, fullText };
      } else {
        const errText = await ocrRes.text().catch(() => "");
        console.error(`[RFP v2] Mistral OCR failed (${ocrRes.status}):`, errText.substring(0, 200));
      }
    } catch (err: any) {
      console.error(`[RFP v2] Mistral OCR error:`, err.message);
    }
  }

  // Fallback: pdftotext (free, instant, but loses table structure)
  console.log(`[RFP v2] Falling back to pdftotext...`);
  const tmpFile = `/tmp/rfp-v2-${Date.now()}.txt`;
  await execFileAsync("pdftotext", ["-layout", pdfPath, tmpFile], { timeout: 120_000 });

  const { readFile, unlink } = await import("fs/promises");
  const fullText = await readFile(tmpFile, "utf-8");
  unlink(tmpFile).catch(() => {});

  const pages = fullText.split("\f").filter(p => p.trim().length > 0);
  console.log(`[RFP v2] pdftotext fallback: ${pages.length} pages, ${(fullText.length / 1024).toFixed(0)}KB total`);
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
    // Always keep page 1 (cover page) — it has project name, client, venue
    if (isRelevant || i === 0) {
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

  // ── AV Schedule format: LED.xxx.x.xx  SIZE  NITS  PITCH  ROOM ──
  // Handles AV drawings with LED device IDs (e.g., LED.000.A.01, LED.300.B.2)
  const avSchedulePattern = /^\s*(LED\.\d{3}\.[A-Z]+\.\d+)\s+([\d''"″\s]+?[xX][\d''"″\s]+?)\s+(\d{4})\s+([\d.]+)\s+([\w\s.()/-]+?)(?:\s{2,}Large Format|\s*$)/gm;
  let avMatch;
  while ((avMatch = avSchedulePattern.exec(text)) !== null) {
    const ledId = avMatch[1].trim();
    const sizeRaw = avMatch[2].trim();
    const nits = parseInt(avMatch[3], 10);
    const pitch = parseFloat(avMatch[4]);
    const room = avMatch[5].trim();
    if (isNaN(nits) || nits < 100) continue;

    // Parse WxH from size field (e.g., "14' X 8'", "320' x 3'", "21' 8\" x 5' 4\"")
    const sizeParts = sizeRaw.split(/[xX]/);
    const widthRaw = (sizeParts[0] || "").trim();
    const heightRaw = (sizeParts[1] || "").trim();

    displays.push({
      name: room || ledId,
      pixelPitchMm: pitch,
      brightnessNits: nits,
      widthRaw,
      heightRaw,
      environment: nits >= 5000 ? "outdoor" : "indoor",
      category: "led_display",
      quantity: 1,
      notes: `LED ID: ${ledId}`,
    });
  }

  // ── Outdoor schedule format (right-side tables in multi-column layouts) ──
  // Pattern: LOCATION  PITCH  NITS  WIDTH  HEIGHT  AREA SF
  const outdoorPattern = /^\s*(NW|SW|EAST|WEST|East [A-D]|NE|SE|North C|North Entry|South Entry)\s+(\d+)\s+(\d{4})\s+([\d''"″\s/-]+?)\s+([\d''"″\s/-]+?)\s+\d+\s+SF/gm;
  let outMatch;
  while ((outMatch = outdoorPattern.exec(text)) !== null) {
    const name = outMatch[1].trim();
    const pitch = parseInt(outMatch[2], 10);
    const nits = parseInt(outMatch[3], 10);
    const widthRaw = outMatch[4].trim();
    const heightRaw = outMatch[5].trim();
    if (isNaN(nits) || nits < 100) continue;

    displays.push({
      name,
      pixelPitchMm: pitch,
      brightnessNits: nits,
      widthRaw,
      heightRaw,
      environment: "outdoor",
      category: /scoreboard|EAST|WEST/i.test(name) && nits >= 7000 ? "led_display" : "led_display",
      quantity: 1,
      notes: null,
    });
  }

  if (displays.length > 0) {
    console.log(`[RFP v2] AV schedule regex: ${displays.length} items found`);
    // Don't return yet — we'll combine with AI results if the document
    // appears to have more data than regex captured (multi-column garble)
  }

  // ── Generic display matrix table format (BOA Stadium style) ──
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
// Step 3a-iii: Markdown table extraction (for Mistral OCR output)
// OCR returns markdown with | delimited tables — regex patterns don't match these
// ---------------------------------------------------------------------------

function extractDisplaysFromMarkdownTables(text: string): RegexDisplay[] {
  const displays: RegexDisplay[] = [];

  // Find markdown tables: header | separator | data rows
  const tablePattern = /(\|[^\n]+\|\n\|[-\s|:]+\|\n(?:\|[^\n]+\|\n?)+)/gm;
  let tableMatch;

  while ((tableMatch = tablePattern.exec(text)) !== null) {
    const tableText = tableMatch[1];
    const rows = tableText.trim().split("\n").filter((r) => r.trim());
    if (rows.length < 3) continue; // Need header + separator + at least 1 data row

    // Parse header
    const headers = rows[0]
      .split("|")
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean);

    // Check if this is an LED-related table
    const isLedTable = headers.some((h) =>
      /led|display|pixel|pitch|nit|brightness|location|videoboard|ribbon|av\s*device|room|area/i.test(h),
    );
    if (!isLedTable) continue;

    // Map columns by header text
    let nameCol = -1,
      pitchCol = -1,
      nitsCol = -1,
      widthCol = -1,
      heightCol = -1,
      qtyCol = -1,
      envCol = -1;
    headers.forEach((h, idx) => {
      if (/name|location|display|device|room|area|description/i.test(h) && nameCol === -1) nameCol = idx;
      if (/pitch/i.test(h)) pitchCol = idx;
      if (/nit|brightness/i.test(h)) nitsCol = idx;
      if (/width|w\s*[\((]|w\s*$/i.test(h) && widthCol === -1) widthCol = idx;
      if (/height|h\s*[\((]|h\s*$/i.test(h) && heightCol === -1) heightCol = idx;
      if (/qty|quantity|count/i.test(h)) qtyCol = idx;
      if (/env|indoor|outdoor|type/i.test(h)) envCol = idx;
    });

    // Detect environment from text before this table
    const preTableIdx = text.indexOf(tableText);
    const preTableText = preTableIdx > 0 ? text.substring(Math.max(0, preTableIdx - 500), preTableIdx) : "";
    const sectionEnv: "indoor" | "outdoor" =
      /outdoor/i.test(preTableText) && !/indoor/i.test(preTableText.slice(-200)) ? "outdoor" : "indoor";

    // Skip separator row (index 1), parse data rows
    for (let i = 2; i < rows.length; i++) {
      const cells = rows[i]
        .split("|")
        .map((c) => c.trim())
        .filter((_, idx, arr) => idx > 0 && idx < arr.length); // strip empty leading/trailing from |...|
      if (cells.length < 2) continue;

      const name = nameCol >= 0 && nameCol < cells.length ? cells[nameCol] : cells[0] || "";
      if (!name || /^(total|subtotal|sum|header|---|—)/i.test(name)) continue;

      const pitchStr = pitchCol >= 0 && pitchCol < cells.length ? cells[pitchCol] : "";
      const nitsStr = nitsCol >= 0 && nitsCol < cells.length ? cells[nitsCol] : "";
      const widthStr = widthCol >= 0 && widthCol < cells.length ? cells[widthCol] : "";
      const heightStr = heightCol >= 0 && heightCol < cells.length ? cells[heightCol] : "";
      const qtyStr = qtyCol >= 0 && qtyCol < cells.length ? cells[qtyCol] : "";
      const envStr = envCol >= 0 && envCol < cells.length ? cells[envCol] : "";

      const nits = nitsStr ? parseInt(nitsStr.replace(/[^\d]/g, ""), 10) : null;
      const env: "indoor" | "outdoor" = envStr
        ? /outdoor/i.test(envStr) ? "outdoor" : "indoor"
        : nits && nits >= 5000 ? "outdoor" : sectionEnv;

      displays.push({
        name,
        pixelPitchMm: pitchStr ? parseFloat(pitchStr.replace(/[^\d.]/g, "")) || null : null,
        brightnessNits: nits && nits >= 100 ? nits : null,
        widthRaw: widthStr,
        heightRaw: heightStr,
        environment: env,
        category: "led_display",
        quantity: qtyStr ? parseInt(qtyStr, 10) || 1 : 1,
        notes: null,
      });
    }
  }

  if (displays.length > 0) {
    console.log(`[RFP v2] Markdown table extraction: ${displays.length} displays found`);
  }
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

async function extractDisplaysViaAI(pdfPath: string, filteredText: string): Promise<any> {
  const prompt = `Extract ALL LED displays from this LED schedule / RFP document. Each row in every table is a separate display.

Return ONLY a JSON object:
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
}

Rules:
- Extract EVERY row from EVERY table. Do NOT skip or merge.
- If the same name appears multiple times, each is a separate display.
- If a field is missing/TBD, set null.
- Include LED videoboards, ribbons, scoreboards, clocks, control systems.
- quantity defaults to 1 unless explicitly stated.`;

  // Primary: GLM-4.7 via Z.AI (text-based, best structured extraction)
  if (Z_AI_API_KEY) {
    try {
      const glmText = filteredText.length > 128000 ? filteredText.substring(0, 128000) : filteredText;
      console.log(`[RFP v2] GLM-4.7: sending ${(glmText.length / 1024).toFixed(0)}KB text to ${Z_AI_MODEL}...`);

      const glmRes = await fetch(`${Z_AI_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${Z_AI_API_KEY}`,
        },
        body: JSON.stringify({
          model: Z_AI_MODEL,
          messages: [{ role: "user", content: prompt + "\n\n" + glmText }],
          temperature: 0,
          max_tokens: 65536,
          response_format: { type: "json_object" },
        }),
      });

      if (glmRes.ok) {
        const data = await glmRes.json();
        const content = data.choices?.[0]?.message?.content || "";
        const start = content.indexOf("{");
        const end = content.lastIndexOf("}");
        if (start >= 0 && end > start) {
          const parsed = JSON.parse(content.substring(start, end + 1));
          console.log(`[RFP v2] GLM-4.7: ${parsed.displays?.length || 0} displays`);
          return parsed;
        }
      } else {
        const err = await glmRes.text();
        console.error(`[RFP v2] GLM-4.7 failed (${glmRes.status}):`, err.substring(0, 200));
      }
    } catch (err: any) {
      console.error(`[RFP v2] GLM-4.7 error:`, err.message);
    }
  }

  // Fallback 1: Gemini via OpenRouter (native PDF vision)
  if (OPENROUTER_API_KEY) {
    try {
      const { readFile } = await import("fs/promises");
      const buffer = await readFile(pdfPath);
      const b64 = buffer.toString("base64");

      console.log(`[RFP v2] Gemini extraction: sending PDF (${(buffer.length / 1024 / 1024).toFixed(1)}MB) to ${GEMINI_MODEL}...`);

      const res = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        },
        body: JSON.stringify({
          model: GEMINI_MODEL,
          messages: [{
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: `data:application/pdf;base64,${b64}` } },
            ],
          }],
          temperature: 0,
          max_tokens: 65536,
          // Strict JSON schema forces the model to output exactly this structure
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "led_schedule_extraction",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  project: {
                    type: "object",
                    properties: {
                      name: { type: ["string", "null"] },
                      client: { type: ["string", "null"] },
                      venue: { type: ["string", "null"] },
                      address: { type: ["string", "null"] },
                    },
                    required: ["name", "client", "venue", "address"],
                    additionalProperties: false,
                  },
                  displays: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        name: { type: "string" },
                        location: { type: ["string", "null"] },
                        pixel_pitch_mm: { type: ["number", "null"] },
                        brightness_nits: { type: ["integer", "null"] },
                        width_ft: { type: ["string", "null"] },
                        height_ft: { type: ["string", "null"] },
                        environment: { type: "string", enum: ["indoor", "outdoor"] },
                        category: { type: "string", enum: ["led_display", "scoreboard", "clock", "control_system", "other"] },
                        quantity: { type: "integer" },
                        notes: { type: ["string", "null"] },
                      },
                      required: ["name", "location", "pixel_pitch_mm", "brightness_nits", "width_ft", "height_ft", "environment", "category", "quantity", "notes"],
                      additionalProperties: false,
                    },
                  },
                  requirements: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        description: { type: "string" },
                        category: { type: "string" },
                        status: { type: "string" },
                      },
                      required: ["description", "category", "status"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["project", "displays", "requirements"],
                additionalProperties: false,
              },
            },
          },
        }),
      });

      if (res.status === 402 || res.status === 429) {
        const errText = await res.text().catch(() => "");
        const isCredit = res.status === 402 || /credit|balance|payment|billing|insufficient/i.test(errText);
        if (isCredit) {
          throw new Error("AI extraction credits exhausted. Please top up your OpenRouter account at openrouter.ai/credits to continue analyzing RFPs.");
        }
      }

      if (res.ok) {
        const data = await res.json();
        const content = data.choices?.[0]?.message?.content || "";
        const start = content.indexOf("{");
        const end = content.lastIndexOf("}");
        if (start >= 0 && end > start) {
          const parsed = JSON.parse(content.substring(start, end + 1));
          console.log(`[RFP v2] Gemini: ${parsed.displays?.length || 0} displays`);
          return parsed;
        }
      } else {
        const err = await res.text();
        console.error(`[RFP v2] Gemini failed (${res.status}):`, err.substring(0, 200));
      }
    } catch (err: any) {
      console.error(`[RFP v2] Gemini error:`, err.message);
      // Credit/billing errors — stop entirely, don't fallback to Mistral
      if (err.message?.includes("credits exhausted") || err.message?.includes("top up")) {
        throw err;
      }
    }
  }

  // Fallback 1: Mercury 2 via OpenRouter (fast, text-based)
  if (OPENROUTER_API_KEY) {
    try {
      const mercuryText = filteredText.length > 128000 ? filteredText.substring(0, 128000) : filteredText;
      console.log(`[RFP v2] Mercury 2 fallback: ${(mercuryText.length / 1024).toFixed(0)}KB text to ${MERCURY_MODEL}...`);

      const mercuryRes = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        },
        body: JSON.stringify({
          model: MERCURY_MODEL,
          messages: [{ role: "user", content: prompt + "\n\n" + mercuryText }],
          temperature: 0,
          max_tokens: 50000,
          response_format: { type: "json_object" },
        }),
      });

      if (mercuryRes.status === 402 || mercuryRes.status === 429) {
        const errText = await mercuryRes.text().catch(() => "");
        const isCredit = mercuryRes.status === 402 || /credit|balance|payment|billing|insufficient/i.test(errText);
        if (isCredit) {
          throw new Error("AI extraction credits exhausted. Please top up your OpenRouter account at openrouter.ai/credits to continue analyzing RFPs.");
        }
      }

      if (mercuryRes.ok) {
        const data = await mercuryRes.json();
        const content = data.choices?.[0]?.message?.content || "";
        const start = content.indexOf("{");
        const end = content.lastIndexOf("}");
        if (start >= 0 && end > start) {
          const parsed = JSON.parse(content.substring(start, end + 1));
          console.log(`[RFP v2] Mercury 2: ${parsed.displays?.length || 0} displays`);
          return parsed;
        }
      } else {
        const err = await mercuryRes.text();
        console.error(`[RFP v2] Mercury 2 failed (${mercuryRes.status}):`, err.substring(0, 200));
      }
    } catch (err: any) {
      console.error(`[RFP v2] Mercury 2 error:`, err.message);
      if (err.message?.includes("credits exhausted") || err.message?.includes("top up")) {
        throw err;
      }
    }
  }

  // Fallback 2: Mistral Large with text input
  if (!MISTRAL_API_KEY) {
    throw new Error("No AI extraction available — set OPENROUTER_API_KEY or MISTRAL_API_KEY");
  }

  const textToSend = filteredText.length > 400000 ? filteredText.substring(0, 400000) : filteredText;
  console.log(`[RFP v2] Mistral fallback: ${(textToSend.length / 1024).toFixed(0)}KB text...`);

  const res = await fetch(`${MISTRAL_API_BASE}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${MISTRAL_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MISTRAL_MODEL,
      messages: [{ role: "user", content: prompt + "\n\n" + textToSend }],
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
  if (start === -1 || end === -1) throw new Error("AI returned no JSON");

  const parsed = JSON.parse(content.substring(start, end + 1));
  console.log(`[RFP v2] Mistral: ${parsed.displays?.length || 0} displays`);
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

  // Fallback: scan cover page (first 2000 chars) for "Project" label followed by a name
  if (!projectName && fullText.length > 0) {
    const coverPage = fullText.substring(0, 2000);
    const projectMatch = coverPage.match(/(?:Project\s*[:—\-]?\s*\n?\s*)([A-Z][A-Z\s&]+(?:MODERNIZATION|RENOVATION|EXPANSION|IMPROVEMENT|UPGRADE|STADIUM|ARENA|CENTER|CENTRE|FIELD|PARK|COMPLEX)[A-Z\s]*)/i);
    if (projectMatch) projectName = projectMatch[1].trim();
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
// Category filtering — only LED displays become screens; rest → requirements
// ---------------------------------------------------------------------------

const LED_CATEGORIES = new Set(["led_display"]);

/**
 * Equipment keywords — items matching these are infrastructure/accessories, NOT LED displays.
 * Catches mis-classified items that the AI labels as "led_display" but aren't.
 */
const EQUIPMENT_EXCLUDE_PATTERNS = [
  /\bgame\s*clock/i,
  /\bplay\s*clock/i,
  /\bshot\s*clock/i,
  /\bdelay\s*of\s*game/i,
  /\blocker\s*room\s*clock/i,
  /\bwarm.?up\s*clock/i,
  /\b(?:scoring|score)\s*(?:controller|system|keeper)/i,
  /\bcontrol\s*operator/i,
  /\bcontrol\s*paddle/i,
  /\bheadend\s*rack/i,
  /\brack\s*mount/i,
  /\bspare\s*part/i,
  /\bcontent\s*(?:management|playback)\s*(?:system|server)/i,
  /\bad\s*control\s*system/i,
  /\baudio\s*system/i,
  /\bsignal\s*distribut/i,
  /\bvideo\s*processor\b/i,
  /\bmatrix\s*switch/i,
  /\bpower\s*distribut/i,
  /\bups\s*(?:battery|system)/i,
  /\bcabling\s*(?:package|system)/i,
];

/** Returns true if an item name matches infrastructure/equipment patterns */
function isEquipmentItem(name: string): boolean {
  return EQUIPMENT_EXCLUDE_PATTERNS.some((pattern) => pattern.test(name));
}

/** Split items into LED screens and non-LED requirements */
function separateByCategory(items: RegexDisplay[]): {
  ledItems: RegexDisplay[];
  nonLedRequirements: { description: string; category: string; status: string; date: null; sourcePages: never[]; rawText: string }[];
} {
  const ledItems: RegexDisplay[] = [];
  const nonLedRequirements: any[] = [];

  for (const item of items) {
    const isCategoryLed = LED_CATEGORIES.has(item.category);
    const isEquipment = isEquipmentItem(item.name);
    if (isCategoryLed && !isEquipment) {
      ledItems.push(item);
    } else {
      // Convert clocks, scoreboards, control systems, etc. to requirements
      const label = `${item.name}${item.quantity > 1 ? ` (qty: ${item.quantity})` : ""}`;
      nonLedRequirements.push({
        description: item.notes ? `${label} — ${item.notes}` : label,
        category: item.category === "clock" ? "scoring_timing"
          : item.category === "scoreboard" ? "scoring_timing"
          : item.category === "control_system" ? "control_system"
          : "technical",
        status: "info",
        date: null,
        sourcePages: [],
        rawText: item.notes || label,
      });
    }
  }

  console.log(`[RFP v2] Category filter: ${ledItems.length} LED displays, ${nonLedRequirements.length} non-LED items moved to requirements`);
  return { ledItems, nonLedRequirements };
}

/** Same filter for AI-extracted displays (different shape) */
function separateAiByCategory(displays: any[]): {
  ledDisplays: any[];
  nonLedRequirements: any[];
} {
  const ledDisplays: any[] = [];
  const nonLedRequirements: any[] = [];

  for (const d of displays) {
    const cat = d.category || "led_display";
    const itemName = d.name || d.location || "";
    // Two-pass filter: category check + equipment keyword safety net
    const isCategoryLed = LED_CATEGORIES.has(cat);
    const isEquipment = isEquipmentItem(itemName);
    if (isCategoryLed && !isEquipment) {
      ledDisplays.push(d);
    } else {
      if (isEquipment && isCategoryLed) {
        console.log(`[RFP v2] Equipment filter: "${itemName}" was categorized as led_display but matches equipment pattern — moving to requirements`);
      }
      const name = d.name || d.location || "Unknown Item";
      const label = `${name}${d.quantity > 1 ? ` (qty: ${d.quantity})` : ""}`;
      nonLedRequirements.push({
        description: d.notes ? `${label} — ${d.notes}` : label,
        category: cat === "clock" ? "scoring_timing"
          : cat === "scoreboard" ? "scoring_timing"
          : cat === "control_system" ? "control_system"
          : "technical",
        status: "info",
        date: null,
        sourcePages: [],
        rawText: d.notes || label,
      });
    }
  }

  console.log(`[RFP v2] AI category filter: ${ledDisplays.length} LED displays, ${nonLedRequirements.length} non-LED items moved to requirements`);
  return { ledDisplays, nonLedRequirements };
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
// pdfplumber extraction — handles multi-column AV schedule drawings
// ---------------------------------------------------------------------------

async function extractViaPdfPlumber(pdfPath: string): Promise<RegexDisplay[]> {
  const scriptPath = require("path").join(process.cwd(), "scripts", "pdfplumber-extract.py");
  const { stdout } = await execFileAsync("python3", [scriptPath, pdfPath], { timeout: 60_000 });
  const result = JSON.parse(stdout);
  if (result.error) throw new Error(result.error);

  const displays: RegexDisplay[] = (result.displays || []).map((d: any) => ({
    name: d.name || "Display",
    pixelPitchMm: d.pixel_pitch_mm ?? null,
    brightnessNits: d.brightness_nits ?? null,
    widthRaw: d.width || "",
    heightRaw: d.height || "",
    environment: d.environment === "outdoor" ? "outdoor" as const : "indoor" as const,
    category: (d.category || "led_display") as RegexDisplay["category"],
    quantity: d.quantity || 1,
    notes: d.led_id ? `LED ID: ${d.led_id}` : null,
  }));

  console.log(`[RFP v2] pdfplumber: ${displays.length} displays (${result.stats?.interior || 0} interior, ${result.stats?.outdoor || 0} outdoor)`);
  return displays;
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

    const { nonLedRequirements } = separateByCategory(combined);
    return {
      screens: regexToSpecs(combined),
      project: extractProjectInfo(allMarkdown),
      requirements: nonLedRequirements,
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
  warnings?: string[];
  validation?: import("../extractionValidator").ValidationResult;
  source: "glm5";
}> {
  // =====================================================================
  // PRIMARY: pdfplumber deterministic extraction — no AI, same result every time
  // Falls through to Gemini only if pdfplumber finds 0 LED displays
  // =====================================================================
  options?.onProgress?.("Extracting tables with pdfplumber...");
  try {
    const path = await import("path");
    const scriptPath = path.join(process.cwd(), "scripts", "pdfplumber-extract.py");
    const { stdout } = await execFileAsync("python3", [scriptPath, pdfPath], { timeout: 60_000 });
    const plumberResult = JSON.parse(stdout);

    if (plumberResult.displays && plumberResult.displays.length > 0) {
      const displays = plumberResult.displays;
      console.log(`[RFP v2] pdfplumber: ${displays.length} displays (${plumberResult.stats.interior} indoor, ${plumberResult.stats.outdoor} outdoor)`);
      options?.onProgress?.(`pdfplumber found ${displays.length} displays — deterministic extraction`);

      // Map pdfplumber output to ExtractedLEDSpec
      const specs: ExtractedLEDSpec[] = displays.map((d: any) => ({
        name: d.name || "Unknown",
        location: d.name || "",
        widthFt: null, // Raw strings preserved, decimal conversion done downstream
        heightFt: null,
        widthPx: null,
        heightPx: null,
        pixelPitchMm: d.pixel_pitch_mm ?? null,
        brightnessNits: d.brightness_nits ?? null,
        environment: d.environment === "outdoor" ? "outdoor" as const : "indoor" as const,
        quantity: d.quantity || 1,
        serviceType: null,
        mountingType: null,
        maxPowerW: null,
        weightLbs: null,
        specialRequirements: [],
        confidence: 1.0, // Deterministic — highest confidence
        sourcePages: d.page ? [d.page] : [],
        sourceType: "table" as const,
        citation: "pdfplumber deterministic extraction",
        notes: d.led_id ? `LED ID: ${d.led_id}` : null,
        category: "led_display" as const,
        isAlternate: false,
        alternateDescription: null,
        selectedProductId: null,
        selectedProductName: null,
        // Preserve raw dimension strings for audit
        widthRaw: d.width || null,
        heightRaw: d.height || null,
      }));

      // Parse raw dimensions to decimal feet
      for (const spec of specs) {
        if (spec.widthRaw) spec.widthFt = parseFeetInches(spec.widthRaw);
        if (spec.heightRaw) spec.heightFt = parseFeetInches(spec.heightRaw);
      }

      // Equipment filter
      const filtered = specs.filter((s) => !isEquipmentItem(s.name));

      // Validation
      options?.onProgress?.("Validating extraction...");
      const sourceText = await (async () => {
        try {
          const { stdout: txt } = await execFileAsync("pdftotext", ["-layout", pdfPath, "-"], { timeout: 30_000 });
          return txt;
        } catch { return ""; }
      })();
      const tableHeaders = detectTableHeaders(sourceText);
      const validation = validateExtraction(filtered, sourceText, null, tableHeaders);

      for (const check of validation.checks) {
        const icon = check.passed ? "PASS" : check.severity === "block" ? "BLOCK" : "REVIEW";
        console.log(`[RFP v2] Validation [${icon}] ${check.name}: ${check.message}`);
      }
      options?.onProgress?.(`Validation: ${validation.summary}`);

      const warnings: string[] = [];
      for (const check of validation.checks) {
        if (!check.passed) warnings.push(`[${check.severity.toUpperCase()}] ${check.name}: ${check.message}`);
      }

      // ── EXTRACT QA — automatic review and correction ──
      let qaDisplays = filtered;
      try {
        const qa = await runExtractQA(filtered, sourceText, pdfPath.split("/").pop() || "document.pdf", options?.onProgress);
        if (qa.changes.length > 0) {
          qaDisplays = qa.correctedDisplays as ExtractedLEDSpec[];
          for (const change of qa.changes) {
            warnings.push(`[QA] ${change}`);
          }
          console.log(`[RFP v2] Extract QA: ${qa.changes.length} corrections applied`);
        }
        if (qa.verified) {
          options?.onProgress?.(`Extract QA: ${qa.message}`);
        }
      } catch (qaErr: any) {
        console.error(`[RFP v2] Extract QA failed:`, qaErr.message);
        warnings.push(`Extract QA failed: ${qaErr.message}`);
        // Non-fatal — keep original extraction
      }

      // AI product matching
      try {
        const aiMatches = await matchProductsWithAI(qaDisplays, options?.onProgress);
        for (const match of aiMatches) {
          const spec = qaDisplays.find(s => s.name === match.displayName);
          if (spec && match.productId) {
            spec.selectedProductId = match.productId;
            spec.selectedProductName = match.productName || undefined;
          }
        }
      } catch (matchErr: any) {
        console.error(`[RFP v2] AI product matching failed:`, matchErr.message);
        warnings.push(`AI product matching failed: ${matchErr.message}`);
      }

      // Extract project info from text
      const project = extractProjectInfo(sourceText);

      return {
        screens: qaDisplays,
        project,
        requirements: [],
        warnings: warnings.length > 0 ? warnings : undefined,
        validation,
        source: "glm5",
      };
    } else {
      console.log(`[RFP v2] pdfplumber found 0 LED displays — falling through to Gemini`);
      options?.onProgress?.("No tables found by pdfplumber — using Gemini...");
    }
  } catch (plumberErr: any) {
    console.error(`[RFP v2] pdfplumber failed:`, plumberErr.message);
    options?.onProgress?.("pdfplumber failed — using Gemini...");
  }

  // =====================================================================
  // SECONDARY: Gemini — gated pipeline with auto-escalation
  // 1. Try 2.5 Flash (fast, cheap)
  // 2. Validate output
  // 3. If validation fails → escalate to 3.1 Pro automatically
  // 4. If Pro also fails → BLOCKED
  // Natalia never knows which model ran. She gets correct data or a review flag.
  // =====================================================================
  if (isGeminiAvailable()) {
    const FLASH_MODEL = "gemini-2.5-flash";
    const PRO_MODEL = "gemini-3.1-pro-preview";

    // Helper: run extraction + validation on a given model
    async function tryModel(modelName: string): Promise<{
      filtered: ExtractedLEDSpec[];
      geminiResult: any;
      validation: import("../extractionValidator").ValidationResult;
      warnings: string[];
    }> {
      console.log(`[RFP v2] Trying ${modelName}...`);
      options?.onProgress?.(`Analyzing with ${modelName === FLASH_MODEL ? "Gemini Flash" : "Gemini Pro"}...`);

      const result = await extractWithGemini(pdfPath, {
        timeout: options?.timeout,
        onProgress: options?.onProgress,
        model: modelName,
      });

      const filtered = result.screens.filter((s) => !isEquipmentItem(s.name));
      const equipmentRemoved = result.screens.length - filtered.length;
      if (equipmentRemoved > 0) console.log(`[RFP v2] ${modelName}: removed ${equipmentRemoved} equipment items`);

      console.log(`[RFP v2] ${modelName}: ${filtered.length} LED displays`);

      const tableHeaders = detectTableHeaders(result.sourceText);
      const validation = validateExtraction(filtered, result.sourceText, result.documentTotal, tableHeaders);

      const warnings: string[] = [];
      for (const check of validation.checks) {
        const icon = check.passed ? "PASS" : check.severity === "block" ? "BLOCK" : "REVIEW";
        console.log(`[RFP v2] [${modelName}] Validation [${icon}] ${check.name}: ${check.message}`);
        if (!check.passed) warnings.push(`[${check.severity.toUpperCase()}] ${check.name}: ${check.message}`);
      }

      return { filtered, geminiResult: result, validation, warnings };
    }

    // Step 1: Try Flash — wrapped in try/catch so a dead API key falls through to Mistral
    options?.onProgress?.("Analyzing document with Gemini Flash...");
    let flash: Awaited<ReturnType<typeof tryModel>> | null = null;
    try {
      flash = await tryModel(FLASH_MODEL);
    } catch (flashErr: any) {
      // 403 leaked key, network error, etc. — fall through to Mistral fallback
      console.error(`[RFP v2] Gemini Flash failed: ${flashErr.message}`);
      options?.onProgress?.(`Gemini unavailable (${flashErr.message.includes("403") ? "API key issue" : flashErr.message.slice(0, 60)}) — trying Mistral...`);
    }

    // If Gemini failed entirely, skip to Mistral fallback below
    if (!flash) {
      // Fall through — do NOT return here, let Mistral section below handle it
    } else {
    let finalResult = flash;

    // Step 2: If Flash validation has blockers, escalate to Pro
    const flashBlockers = flash.validation.checks.filter(c => !c.passed && c.severity === "block");
    if (flashBlockers.length > 0) {
      console.log(`[RFP v2] Flash validation FAILED (${flashBlockers.length} blockers) — escalating to 3.1 Pro`);
      options?.onProgress?.(`Flash validation failed — escalating to Gemini Pro...`);

      try {
        const pro = await tryModel(PRO_MODEL);
        const proBlockers = pro.validation.checks.filter(c => !c.passed && c.severity === "block");

        if (proBlockers.length < flashBlockers.length) {
          // Pro is better — use it
          console.log(`[RFP v2] Pro validation: ${proBlockers.length} blockers (Flash had ${flashBlockers.length}) — using Pro result`);
          options?.onProgress?.(`Pro result is better — using Pro extraction`);
          finalResult = pro;
          finalResult.warnings.push(`Escalated from Flash to Pro (Flash had ${flashBlockers.length} validation failures)`);
        } else {
          // Pro is not better — use Flash (it was closer)
          console.log(`[RFP v2] Pro not better (${proBlockers.length} blockers) — keeping Flash result`);
          finalResult = flash;
        }
      } catch (proErr: any) {
        console.error(`[RFP v2] Pro escalation failed:`, proErr.message);
        finalResult.warnings.push(`Pro escalation failed: ${proErr.message}`);
      }
    } else {
      console.log(`[RFP v2] Flash validation passed — no escalation needed`);
      options?.onProgress?.("Flash validation passed");
    }

    options?.onProgress?.(`Validation: ${finalResult.validation.summary}`);

    // ── EXTRACT QA — automatic review and correction ──
    try {
      const qa = await runExtractQA(
        finalResult.filtered,
        finalResult.geminiResult.sourceText || "",
        pdfPath.split("/").pop() || "document.pdf",
        options?.onProgress,
      );
      if (qa.changes.length > 0) {
        finalResult.filtered = qa.correctedDisplays as ExtractedLEDSpec[];
        for (const change of qa.changes) {
          finalResult.warnings.push(`[QA] ${change}`);
        }
      }
      if (qa.verified) {
        options?.onProgress?.(`Extract QA: ${qa.message}`);
      }
    } catch (qaErr: any) {
      console.error(`[RFP v2] Extract QA failed:`, qaErr.message);
      finalResult.warnings.push(`Extract QA failed: ${qaErr.message}`);
    }

    // AI product matching
    try {
      const aiMatches = await matchProductsWithAI(finalResult.filtered, options?.onProgress);
      for (const match of aiMatches) {
        const spec = finalResult.filtered.find(s => s.name === match.displayName);
        if (spec && match.productId) {
          spec.selectedProductId = match.productId;
          spec.selectedProductName = match.productName || undefined;
          spec.notes = spec.notes
            ? `${spec.notes} | AI match: ${match.matchReason}`
            : `AI match: ${match.matchReason}`;
        }
      }
    } catch (matchErr: any) {
      console.error(`[RFP v2] AI product matching failed:`, matchErr.message);
      finalResult.warnings.push(`AI product matching failed: ${matchErr.message}`);
    }

    return {
      screens: finalResult.filtered,
      project: finalResult.geminiResult.project,
      requirements: finalResult.geminiResult.requirements,
      warnings: finalResult.warnings.length > 0 ? finalResult.warnings : undefined,
      validation: finalResult.validation,
      source: "glm5",
    };
    } // end else (flash succeeded)
  } // end if (isGeminiAvailable())

  // =====================================================================
  // FALLBACK 1: Mistral OCR + Document Annotation — one call, PDF → JSON
  // The OCR model sees the actual PDF layout and extracts structured data
  // directly into our schema. No intermediary text step needed.
  // =====================================================================
  if (MISTRAL_API_KEY) {
    options?.onProgress?.("Analyzing document with Mistral OCR...");
    try {
      const { readFile: readPdf } = await import("fs/promises");
      const pdfBuffer = await readPdf(pdfPath);
      const b64 = pdfBuffer.toString("base64");
      const sizeMb = (pdfBuffer.length / 1024 / 1024).toFixed(1);

      console.log(`[RFP v2] Mistral OCR + Annotations: sending PDF (${sizeMb}MB)...`);

      const annotationSchema = {
        type: "json_schema" as const,
        json_schema: {
          name: "led_extraction",
          strict: true,
          schema: {
            type: "object",
            properties: {
              project: {
                type: "object",
                properties: {
                  name: { type: ["string", "null"], description: "Project name from the document title or header" },
                  client: { type: ["string", "null"], description: "Client or owner organization name" },
                  venue: { type: ["string", "null"], description: "Venue or facility name" },
                  address: { type: ["string", "null"], description: "City, state, or full address" },
                },
                required: ["name", "client", "venue", "address"],
                additionalProperties: false,
              },
              displays: {
                type: "array",
                description: "EVERY item in the document: LED videoboards, ribbon boards, scoreboards, clocks, scoring systems, game clock controllers, control operator positions, play clock paddles, display control systems, content playback systems, CMS, audio systems. Each section header = one entry. Use quantity field for multiples. Do NOT skip control systems, scoring equipment, or accessories.",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string", description: "Display name exactly as written in the document" },
                    location: { type: ["string", "null"], description: "Where in the venue this display is located" },
                    pixel_pitch_mm: { type: ["number", "null"], description: "Pixel pitch in millimeters (e.g. 10 for 10mm). null if not specified or not an LED display." },
                    brightness_nits: { type: ["integer", "null"], description: "Brightness in nits. null if not specified." },
                    width_ft: { type: ["string", "null"], description: "Width as written (e.g. \"30'\" or \"57'6\\\"\"). null if not specified." },
                    height_ft: { type: ["string", "null"], description: "Height as written (e.g. \"18'\" or \"4'5\\\"\"). null if not specified." },
                    environment: { type: "string", enum: ["indoor", "outdoor"], description: "Indoor or outdoor installation" },
                    category: { type: "string", enum: ["led_display", "scoreboard", "clock", "control_system", "other"], description: "led_display = LED video displays/ribbons. scoreboard = fixed digit scoreboards/OES. clock = game clocks/play clocks/locker room clocks. control_system = scorekeeping systems, game clock controllers, control operator positions, play clock paddles, display control, content playback, CMS, audio. other = anything else." },
                    quantity: { type: "integer", description: "Total quantity. Back-to-back pairs count as 2. Multiple locations listed = sum them." },
                    notes: { type: ["string", "null"], description: "Key specs: mounting type, service access, model references, special requirements" },
                  },
                  required: ["name", "location", "pixel_pitch_mm", "brightness_nits", "width_ft", "height_ft", "environment", "category", "quantity", "notes"],
                  additionalProperties: false,
                },
              },
              requirements: {
                type: "array",
                description: "General project requirements: scope items, warranty terms, labor requirements, special conditions",
                items: {
                  type: "object",
                  properties: {
                    description: { type: "string" },
                    category: { type: "string" },
                    status: { type: "string" },
                  },
                  required: ["description", "category", "status"],
                  additionalProperties: false,
                },
              },
            },
            required: ["project", "displays", "requirements"],
            additionalProperties: false,
          },
        },
      };

      const annotationPrompt = `Extract EVERY SINGLE item from this RFP/bid document. Miss nothing.

CRITICAL: EVERY ROW in EVERY TABLE is a separate display entry. Do NOT group, summarize, or merge table rows. If a table has 47 rows, you return 47 items. Every section header with specs underneath is also an item.

You MUST extract ALL of the following categories — do NOT skip any:
1. LED DISPLAYS: videoboards, ribbon boards, fascia displays, marquees, digital signage
2. SCOREBOARDS: fixed digit scoreboards, OES scoreboards, scoring displays
3. CLOCKS: game clocks, play clocks, shot clocks, locker room clocks, delay of game clocks
4. SCORING SYSTEMS: scorekeeping systems, game clock controllers, control operator positions, play clock control paddles, scoring controllers
5. CONTROL SYSTEMS: display control systems, content playback systems, CMS, ad control systems, audio systems

Rules:
- EVERY TABLE ROW is a separate item. Even if two rows have the same name (e.g. "Elev Lobby" appearing twice), each row is a SEPARATE entry — they are different physical displays.
- Each unique item is ONE entry with the correct quantity. Do NOT split back-to-back pairs into separate rows.
- "2 displays located back-to-back" = 1 entry with quantity: 2
- "4 locations, 2 in each locker room" = 1 entry with quantity: 8 (4 locations x 2 each)
- Include dimensions and pixel pitch ONLY if explicitly stated in the document.
- Classify: LED videoboards/ribbons = led_display, fixed scoreboards = scoreboard, timing displays = clock, controllers/paddles/operators/scorekeeping = control_system, CMS/playback/audio = control_system
- Extract general requirements: warranty terms, labor scope, electrical scope, special conditions
- If you are unsure whether to include an item, INCLUDE IT. Missing items is worse than extra items.`;

      const ocrRes = await fetch(`${MISTRAL_API_BASE}/v1/ocr`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${MISTRAL_API_KEY}`,
        },
        body: JSON.stringify({
          model: MISTRAL_OCR_MODEL,
          document: {
            type: "document_url",
            document_url: `data:application/pdf;base64,${b64}`,
          },
          document_annotation_format: annotationSchema,
          document_annotation_prompt: annotationPrompt,
          include_image_base64: false,
        }),
      });

      if (ocrRes.ok) {
        const ocrData = await ocrRes.json();
        const annotation = ocrData.document_annotation;

        if (annotation) {
          const parsed = typeof annotation === "string" ? JSON.parse(annotation) : annotation;
          const allDisplays = parsed.displays || [];
          const { ledDisplays, nonLedRequirements } = separateAiByCategory(allDisplays);

          console.log(`[RFP v2] Mistral OCR Annotations: ${allDisplays.length} total items, ${ledDisplays.length} LED displays, ${nonLedRequirements.length} non-LED → requirements`);

          // ── Supplementary pass: run regex on OCR page text ──
          // Mistral OCR annotation may miss table rows in dense AV schedules.
          // The OCR response also includes page markdown — run regex + markdown
          // table parsing on that text. If it finds more items, use the larger set.
          const ocrPages: string[] = (ocrData.pages || []).map((p: any) => p.markdown || "");
          const ocrFullText = ocrPages.join("\n\n");
          if (ocrFullText.length > 100) {
            const mdTableDisplays = extractDisplaysFromMarkdownTables(ocrFullText);
            const regexDisplays = extractDisplaysViaRegex(ocrFullText);
            const bulletDisplays = extractBulletItems(ocrFullText);
            const allRegex = [...mdTableDisplays, ...regexDisplays, ...bulletDisplays];
            const { ledItems: regexLed } = separateByCategory(allRegex);

            if (regexLed.length > ledDisplays.length) {
              console.log(`[RFP v2] Regex supplement found ${regexLed.length} LED items vs ${ledDisplays.length} from annotation — using regex results`);
              const regexSpecs = regexToSpecs(regexLed);
              options?.onProgress?.(`Found ${regexLed.length} displays via text analysis (supplemented)`);

              const project = parsed.project || {};
              const docRequirements = (parsed.requirements || []).map((r: any) => ({
                description: r.description || "",
                category: r.category || "technical",
                status: r.status || "info",
                date: null,
                sourcePages: [],
                rawText: r.description || "",
              }));
              // Non-LED items from regex go to requirements too
              const { nonLedRequirements: regexNonLed } = separateByCategory(allRegex);
              const regexReqs = regexNonLed.map((r: any) => ({
                description: r.description || "",
                category: r.category || "technical",
                status: r.status || "info",
                date: null,
                sourcePages: [],
                rawText: r.rawText || r.description || "",
              }));

              return {
                screens: regexSpecs,
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
                requirements: [...docRequirements, ...regexReqs, ...nonLedRequirements],
                source: "glm5",
              };
            }
          }

          options?.onProgress?.(`Found ${ledDisplays.length} LED displays via document analysis`);

          const project = parsed.project || {};
          const docRequirements = (parsed.requirements || []).map((r: any) => ({
            description: r.description || "",
            category: r.category || "technical",
            status: r.status || "info",
            date: null,
            sourcePages: [],
            rawText: r.description || "",
          }));

          return {
            screens: aiToSpecs(ledDisplays),
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
            requirements: [...docRequirements, ...nonLedRequirements],
            source: "glm5",
          };
        } else {
          console.log(`[RFP v2] Mistral OCR returned no annotation — falling back to text + AI`);
        }
      } else {
        const errText = await ocrRes.text().catch(() => "");
        console.error(`[RFP v2] Mistral OCR Annotations failed (${ocrRes.status}):`, errText.substring(0, 300));
      }
    } catch (err: any) {
      console.error(`[RFP v2] Mistral OCR Annotations error:`, err.message);
    }
  }

  // =====================================================================
  // FALLBACK 1: Mistral Document QnA — send PDF directly to chat model
  // The model handles OCR internally and reasons over the document
  // =====================================================================
  if (MISTRAL_API_KEY) {
    options?.onProgress?.("Analyzing document with Mistral QnA...");
    try {
      const { readFile: readPdf2 } = await import("fs/promises");
      const pdfBuf = await readPdf2(pdfPath);
      const b64 = pdfBuf.toString("base64");

      console.log(`[RFP v2] Mistral Document QnA: sending PDF (${(pdfBuf.length / 1024 / 1024).toFixed(1)}MB)...`);

      const qnaPrompt = `Extract ALL LED displays, scoreboards, clocks, and control systems from this RFP document.

Return ONLY a JSON object:
{
  "project": { "name": string, "client": string, "venue": string, "address": string },
  "displays": [
    {
      "name": string,
      "location": string | null,
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
}

Rules:
- Each unique item is ONE entry with the correct quantity. Do NOT split back-to-back pairs into separate rows.
- "2 displays located back-to-back" = 1 entry with quantity: 2
- Include dimensions and pixel pitch ONLY if explicitly stated.
- Classify correctly: LED videoboards/ribbons = led_display, fixed digit scoreboards = scoreboard, timing displays = clock, controllers/CMS/playback = control_system`;

      const qnaRes = await fetch(`${MISTRAL_API_BASE}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${MISTRAL_API_KEY}`,
        },
        body: JSON.stringify({
          model: "mistral-small-latest",
          messages: [{
            role: "user",
            content: [
              { type: "text", text: qnaPrompt },
              { type: "document_url", document_url: `data:application/pdf;base64,${b64}` },
            ],
          }],
          temperature: 0,
          max_tokens: 65536,
          response_format: { type: "json_object" },
        }),
      });

      if (qnaRes.ok) {
        const data = await qnaRes.json();
        const content = data.choices?.[0]?.message?.content || "";
        const start = content.indexOf("{");
        const end = content.lastIndexOf("}");
        if (start >= 0 && end > start) {
          const parsed = JSON.parse(content.substring(start, end + 1));
          const allDisplays = parsed.displays || [];
          const { ledDisplays, nonLedRequirements } = separateAiByCategory(allDisplays);

          console.log(`[RFP v2] Mistral QnA: ${allDisplays.length} total, ${ledDisplays.length} LED displays`);
          options?.onProgress?.(`Found ${ledDisplays.length} LED displays via document QnA`);

          const project = parsed.project || {};
          const qnaRequirements = (parsed.requirements || []).map((r: any) => ({
            description: r.description || "",
            category: r.category || "technical",
            status: r.status || "info",
            date: null,
            sourcePages: [],
            rawText: r.description || "",
          }));

          return {
            screens: aiToSpecs(ledDisplays),
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
            requirements: [...qnaRequirements, ...nonLedRequirements],
            source: "glm5",
          };
        }
      } else {
        const errText = await qnaRes.text().catch(() => "");
        console.error(`[RFP v2] Mistral QnA failed (${qnaRes.status}):`, errText.substring(0, 300));
      }
    } catch (err: any) {
      console.error(`[RFP v2] Mistral QnA error:`, err.message);
    }
  }

  // =====================================================================
  // FALLBACK 2: Text extraction + AI reasoning (last resort)
  // =====================================================================
  options?.onProgress?.("Extracting text from PDF...");
  const { pages, fullText } = await extractFullText(pdfPath);

  if (fullText.trim().length < 100) {
    console.log(`[RFP v2] No meaningful text extracted`);
    return {
      screens: [],
      project: extractProjectInfo(fullText),
      requirements: [],
      source: "glm5",
    };
  }

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

  console.log(`[RFP v2] Fallback path: ${keptPages.length}/${pages.length} LED-relevant pages (${stats})`);
  options?.onProgress?.("Analyzing with AI...");

  try {
    const aiResult = await extractDisplaysViaAI(pdfPath, filtered);
    const allDisplays = aiResult.displays || [];
    const { ledDisplays, nonLedRequirements } = separateAiByCategory(allDisplays);
    console.log(`[RFP v2] AI extraction: ${allDisplays.length} total, ${ledDisplays.length} LED displays`);
    options?.onProgress?.(`Found ${ledDisplays.length} LED displays via AI extraction`);

    const project = aiResult.project || {};
    const aiRequirements = (aiResult.requirements || []).map((r: any) => ({
      description: r.description || "",
      category: r.category || "technical",
      status: r.status || "info",
      date: null,
      sourcePages: [],
      rawText: r.description || "",
    }));

    return {
      screens: aiToSpecs(ledDisplays),
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
      requirements: [...aiRequirements, ...nonLedRequirements],
      source: "glm5",
    };
  } catch (err: any) {
    console.error(`[RFP v2] AI extraction failed:`, err.message);
    throw err;
  }
}

export function isGLM5Available(): boolean {
  // v2 only needs pdftotext (always available) + optionally MISTRAL_API_KEY for fallback
  return true;
}
