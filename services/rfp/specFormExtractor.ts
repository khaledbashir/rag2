import { ANYTHING_LLM_BASE_URL, ANYTHING_LLM_KEY } from "@/lib/variables";
import { ANC_SYSTEM_PROMPT } from "@/lib/ai-prompts";

export interface ExtractedSpecForm {
  formId: string;
  screenName: string;
  location: string;
  widthFt: number | null;
  heightFt: number | null;
  widthPx: number | null;
  heightPx: number | null;
  pitchMm: number | null;
  brightness: number | null; // nits
  maxPower: number | null; // watts
  weight: number | null; // lbs
  hardware: string;
  processing: string;
  environment: "Indoor" | "Outdoor";
  quantity: number;
  confidence: number;
  citation: string;
}

const DASHBOARD_WORKSPACE_SLUG = process.env.ANYTHING_LLM_WORKSPACE || "ancdashboard";

const FORM_MARKER = /(?:^|\n)\s*((?:form\s*1[\w-]*|requirement\s*details?|exhibit\s*g)[^\n]*)/gi;

const DIMENSION_PATTERNS = [
  /(\d+)['′]\s*[-–]?\s*(\d*)["″]?\s*[xX×]\s*(\d+)['′]\s*[-–]?\s*(\d*)["″]?/,
  /(\d+(?:\.\d+)?)\s*(?:ft|feet)\s*[xX×]\s*(\d+(?:\.\d+)?)\s*(?:ft|feet)/i,
  /(\d+)["″]\s*[xX×]\s*(\d+)["″]/,
  /(?:dimensions?|size|active\s*area)\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*(?:ft|feet)\s*(?:w|wide)?\s*[xX×]\s*(\d+(?:\.\d+)?)\s*(?:ft|feet)\s*(?:h|high)?/i,
  // AJP-style: "32' tall x 106' wide" or "3' tall x 252' wide"
  /(\d+(?:\.\d+)?)['′]\s*(?:tall|high|h)\s*[xX×]\s*(\d+(?:\.\d+)?)['′]\s*(?:wide|long|w)/i,
];

const PITCH_PATTERNS = [
  /(\d+(?:\.\d+)?)\s*mm\s*(?:pixel\s*)?pitch/i,
  /pitch[:\s]+(\d+(?:\.\d+)?)\s*mm/i,
  /\bP(\d+(?:\.\d+)?)\b/i,
  /(\d+(?:\.\d+)?)\s*mm\s*PP/i,
  // AJP-style: "10 (mm)" or "8 (mm)"
  /(\d+(?:\.\d+)?)\s*\(\s*mm\s*\)/i,
];

const QUANTITY_PATTERNS = [
  /(?:qty|quantity)[:\s]*(\d+)/i,
  /(?:number\s*of\s*displays?)[:\s]*(\d+)/i,
  // AJP-style: "One (1)", "Two (2)" — extract the digit in parens
  /(?:one|two|three|four|five|six|eight|ten)\s*\((\d+)\)/i,
  /\((\d+)\)/,
];

const ENVIRONMENT_PATTERNS = [
  { pattern: /outdoor|exterior|weatherproof|ip65|ip66/i, env: "Outdoor" as const },
  { pattern: /indoor|interior|lobby|concourse/i, env: "Indoor" as const },
];

function parseNumber(raw: string | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/,/g, "").trim();
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function sanitizeLabel(raw: string | undefined): string {
  return (raw || "").replace(/\s+/g, " ").replace(/[\s,;:.]+$/g, "").trim();
}

function normalizeFormId(rawHeading: string): string {
  const match = rawHeading.match(/form\s*(1[\w-]*)/i);
  if (!match) return "Form 1";
  return `Form ${match[1].replace(/\s+/g, "")}`;
}

function parseDimensions(text: string): { widthFt: number | null; heightFt: number | null } {
  for (const pattern of DIMENSION_PATTERNS) {
    const match = text.match(pattern);
    if (!match) continue;

    // AJP-style: "32' tall x 106' wide" — match[1] = height, match[2] = width
    if (pattern.source.includes("tall|high")) {
      const height = parseNumber(match[1]);
      const width = parseNumber(match[2]);
      if (width && height) return { widthFt: width, heightFt: height };
    }

    if (pattern.source.includes("ft|feet") || pattern.source.includes("active\\s*area")) {
      const width = parseNumber(match[1]);
      const height = parseNumber(match[2]);
      if (width && height) return { widthFt: width, heightFt: height };
    }

    if (pattern.source.includes("[\\\"″]")) {
      const widthIn = parseNumber(match[1]);
      const heightIn = parseNumber(match[2]);
      if (widthIn && heightIn) return { widthFt: widthIn / 12, heightFt: heightIn / 12 };
    }

    const feetW = parseNumber(match[1]);
    const inchesW = parseNumber(match[2]) || 0;
    const feetH = parseNumber(match[3]);
    const inchesH = parseNumber(match[4]) || 0;
    if (feetW && feetH) {
      return { widthFt: feetW + inchesW / 12, heightFt: feetH + inchesH / 12 };
    }
  }

  return { widthFt: null, heightFt: null };
}

function parseResolution(text: string): { widthPx: number | null; heightPx: number | null } {
  const patterns = [
    /(?:resolution|pixels?)\s*[:\-]?\s*(\d{3,6})\s*[xX×]\s*(\d{3,6})/i,
    /(\d{3,6})\s*(?:px|pixels?)\s*[xX×]\s*(\d{3,6})\s*(?:px|pixels?)?/i,
    // AJP-style: "976 vertical pixels by 3232 horizontal pixels"
    /(\d{2,6})\s*vertical\s*pixels?\s*(?:by|[xX×])\s*(\d{2,6})\s*horizontal\s*pixels?/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    // AJP-style: "vertical pixels by horizontal pixels" — match[1]=height, match[2]=width
    if (pattern.source.includes("vertical")) {
      const height = parseNumber(match[1]);
      const width = parseNumber(match[2]);
      if (width && height) return { widthPx: width, heightPx: height };
    }
    const width = parseNumber(match[1]);
    const height = parseNumber(match[2]);
    if (width && height) return { widthPx: width, heightPx: height };
  }

  return { widthPx: null, heightPx: null };
}

function parsePitchMm(text: string): number | null {
  for (const pattern of PITCH_PATTERNS) {
    const match = text.match(pattern);
    const pitch = parseNumber(match?.[1]);
    if (pitch) return pitch;
  }
  return null;
}

function parseBrightness(text: string): number | null {
  const match = text.match(/(\d{2,5}(?:,\d{3})?)\s*(?:nits?|cd\/m2|cd\/m²)/i);
  return parseNumber(match?.[1]);
}

function parseMaxPowerWatts(text: string): number | null {
  const watts = text.match(/(?:max(?:imum)?\s*)?(?:power|consumption)[^\n:]*[:\s]+(\d{2,7}(?:,\d{3})?)\s*w(?:atts?)?\b/i);
  if (watts) return parseNumber(watts[1]);

  const kw = text.match(/(?:max(?:imum)?\s*)?(?:power|consumption)[^\n:]*[:\s]+(\d{1,4}(?:\.\d+)?)\s*kw\b/i);
  const kwValue = parseNumber(kw?.[1]);
  if (kwValue) return kwValue * 1000;

  return null;
}

function parseWeightLbs(text: string): number | null {
  const lbs = text.match(/(?:weight|mass)[^\n:]*[:\s]+(\d{2,7}(?:,\d{3})?)\s*(?:lbs?|pounds?)\b/i);
  if (lbs) return parseNumber(lbs[1]);

  const kg = text.match(/(?:weight|mass)[^\n:]*[:\s]+(\d{2,6}(?:\.\d+)?)\s*kg\b/i);
  const kgValue = parseNumber(kg?.[1]);
  if (kgValue) return kgValue * 2.2046226218;

  return null;
}

function parseHardware(text: string): string {
  const direct = text.match(/(?:hardware|module|display\s*model|model)\s*[:\-]\s*([^\n]+)/i);
  if (direct) return sanitizeLabel(direct[1]);

  const brand = text.match(/\b(?:Nitxeon|Absen|Daktronics|LG|Samsung|Unilumin|Barco|Sony)\b[^\n]*/i);
  return sanitizeLabel(brand?.[0]);
}

function parseProcessing(text: string): string {
  const direct = text.match(/(?:processing|processor|controller)\s*[:\-]\s*([^\n]+)/i);
  if (direct) return sanitizeLabel(direct[1]);

  const brand = text.match(/\b(?:NovaStar|Colorlight|Brompton|Megapixel|Avolites)\b[^\n]*/i);
  return sanitizeLabel(brand?.[0]);
}

function parseQuantity(text: string): number {
  for (const pattern of QUANTITY_PATTERNS) {
    const match = text.match(pattern);
    const qty = parseNumber(match?.[1]);
    if (qty && qty > 0) return Math.round(qty);
  }
  return 1;
}

function parseEnvironment(text: string): "Indoor" | "Outdoor" {
  for (const { pattern, env } of ENVIRONMENT_PATTERNS) {
    if (pattern.test(text)) return env;
  }
  return "Indoor";
}

function parseScreenName(block: string, fallbackIndex: number): string {
  const direct = block.match(/(?:screen|display)\s*(?:name|id)?\s*[:\-]\s*([^\n]+)/i);
  if (direct) return sanitizeLabel(direct[1]);

  const heading = block.split("\n")[0] || "";
  const headingName = heading.match(/(?:form\s*1[\w-]*\s*[-:])\s*(.+)$/i);
  if (headingName) return sanitizeLabel(headingName[1]);

  return `Display ${fallbackIndex + 1}`;
}

function parseLocation(block: string): string {
  const direct = block.match(/(?:location|zone|area|venue|placement)\s*[:\-]\s*([^\n]+)/i);
  if (direct) return sanitizeLabel(direct[1]);

  const line = block.match(/(?:north|south|east|west|lobby|concourse|bowl|plaza|fa[cç]ade|entry|atrium)[^\n]*/i);
  return sanitizeLabel(line?.[0]);
}

function computeConfidence(spec: Omit<ExtractedSpecForm, "confidence">): number {
  let score = 0.2;

  if (/form\s*1/i.test(spec.formId)) score += 0.1;
  if (spec.screenName && !/^Display\s\d+$/i.test(spec.screenName)) score += 0.08;
  if (spec.location) score += 0.07;
  if (spec.widthFt && spec.heightFt) score += 0.12;
  if (spec.widthPx && spec.heightPx) score += 0.08;
  if (spec.pitchMm) score += 0.12;
  if (spec.brightness) score += 0.08;
  if (spec.maxPower) score += 0.08;
  if (spec.weight) score += 0.07;
  if (spec.hardware) score += 0.05;
  if (spec.processing) score += 0.05;
  if (spec.quantity > 0) score += 0.04;
  if (spec.environment) score += 0.04;

  return Math.max(0, Math.min(1, Math.round(score * 100) / 100));
}

function normalizeCitation(text: string): string {
  const firstLine = sanitizeLabel((text.split("\n")[0] || "").slice(0, 140));
  return firstLine ? `[Source: ${firstLine}]` : "[Source: Requirement Details section]";
}

function parseSpecBlock(block: string, index: number): ExtractedSpecForm | null {
  const heading = block.split("\n")[0] || "";
  const formId = normalizeFormId(heading);
  const { widthFt, heightFt } = parseDimensions(block);
  const { widthPx, heightPx } = parseResolution(block);

  const parsed: Omit<ExtractedSpecForm, "confidence"> = {
    formId,
    screenName: parseScreenName(block, index),
    location: parseLocation(block),
    widthFt: widthFt ? Math.round(widthFt * 100) / 100 : null,
    heightFt: heightFt ? Math.round(heightFt * 100) / 100 : null,
    widthPx: widthPx ? Math.round(widthPx) : null,
    heightPx: heightPx ? Math.round(heightPx) : null,
    pitchMm: parsePitchMm(block),
    brightness: parseBrightness(block),
    maxPower: (() => {
      const value = parseMaxPowerWatts(block);
      return value ? Math.round(value) : null;
    })(),
    weight: (() => {
      const value = parseWeightLbs(block);
      return value ? Math.round(value) : null;
    })(),
    hardware: parseHardware(block),
    processing: parseProcessing(block),
    environment: parseEnvironment(block),
    quantity: parseQuantity(block),
    citation: normalizeCitation(block),
  };

  const keySignalCount = [
    parsed.widthFt && parsed.heightFt,
    parsed.pitchMm,
    parsed.maxPower,
    parsed.weight,
    parsed.brightness,
    parsed.hardware,
    parsed.processing,
  ].filter(Boolean).length;

  if (keySignalCount < 2 && !/form\s*1|requirement\s*details|exhibit\s*g/i.test(block)) {
    return null;
  }

  return {
    ...parsed,
    confidence: computeConfidence(parsed),
  };
}

export function extractSpecForms(text: string): ExtractedSpecForm[] {
  const normalized = text.replace(/\r/g, "");
  const markerMatches: Array<{ index: number; header: string }> = [];

  for (const match of normalized.matchAll(FORM_MARKER)) {
    const index = match.index ?? -1;
    if (index < 0) continue;
    markerMatches.push({ index, header: sanitizeLabel(match[1]) });
  }

  const blocks: string[] = [];

  if (markerMatches.length > 0) {
    for (let i = 0; i < markerMatches.length; i++) {
      const start = markerMatches[i].index;
      const end = markerMatches[i + 1]?.index ?? normalized.length;
      blocks.push(normalized.slice(start, end).trim());
    }
  } else {
    blocks.push(normalized);
  }

  const extracted: ExtractedSpecForm[] = [];

  for (let i = 0; i < blocks.length; i++) {
    const parsed = parseSpecBlock(blocks[i], i);
    if (parsed) extracted.push(parsed);
  }

  const deduped = new Map<string, ExtractedSpecForm>();
  for (const spec of extracted) {
    const key = `${spec.formId}|${spec.screenName}|${spec.widthFt}|${spec.heightFt}|${spec.pitchMm}`;
    if (!deduped.has(key)) {
      deduped.set(key, spec);
      continue;
    }

    const existing = deduped.get(key)!;
    if (spec.confidence > existing.confidence) deduped.set(key, spec);
  }

  return Array.from(deduped.values());
}

function extractJsonArray(raw: string): unknown[] {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] || raw).trim();

  const attempts = [candidate];
  const bracketStart = candidate.indexOf("[");
  const bracketEnd = candidate.lastIndexOf("]");
  if (bracketStart >= 0 && bracketEnd > bracketStart) {
    attempts.push(candidate.slice(bracketStart, bracketEnd + 1));
  }

  for (const attempt of attempts) {
    try {
      const parsed: unknown = JSON.parse(attempt);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // continue
    }
  }

  throw new Error("AI response did not return a valid JSON array for ExtractedSpecForm[].");
}

function coerceAiSpec(input: unknown): ExtractedSpecForm | null {
  if (!input || typeof input !== "object") return null;
  const row = input as Record<string, unknown>;

  const environmentRaw = String(row.environment || "Indoor").toLowerCase();
  const environment: "Indoor" | "Outdoor" = environmentRaw.includes("out") ? "Outdoor" : "Indoor";

  const base: Omit<ExtractedSpecForm, "confidence"> = {
    formId: sanitizeLabel(String(row.formId || "Form 1")),
    screenName: sanitizeLabel(String(row.screenName || "Display")),
    location: sanitizeLabel(String(row.location || "")),
    widthFt: parseNumber(typeof row.widthFt === "string" ? row.widthFt : row.widthFt != null ? String(row.widthFt) : undefined),
    heightFt: parseNumber(typeof row.heightFt === "string" ? row.heightFt : row.heightFt != null ? String(row.heightFt) : undefined),
    widthPx: parseNumber(typeof row.widthPx === "string" ? row.widthPx : row.widthPx != null ? String(row.widthPx) : undefined),
    heightPx: parseNumber(typeof row.heightPx === "string" ? row.heightPx : row.heightPx != null ? String(row.heightPx) : undefined),
    pitchMm: parseNumber(typeof row.pitchMm === "string" ? row.pitchMm : row.pitchMm != null ? String(row.pitchMm) : undefined),
    brightness: parseNumber(typeof row.brightness === "string" ? row.brightness : row.brightness != null ? String(row.brightness) : undefined),
    maxPower: parseNumber(typeof row.maxPower === "string" ? row.maxPower : row.maxPower != null ? String(row.maxPower) : undefined),
    weight: parseNumber(typeof row.weight === "string" ? row.weight : row.weight != null ? String(row.weight) : undefined),
    hardware: sanitizeLabel(String(row.hardware || "")),
    processing: sanitizeLabel(String(row.processing || "")),
    environment,
    quantity: Math.max(1, Math.round(parseNumber(typeof row.quantity === "string" ? row.quantity : row.quantity != null ? String(row.quantity) : undefined) || 1)),
    citation: sanitizeLabel(String(row.citation || "[Source: AI extraction]") || "[Source: AI extraction]"),
  };

  const confidenceValue = parseNumber(typeof row.confidence === "string" ? row.confidence : row.confidence != null ? String(row.confidence) : undefined);

  return {
    ...base,
    confidence: confidenceValue ?? computeConfidence(base),
  };
}

async function callAnythingLLM(message: string): Promise<{ text: string; sources: unknown[] }> {
  const chatUrl = `${ANYTHING_LLM_BASE_URL}/workspace/${DASHBOARD_WORKSPACE_SLUG}/chat`;

  const response = await fetch(chatUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ANYTHING_LLM_KEY}`,
    },
    body: JSON.stringify({
      message,
      mode: "chat",
      sessionId: `spec-form-extractor-${Date.now()}`,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`AnythingLLM error (${response.status}): ${errorText}`);
  }

  const data: unknown = await response.json();
  const asRecord = data as Record<string, unknown>;

  return {
    text: String(asRecord.textResponse || asRecord.response || ""),
    sources: Array.isArray(asRecord.sources) ? asRecord.sources : [],
  };
}

export async function extractSpecFormsWithAI(highValueText: string): Promise<ExtractedSpecForm[]> {
  if (!ANYTHING_LLM_BASE_URL || !ANYTHING_LLM_KEY) {
    throw new Error("AnythingLLM not configured. Set ANYTHING_LLM_URL and ANYTHING_LLM_KEY.");
  }

  const prompt = `${ANC_SYSTEM_PROMPT}

You are extracting LED display specification forms from an ANC RFP packet.
Focus only on sections labeled similar to: Form 1a, Form 1b, Requirement Details, Exhibit G.
Return ONLY a valid JSON array matching this schema exactly:
[
  {
    "formId": "Form 1a",
    "screenName": "string",
    "location": "string",
    "widthFt": 0,
    "heightFt": 0,
    "widthPx": 0,
    "heightPx": 0,
    "pitchMm": 0,
    "brightness": 0,
    "maxPower": 0,
    "weight": 0,
    "hardware": "string",
    "processing": "string",
    "environment": "Indoor",
    "quantity": 1,
    "confidence": 0.0,
    "citation": "[Source: Form 1a Requirement Details]"
  }
]

Rules:
- Extract factual values only; unknown values must be null (except quantity defaults to 1).
- "maxPower" must be watts.
- "weight" must be lbs.
- "brightness" must be nits.
- "environment" must be exactly "Indoor" or "Outdoor".
- Keep citations short and source-specific.
- Output JSON only with no markdown.

DOCUMENT SECTION TEXT:
${highValueText}`;

  const result = await callAnythingLLM(prompt);
  const rows = extractJsonArray(result.text);
  const specs = rows.map(coerceAiSpec).filter((row): row is ExtractedSpecForm => row !== null);

  return specs;
}
