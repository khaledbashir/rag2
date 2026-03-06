/**
 * AI Template Analyzer
 *
 * Uses NVIDIA NIM (OpenAI-compatible) to analyze Excel template structure
 * and map labels to spec field keys. Replaces brittle regex matching with
 * AI understanding of any template layout.
 *
 * Flow:
 *   1. Extract template cells/merges into structured text description
 *   2. Send to Llama 3.2 90B (via NVIDIA NIM) with field key vocabulary
 *   3. AI returns JSON mapping: { rowIndex, label, fieldKey, valueCol, type }
 *   4. Result cached in ImportProfile ("Map Once, Remember Forever")
 */

// ─── Known spec field keys with descriptions (vocabulary for AI) ─────────────

const FIELD_KEY_VOCABULARY: Record<string, string> = {
  // General
  respondent: "Company/respondent name submitting the form",
  displayName: "Display name or identifier",
  displayLocation: "Physical location of the display",
  manufacturer: "LED display manufacturer/vendor",
  model: "Product model number",
  bidType: "Base or Alternate bid type",
  ledType: "Type of LED (Indoor/Outdoor LED)",

  // Display specs
  pixelPitch: "Physical pixel pitch in mm",
  virtualPixelPitch: "Always N/A",
  indoorOutdoor: "Indoor or Outdoor installation",
  panelResolutionW: "Panel/cabinet resolution width in pixels",
  panelResolutionH: "Panel/cabinet resolution height in pixels",
  activeDisplaySize: "Overall active display size (not including borders)",
  specWidthFt: "Specified display width in feet",
  specHeightFt: "Specified display height in feet",
  physicalSizeWithBorders: "Physical display size including borders/shrouding",
  physicalWidthWithBorder: "Physical width with borders in feet",
  physicalHeightWithBorder: "Physical height with borders in feet",
  actualWidthFt: "Actual display width in feet",
  actualHeightFt: "Actual display height in feet",
  totalResolutionW: "Total display resolution width in pixels",
  totalResolutionH: "Total display resolution height in pixels",
  areaSqFt: "Display area per screen in square feet",
  numberOfScreens: "Number of screens/displays",
  pixelDensity: "Pixel density (pixels per square foot)",

  // Optical
  viewingAngleH: "Horizontal viewing angle in degrees",
  viewingAngleUp: "Vertical up viewing angle",
  viewingAngleDown: "Vertical down viewing angle",
  pixelFillFactor: "Pixel fill factor percentage",
  openArea: "Percent open area / transparency",
  maxBrightness: "Maximum brightness in NITs",
  postCalibrationBrightness: "Post-calibration brightness in NITs",
  brightnessAdjustment: "Brightness level adjustment range",
  nativeColorTemperature: "Native color temperature",
  colorTemperatureK: "Color temperature in Kelvin",
  colorTempAdjustability: "Color temperature adjustability range",
  colorSpaceRec709: "Color space Rec 709 coverage percentage",
  colorSpaceDciP3: "Color space DCI-P3 coverage percentage",
  colorSpaceRec2020: "Color space Rec 2020 coverage percentage",
  refreshRate: "Display refresh rate in Hz",
  contrastRatio: "Contrast ratio",

  // OEM
  oemLedModuleMfr: "OEM LED module manufacturer",
  oemProcessorMfr: "OEM processor/controller manufacturer",
  factory: "Factory / country of origin",
  ledLampType: "LED lamp type (SMD, DIP, etc.)",

  // Electrical
  powerAt0: "Power consumption at 0% (black screen) in KW",
  powerAvg: "Power consumption average/typical in KW",
  powerAt100: "Power consumption at 100% (white screen) in KW",
  btuAt0: "BTU heat output at 0% (black screen)",
  btuAvg: "BTU heat output average",
  btuAt100: "BTU heat output at 100% (white screen)",
  powerRequirements: "Power requirements (voltage, phase)",

  // Weight
  totalWeight: "Total display assembly weight",

  // Other
  smdLedModel: "SMD LED model number",
  gradationMethod: "Gradation/processing bit depth",
  tonalGradation: "Tonal gradation (color depth)",
  ventilationRequirements: "Ventilation / cooling method",
  ipRating: "IP / ingress protection rating",
  serviceAccess: "Service access type (front/rear)",

  // Sub-row fields (for templates with multi-row grouped fields)
  pixelPitchV: "Vertical pixel pitch (vertical-to-vertical spacing)",
  pixelPitchH: "Horizontal pixel pitch (horizontal-to-horizontal spacing)",
};

// ─── NVIDIA NIM Configuration ────────────────────────────────────────────────

const NIM_BASE_URL = process.env.NVIDIA_NIM_BASE_URL || "https://integrate.api.nvidia.com/v1";
const NIM_API_KEY = process.env.NVIDIA_NIM_API_KEY || "";
const NIM_MODEL = process.env.NVIDIA_NIM_MODEL || "meta/llama-3.2-90b-vision-instruct";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AIFieldMapping {
  type: "section" | "field" | "separator";
  label: string;
  fieldKey: string | null;
  rowIndex: number;
  valueCol: number;
}

export interface AIAnalysisResult {
  fields: AIFieldMapping[];
  templateType: string; // e.g., "AJP/WJHW Product Data Form", "Standard 2-Column"
  confidence: number;   // 0-1 overall confidence
}

// ─── Template structure extraction ───────────────────────────────────────────

interface CellInfo {
  row: number;
  col: number;
  value: string;
  isMerged?: boolean;
  mergeEndCol?: number;
  mergeEndRow?: number;
}

/**
 * Convert Excel template structure into a concise text representation
 * that the AI can analyze. Includes merge info, cell values, and layout.
 */
export function extractTemplateStructure(
  data: any[][],
  merges: any[],
): string {
  const lines: string[] = [];
  lines.push("=== TEMPLATE STRUCTURE ===");
  lines.push(`Total rows: ${data.length}`);
  lines.push(`Merges: ${merges.length}`);
  lines.push("");

  for (let r = 0; r < data.length; r++) {
    const row = data[r] || [];
    const cells: string[] = [];
    let hasContent = false;

    for (let c = 0; c < Math.min(row.length, 12); c++) {
      const val = String(row[c] || "").trim();
      if (val) hasContent = true;

      // Check if this cell starts a merge
      const merge = merges.find(
        (m: any) => m.s.r === r && m.s.c === c
      );

      if (merge) {
        const mergeSpan = `[${colLetter(c)}:${colLetter(merge.e.c)}]`;
        cells.push(`${colLetter(c)}${mergeSpan}="${val}"`);
        // Skip merged columns
        c = merge.e.c;
      } else {
        if (val) {
          cells.push(`${colLetter(c)}="${val}"`);
        }
      }
    }

    if (hasContent) {
      lines.push(`Row ${r}: ${cells.join(" | ")}`);
    }
  }

  return lines.join("\n");
}

function colLetter(idx: number): string {
  return String.fromCharCode(65 + idx); // A=0, B=1, ...
}

// ─── AI Analysis ─────────────────────────────────────────────────────────────

/**
 * Analyze a template using AI to produce field mappings.
 * Returns null if AI is unavailable or fails (caller should fall back to regex).
 */
export async function analyzeTemplateWithAI(
  data: any[][],
  merges: any[],
): Promise<AIAnalysisResult | null> {
  if (!NIM_API_KEY) {
    console.warn("[AI Template] No NVIDIA_NIM_API_KEY — skipping AI analysis");
    return null;
  }

  const structure = extractTemplateStructure(data, merges);

  // Build the field key vocabulary list for the prompt
  const vocabList = Object.entries(FIELD_KEY_VOCABULARY)
    .map(([key, desc]) => `  "${key}": ${desc}`)
    .join("\n");

  const systemPrompt = `You are an expert at analyzing LED display Product Data Form templates.
Given the structure of an Excel template (rows, columns, merged cells), identify:
1. Section headers (bold titles that group fields together)
2. Field rows (label → value pairs where users fill in spec data)
3. The correct value column for each field (where the blank/placeholder cell is)

The template may use different layouts:
- Simple 2-column: label in A, value in B
- Multi-column: labels merge across A:E, values in F or later columns
- Sub-rows: parent field in A spans multiple rows, sub-labels in col F (e.g., "VERTICAL:", "HORIZONTAL:")
- Dual-field rows: two label-value pairs on one row (e.g., label in A, value in B, second label in F, second value in G)`;

  const userPrompt = `Analyze this LED display Product Data Form template and map each row to the correct spec field key.

${structure}

=== KNOWN FIELD KEYS ===
${vocabList}

Return a JSON array of objects. Each object has:
- "type": "section" | "field" | "separator"
- "label": the text label from the template
- "fieldKey": one of the known field keys above, or null if you can't identify it
- "rowIndex": the row number (0-based)
- "valueCol": the 0-based column index where values should be written (the first empty/placeholder column after the label)

Rules:
- Section headers have type="section", fieldKey=null
- Empty rows or decorative dividers have type="separator", fieldKey=null
- For multi-column templates where labels merge A:E, valueCol should be 5 (column F) or higher
- For simple 2-column templates, valueCol is usually 1 (column B)
- If a row has sub-labels (like "VERTICAL:" or "AT 0% (BLACK SCREEN):"), each sub-label is a separate field entry
- Be precise: "PHYSICAL PIXEL SPACING" maps to "pixelPitch", not "pixelDensity"
- Only use field keys from the list above. If unsure, set fieldKey to null.

Return ONLY the JSON array, no other text. Example:
[
  {"type":"section","label":"GENERAL INFORMATION","fieldKey":null,"rowIndex":0,"valueCol":1},
  {"type":"field","label":"Respondent's Name","fieldKey":"respondent","rowIndex":1,"valueCol":1},
  {"type":"field","label":"Display Name","fieldKey":"displayName","rowIndex":2,"valueCol":5}
]`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000); // 30s timeout

    const response = await fetch(`${NIM_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${NIM_API_KEY}`,
      },
      body: JSON.stringify({
        model: NIM_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.1, // Low temp for structured output
        max_tokens: 4096,
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!response.ok) {
      const errText = await response.text();
      console.warn(`[AI Template] NIM API error ${response.status}: ${errText.slice(0, 200)}`);
      return null;
    }

    const json = await response.json();
    const content = json.choices?.[0]?.message?.content;

    if (!content) {
      console.warn("[AI Template] Empty response from NIM");
      return null;
    }

    // Parse the JSON response — handle markdown code fences
    const cleaned = content
      .replace(/^```json\s*/i, "")
      .replace(/```\s*$/, "")
      .trim();

    const fields: AIFieldMapping[] = JSON.parse(cleaned);

    // Validate: only allow known field keys
    const validKeys = new Set(Object.keys(FIELD_KEY_VOCABULARY));
    for (const f of fields) {
      if (f.fieldKey && !validKeys.has(f.fieldKey)) {
        console.warn(`[AI Template] Unknown fieldKey "${f.fieldKey}" for "${f.label}" — setting to null`);
        f.fieldKey = null;
      }
      // Ensure valueCol is a reasonable number
      if (typeof f.valueCol !== "number" || f.valueCol < 0 || f.valueCol > 20) {
        f.valueCol = 1;
      }
    }

    // Detect template type based on layout
    const hasWideLabels = merges.some(
      (m: any) => m.s.c === 0 && m.e.c >= 3 && m.e.r === m.s.r
    );
    const templateType = hasWideLabels
      ? "Multi-column Product Data Form"
      : "Standard 2-column Product Data Form";

    // Calculate confidence: proportion of fields with a known fieldKey
    const fieldEntries = fields.filter(f => f.type === "field");
    const mappedEntries = fieldEntries.filter(f => f.fieldKey !== null);
    const confidence = fieldEntries.length > 0
      ? mappedEntries.length / fieldEntries.length
      : 0;

    console.log(
      `[AI Template] Analyzed: ${fields.length} entries, ${mappedEntries.length}/${fieldEntries.length} mapped (${(confidence * 100).toFixed(0)}% confidence), type: ${templateType}`
    );

    return { fields, templateType, confidence };
  } catch (err: any) {
    console.warn(`[AI Template] Analysis failed: ${err.message}`);
    return null;
  }
}

/**
 * Merge AI results with regex fallback.
 * AI results take priority; regex fills in any gaps the AI missed.
 */
export function mergeWithRegexFallback(
  aiFields: AIFieldMapping[],
  regexFields: { type: string; label: string; fieldKey: string | null; rowIndex: number; valueCol: number }[],
): AIFieldMapping[] {
  // Build a map of row → AI result
  const aiByRow = new Map<number, AIFieldMapping>();
  for (const f of aiFields) {
    aiByRow.set(f.rowIndex, f);
  }

  // For any regex field that the AI missed (not in AI results), add it
  for (const rf of regexFields) {
    if (!aiByRow.has(rf.rowIndex) && rf.fieldKey) {
      aiByRow.set(rf.rowIndex, {
        type: rf.type as "section" | "field" | "separator",
        label: rf.label,
        fieldKey: rf.fieldKey,
        rowIndex: rf.rowIndex,
        valueCol: rf.valueCol,
      });
    }
  }

  // For AI fields that have null fieldKey, check if regex matched something
  for (const af of aiFields) {
    if (af.type === "field" && af.fieldKey === null) {
      const regexMatch = regexFields.find(
        rf => rf.rowIndex === af.rowIndex && rf.fieldKey
      );
      if (regexMatch) {
        af.fieldKey = regexMatch.fieldKey;
      }
    }
  }

  // Return sorted by row
  return Array.from(aiByRow.values()).sort((a, b) => a.rowIndex - b.rowIndex);
}
