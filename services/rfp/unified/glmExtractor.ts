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
      max_tokens: 16000,
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
  // Find the SECTION headers (not ToC entries) for indoor and outdoor
  // Both sections may share the same number (116843) — match by title
  const sectionPattern = /SECTION\s+\d+\s*-?\s*(INDOOR|OUTDOOR)\s+LED\s+VIDEOBOARDS/gi;
  let indoorStart = -1;
  let outdoorStart = -1;
  let match;

  while ((match = sectionPattern.exec(fullText)) !== null) {
    const type = match[1].toUpperCase();
    if (type === "INDOOR" && indoorStart === -1) {
      indoorStart = match.index;
      console.log(`[GLM5] Found INDOOR section at offset ${indoorStart}`);
    } else if (type === "OUTDOOR" && outdoorStart === -1) {
      outdoorStart = match.index;
      console.log(`[GLM5] Found OUTDOOR section at offset ${outdoorStart}`);
    }
  }

  // Fallback: try broader patterns if SECTION headers not found
  if (indoorStart === -1) {
    const fallbackPatterns = [
      /INDOOR\s+LED\s+VIDEOBOARDS/i,
      /Pixel\s+Pitch\s+Brightness.*Width.*Height/i,
    ];
    for (const pat of fallbackPatterns) {
      indoorStart = fullText.search(pat);
      if (indoorStart >= 0) {
        console.log(`[GLM5] Found indoor via fallback pattern at offset ${indoorStart}`);
        break;
      }
    }
  }

  if (outdoorStart === -1) {
    const fallbackPatterns = [
      /OUTDOOR\s+LED\s+VIDEOBOARDS/i,
      /Scoreboard.*Pixel\s*Pitch/i,
    ];
    for (const pat of fallbackPatterns) {
      const idx = fullText.search(pat);
      if (idx >= 0 && idx > indoorStart) {
        outdoorStart = idx;
        console.log(`[GLM5] Found outdoor via fallback pattern at offset ${outdoorStart}`);
        break;
      }
    }
  }

  let indoor = "";
  let outdoor = "";

  if (indoorStart >= 0) {
    const indoorEnd = outdoorStart > indoorStart ? outdoorStart : indoorStart + 80000;
    indoor = fullText.substring(indoorStart, Math.min(indoorEnd, indoorStart + 120000));
  }

  if (outdoorStart >= 0) {
    outdoor = fullText.substring(outdoorStart, Math.min(outdoorStart + 80000, fullText.length));
  }

  // If we couldn't find specific sections, send the full text (truncated)
  if (!indoor && !outdoor) {
    console.log(`[GLM5] No section markers found — sending full text (${(fullText.length / 1024).toFixed(0)}KB)`);
    indoor = fullText.substring(0, 120000);
  }

  console.log(`[GLM5] Indoor: ${(indoor.length / 1024).toFixed(0)}KB, Outdoor: ${(outdoor.length / 1024).toFixed(0)}KB`);

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

  // Call 1: Indoor sections
  if (sections.indoor) {
    options?.onProgress?.("Analyzing indoor LED specifications...");
    console.log(`[GLM5] Sending indoor section (${(sections.indoor.length / 1024).toFixed(0)}KB)...`);

    try {
      const result = await callGLM5(sections.indoor, EXTRACT_PROMPT);
      const displays = result.displays || [];
      allDisplays.push(...displays);
      project = result.project || project;
      if (result.requirements) allRequirements.push(...result.requirements);
      console.log(`[GLM5] Indoor: ${displays.length} displays`);
    } catch (err: any) {
      console.error(`[GLM5] Indoor extraction failed:`, err.message);
    }
  }

  // Call 2: Outdoor sections
  if (sections.outdoor) {
    options?.onProgress?.("Analyzing outdoor LED specifications...");
    console.log(`[GLM5] Sending outdoor section (${(sections.outdoor.length / 1024).toFixed(0)}KB)...`);

    try {
      const outdoorPrompt = `Extract ALL outdoor LED displays from this section. There are separate sub-tables for Scoreboards, Ribbon Board LEDs, and Entry LEDs — extract from ALL of them. Return JSON only with the same schema. Set environment to "outdoor" for all.`;
      const result = await callGLM5(sections.outdoor, outdoorPrompt + "\n\n" + EXTRACT_PROMPT);
      const displays = result.displays || [];
      allDisplays.push(...displays);
      if (result.requirements) allRequirements.push(...result.requirements);
      console.log(`[GLM5] Outdoor: ${displays.length} displays`);
    } catch (err: any) {
      console.error(`[GLM5] Outdoor extraction failed:`, err.message);
    }
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
