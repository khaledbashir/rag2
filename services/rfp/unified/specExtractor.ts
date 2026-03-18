/**
 * LED Spec Extraction via Mistral Chat API (Direct)
 *
 * Takes classified pages with OCR markdown and extracts structured
 * LED display specifications by calling Mistral's chat API directly.
 *
 * WHY NOT AnythingLLM: AnythingLLM is a RAG system that mixes in its
 * own embedded document context. For extraction from raw text we need
 * a clean LLM call with ONLY our prompt + page text. No RAG noise.
 */

import type { AnalyzedPage, ExtractedLEDSpec, ExtractedProjectInfo, ExtractedRequirement, IncompleteSpec } from "./types";

const MISTRAL_API_BASE = process.env.MISTRAL_API_BASE_URL || "https://api.mistral.ai";
const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY || "";
const MISTRAL_CHAT_MODEL = process.env.MISTRAL_CHAT_MODEL || "mistral-large-latest";

// ---------------------------------------------------------------------------
// Extraction prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are the ANC Digital Signage Expert AI. You extract LED display specifications from RFP documents.

You will receive OCR'd pages from construction/stadium RFP documents. Your job is to find EVERY LED display requirement and return structured JSON.

PRIORITY SECTIONS (search for these):
1. "SECTION 11 06 60" — Display Schedule (MASTER TRUTH for quantities/dimensions)
2. "SECTION 11 63 10" — LED Display Systems (technical specs)
3. Any section mentioning: scoreboard, ribbon, fascia, marquee, video board, LED display

CRITICAL RULE — ADDENDUM PRIORITY:
- If you see an Addendum that replaces or modifies a section, ONLY extract the addendum version. The addendum SUPERSEDES the original.
- Look for phrases: "hereby replaces", "revised", "updated schedule", "this addendum modifies Section...", "replace in its entirety"
- If both original and addendum specs appear for the SAME display, ONLY return the addendum specs.
- This is critical: bidding on superseded specs loses the contract.

COST ALTERNATES:
- RFPs often include alternate pricing scenarios (e.g., "Alt A1", "Alternate 1", "Cost Alternate", "Option B").
- Extract these as SEPARATE screen entries with is_alternate: true.
- Set alternate_id to the ID from the RFP (e.g., "A1", "B3", "C", "F1").
- Set alternate_description to what it changes (e.g., "12mm Discrete Lamp upgrade for Main South").
- Alternates typically change pixel pitch, dimensions, or brightness for an existing base bid display.

EXISTING HARDWARE / INTERFACE-ONLY:
- If the RFP says to "interface with existing", "reuse", "relocate", "reinstall", or "integrate existing" equipment, do NOT extract these as new LED displays.
- Only extract items that require NEW LED hardware to be provided.
- If game clocks, shot clocks, play clocks, or scoring systems are to be INTERFACED (not replaced), exclude them from the screens array.
- Instead add a requirement: "Interface with existing [equipment name]" with category: "technical".

Return ONLY valid JSON (no markdown fences, no explanation, no text before or after):
{
  "project": {
    "client_name": null,
    "project_name": null,
    "venue": null,
    "location": null,
    "is_outdoor": false,
    "is_union": false,
    "bond_required": false,
    "special_requirements": [],
    "schedule_phases": []
  },
  "screens": [
    {
      "name": "Display name from RFP",
      "location": "Physical location in venue",
      "width_ft": 40,
      "height_ft": 22,
      "width_px": null,
      "height_px": null,
      "pixel_pitch_mm": 10,
      "brightness_nits": 6000,
      "environment": "outdoor",
      "quantity": 1,
      "service_type": "rear",
      "mounting_type": "steel structure",
      "max_power_w": null,
      "weight_lbs": null,
      "special_requirements": ["weatherproof"],
      "confidence": 0.95,
      "source_pages": [9, 15],
      "notes": null,
      "is_alternate": false,
      "alternate_id": null,
      "alternate_description": null
    }
  ],
  "requirements": [
    {
      "description": "NEMA 4X Environmental Rating required",
      "category": "compliance",
      "status": "critical",
      "date": null,
      "source_pages": [12],
      "raw_text": "All outdoor LED displays shall meet NEMA 4X rating"
    }
  ]
}

WHAT IS NOT A DISPLAY (do NOT add to screens):
- Section headers or category groupings (e.g., "LED Ribbon Displays" as a section title is NOT a display — the individual ribbon boards ARE)
- Assembly/mounting structures (e.g., "Center Hung Display Assembly" is the structure, not a display — the individual boards on it like "Main Video", "Corner Wedges" ARE)
- Generic references like "All LED displays shall..." — this is a requirement, not a display
- Systems or subsystems that don't have their own LED panel (e.g., "scoring system", "control system", "display processor")
- If a name appears ONLY as a header with no dimensions, no pixel pitch, and no brightness anywhere — it's a category, skip it

MINIMUM DATA RULE:
- Each display MUST have at least ONE physical spec: dimensions (width OR height), pixel pitch, OR brightness
- If a display name appears with ZERO physical specs and no quantity > 0, do NOT extract it
- Set confidence < 0.3 for displays with only a name and location but no specs

RULES:
- Extract every new LED display that has at least one measurable spec
- Convert dimensions to FEET (120" = 10ft, 3048mm = 10ft). If dimensions are in inches, convert: 28" height = 2.33ft
- If pixel pitch/brightness not specified, set to null
- Quantity defaults to 1 if not stated
- Confidence 0-1 based on how clearly specs are stated
- Include source page numbers
- Use concise display names from the RFP (e.g., "Main Video" not "Main LED Video Display Board")
- For requirements: category = compliance|technical|deadline|financial|operational|environmental|other
- For requirements: status = critical|verified|risk|info
- If no LED displays found, return empty screens array — do NOT invent data
- Do NOT extract static/non-illuminated signage, banners, or backlit panels as LED displays`;

// ---------------------------------------------------------------------------
// Direct Mistral Chat call
// ---------------------------------------------------------------------------

async function callMistralChat(userMessage: string): Promise<string> {
  if (!MISTRAL_API_KEY) {
    throw new Error("MISTRAL_API_KEY not set — cannot call Mistral Chat");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 180_000); // 3 min per batch

  try {
    const res = await fetch(`${MISTRAL_API_BASE}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${MISTRAL_API_KEY}`,
      },
      body: JSON.stringify({
        model: MISTRAL_CHAT_MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
        temperature: 0.0,
        max_tokens: 16384, // Larger output for bigger batches with more specs
        response_format: { type: "json_object" },
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Mistral Chat ${res.status}: ${text.slice(0, 300)}`);
    }

    const data = await res.json();
    return data.choices?.[0]?.message?.content || "";
  } catch (err: any) {
    clearTimeout(timer);
    throw new Error(`Mistral Chat failed: ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// Extract specs from a batch of pages
// ---------------------------------------------------------------------------

export async function extractLEDSpecs(
  relevantPages: AnalyzedPage[],
): Promise<{
  screens: ExtractedLEDSpec[];
  project: ExtractedProjectInfo;
  requirements: ExtractedRequirement[];
}> {
  if (relevantPages.length === 0) {
    return { screens: [], project: emptyProject(), requirements: [] };
  }

  // Combine markdown from relevant pages
  const combinedText = relevantPages
    .map((p) => {
      let content = `\n--- PAGE ${p.pageNumber} (${p.category}) ---\n${p.markdown}`;
      if (p.tables.length > 0) {
        content += "\n\nTABLES:\n";
        for (const t of p.tables) {
          content += `${t.content}\n`;
        }
      }
      return content;
    })
    .join("\n");

  // Mistral large context is 128K tokens (~100K chars). Use most of it.
  const maxChars = 100_000;
  const textToSend =
    combinedText.length > maxChars
      ? combinedText.slice(0, maxChars) + "\n\n[TRUNCATED — remaining pages omitted]"
      : combinedText;

  const userMessage = `Extract all LED display specifications and project requirements from these RFP pages:\n\n${textToSend}`;

  try {
    const response = await callMistralChat(userMessage);

    // Parse JSON from response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("[SpecExtractor] No JSON in Mistral response:", response.slice(0, 500));
      return { screens: [], project: emptyProject(), requirements: [] };
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const rawScreens = Array.isArray(parsed.screens) ? parsed.screens : [];

    const screens: ExtractedLEDSpec[] = rawScreens.map(
      (s: any): ExtractedLEDSpec => ({
        name: s.name || "Unknown Display",
        location: s.location || "",
        widthFt: s.width_ft ?? null,
        heightFt: s.height_ft ?? null,
        widthPx: s.width_px ?? null,
        heightPx: s.height_px ?? null,
        pixelPitchMm: s.pixel_pitch_mm ?? null,
        brightnessNits: s.brightness_nits ?? null,
        environment: s.environment === "outdoor" ? "outdoor" : "indoor",
        quantity: s.quantity || 1,
        serviceType: s.service_type ?? null,
        mountingType: s.mounting_type ?? null,
        maxPowerW: s.max_power_w ?? null,
        weightLbs: s.weight_lbs ?? null,
        specialRequirements: s.special_requirements || [],
        confidence: s.confidence ?? 0.5,
        sourcePages: s.source_pages || [],
        sourceType: "text",
        citation: `[Source: Pages ${(s.source_pages || []).join(", ")}]`,
        notes: s.notes ?? null,
        isAlternate: s.is_alternate ?? false,
        alternateId: s.alternate_id ?? null,
        alternateDescription: s.alternate_description ?? null,
      }),
    );

    const requirements: ExtractedRequirement[] = (parsed.requirements || []).map(
      (r: any): ExtractedRequirement => ({
        description: r.description || "",
        category: r.category || "other",
        status: r.status || "info",
        date: r.date ?? null,
        sourcePages: r.source_pages || [],
        rawText: r.raw_text ?? null,
      }),
    );

    const project: ExtractedProjectInfo = {
      clientName: parsed.project?.client_name ?? null,
      projectName: parsed.project?.project_name ?? null,
      venue: parsed.project?.venue ?? null,
      location: parsed.project?.location ?? null,
      isOutdoor: parsed.project?.is_outdoor ?? false,
      isUnionLabor: parsed.project?.is_union ?? false,
      bondRequired: parsed.project?.bond_required ?? false,
      specialRequirements: parsed.project?.special_requirements || [],
      schedulePhases: (parsed.project?.schedule_phases || []).map((p: any) => ({
        phaseName: p.phase_name || "",
        startDate: p.start_date ?? null,
        endDate: p.end_date ?? null,
        duration: p.duration ?? null,
      })),
    };

    return { screens, project, requirements };
  } catch (err) {
    console.error("[SpecExtractor] Mistral Chat error:", err);
    return { screens: [], project: emptyProject(), requirements: [] };
  }
}

// ---------------------------------------------------------------------------
// Batched extraction — processes pages in groups, no truncation
// ---------------------------------------------------------------------------

const BATCH_SIZE = 25; // More pages per batch — uses Mistral's full context
const MAX_CHARS_PER_BATCH = 80_000; // ~20K tokens — well within Mistral's 128K
const PARALLEL_BATCHES = 4; // Run up to 4 Mistral calls concurrently

function buildDeterministicScheduleScreens(text: string): ExtractedLEDSpec[] {
  const itemMatches = [...text.matchAll(/\((\d+)\)\s+([^\n:]+?)(?=(?::|\n))/g)];
  if (itemMatches.length < 3) return [];

  const screens: ExtractedLEDSpec[] = [];

  for (let i = 0; i < itemMatches.length; i++) {
    const match = itemMatches[i];
    const itemNo = match[1];
    const rawName = match[2].trim().replace(/\s+/g, " ");
    const start = match.index ?? 0;
    const end = i + 1 < itemMatches.length ? (itemMatches[i + 1].index ?? text.length) : text.length;
    const block = text.slice(start, end);

    const dimensionMatches = [...block.matchAll(/(\d+(?:\.\d+)?)\s*'\s*[x×]\s*(\d+(?:\.\d+)?)\s*'/gi)];
    if (dimensionMatches.length === 0) continue;

    const isOutdoor = /outdoor|ip65|exterior|weather/i.test(block);
    const serviceType = /front/i.test(block) ? "front" : /rear/i.test(block) ? "rear" : null;
    const mountingType = /transparent|mesh/i.test(block)
      ? "mesh / transparent"
      : /no structural/i.test(block)
        ? "existing structure / no structural"
        : null;
    const specialRequirements = [
      /transparent|mesh/i.test(block) ? "mesh / transparent" : null,
      /ip65/i.test(block) ? "IP65" : null,
      /no structural/i.test(block) ? "LED only / no structural" : null,
    ].filter(Boolean) as string[];

    const pitchOptions = [...new Set(
      [...block.matchAll(/(?:option\s*\d+[^.\n]*?)?(\d+(?:\.\d+)?)\s*mm/gi)].map((m) => Number.parseFloat(m[1]))
    )].filter((n) => Number.isFinite(n));

    const rangeMatch = block.match(/screens?\s+(\d+)\s*[-–]\s*(\d+)/i);
    const explicitQtyMatch = block.match(/(?:qty|quantity)\s*[:=]?\s*(\d+)/i);
    const rangeQty = rangeMatch ? (Number.parseInt(rangeMatch[2], 10) - Number.parseInt(rangeMatch[1], 10) + 1) : null;
    const explicitQty = explicitQtyMatch ? Number.parseInt(explicitQtyMatch[1], 10) : null;

    const baseNames = dimensionMatches.length > 1
      ? dimensionMatches.map((_m, idx) => `${rawName} ${idx + 1}`)
      : [rawName];

    dimensionMatches.forEach((dim, idx) => {
      const widthFt = Number.parseFloat(dim[1]);
      const heightFt = Number.parseFloat(dim[2]);
      const quantity = dimensionMatches.length > 1 ? 1 : (explicitQty ?? rangeQty ?? 1);
      const baseName = baseNames[idx];

      const baseSpec: ExtractedLEDSpec = {
        name: baseName,
        location: rawName,
        widthFt,
        heightFt,
        widthPx: null,
        heightPx: null,
        pixelPitchMm: pitchOptions[0] ?? null,
        brightnessNits: null,
        environment: isOutdoor ? "outdoor" : "indoor",
        quantity,
        serviceType,
        mountingType,
        maxPowerW: null,
        weightLbs: null,
        specialRequirements,
        confidence: 0.95,
        sourcePages: [],
        sourceType: "table",
        citation: `[Deterministic schedule parse: Item ${itemNo}]`,
        notes: null,
        isAlternate: false,
        alternateId: null,
        alternateDescription: null,
      };

      screens.push(baseSpec);

      if (pitchOptions.length > 1) {
        for (let p = 1; p < pitchOptions.length; p++) {
          screens.push({
            ...baseSpec,
            name: `${baseName} — Option ${p + 1}`,
            pixelPitchMm: pitchOptions[p],
            isAlternate: true,
            alternateId: `Item ${itemNo} Option ${p + 1}`,
            alternateDescription: `${pitchOptions[p]}mm alternate`,
          });
        }
      }
    });
  }

  return screens;
}

export async function extractLEDSpecsBatched(
  relevantPages: AnalyzedPage[],
  onProgress?: (batch: number, totalBatches: number) => void,
): Promise<{
  screens: ExtractedLEDSpec[];
  project: ExtractedProjectInfo;
  requirements: ExtractedRequirement[];
  incompleteSpecs: IncompleteSpec[];
  warnings: string[];
  extractionFailed: boolean;
}> {
  if (relevantPages.length === 0) {
    return { screens: [], project: emptyProject(), requirements: [], incompleteSpecs: [], warnings: [], extractionFailed: false };
  }

  // Sort by relevance (highest first) so the most important pages get processed
  // even if we hit token limits or batch failures
  const sortedPages = [...relevantPages].sort((a, b) => b.relevance - a.relevance);

  // Build batches — respect both page count and char limit
  const batches: AnalyzedPage[][] = [];
  let currentBatch: AnalyzedPage[] = [];
  let currentChars = 0;

  for (const page of sortedPages) {
    const pageChars = page.markdown.length + page.tables.reduce((s, t) => s + t.content.length, 0);

    if (currentBatch.length >= BATCH_SIZE || (currentChars + pageChars > MAX_CHARS_PER_BATCH && currentBatch.length > 0)) {
      batches.push(currentBatch);
      currentBatch = [];
      currentChars = 0;
    }

    currentBatch.push(page);
    currentChars += pageChars;
  }
  if (currentBatch.length > 0) batches.push(currentBatch);

  // Process batches in parallel (up to PARALLEL_BATCHES concurrently)
  type BatchResult = { screens: ExtractedLEDSpec[]; project: ExtractedProjectInfo; requirements: ExtractedRequirement[] };
  const results: BatchResult[] = new Array(batches.length);
  let completed = 0;
  let failedBatches = 0;
  const warnings: string[] = [];

  const runBatch = async (i: number) => {
    const MAX_RETRIES = 2;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        results[i] = await extractLEDSpecs(batches[i]);
        break; // success
      } catch (err: any) {
        const isTimeout = err.message?.includes("aborted") || err.message?.includes("timeout");
        console.error(`[SpecExtractor] Batch ${i + 1}/${batches.length} attempt ${attempt + 1} failed${isTimeout ? " (TIMEOUT)" : ""}:`, err.message);
        if (attempt < MAX_RETRIES && isTimeout) {
          console.log(`[SpecExtractor] Retrying batch ${i + 1} in 3s...`);
          await new Promise((r) => setTimeout(r, 3000));
        } else {
          failedBatches++;
          results[i] = { screens: [], project: emptyProject(), requirements: [] };
        }
      }
    }
    completed++;
    onProgress?.(completed, batches.length);
  };

  // Concurrency pool — run PARALLEL_BATCHES at a time
  const queue = batches.map((_, i) => i);
  const workers = Array.from({ length: Math.min(PARALLEL_BATCHES, batches.length) }, async () => {
    while (queue.length > 0) {
      const idx = queue.shift()!;
      await runBatch(idx);
    }
  });
  await Promise.all(workers);

  if (failedBatches > 0) {
    if (failedBatches === batches.length) {
      warnings.push("All AI extraction batches failed — no specs could be extracted. Try again or contact support.");
    } else {
      warnings.push(`${failedBatches} of ${batches.length} extraction batches failed — results may be incomplete.`);
    }
  }

  // Merge all results
  let allScreens: ExtractedLEDSpec[] = [];
  let allRequirements: ExtractedRequirement[] = [];
  let project: ExtractedProjectInfo = emptyProject();

  for (const result of results) {
    if (!result) continue;
    allScreens.push(...result.screens);
    allRequirements.push(...result.requirements);

    // Merge project info — take first non-null values
    if (!project.clientName && result.project.clientName) project = { ...project, ...result.project };
    if (result.project.clientName && !project.clientName) project.clientName = result.project.clientName;
    if (result.project.venue && !project.venue) project.venue = result.project.venue;
    if (result.project.projectName && !project.projectName) project.projectName = result.project.projectName;
    if (result.project.location && !project.location) project.location = result.project.location;
    if (result.project.isOutdoor) project.isOutdoor = true;
    if (result.project.isUnionLabor) project.isUnionLabor = true;
    if (result.project.bondRequired) project.bondRequired = true;
    project.specialRequirements = [...new Set([...project.specialRequirements, ...result.project.specialRequirements])];
    project.schedulePhases = [...project.schedulePhases, ...result.project.schedulePhases];
  }

  const deterministicScreens = buildDeterministicScheduleScreens(
    relevantPages.map((p) => [p.markdown, ...p.tables.map((t) => t.content)].join("\n")).join("\n\n")
  );
  if (deterministicScreens.length > 0) {
    allScreens.push(...deterministicScreens);
  }

  // Quarantine incomplete specs instead of silently dropping them
  const incompleteSpecs: IncompleteSpec[] = [];
  allScreens = allScreens.filter((s) => {
    const hasAnySpec = s.widthFt != null || s.heightFt != null ||
      s.pixelPitchMm != null || s.brightnessNits != null ||
      s.widthPx != null || s.heightPx != null;
    if (!hasAnySpec) {
      console.log(`[specExtractor] Quarantining "${s.name}" — no physical specs (manual entry required)`);
      incompleteSpecs.push({
        name: s.name,
        location: s.location || "",
        notes: s.notes,
        sourcePages: s.sourcePages,
        reason: "Referenced in RFP but no physical specs provided — manual entry required",
      });
    }
    return hasAnySpec;
  });

  console.log(`[specExtractor] Pre-dedup: ${allScreens.length} screens, ${incompleteSpecs.length} quarantined`);
  // Deduplicate screens by name + location
  allScreens = deduplicateScreens(allScreens);

  // Deduplicate requirements by description
  const seenReqs = new Set<string>();
  allRequirements = allRequirements.filter((r) => {
    const key = r.description.toLowerCase().trim();
    if (seenReqs.has(key)) return false;
    seenReqs.add(key);
    return true;
  });

  const extractionFailed = relevantPages.length > 0 && allScreens.length === 0 && failedBatches === batches.length;

  return { screens: allScreens, project, requirements: allRequirements, incompleteSpecs, warnings, extractionFailed };
}

// ---------------------------------------------------------------------------
// Smart fuzzy deduplication
// ---------------------------------------------------------------------------

const NOISE_WORDS = new Set([
  "led", "display", "screen", "board", "panel", "rgb", "new", "proposed",
  "existing", "the", "a", "an", "for", "of", "at", "in", "on", "to",
  "system", "systems", "sign", "signage", "digital", "electronic",
]);

function normalizeForDedup(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !NOISE_WORDS.has(w));
}

function tokenSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const t of setA) if (setB.has(t)) intersection++;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

function normalizedSubstring(a: string[], b: string[]): boolean {
  const strA = a.join(" ");
  const strB = b.join(" ");
  if (strA.length < 3 || strB.length < 3) return false;
  return strA.includes(strB) || strB.includes(strA);
}

function dimensionMatch(a: ExtractedLEDSpec, b: ExtractedLEDSpec): boolean {
  if (a.widthFt == null || a.heightFt == null) return false;
  if (b.widthFt == null || b.heightFt == null) return false;
  const sameLocation = (a.location || "").trim().toLowerCase() === (b.location || "").trim().toLowerCase();
  return sameLocation && a.widthFt === b.widthFt && a.heightFt === b.heightFt && a.pixelPitchMm === b.pixelPitchMm;
}

function extractOrdinalMarkers(name: string): string[] {
  return [...name.toLowerCase().matchAll(/\b(\d+[a-z]?)(?:-\d+[a-z]?)?\b/g)].map((m) => m[1]);
}

function mergeSpecs(primary: ExtractedLEDSpec, secondary: ExtractedLEDSpec): ExtractedLEDSpec {
  const merged = { ...primary };
  merged.widthFt ??= secondary.widthFt;
  merged.heightFt ??= secondary.heightFt;
  merged.widthPx ??= secondary.widthPx;
  merged.heightPx ??= secondary.heightPx;
  merged.pixelPitchMm ??= secondary.pixelPitchMm;
  merged.brightnessNits ??= secondary.brightnessNits;
  merged.serviceType ??= secondary.serviceType;
  merged.mountingType ??= secondary.mountingType;
  merged.maxPowerW ??= secondary.maxPowerW;
  merged.weightLbs ??= secondary.weightLbs;
  merged.sourcePages = [...new Set([...merged.sourcePages, ...secondary.sourcePages])];
  if (secondary.specialRequirements.length > merged.specialRequirements.length) {
    merged.specialRequirements = [...new Set([...merged.specialRequirements, ...secondary.specialRequirements])];
  }
  return merged;
}

function screensMatch(a: ExtractedLEDSpec, b: ExtractedLEDSpec): boolean {
  // Never merge across environments
  if (a.environment !== b.environment) return false;
  // Never merge base bid with alternate
  if ((a.isAlternate ?? false) !== (b.isAlternate ?? false)) return false;
  // For alternates, only merge if same alternate ID
  if (a.isAlternate && b.isAlternate && a.alternateId !== b.alternateId) return false;

  const tokensA = normalizeForDedup(a.name);
  const tokensB = normalizeForDedup(b.name);
  const ordinalsA = extractOrdinalMarkers(a.name);
  const ordinalsB = extractOrdinalMarkers(b.name);

  // Keep schedule rows distinct when the only difference is screen numbering.
  if (ordinalsA.length > 0 && ordinalsB.length > 0 && ordinalsA.join(",") !== ordinalsB.join(",")) {
    return false;
  }

  const locationA = normalizeForDedup(a.location || "");
  const locationB = normalizeForDedup(b.location || "");
  const nameSimilarity = tokenSimilarity(tokensA, tokensB);
  const locationSimilarity = tokenSimilarity(locationA, locationB);

  // Check token similarity — use 0.8 threshold to avoid merging distinct screens
  if (nameSimilarity >= 0.8 && (locationA.length === 0 || locationB.length === 0 || locationSimilarity >= 0.6)) return true;
  // Check substring match
  if (normalizedSubstring(tokensA, tokensB) && (locationA.length === 0 || locationB.length === 0 || normalizedSubstring(locationA, locationB))) return true;
  // Check dimension + pitch match (same physical display)
  if (dimensionMatch(a, b)) return true;

  return false;
}

export function deduplicateScreens(screens: ExtractedLEDSpec[]): ExtractedLEDSpec[] {
  const deduped: ExtractedLEDSpec[] = [];

  for (const screen of screens) {
    const matchIdx = deduped.findIndex((d) => screensMatch(d, screen));

    if (matchIdx >= 0) {
      const existing = deduped[matchIdx];
      console.log(`[specExtractor] Dedup: merging "${screen.name}" into "${existing.name}"`);
      if (screen.confidence > existing.confidence) {
        deduped[matchIdx] = mergeSpecs(screen, existing);
      } else {
        deduped[matchIdx] = mergeSpecs(existing, screen);
      }
    } else {
      deduped.push({ ...screen });
    }
  }

  console.log(`[specExtractor] Dedup: ${screens.length} screens → ${deduped.length} after dedup (merged ${screens.length - deduped.length})`);
  return deduped;
}

function emptyProject(): ExtractedProjectInfo {
  return {
    clientName: null,
    projectName: null,
    venue: null,
    location: null,
    isOutdoor: false,
    isUnionLabor: false,
    bondRequired: false,
    specialRequirements: [],
    schedulePhases: [],
  };
}
