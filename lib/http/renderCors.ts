/**
 * CORS for the /api/render/* endpoints that a browser calls directly.
 *
 * The CRM's Exports hub is a front component running on crm.ancsports.net. It
 * probes each report endpoint on mount and only renders the tile once the
 * endpoint answers — so an endpoint that omits these headers makes the browser
 * fetch throw, and the tile silently never appears. That is exactly how the LG
 * Alliance, Active Pricing Priority and User Activity tiles went missing from
 * the Exports page while every endpoint returned a healthy 200 to curl.
 *
 * A plain <a href> download is unaffected by CORS; only the scripted probe is.
 */
import type { NextRequest, NextResponse } from "next/server";

const ALLOWED_BROWSER_ORIGINS = new Set([
  "https://crm.ancsports.net",
]);

export function renderCorsHeaders(req: NextRequest): HeadersInit {
  const origin = req.headers.get("origin");
  if (!origin || !ALLOWED_BROWSER_ORIGINS.has(origin)) {
    return { Vary: "Origin" };
  }
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Expose-Headers": "Content-Disposition",
    Vary: "Origin",
  };
}

export function withRenderCors<T extends NextResponse>(response: T, req: NextRequest): T {
  for (const [name, value] of Object.entries(renderCorsHeaders(req))) {
    if (value !== undefined) response.headers.set(name, String(value));
  }
  return response;
}
