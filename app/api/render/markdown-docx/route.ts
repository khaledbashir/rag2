/**
 * POST /api/render/markdown-docx
 *
 * Turns a CRM AI answer into a formatted Word document.
 *
 * Jireh Billings, 2026-07-30: "for the CRM AI question, is there a way to
 * export to word document feature? i just asked it something and it gave a
 * great response, but looking to get better formatted."
 *
 * Body: { markdown: string, title?: string, subtitle?: string, fileName?: string }
 * GET is supported with ?markdown= so a link can carry a short answer directly.
 *
 * Auth-exempt via the /api/render/* allowlist — openable as a direct link and
 * callable from the CRM assistant's tool layer.
 */
import { NextRequest, NextResponse } from "next/server";

import { docxFileName, inferTitle, markdownToDocxBuffer } from "@/lib/docx/markdownToDocx";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_MARKDOWN_CHARS = 400_000;
const ALLOWED_BROWSER_ORIGINS = new Set([
  "https://crm.ancsports.net",
]);

function browserHeaders(req: NextRequest): HeadersInit {
  const origin = req.headers.get("origin");
  if (!origin || !ALLOWED_BROWSER_ORIGINS.has(origin)) {
    return { Vary: "Origin" };
  }

  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Expose-Headers": "Content-Disposition",
    Vary: "Origin",
  };
}

function addBrowserHeaders(response: NextResponse, req: NextRequest): NextResponse {
  const headers = browserHeaders(req);
  for (const [name, value] of Object.entries(headers)) {
    if (value !== undefined) response.headers.set(name, String(value));
  }
  return response;
}

async function render(
  markdown: string,
  title: string | null,
  subtitle: string | null,
  fileName: string | null,
) {
  if (!markdown || !markdown.trim()) {
    return NextResponse.json(
      { error: "Nothing to export — send the assistant's answer as `markdown`." },
      { status: 400 },
    );
  }
  if (markdown.length > MAX_MARKDOWN_CHARS) {
    return NextResponse.json(
      { error: `That answer is too long to export (${markdown.length} characters, limit ${MAX_MARKDOWN_CHARS}).` },
      { status: 413 },
    );
  }

  const buffer = await markdownToDocxBuffer(markdown, { title, subtitle });
  const resolvedName = fileName?.trim()
    ? (fileName.trim().toLowerCase().endsWith(".docx") ? fileName.trim() : `${fileName.trim()}.docx`)
    : docxFileName(title || inferTitle(markdown) || "ANC Report");

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${resolvedName}"`,
      "Cache-Control": "no-store",
    },
  });
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: browserHeaders(req),
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    return addBrowserHeaders(
      await render(
        String(body?.markdown ?? body?.content ?? body?.text ?? ""),
        body?.title ? String(body.title) : null,
        body?.subtitle ? String(body.subtitle) : null,
        body?.fileName ? String(body.fileName) : null,
      ),
      req,
    );
  } catch (error: any) {
    return addBrowserHeaders(
      NextResponse.json(
        { error: "Could not build the Word document.", message: error?.message ?? String(error) },
        { status: 500 },
      ),
      req,
    );
  }
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  try {
    return addBrowserHeaders(
      await render(
        params.get("markdown") ?? "",
        params.get("title"),
        params.get("subtitle"),
        params.get("fileName"),
      ),
      req,
    );
  } catch (error: any) {
    return addBrowserHeaders(
      NextResponse.json(
        { error: "Could not build the Word document.", message: error?.message ?? String(error) },
        { status: 500 },
      ),
      req,
    );
  }
}
