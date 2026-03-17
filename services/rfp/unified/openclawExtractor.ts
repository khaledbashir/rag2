/**
 * OpenClaw LED Spec Extractor
 *
 * Calls the OpenClaw HTTP bridge running on the host to extract
 * LED display specs from RFP PDFs. The bridge wraps the openclaw CLI
 * which has ANC-specific skills with Natalia's extraction rules.
 *
 * Architecture:
 *   Next.js (Docker) → HTTP → OpenClaw Bridge (Host:18790) → openclaw CLI → JSON
 */

import type { ExtractedLEDSpec, ExtractedProjectInfo } from "./types";

const OPENCLAW_BRIDGE_URL = process.env.OPENCLAW_BRIDGE_URL || "http://172.17.0.1:18790";
const OPENCLAW_TOKEN = process.env.OPENCLAW_TOKEN || "d1cd954f0f49c7e03ed01693727d811bc9778e892d32c5812473e53a8673c144";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OpenClawDisplay {
  name: string;
  location?: string;
  quantity?: number;
  pixel_pitch_mm?: number;
  brightness_nits?: number;
  width_ft_decimal?: number;
  height_ft_decimal?: number;
  width_ft?: string;
  height_ft?: string;
  area_sqft?: number;
  application?: string;
  environment?: string;
  service_type?: string;
  mounting_type?: string;
  notes?: string;
  is_alternate?: boolean;
  alternate_description?: string;
  [key: string]: any;
}

// ---------------------------------------------------------------------------
// Map OpenClaw output → ExtractedLEDSpec
// ---------------------------------------------------------------------------

function mapToExtractedSpecs(displays: OpenClawDisplay[]): ExtractedLEDSpec[] {
  return displays.map((d, idx) => {
    let widthFt = d.width_ft_decimal || null;
    let heightFt = d.height_ft_decimal || null;

    // Parse from string if decimal not provided (e.g. "22'8"" → 22.67)
    if (!widthFt && d.width_ft) {
      widthFt = parseFeetInches(String(d.width_ft));
    }
    if (!heightFt && d.height_ft) {
      heightFt = parseFeetInches(String(d.height_ft));
    }

    const env = (d.application || d.environment || "indoor").toLowerCase();

    return {
      name: d.name || `Display ${idx + 1}`,
      location: d.location || "",
      widthFt,
      heightFt,
      widthPx: null,
      heightPx: null,
      pixelPitchMm: d.pixel_pitch_mm || null,
      brightnessNits: d.brightness_nits || null,
      environment: env.includes("outdoor") ? "outdoor" : "indoor",
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

function parseFeetInches(str: string): number | null {
  // "22'8"" → 22.67, "14'" → 14, "100'" → 100
  const match = str.match(/(\d+)['']\s*(\d+)?/);
  if (match) {
    const feet = parseInt(match[1], 10);
    const inches = match[2] ? parseInt(match[2], 10) : 0;
    return Math.round((feet + inches / 12) * 100) / 100;
  }
  const num = parseFloat(str);
  return isNaN(num) ? null : num;
}

function mapToProjectInfo(project: any): ExtractedProjectInfo {
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
// Main extraction
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
  requirements: any[];
  source: "openclaw";
}> {
  const timeout = options?.timeout || 300;
  options?.onProgress?.("Sending PDF to AI agent...");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), (timeout + 60) * 1000);

  try {
    // Read PDF and send binary to bridge (Docker can't share file paths with host)
    const { readFile } = await import("fs/promises");
    const pdfBuffer = await readFile(pdfPath);
    options?.onProgress?.(`Sending PDF to AI agent (${(pdfBuffer.length / 1024 / 1024).toFixed(1)}MB)...`);

    const res = await fetch(`${OPENCLAW_BRIDGE_URL}/extract`, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        Authorization: `Bearer ${OPENCLAW_TOKEN}`,
      },
      body: pdfBuffer,
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new Error(err.error || `Bridge returned ${res.status}`);
    }

    const data = await res.json();
    const displays: OpenClawDisplay[] = data.displays || data.screens || [];
    const project = data.project || null;
    const requirements = (data.requirements || []).map((r: any) => ({
      description: r.description || r.text || "",
      category: r.category || "technical",
      status: r.status || "info",
      date: r.date || null,
      sourcePages: r.source_pages || r.sourcePages || [],
      rawText: r.raw_text || r.rawText || r.description || "",
    }));

    options?.onProgress?.(`Extracted ${displays.length} displays, ${requirements.length} requirements`);
    console.log(`[OpenClaw] Extracted ${displays.length} displays, ${requirements.length} requirements from ${pdfPath}`);

    return {
      screens: mapToExtractedSpecs(displays),
      project: mapToProjectInfo(project),
      requirements,
      source: "openclaw",
    };
  } catch (err: any) {
    clearTimeout(timer);
    console.error("[OpenClaw] Extraction failed:", err.message);
    throw new Error(`OpenClaw extraction failed: ${err.message}`);
  }
}

/**
 * Check if the OpenClaw bridge is reachable.
 */
export function isOpenClawAvailable(): boolean {
  // Always return true — we use the HTTP bridge, not the local CLI.
  // If the bridge is down, extractWithOpenClaw will throw and we fall back.
  return true;
}
