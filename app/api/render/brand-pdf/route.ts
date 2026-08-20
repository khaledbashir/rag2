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
 * Placement is decided from the sheet itself by default: each page is rasterized,
 * its ink measured, and the mark put on the blank paper nearest `position`
 * (`bottom-right` unless told otherwise). Pass `placement=band` or
 * `placement=overlay` to override that judgement.
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
// A 104MB / 67-page drawing set brands in 3.2s at 528MB peak RSS (measured
// 2026-08-20), so the ceiling is time spent uploading, not stamping.
export const maxDuration = 300;

/** Covers the 105MB Scotia drawing set used for the real regression probe. */
const MAX_BYTES = 200 * 1024 * 1024;

const POSITIONS: BrandPdfPosition[] = ["top-left", "top-right", "bottom-left", "bottom-right"];
const PLACEMENTS: BrandPdfPlacement[] = ["auto", "band", "overlay"];
const EDGES: BrandPdfEdge[] = ["top", "bottom"];

const ALLOWED_BROWSER_ORIGINS = new Set(["https://crm.ancsports.net"]);

function browserHeaders(req: NextRequest): HeadersInit {
  const origin = req.headers.get("origin");
  if (!origin || !ALLOWED_BROWSER_ORIGINS.has(origin)) return { Vary: "Origin" };

  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Expose-Headers":
      "Content-Disposition, X-Anc-Brand-Warnings, X-Anc-Brand-Placement",
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
  /**
   * Size of the RAW request body, when we know it, so the truncation check can
   * compare like with like. Null means "do not check" — for multipart we never
   * see the raw body, and `formData()` already throws on a cut-off upload.
   */
  rawLength: number | null;
  error?: string;
}

/**
 * Hosts we will fetch a PDF from when the caller passes `url` instead of bytes.
 * The assistant's first instinct is to hand over the CRM file link it already
 * has, which is both reasonable and far cheaper than a download-and-re-upload
 * round trip. Kept to an allowlist so this is not an open fetch proxy.
 */
const FETCHABLE_HOSTS = new Set(["crm.ancsports.net", "proposals.anc.com"]);

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
      return { bytes: null, fileName: null, fields, rawLength: null, error: "Attach the PDF as `file`." };
    }
    const name = file instanceof File ? file.name : null;
    // Content-Length here also covers MIME framing, so it is not comparable.
    return { bytes: Buffer.from(await file.arrayBuffer()), fileName: name, fields, rawLength: null };
  }

  if (contentType.includes("application/json")) {
    // Read the bytes rather than req.json() so we know the true body size.
    const rawBody = Buffer.from(await req.arrayBuffer());
    let body: Record<string, unknown> | null = null;
    try {
      body = JSON.parse(rawBody.toString("utf8")) as Record<string, unknown>;
    } catch {
      body = null;
    }
    if (!body) {
      return {
        bytes: null,
        fileName: null,
        fields,
        rawLength: rawBody.length,
        error: "Send valid JSON.",
      };
    }
    for (const [key, value] of Object.entries(body)) {
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        fields[key] = String(value);
      }
    }
    const fromUrl = typeof body.url === "string" ? body.url.trim() : null;
    if (fromUrl) {
      const fetched = await fetchPdf(fromUrl);
      return { ...fetched, fields, rawLength: rawBody.length };
    }

    const base64 = typeof body.base64 === "string" ? body.base64 : null;
    if (!base64) {
      return {
        bytes: null,
        fileName: null,
        fields,
        rawLength: rawBody.length,
        error: "Send the PDF as multipart `file`, JSON `{ base64 }`, or JSON `{ url }` for a CRM file link.",
      };
    }
    const cleaned = base64.replace(/^data:application\/pdf;base64,/, "");
    return {
      bytes: Buffer.from(cleaned, "base64"),
      fileName: typeof body.fileName === "string" ? body.fileName : null,
      fields,
      rawLength: rawBody.length,
    };
  }

  // A bare body of PDF bytes.
  const raw = Buffer.from(await req.arrayBuffer());
  if (raw.length === 0) {
    return {
      bytes: null,
      fileName: null,
      fields,
      rawLength: 0,
      error: "Send the PDF as multipart `file`, JSON `{ base64 }`, or JSON `{ url }`.",
    };
  }
  return { bytes: raw, fileName: null, fields, rawLength: raw.length };
}

/** Pull a PDF from an allowlisted host — in practice a signed CRM file link. */
async function fetchPdf(
  target: string,
): Promise<{ bytes: Buffer | null; fileName: string | null; error?: string }> {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(target);
  } catch {
    return { bytes: null, fileName: null, error: "`url` is not a valid URL." };
  }
  if (parsedUrl.protocol !== "https:" || !FETCHABLE_HOSTS.has(parsedUrl.hostname)) {
    return {
      bytes: null,
      fileName: null,
      error: `\`url\` must be an https link on ${[...FETCHABLE_HOSTS].join(" or ")}. Send the bytes instead.`,
    };
  }

  let response: Response;
  try {
    response = await fetch(parsedUrl.toString(), { redirect: "follow" });
  } catch (error) {
    return {
      bytes: null,
      fileName: null,
      error: `Could not fetch that URL: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  if (!response.ok) {
    // A 403 here is nearly always an expired or mistyped file token.
    return {
      bytes: null,
      fileName: null,
      error: `That URL returned ${response.status}. If it is a CRM file link the token may have expired — generate a fresh one.`,
    };
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  const disposition = response.headers.get("content-disposition") || "";
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
  return { bytes, fileName: match ? decodeURIComponent(match[1]) : null };
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

/** "714KB" / "1.4MB" — round numbers hide the very difference being reported. */
function describeSize(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)}MB`
    : `${Math.max(1, Math.round(bytes / 1024))}KB`;
}

export async function POST(req: NextRequest) {
  const url = new URL(req.url);

  let parsed: Parsed;
  try {
    parsed = await readBody(req);
  } catch {
    // Nearly always the body being cut off in transit rather than a malformed
    // upload — say so, because "could not be read" sends people looking at
    // their file instead of its size.
    return withHeaders(
      NextResponse.json(
        {
          error:
            "That upload could not be read — most often the request body was cut off in transit. Try again, and if it is a very large drawing set send fewer sheets.",
        },
        { status: 400 },
      ),
      req,
    );
  }

  // A body shorter than its own Content-Length was truncated upstream. Compare
  // the RAW body against Content-Length, never the extracted PDF: base64 in JSON
  // is ~33% larger than the file it carries, so comparing the decoded bytes
  // flagged every valid base64 upload as "incomplete". That false positive
  // shipped on 2026-08-20 and blocked a real 714KB document.
  const declared = Number.parseInt(req.headers.get("content-length") || "", 10);
  if (parsed.rawLength !== null && Number.isFinite(declared) && declared > 0) {
    const shortfall = declared - parsed.rawLength;
    if (shortfall > 4096) {
      return withHeaders(
        NextResponse.json(
          {
            error: `That upload arrived incomplete — ${describeSize(
              parsed.rawLength,
            )} of a declared ${describeSize(
              declared,
            )}. The file was not the problem; the request was cut off in transit.`,
          },
          { status: 400 },
        ),
        req,
      );
    }
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
        placedOnSheet: result.placedOnSheet,
        placedOnBand: result.placedOnBand,
        positionsUsed: result.positionsUsed,
        decidedBy: result.decidedBy,
        decisionNote: result.decisionNote,
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
      // Where the mark actually landed, so a caller streaming the bytes can still
      // say what was decided without asking for the JSON form.
      "X-Anc-Brand-Placement": JSON.stringify({
        placement: result.placement,
        onSheet: result.placedOnSheet,
        onBand: result.placedOnBand,
        positions: result.positionsUsed,
        decidedBy: result.decidedBy,
      }),
    },
  });
  return withHeaders(response, req);
}

export async function OPTIONS(req: NextRequest) {
  return withHeaders(new NextResponse(null, { status: 204 }), req);
}
