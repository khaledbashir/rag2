/**
 * POST /api/render/brand-pdf
 *
 * A PDF goes in, the same PDF wearing the ANC mark comes out.
 *
 * The third side of the house-template set:
 *
 *     markdown            → /api/render/markdown-docx  → branded .docx
 *     someone's .docx     → /api/render/docx-markdown  → markdown (then the above)
 *     someone's .pdf      → /api/render/brand-pdf      → branded .pdf   ← this
 *
 * `generate-pdf-browserless` already covers a *new* PDF built from HTML. What had
 * no house path was branding a PDF that already exists — a manufacturer drawing, a
 * vendor spec sheet, a submittal. On 2026-08-20 the CRM assistant was asked to do
 * exactly that to an OKC Thunder LED drawing, had nowhere to go, and drew its own
 * ANC wordmark in the sandbox. See lib/pdf/brandPdf.ts.
 *
 * Multipart (`file`) or JSON (`{ base64 }`). Options ride as form fields or query
 * string: `placement`, `edge`, `position`, `pages`, `footer`, `footerText`,
 * `title`, `logoScale`.
 * `?format=json` returns the branded PDF as base64 alongside the warnings, which
 * is what the assistant's sandbox wants when it needs to see them.
 *
 * Auth-exempt via the /api/render/* allowlist: it takes bytes the caller already
 * holds and gives bytes back. No records, no lookups, no side effects.
 */
import { NextRequest, NextResponse } from "next/server";

import {
  BrandPdfEdge,
  BrandPdfOptions,
  BrandPdfPlacement,
  BrandPdfPosition,
  brandPdf,
  brandedFileName,
} from "@/lib/pdf/brandPdf";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Past any drawing set we have seen; a guard, not a working limit. */
const MAX_BYTES = 60 * 1024 * 1024;

const POSITIONS: BrandPdfPosition[] = ["top-left", "top-right", "bottom-left", "bottom-right"];
const PLACEMENTS: BrandPdfPlacement[] = ["band", "overlay"];
const EDGES: BrandPdfEdge[] = ["top", "bottom"];

const ALLOWED_BROWSER_ORIGINS = new Set(["https://crm.ancsports.net"]);

function browserHeaders(req: NextRequest): HeadersInit {
  const origin = req.headers.get("origin");
  if (!origin || !ALLOWED_BROWSER_ORIGINS.has(origin)) return { Vary: "Origin" };

  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Expose-Headers": "Content-Disposition, X-Anc-Brand-Warnings",
    Vary: "Origin",
  };
}

function withHeaders(response: NextResponse, req: NextRequest): NextResponse {
  for (const [name, value] of Object.entries(browserHeaders(req))) {
    if (value !== undefined) response.headers.set(name, String(value));
  }
  return response;
}

interface Parsed {
  bytes: Buffer | null;
  fileName: string | null;
  fields: Record<string, string>;
  error?: string;
}

async function readBody(req: NextRequest): Promise<Parsed> {
  const contentType = req.headers.get("content-type") || "";
  const fields: Record<string, string> = {};

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    for (const [key, value] of form.entries()) {
      if (typeof value === "string") fields[key] = value;
    }
    const file = form.get("file") ?? form.get("files") ?? form.get("document") ?? form.get("pdf");
    if (!(file instanceof Blob)) {
      return { bytes: null, fileName: null, fields, error: "Attach the PDF as `file`." };
    }
    const name = file instanceof File ? file.name : null;
    return { bytes: Buffer.from(await file.arrayBuffer()), fileName: name, fields };
  }

  if (contentType.includes("application/json")) {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return { bytes: null, fileName: null, fields, error: "Send valid JSON." };
    for (const [key, value] of Object.entries(body)) {
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        fields[key] = String(value);
      }
    }
    const base64 = typeof body.base64 === "string" ? body.base64 : null;
    if (!base64) {
      return {
        bytes: null,
        fileName: null,
        fields,
        error: "Send the PDF as multipart `file`, or JSON `{ base64 }`.",
      };
    }
    const cleaned = base64.replace(/^data:application\/pdf;base64,/, "");
    return {
      bytes: Buffer.from(cleaned, "base64"),
      fileName: typeof body.fileName === "string" ? body.fileName : null,
      fields,
    };
  }

  // A bare body of PDF bytes.
  const raw = Buffer.from(await req.arrayBuffer());
  if (raw.length === 0) {
    return {
      bytes: null,
      fileName: null,
      fields,
      error: "Send the PDF as multipart `file`, or JSON `{ base64 }`.",
    };
  }
  return { bytes: raw, fileName: null, fields };
}

function optionsFrom(fields: Record<string, string>, url: URL): BrandPdfOptions & { title: string | null } {
  const pick = (name: string): string | null => fields[name] ?? url.searchParams.get(name);

  const rawPlacement = (pick("placement") || "").trim().toLowerCase();
  const placement = PLACEMENTS.includes(rawPlacement as BrandPdfPlacement)
    ? (rawPlacement as BrandPdfPlacement)
    : undefined;

  const rawEdge = (pick("edge") || "").trim().toLowerCase();
  const edge = EDGES.includes(rawEdge as BrandPdfEdge)
    ? (rawEdge as BrandPdfEdge)
    : undefined;

  const rawPosition = (pick("position") || "").trim().toLowerCase();
  const position = POSITIONS.includes(rawPosition as BrandPdfPosition)
    ? (rawPosition as BrandPdfPosition)
    : undefined;

  const rawPages = (pick("pages") || "").trim().toLowerCase();
  const pages = rawPages === "first" ? "first" : rawPages === "all" ? "all" : undefined;

  const rawFooter = (pick("footer") || "").trim().toLowerCase();
  const footer = rawFooter === "" ? undefined : !["false", "0", "no", "off"].includes(rawFooter);

  const scale = Number.parseFloat(pick("logoScale") || "");

  return {
    placement,
    edge,
    position,
    pages,
    footer,
    footerText: pick("footerText"),
    title: pick("title"),
    logoScale: Number.isFinite(scale) ? scale : undefined,
  };
}

export async function POST(req: NextRequest) {
  const url = new URL(req.url);

  let parsed: Parsed;
  try {
    parsed = await readBody(req);
  } catch {
    return withHeaders(
      NextResponse.json({ error: "That upload could not be read." }, { status: 400 }),
      req,
    );
  }

  if (parsed.error || !parsed.bytes) {
    return withHeaders(
      NextResponse.json({ error: parsed.error ?? "No PDF received." }, { status: 400 }),
      req,
    );
  }
  if (parsed.bytes.length > MAX_BYTES) {
    return withHeaders(
      NextResponse.json(
        { error: `That PDF is larger than the ${Math.round(MAX_BYTES / 1024 / 1024)}MB limit.` },
        { status: 413 },
      ),
      req,
    );
  }
  if (parsed.bytes.subarray(0, 5).toString("latin1") !== "%PDF-") {
    return withHeaders(
      NextResponse.json(
        { error: "That file is not a PDF. Word documents go to /api/render/docx-markdown." },
        { status: 400 },
      ),
      req,
    );
  }

  const options = optionsFrom(parsed.fields, url);

  let result;
  try {
    result = await brandPdf(parsed.bytes, options);
  } catch (error) {
    return withHeaders(
      NextResponse.json(
        { error: error instanceof Error ? error.message : "That PDF could not be branded." },
        { status: 422 },
      ),
      req,
    );
  }

  const fileName = brandedFileName(options.title ?? null, parsed.fileName);

  if ((url.searchParams.get("format") || parsed.fields.format) === "json") {
    return withHeaders(
      NextResponse.json({
        fileName,
        pageCount: result.pageCount,
        stampedPages: result.stampedPages,
        placement: result.placement,
        edge: result.edge,
        position: result.position,
        footer: result.footer,
        warnings: result.warnings,
        base64: Buffer.from(result.bytes).toString("base64"),
      }),
      req,
    );
  }

  const response = new NextResponse(Buffer.from(result.bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
      // Warnings survive the binary response so a caller can surface them.
      "X-Anc-Brand-Warnings": result.warnings.length ? JSON.stringify(result.warnings) : "",
    },
  });
  return withHeaders(response, req);
}

export async function OPTIONS(req: NextRequest) {
  return withHeaders(new NextResponse(null, { status: 204 }), req);
}
