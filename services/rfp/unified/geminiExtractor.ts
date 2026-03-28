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
const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY || "";
const MISTRAL_API_BASE = process.env.MISTRAL_API_BASE_URL || "https://api.mistral.ai";
const MISTRAL_OCR_MODEL = process.env.MISTRAL_OCR_MODEL || "mistral-ocr-latest";

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
    model?: string;
  },
): Promise<{
  screens: ExtractedLEDSpec[];
  project: ExtractedProjectInfo;
  requirements: any[];
  warnings: string[];
  sourceText: string;
  extractionMethod: string;
  documentTotal: number | null;
  source: "gemini";
}> {
  // =========================================================================
  // TEXT-FIRST EXTRACTION (Interim Safety Upgrade)
  //
  // Always try pdftotext first. The text layer is the source of truth.
  // Only fall to vision if there is truly no extractable text.
  // This is NOT the final parser architecture — it's a safety net.
  // =========================================================================
  const { execFile: execFileCb } = await import("child_process");
  const { promisify } = await import("util");
  const { readFile: readImg, readdir, mkdir, rm } = await import("fs/promises");
  const execFileAsync = promisify(execFileCb);

  let pageCount = 0;
  try {
    const { stdout } = await execFileAsync("pdfinfo", [pdfPath], { timeout: 10_000 });
    const m = stdout.match(/Pages:\s+(\d+)/);
    pageCount = m ? parseInt(m[1], 10) : 0;
  } catch { pageCount = 0; }

  const activeModelForLog = options?.model || GEMINI_MODEL;
  console.log(`[GeminiExtractor] model: ${activeModelForLog}, ${pageCount} pages`);

  // Step 1: Extract full text — pdftotext first, Mistral OCR if no text
  options?.onProgress?.("Extracting text from PDF...");
  let sourceText = "";
  try {
    const { stdout } = await execFileAsync("pdftotext", ["-layout", pdfPath, "-"], { timeout: 30_000 });
    sourceText = stdout;
  } catch (err: any) {
    console.error(`[GeminiExtractor] pdftotext failed:`, err.message);
  }

  console.log(`[GeminiExtractor] pdftotext: ${sourceText.length} chars`);

  // If pdftotext got nothing, run Mistral OCR — turns scanned pages into text
  if (sourceText.trim().length < 200 && MISTRAL_API_KEY) {
    options?.onProgress?.("No selectable text — running OCR...");
    console.log(`[GeminiExtractor] Running Mistral OCR on scanned PDF...`);
    try {
      const pdfBuffer = await readFile(pdfPath);
      const b64 = pdfBuffer.toString("base64");
      const ocrRes = await fetch(`${MISTRAL_API_BASE}/v1/ocr`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${MISTRAL_API_KEY}` },
        body: JSON.stringify({
          model: MISTRAL_OCR_MODEL,
          document: { type: "document_url", document_url: `data:application/pdf;base64,${b64}` },
          include_image_base64: false,
        }),
      });
      if (ocrRes.ok) {
        const ocrData = await ocrRes.json();
        const ocrPages: string[] = (ocrData.pages || []).map((p: any) => p.markdown || "");
        sourceText = ocrPages.join("\f");
        console.log(`[GeminiExtractor] Mistral OCR: ${ocrPages.length} pages, ${sourceText.length} chars`);
        options?.onProgress?.(`OCR complete: ${ocrPages.length} pages, ${(sourceText.length / 1024).toFixed(0)}KB text`);
      } else {
        console.error(`[GeminiExtractor] Mistral OCR failed: ${ocrRes.status}`);
      }
    } catch (ocrErr: any) {
      console.error(`[GeminiExtractor] Mistral OCR error:`, ocrErr.message);
    }
  }

  // Step 2: Decide path based on text quality
  const hasUsableText = sourceText.trim().length > 200;
  let contentParts: any[];
  let extractionMethod: string;

  if (hasUsableText) {
    // TEXT PATH — extract only display-relevant sections, not the full document
    extractionMethod = "text";

    // Split text by table headers and keep only LED/display schedule sections
    const SCHEDULE_PATTERNS = [
      /A\/V\s+(?:INTERIOR\s+)?LED\s+BOARD\s+SCHEDULE/i,
      /A\/V\s+SCOREBOARD\s+&\s+RIBBON/i,
      /A\/V\s+(?:EAST|WEST|NORTH|SOUTH)\s+(?:ENTRY|EXTERIOR)\s+LED/i,
      /A\/V\s+(?:NORTH|SOUTH)\s+(?:EAST|WEST)\s+EXTERIOR/i,
      /A\/V\s+(?:NORTH|SOUTH)\s+ENTRY\s+LED/i,
      /LED\s+(?:DISPLAY|BOARD|VIDEOBOARD)\s+SCHEDULE/i,
      /DISPLAY\s+(?:MATRIX|SCHEDULE)/i,
      /SECTION\s+11\s*(?:06\s*60|68\s*43|63\s*10)/i,
    ];

    // Find where each schedule section starts in the text
    const sections: { header: string; start: number }[] = [];
    for (const pattern of SCHEDULE_PATTERNS) {
      let match;
      const global = new RegExp(pattern.source, "gi");
      while ((match = global.exec(sourceText)) !== null) {
        sections.push({ header: match[0], start: match.index });
      }
    }

    let relevantText: string;
    if (sections.length > 0) {
      // Sort by position, extract text from each section header to the next (or end)
      sections.sort((a, b) => a.start - b.start);
      const chunks: string[] = [];
      for (let i = 0; i < sections.length; i++) {
        const start = sections[i].start;
        const end = i + 1 < sections.length ? sections[i + 1].start : Math.min(start + 5000, sourceText.length);
        chunks.push(sourceText.substring(start, end));
      }
      relevantText = chunks.join("\n\n--- TABLE BOUNDARY ---\n\n");
      console.log(`[GeminiExtractor] Text path: ${sections.length} schedule sections found, ${relevantText.length} chars (from ${sourceText.length} total)`);
      options?.onProgress?.(`Found ${sections.length} schedule tables — extracting relevant sections`);
    } else {
      // No known headers found — send full text (spec docs without schedule headers)
      relevantText = sourceText;
      console.log(`[GeminiExtractor] Text path: no schedule headers found, sending full text (${sourceText.length} chars)`);
      options?.onProgress?.(`${sourceText.length} chars of text extracted — no schedule headers detected, sending full document`);
    }

    contentParts = [{ text: `Extracted text from display schedule sections of the PDF (pdftotext -layout). Each section between TABLE BOUNDARY markers is a separate table. Columns are aligned by whitespace.\n\n${relevantText}` }];
  } else {
    // VISION PATH — no usable text (scanned/image PDF)
    extractionMethod = "vision";
    const tmpDir = `/tmp/gemini-vision-${Date.now()}`;
    await mkdir(tmpDir, { recursive: true });

    if (pageCount > 20) {
      // LARGE SCANNED PDF — Read TOC first, then go to LED sections
      // This is how a human would do it: open the TOC, find "LED Videoboards",
      // note the page number, flip directly to that page.
      options?.onProgress?.(`Large scanned PDF (${pageCount} pages) — reading Table of Contents...`);
      console.log(`[GeminiExtractor] Large scanned PDF: ${pageCount} pages, reading TOC first`);

      // Step 1: Convert TOC pages (typically pages 2-10) to images
      const tocPages = Math.min(10, pageCount);
      options?.onProgress?.(`Converting first ${tocPages} pages (TOC) to images...`);
      for (let p = 1; p <= tocPages; p++) {
        try {
          await execFileAsync("pdftoppm", ["-png", "-r", "200", "-f", String(p), "-l", String(p), pdfPath, `${tmpDir}/toc-${String(p).padStart(4, "0")}`], { timeout: 15_000 });
        } catch { /* skip */ }
      }

      const tocFiles = (await readdir(tmpDir)).filter(f => f.startsWith("toc-") && f.endsWith(".png")).sort();
      let targetPages: number[] = [];

      if (tocFiles.length > 0) {
        // Step 2: Send TOC pages to Gemini — "read this TOC, find LED sections"
        options?.onProgress?.("AI reading Table of Contents to find LED sections...");
        const tocParts: any[] = [];
        for (const t of tocFiles) {
          const buf = await readImg(`${tmpDir}/${t}`);
          tocParts.push({ inlineData: { mimeType: "image/png", data: buf.toString("base64") } });
        }

        const tocPrompt = `This is the Table of Contents from a ${pageCount}-page construction project manual.

Find ALL sections related to LED displays, videoboards, scoreboards, AV systems, or Division 11 equipment.

For each section found, tell me:
- The section number (e.g., 116643, 116843)
- The section name
- The page number or approximate location in the document

Also look for: "Visual Display Units", "Audio Video Systems", "Display Schedule", "LED", "AV"

Return ONLY JSON:
{
  "sections": [
    {"number": "116843", "name": "Indoor LED Videoboards", "startPage": 84}
  ],
  "estimatedLedPages": [84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107]
}

The estimatedLedPages should include a generous range around each LED section (±20 pages) to catch the full section content. If you can't determine exact page numbers, estimate based on position in the TOC.`;

        try {
          const tocUrl = `https://generativelanguage.googleapis.com/v1beta/models/${activeModel}:generateContent?key=${GEMINI_API_KEY}`;
          const tocRes = await fetch(tocUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [...tocParts, { text: tocPrompt }] }],
              generationConfig: { temperature: 0, maxOutputTokens: 2048 },
            }),
          });

          if (tocRes.ok) {
            const tocData = await tocRes.json();
            const tocText = tocData.candidates?.[0]?.content?.parts?.[0]?.text || "";
            const tocCleaned = tocText.replace(/```json/gi, "").replace(/```/g, "").trim();
            const si = tocCleaned.indexOf("{");
            const ei = tocCleaned.lastIndexOf("}") + 1;
            if (si >= 0 && ei > si) {
              const tocResult = JSON.parse(tocCleaned.substring(si, ei));

              // Log found sections
              const sections = tocResult.sections || [];
              for (const s of sections) {
                console.log(`[GeminiExtractor] TOC: Section ${s.number} "${s.name}" → page ${s.startPage}`);
              }

              targetPages = tocResult.estimatedLedPages || [];
              if (targetPages.length === 0 && sections.length > 0) {
                // Build page range from sections: ±20 pages around each section start
                for (const s of sections) {
                  const start = Math.max(1, (s.startPage || 80) - 5);
                  const end = Math.min(pageCount, (s.startPage || 80) + 30);
                  for (let p = start; p <= end; p++) targetPages.push(p);
                }
                targetPages = [...new Set(targetPages)].sort((a, b) => a - b);
              }

              console.log(`[GeminiExtractor] TOC analysis: ${sections.length} LED sections → ${targetPages.length} target pages`);
              options?.onProgress?.(`Found ${sections.length} LED sections in TOC → processing ${targetPages.length} pages...`);
            }
          }
        } catch (tocErr: any) {
          console.error(`[GeminiExtractor] TOC reading failed:`, tocErr.message);
        }
      }

      // Step 3: If TOC analysis worked, convert target pages. Otherwise sample.
      if (targetPages.length > 0) {
        options?.onProgress?.(`Converting ${targetPages.length} LED pages to high-res images...`);
        for (const p of targetPages.slice(0, 40)) { // Max 40 pages
          try {
            await execFileAsync("pdftoppm", ["-png", "-r", "300", "-f", String(p), "-l", String(p), pdfPath, `${tmpDir}/page-${String(p).padStart(4, "0")}`], { timeout: 30_000 });
          } catch { /* skip */ }
        }
      } else {
        // TOC failed — fall back to sampling every 20th page
        console.log(`[GeminiExtractor] TOC analysis failed — falling back to page sampling`);
        options?.onProgress?.("TOC reading failed — sampling pages...");
        const step = Math.max(1, Math.floor(pageCount / 25));
        for (let p = 1; p <= pageCount; p += step) {
          try {
            await execFileAsync("pdftoppm", ["-png", "-r", "300", "-f", String(p), "-l", String(p), pdfPath, `${tmpDir}/page-${String(p).padStart(4, "0")}`], { timeout: 30_000 });
          } catch { /* skip */ }
        }
      }
    } else {
      // Small scanned PDF — convert all pages
      options?.onProgress?.("No extractable text — converting to images...");
      console.log(`[GeminiExtractor] Vision path: ${pageCount} pages, converting all to PNG`);
      await execFileAsync("pdftoppm", ["-png", "-r", "300", pdfPath, `${tmpDir}/page`], { timeout: 120_000 });
    }

    const pngFiles = (await readdir(tmpDir)).filter(f => f.startsWith("page") && f.endsWith(".png")).sort();

    if (pngFiles.length === 0) {
      await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
      throw new Error("PDF has no extractable text and image conversion produced 0 pages");
    }

    contentParts = [];
    for (const png of pngFiles.slice(0, 20)) {
      const imgBuf = await readImg(`${tmpDir}/${png}`);
      contentParts.push({ inlineData: { mimeType: "image/png", data: imgBuf.toString("base64") } });
    }
    console.log(`[GeminiExtractor] Added ${pngFiles.length} page images for extraction`);
    rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }

  options?.onProgress?.(`Sending to Gemini Flash (${extractionMethod} path)...`);

  // Streaming endpoint — read chunks incrementally, forward thinking tokens in real time
  const activeModel = options?.model || GEMINI_MODEL;
  const streamUrl = `https://generativelanguage.googleapis.com/v1beta/models/${activeModel}:streamGenerateContent?alt=sse&key=${GEMINI_API_KEY}`;

  const body = {
    systemInstruction: {
      parts: [{ text: SYSTEM_PROMPT }],
    },
    contents: [
      {
        parts: [
          ...contentParts,
          { text: USER_PROMPT },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.0,
      maxOutputTokens: 65536,
      responseMimeType: "application/json",
      thinkingConfig: {
        thinkingBudget: 8192,
        includeThoughts: true,
      },
    },
  };

  const controller = new AbortController();
  const timeout = (options?.timeout || 300) * 1000;
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(streamUrl, {
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

    // Read stream chunk by chunk — no buffering the entire response
    let text = "";
    let lastThought = "";
    const reader = res.body?.getReader();
    const decoder = new TextDecoder();
    let sseBuffer = "";

    if (!reader) throw new Error("No response body to stream");

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      sseBuffer += decoder.decode(value, { stream: true });

      // Process complete SSE events from the buffer
      const lines = sseBuffer.split("\n");
      sseBuffer = lines.pop() || ""; // Keep incomplete last line in buffer

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const chunk = JSON.parse(line.substring(6));
          const parts = chunk.candidates?.[0]?.content?.parts || [];
          for (const part of parts) {
            if (part.thought && part.text) {
              // Real AI thinking — forward each thought line to UI immediately
              for (const thoughtLine of part.text.split("\n")) {
                const cleaned = thoughtLine.replace(/^\*+|\*+$/g, "").trim();
                if (cleaned && cleaned !== lastThought && cleaned.length > 5) {
                  lastThought = cleaned;
                  options?.onProgress?.(`AI: ${cleaned}`);
                }
              }
            } else if (part.text) {
              text += part.text;
            }
          }
        } catch { /* skip malformed SSE chunks */ }
      }
    }

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
      sourceText,
      extractionMethod,
      documentTotal: elog?.total_displays_counted_in_text ?? null,
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
