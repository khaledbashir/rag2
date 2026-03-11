/**
 * Mistral OCR Client — Direct API with Document AI Annotations
 *
 * Calls Mistral OCR API directly (https://api.mistral.ai/v1/ocr).
 * Uses document_annotation + annotation_prompt for structured LED extraction.
 * Supports file upload flow for large PDFs (avoids base64 bloat).
 * Extracts headers/footers for project metadata.
 */

import type { ExtractedLEDSpec } from "./types";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const MISTRAL_API_BASE = process.env.MISTRAL_API_BASE_URL || "https://api.mistral.ai";
const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY || "";
const MISTRAL_OCR_MODEL = process.env.MISTRAL_OCR_MODEL || "mistral-ocr-latest";

// Threshold for file upload vs base64 inline (10MB)
const FILE_UPLOAD_THRESHOLD = 10 * 1024 * 1024;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MistralOcrPage {
  index: number;
  markdown: string;
  images: Array<{ id: string; data?: string; image_annotation?: string | null }>;
  tables: Array<{ id: string; content: string; format: string }>;
  hyperlinks: Array<{ url: string; text: string }>;
  header: string | null;
  footer: string | null;
  dimensions: { dpi: number; height: number; width: number };
}

export interface MistralOcrResult {
  pages: MistralOcrPage[];
  model: string;
  document_annotation: string | null;
  usage_info: {
    pages_processed: number;
    doc_size_bytes: number;
  } | null;
}

// ---------------------------------------------------------------------------
// Domain-specific annotation prompt — guides Mistral's Document AI
// ---------------------------------------------------------------------------

const LED_ANNOTATION_PROMPT = `You are analyzing architectural/engineering construction documents for a stadium or arena LED display integration project.

Your goal: extract EVERY LED display, video board, ribbon board, scoreboard, fascia board, and digital signage system from this page.

Key context:
- These are RFP (Request for Proposal) bid documents for professional sports venues (NFL, NBA, MLS, NCAA)
- Displays are identified by names like "Main Videoboard", "North Ribbon", "Fascia Board", "Center Hung"
- Dimensions may be in feet, inches, or millimeters — convert everything to feet
- Pixel pitch is always in millimeters (e.g., 2.5mm, 3.9mm, 5.9mm, 10mm)
- Brightness is in nits or cd/m² (same unit) — outdoor displays are typically 5000-10000 nits
- Indoor displays are typically 800-2000 nits
- Look for spec schedules (tables listing multiple displays), elevation drawings with callouts, and detail drawings
- "Alternate" or "Alt" means an optional add-on, not the base bid
- Common mounting: fascia (on face of structure), flown (hung from ceiling), wall-mount, ground-supported
- Drawing sheet numbers like AV2.04, TL3.01 indicate AV/technology drawings

Be thorough — missing a display costs the contractor money. Include every display you can identify, even with partial specs.`;

// ---------------------------------------------------------------------------
// LED Spec Annotation Schema — Mistral extracts structured data in the OCR call
// ---------------------------------------------------------------------------

const LED_ANNOTATION_SCHEMA = {
  type: "json_schema" as const,
  json_schema: {
    name: "led_display_extraction",
    strict: true,
    schema: {
      type: "object",
      properties: {
        has_led_displays: {
          type: "boolean",
          description: "Whether this page shows or references LED displays, video boards, ribbon boards, scoreboards, or fascia boards",
        },
        drawing_type: {
          type: "string",
          description: "Type of drawing/document: av_layout, elevation, section, detail, schedule, spec_sheet, electrical, structural, other",
        },
        displays: {
          type: "array",
          description: "All LED displays found on this page. Only include displays with at least one measurable spec.",
          items: {
            type: "object",
            properties: {
              name: { type: "string", description: "Display name from the document (e.g., 'North Main Videoboard')" },
              location: { type: "string", description: "Physical location in venue (e.g., 'North End Zone, Upper Level')" },
              width_ft: { type: ["number", "null"], description: "Width in feet. Convert from inches (/12) or mm (/304.8) if needed." },
              height_ft: { type: ["number", "null"], description: "Height in feet. Convert from inches (/12) or mm (/304.8) if needed." },
              pixel_pitch_mm: { type: ["number", "null"], description: "Pixel pitch in mm" },
              brightness_nits: { type: ["number", "null"], description: "Brightness in nits/candelas per sqm" },
              environment: { type: "string", enum: ["indoor", "outdoor"], description: "Indoor or outdoor installation" },
              quantity: { type: "number", description: "Number of identical displays. Default 1." },
              mounting_type: { type: ["string", "null"], description: "Mounting method (fascia, structure, wall, ceiling, etc.)" },
              confidence: { type: "number", description: "Confidence 0-1 based on how clearly specs are stated" },
              notes: { type: ["string", "null"], description: "Any additional relevant notes" },
              is_alternate: { type: "boolean", description: "True if this is a cost alternate, not base bid" },
              alternate_id: { type: ["string", "null"], description: "Alternate ID (e.g., 'A1', 'B3') if is_alternate" },
            },
            required: ["name", "location", "width_ft", "height_ft", "pixel_pitch_mm", "brightness_nits", "environment", "quantity", "mounting_type", "confidence", "notes", "is_alternate", "alternate_id"],
            additionalProperties: false,
          },
        },
      },
      required: ["has_led_displays", "drawing_type", "displays"],
      additionalProperties: false,
    },
  },
};

// ---------------------------------------------------------------------------
// Drawing bbox annotation — analyzes each figure/image in drawings
// ---------------------------------------------------------------------------

const BBOX_ANNOTATION_SCHEMA = {
  type: "json_schema" as const,
  json_schema: {
    name: "drawing_figure_analysis",
    strict: true,
    schema: {
      type: "object",
      properties: {
        figure_type: {
          type: "string",
          description: "Type: led_display_diagram, floor_plan, elevation, wiring_diagram, detail, legend, photo, logo, other",
        },
        shows_led_display: {
          type: "boolean",
          description: "Whether this figure shows an LED display, video board, or related equipment",
        },
        description: {
          type: "string",
          description: "Brief description of what this figure shows",
        },
        display_name: {
          type: ["string", "null"],
          description: "If an LED display is shown, its name/label",
        },
        dimensions_noted: {
          type: ["string", "null"],
          description: "Any dimensions visible in the figure (e.g., '40\\' x 22\\'')",
        },
      },
      required: ["figure_type", "shows_led_display", "description", "display_name", "dimensions_noted"],
      additionalProperties: false,
    },
  },
};

// ---------------------------------------------------------------------------
// Parse annotation response into ExtractedLEDSpec[]
// ---------------------------------------------------------------------------

export function parseAnnotationSpecs(
  annotationJson: string | null,
  pageNumber: number,
): ExtractedLEDSpec[] {
  if (!annotationJson) return [];

  try {
    const parsed = typeof annotationJson === "string" ? JSON.parse(annotationJson) : annotationJson;
    if (!parsed.has_led_displays || !Array.isArray(parsed.displays)) return [];

    return parsed.displays
      .filter((d: any) => {
        // Must have at least one measurable spec
        return d.width_ft != null || d.height_ft != null ||
          d.pixel_pitch_mm != null || d.brightness_nits != null;
      })
      .map((d: any): ExtractedLEDSpec => ({
        name: d.name || "Unknown Display",
        location: d.location || "",
        widthFt: d.width_ft ?? null,
        heightFt: d.height_ft ?? null,
        widthPx: null,
        heightPx: null,
        pixelPitchMm: d.pixel_pitch_mm ?? null,
        brightnessNits: d.brightness_nits ?? null,
        environment: d.environment === "outdoor" ? "outdoor" : "indoor",
        quantity: d.quantity || 1,
        serviceType: null,
        mountingType: d.mounting_type ?? null,
        maxPowerW: null,
        weightLbs: null,
        specialRequirements: [],
        confidence: d.confidence ?? 0.7,
        sourcePages: [pageNumber],
        sourceType: "drawing",
        citation: `[Source: Mistral Document AI, Page ${pageNumber}]`,
        notes: d.notes ?? null,
        isAlternate: d.is_alternate ?? false,
        alternateId: d.alternate_id ?? null,
        alternateDescription: null,
      }));
  } catch (err) {
    console.error(`[MistralOCR] Failed to parse annotation for page ${pageNumber}:`, err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Extract a SINGLE page IMAGE — with Document AI annotations + prompt
// Returns structured LED specs directly from OCR (no separate LLM call needed)
// ---------------------------------------------------------------------------

export async function extractSinglePage(
  imagePath: string,
  pageNumber: number,
): Promise<MistralOcrPage & { annotationSpecs: ExtractedLEDSpec[] }> {
  if (!MISTRAL_API_KEY) {
    throw new Error("MISTRAL_API_KEY not set — cannot call Mistral OCR");
  }

  const { readFile } = await import("fs/promises");
  const imageBuffer = await readFile(imagePath);
  const base64 = imageBuffer.toString("base64");
  const dataUrl = `data:image/jpeg;base64,${base64}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90_000); // 90s per page (annotation takes longer)

  try {
    const res = await fetch(`${MISTRAL_API_BASE}/v1/ocr`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${MISTRAL_API_KEY}`,
      },
      body: JSON.stringify({
        model: MISTRAL_OCR_MODEL,
        document: {
          type: "image_url",
          image_url: dataUrl,
        },
        include_image_base64: false,
        table_format: "html",
        extract_header: true,
        extract_footer: true,
        document_annotation_format: LED_ANNOTATION_SCHEMA,
        document_annotation_prompt: LED_ANNOTATION_PROMPT,
        bbox_annotation_format: BBOX_ANNOTATION_SCHEMA,
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Mistral OCR ${res.status}: ${text.slice(0, 300)}`);
    }

    const data: MistralOcrResult = await res.json();

    if (!data.pages || data.pages.length === 0) {
      return {
        index: 0,
        markdown: "",
        images: [],
        tables: [],
        hyperlinks: [],
        header: null,
        footer: null,
        dimensions: { dpi: 0, height: 0, width: 0 },
        annotationSpecs: [],
      };
    }

    // Parse structured specs from the document annotation
    const annotationSpecs = parseAnnotationSpecs(data.document_annotation, pageNumber);

    if (annotationSpecs.length > 0) {
      console.log(`[MistralOCR] Page ${pageNumber}: Document AI extracted ${annotationSpecs.length} LED specs directly`);
    }

    // Log header/footer if present (useful for project metadata)
    const page = data.pages[0];
    if (page.header) {
      console.log(`[MistralOCR] Page ${pageNumber} header: ${page.header.slice(0, 100)}`);
    }

    return {
      ...page,
      annotationSpecs,
    };
  } catch (err: any) {
    clearTimeout(timer);
    throw new Error(`Mistral OCR page ${pageNumber} failed: ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// Upload file to Mistral cloud → get signed URL (for large PDFs)
// ---------------------------------------------------------------------------

async function uploadToMistralCloud(
  buffer: Buffer,
  filename: string,
): Promise<{ fileId: string; signedUrl: string }> {
  // Step 1: Upload file
  const formData = new FormData();
  formData.append("purpose", "ocr");
  formData.append("file", new Blob([buffer]), filename);

  const uploadRes = await fetch(`${MISTRAL_API_BASE}/v1/files`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${MISTRAL_API_KEY}`,
    },
    body: formData,
    signal: AbortSignal.timeout(120_000), // 2 min upload timeout
  });

  if (!uploadRes.ok) {
    const text = await uploadRes.text();
    throw new Error(`Mistral file upload ${uploadRes.status}: ${text.slice(0, 300)}`);
  }

  const uploadData = await uploadRes.json();
  const fileId = uploadData.id;
  console.log(`[MistralOCR] Uploaded ${filename} to cloud: ${fileId} (${(buffer.length / 1024 / 1024).toFixed(1)}MB)`);

  // Step 2: Get signed URL
  const urlRes = await fetch(`${MISTRAL_API_BASE}/v1/files/${fileId}/url?expiry=1`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${MISTRAL_API_KEY}`,
    },
    signal: AbortSignal.timeout(10_000),
  });

  if (!urlRes.ok) {
    const text = await urlRes.text();
    throw new Error(`Mistral signed URL ${urlRes.status}: ${text.slice(0, 300)}`);
  }

  const urlData = await urlRes.json();
  return { fileId, signedUrl: urlData.url };
}

// ---------------------------------------------------------------------------
// Delete file from Mistral cloud (cleanup after OCR)
// ---------------------------------------------------------------------------

async function deleteFromMistralCloud(fileId: string): Promise<void> {
  try {
    await fetch(`${MISTRAL_API_BASE}/v1/files/${fileId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${MISTRAL_API_KEY}` },
      signal: AbortSignal.timeout(5_000),
    });
    console.log(`[MistralOCR] Deleted cloud file ${fileId}`);
  } catch (err: any) {
    console.warn(`[MistralOCR] Failed to delete cloud file ${fileId}:`, err.message);
  }
}

// ---------------------------------------------------------------------------
// Extract full document via Mistral OCR
// Supports: selective pages, file upload for large PDFs, header/footer extraction
// ---------------------------------------------------------------------------

export async function extractWithMistral(
  buffer: Buffer,
  filename: string,
  options?: {
    pages?: number[];  // 0-indexed page indices to process (undefined = all)
  },
): Promise<MistralOcrResult> {
  if (!MISTRAL_API_KEY) {
    throw new Error("MISTRAL_API_KEY not set — cannot call Mistral OCR");
  }

  const useCloudUpload = buffer.length > FILE_UPLOAD_THRESHOLD;
  let cloudFileId: string | null = null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 300_000); // 5 min for full docs

  try {
    let documentPayload: any;

    if (useCloudUpload) {
      // Large file: upload to Mistral cloud, OCR from signed URL
      console.log(`[MistralOCR] File ${(buffer.length / 1024 / 1024).toFixed(1)}MB > ${(FILE_UPLOAD_THRESHOLD / 1024 / 1024)}MB threshold — using cloud upload`);
      const { fileId, signedUrl } = await uploadToMistralCloud(buffer, filename);
      cloudFileId = fileId;
      documentPayload = {
        type: "document_url",
        document_url: signedUrl,
      };
    } else {
      // Small file: inline base64
      const base64 = buffer.toString("base64");
      const mime = guessMime(filename);
      documentPayload = {
        type: "document_url",
        document_url: `data:${mime};base64,${base64}`,
      };
    }

    const body: any = {
      model: MISTRAL_OCR_MODEL,
      document: documentPayload,
      include_image_base64: false,
      table_format: "html",
      extract_header: true,
      extract_footer: true,
    };

    // Selective page processing — only OCR specific pages
    if (options?.pages && options.pages.length > 0) {
      body.pages = options.pages;
      console.log(`[MistralOCR] Selective OCR: ${options.pages.length} pages (of full document)`);
    }

    const res = await fetch(`${MISTRAL_API_BASE}/v1/ocr`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${MISTRAL_API_KEY}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Mistral OCR ${res.status}: ${text.slice(0, 300)}`);
    }

    const data: MistralOcrResult = await res.json();

    if (!data.pages || data.pages.length === 0) {
      return {
        pages: [],
        model: MISTRAL_OCR_MODEL,
        document_annotation: null,
        usage_info: null,
      };
    }

    return data;
  } catch (err: any) {
    clearTimeout(timer);
    throw new Error(`Mistral OCR extraction failed: ${err.message}`);
  } finally {
    // Cleanup uploaded file from Mistral cloud
    if (cloudFileId) {
      deleteFromMistralCloud(cloudFileId).catch(() => {});
    }
  }
}

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

export async function mistralOcrHealthCheck(): Promise<{
  ok: boolean;
  url?: string;
  error?: string;
}> {
  if (!MISTRAL_API_KEY) {
    return { ok: false, error: "MISTRAL_API_KEY not configured" };
  }

  try {
    // Simple models list call to verify the key works
    const res = await fetch(`${MISTRAL_API_BASE}/v1/models`, {
      headers: { Authorization: `Bearer ${MISTRAL_API_KEY}` },
      signal: AbortSignal.timeout(5_000),
    });
    if (res.ok) {
      return { ok: true, url: MISTRAL_API_BASE };
    }
    return { ok: false, error: `Mistral API returned ${res.status}` };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function guessMime(filename: string): string {
  const ext = filename.toLowerCase().split(".").pop() || "";
  const map: Record<string, string> = {
    pdf: "application/pdf",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    tiff: "image/tiff",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };
  return map[ext] || "application/octet-stream";
}
