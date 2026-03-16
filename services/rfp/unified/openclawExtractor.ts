/**
 * OpenClaw LED Spec Extractor
 *
 * Uses the OpenClaw AI agent (local CLI) to extract LED display specs
 * from RFP PDFs. OpenClaw has ANC-specific skills with Natalia's
 * extraction rules baked in (no grouping, exact screen names, etc.).
 *
 * Advantages over Mistral→Gemini pipeline:
 * - Handles 400+ page construction manuals
 * - ANC-specific skills with domain knowledge
 * - Natalia-verified extraction rules
 * - Runs locally on VPS (no external API costs for extraction)
 */

import { execFile } from "child_process";
import { promisify } from "util";
import { readFile } from "fs/promises";
import { existsSync } from "fs";
import type { ExtractedLEDSpec, ExtractedProjectInfo } from "./types";

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OpenClawDisplay {
  id?: number;
  name: string;
  location?: string;
  type?: string;
  application?: string;
  quantity?: number;
  pixel_pitch_mm?: number;
  brightness_nits?: number;
  width_ft?: string;
  height_ft?: string;
  width_ft_decimal?: number;
  height_ft_decimal?: number;
  area_sqft?: number;
  service_type?: string;
  mounting_type?: string;
  environment?: string;
  notes?: string;
  is_alternate?: boolean;
  alternate_id?: string;
  alternate_description?: string;
  [key: string]: any;
}

interface OpenClawResult {
  project?: {
    name?: string;
    client?: string;
    venue?: string;
    address?: string;
    [key: string]: any;
  };
  displays?: OpenClawDisplay[];
}

// ---------------------------------------------------------------------------
// Parse OpenClaw output
// ---------------------------------------------------------------------------

function parseOpenClawResponse(jsonStr: string): OpenClawResult | null {
  try {
    const data = JSON.parse(jsonStr);

    // CLI --json wraps in { runId, status, result: { payloads: [...] } }
    if (data.result?.payloads) {
      // The JSON file path is often mentioned in the text response
      // But we also look for the actual structured data
      return data;
    }

    // Direct JSON format (from file)
    if (data.displays || data.screens) {
      return {
        project: data.project,
        displays: data.displays || data.screens,
      };
    }

    return null;
  } catch {
    return null;
  }
}

function mapToExtractedSpecs(displays: OpenClawDisplay[]): ExtractedLEDSpec[] {
  return displays.map((d, idx) => {
    const widthFt = d.width_ft_decimal || parseFloat(String(d.width_ft || "0").replace(/['"]/g, "")) || null;
    const heightFt = d.height_ft_decimal || parseFloat(String(d.height_ft || "0").replace(/['"]/g, "")) || null;

    const env = (d.application || d.environment || "indoor").toLowerCase();
    const isOutdoor = env.includes("outdoor");

    return {
      name: d.name || `Display ${idx + 1}`,
      location: d.location || "",
      widthFt,
      heightFt,
      widthPx: null,
      heightPx: null,
      pixelPitchMm: d.pixel_pitch_mm || null,
      brightnessNits: d.brightness_nits || null,
      environment: isOutdoor ? "outdoor" : "indoor",
      quantity: d.quantity || 1,
      serviceType: (d.service_type as any) || null,
      mountingType: d.mounting_type || null,
      maxPowerW: null,
      weightLbs: null,
      specialRequirements: [],
      confidence: 0.9,
      sourcePages: [],
      sourceType: "text" as const,
      citation: "OpenClaw RFP Analyzer",
      notes: d.notes || null,
      isAlternate: d.is_alternate || false,
      alternateDescription: d.alternate_description || null,
      selectedProductId: null,
      selectedProductName: null,
    };
  });
}

function mapToProjectInfo(project: OpenClawResult["project"]): ExtractedProjectInfo {
  return {
    clientName: project?.client || project?.name || null,
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
// Main extraction function
// ---------------------------------------------------------------------------

export async function extractWithOpenClaw(
  pdfPath: string,
  options?: {
    timeout?: number;
    onProgress?: (message: string) => void;
  },
): Promise<{
  screens: ExtractedLEDSpec[];
  project: ExtractedProjectInfo;
  source: "openclaw";
}> {
  const timeout = options?.timeout || 180;

  options?.onProgress?.("Sending PDF to OpenClaw agent...");

  // Call OpenClaw CLI — trigger the "RFP to Excel Proposal" skill
  // The skill uses pdftotext → extract tables → structured JSON output.
  // Key: tell it to save JSON so we can reliably parse the output.
  const message = [
    `I have an RFP PDF at: ${pdfPath}`,
    ``,
    `Extract ALL LED display specs from this document. Use pdftotext to read it.`,
    `Look for display schedule tables — they usually have columns like Location, Pixel Pitch, Brightness, Width, Height.`,
    ``,
    `IMPORTANT RULES:`,
    `- Each row in the table is its OWN display — do NOT group or combine`,
    `- First column = screen name — use EXACTLY as written (even if it just says "NW")`,
    `- Convert dimensions to decimal feet (22'8" = 22.67)`,
    `- Check for BOTH indoor and outdoor sections`,
    ``,
    `Save the results as JSON to /tmp/openclaw-rfp-extract.json with this format:`,
    `{ "project": { "name": "...", "client": "...", "venue": "..." }, "displays": [ { "name": "...", "location": "...", "pixel_pitch_mm": 3.9, "brightness_nits": 8000, "width_ft_decimal": 14.0, "height_ft_decimal": 8.0, "quantity": 1, "application": "Indoor" } ] }`,
    ``,
    `Do NOT generate an Excel file. Just extract and save the JSON.`,
  ].join("\n");

  try {
    const { stdout } = await execFileAsync(
      "openclaw",
      ["agent", "--agent", "main", "--message", message, "--json", "--timeout", String(timeout)],
      {
        timeout: (timeout + 30) * 1000,
        maxBuffer: 10 * 1024 * 1024,
        env: { ...process.env, HOME: process.env.HOME || "/root" },
      },
    );

    options?.onProgress?.("OpenClaw extraction complete — parsing results...");

    // Try to read the saved JSON file first (more reliable than parsing CLI output)
    const jsonPath = "/tmp/openclaw-rfp-extract.json";
    let displays: OpenClawDisplay[] = [];
    let project: OpenClawResult["project"] = undefined;

    if (existsSync(jsonPath)) {
      try {
        const jsonContent = await readFile(jsonPath, "utf-8");
        const parsed = JSON.parse(jsonContent);
        displays = parsed.displays || parsed.screens || [];
        project = parsed.project;
      } catch {
        // Fall back to parsing CLI output
      }
    }

    // If file parsing failed, try CLI output
    if (displays.length === 0) {
      try {
        const cliData = JSON.parse(stdout);
        // Check if the agent saved to a different path
        const textResponse = cliData.result?.payloads?.[0]?.text || "";
        const pathMatch = textResponse.match(/\/tmp\/[^\s"]+\.json/);
        if (pathMatch && existsSync(pathMatch[0])) {
          const altJson = await readFile(pathMatch[0], "utf-8");
          const altParsed = JSON.parse(altJson);
          displays = altParsed.displays || altParsed.screens || [];
          project = altParsed.project || project;
        }
      } catch { /* ignore */ }
    }

    if (displays.length === 0) {
      console.warn("[OpenClaw] No displays extracted — returning empty result");
    }

    const specs = mapToExtractedSpecs(displays);
    const projectInfo = mapToProjectInfo(project);

    console.log(`[OpenClaw] Extracted ${specs.length} displays from ${pdfPath}`);

    return {
      screens: specs,
      project: projectInfo,
      source: "openclaw",
    };
  } catch (err: any) {
    console.error("[OpenClaw] Extraction failed:", err.message);
    throw new Error(`OpenClaw extraction failed: ${err.message}`);
  }
}

/**
 * Check if OpenClaw CLI is available on this system.
 */
export function isOpenClawAvailable(): boolean {
  try {
    const { execSync } = require("child_process");
    execSync("which openclaw", { timeout: 3000, stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}
