/**
 * POST /api/render/docx-markdown
 *
 * Word document in, markdown out — headings, bullets, and tables in the
 * positions they occupy in the document.
 *
 * The companion of POST /api/render/markdown-docx. Together they are the whole
 * "put this on the ANC template" round-trip the CRM assistant runs when
 * someone uploads a .docx:
 *
 *     docx  →  /api/render/docx-markdown  →  markdown
 *     markdown → /api/render/markdown-docx →  branded docx
 *
 * Natalia Kovaleva, 2026-08-20: "it did not identified bullet points and threw
 * all tables at the end of the file." Both came from the assistant writing its
 * own converter in the sandbox each time. See lib/docx/docxToMarkdown.ts for
 * the two traps that makes inevitable; this endpoint exists so the conversion
 * is the same code on every run rather than whatever gets written that day.
 *
 * Accepts either a multipart upload (field `file`) or JSON `{ base64 }`.
 * Returns `{ markdown, headings, bullets, tableRows, characters }` — the
 * counts are there so a caller can see at a glance that the structure came
 * through.
 *
 * Auth-exempt via the /api/render/* allowlist: it reads bytes the caller
 * already has and returns text. No records, no lookups, no side effects.
 */
import { NextRequest, NextResponse } from "next/server";

import { docxToMarkdown } from "@/lib/docx/docxToMarkdown";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Comfortably past any proposal or assessment; a guard, not a limit in practice. */
const MAX_BYTES = 25 * 1024 * 1024;

const ALLOWED_BROWSER_ORIGINS = new Set(["https://crm.ancsports.net"]);

function browserHeaders(req: NextRequest): HeadersInit {
  const origin = req.headers.get("origin");
  if (!origin || !ALLOWED_BROWSER_ORIGINS.has(origin)) return { Vary: "Origin" };

  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

function withHeaders(response: NextResponse, req: NextRequest): NextResponse {
  for (const [name, value] of Object.entries(browserHeaders(req))) {
    if (value !== undefined) response.headers.set(name, String(value));
  }
  return response;
}

/** The uploaded bytes, however the caller chose to send them. */
async function readBody(req: NextRequest): Promise<{ bytes: Buffer | null; error?: string }> {
  const contentType = req.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file") ?? form.get("files") ?? form.get("document");
    if (!(file instanceof Blob)) {
      return { bytes: null, error: "Attach the Word document as `file`." };
    }
    return { bytes: Buffer.from(await file.arrayBuffer()) };
  }

  const body = await req.json().catch(() => ({}) as any);
  const base64 = body?.base64 ?? body?.data ?? body?.docx;
  if (typeof base64 !== "string" || !base64.trim()) {
    return { bytes: null, error: "Send the document as a multipart `file`, or as JSON `{ base64 }`." };
  }
  // A data: URI is a reasonable thing for a caller to paste; take it either way.
  const payload = base64.replace(/^data:[^;,]*(;base64)?,/, "");
  return { bytes: Buffer.from(payload, "base64") };
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: browserHeaders(req) });
}

export async function POST(req: NextRequest) {
  try {
    const { bytes, error } = await readBody(req);
    if (!bytes) {
      return withHeaders(NextResponse.json({ error }, { status: 400 }), req);
    }
    if (bytes.length === 0) {
      return withHeaders(NextResponse.json({ error: "That file is empty." }, { status: 400 }), req);
    }
    if (bytes.length > MAX_BYTES) {
      const mb = Math.round(bytes.length / (1024 * 1024));
      return withHeaders(
        NextResponse.json({ error: `That document is ${mb}MB, too large to convert.` }, { status: 413 }),
        req,
      );
    }

    const markdown = docxToMarkdown(bytes);

    return withHeaders(
      NextResponse.json({
        markdown,
        characters: markdown.length,
        headings: (markdown.match(/^#{1,6} /gm) || []).length,
        bullets: (markdown.match(/^ *[-*] /gm) || []).length,
        tableRows: (markdown.match(/^\|/gm) || []).length,
      }),
      req,
    );
  } catch (error: any) {
    // docxToMarkdown throws rather than returning something partial, so the
    // caller learns the document could not be read instead of quietly
    // rendering less than it said.
    return withHeaders(
      NextResponse.json(
        { error: "Could not read that Word document.", message: error?.message ?? String(error) },
        { status: 422 },
      ),
      req,
    );
  }
}
