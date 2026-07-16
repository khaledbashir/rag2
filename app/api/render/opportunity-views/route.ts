/**
 * GET /api/render/opportunity-views
 *
 * Lists Opportunity saved views for the ANC Exports hub. Auth-exempt via the
 * /api/render/* allowlist so the CRM front component can load the list without
 * holding a CRM API token in the browser sandbox (the previous in-component
 * metadata call failed silently and left only the hard-coded preset tiles).
 *
 * Query params:
 *   q   optional name filter (case-insensitive substring)
 */
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

const TWENTY_BASE = "https://abc-twenty.izcgmb.easypanel.host";
const TWENTY_TOKEN =
  process.env.TWENTY_API_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkM2ZiYzI5YS1hNjM1LTQ4YjctOWQ2ZS0yNTA5NDE2NzdmZDAiLCJ0eXBlIjoiQVBJX0tFWSIsIndvcmtzcGFjZUlkIjoiZDNmYmMyOWEtYTYzNS00OGI3LTlkNmUtMjUwOTQxNjc3ZmQwIiwiaWF0IjoxNzc0ODEwNDkyLCJleHAiOjQ5Mjg0MTA0ODcsImp0aSI6IjYxMGEzMWEzLTJhMDgtNDM5MC1iMTU1LTFkN2M3NzY5Y2QxOSJ9.nzknS-bBNuf7y3LUCv2xEa5-9xuJNHBK3GalJwWK3eA";

const OPPORTUNITY_OBJECT_ID = "c779922d-cf25-4a5e-9382-23eb1c02199e";

type ViewRow = {
  id: string;
  name: string | null;
  key: string | null;
  objectMetadataId: string;
  type: string | null;
};

export async function GET(req: NextRequest) {
  try {
    const res = await fetch(`${TWENTY_BASE}/metadata`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TWENTY_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query:
          "query { getViews { id name key objectMetadataId type } }",
      }),
      // short-lived; hub reloads on each open
      cache: "no-store",
    });
    const body = (await res.json()) as {
      data?: { getViews?: ViewRow[] };
      errors?: Array<{ message: string }>;
    };
    if (body.errors?.length) {
      throw new Error(body.errors.map((e) => e.message).join("; "));
    }

    const q = (req.nextUrl.searchParams.get("q") || "").trim().toLowerCase();
    const views = (body.data?.getViews ?? [])
      .filter((v) => v.objectMetadataId === OPPORTUNITY_OBJECT_ID)
      .map((v) => ({
        id: v.id,
        name: v.name || v.key || "Untitled view",
        key: v.key,
        type: v.type || "TABLE",
        isIndex: v.key === "INDEX",
      }))
      .filter((v) => !q || v.name.toLowerCase().includes(q))
      .sort((a, b) => {
        // Keep All Deals / INDEX first, then alpha.
        if (a.isIndex !== b.isIndex) return a.isIndex ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

    return NextResponse.json(
      { views, count: views.length },
      {
        headers: {
          "Cache-Control": "public, max-age=30, stale-while-revalidate=120",
          "Access-Control-Allow-Origin": "*",
        },
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: message, views: [], count: 0 },
      {
        status: 500,
        headers: { "Access-Control-Allow-Origin": "*" },
      },
    );
  }
}
