/**
 * POST /api/rfp/analyses/:id/sync-twenty — Manually replay the Twenty CRM sync
 * for an RFP analysis. Used when the initial sync failed (e.g. Twenty was
 * cold-starting at analyze time) and the opportunity never landed in the CRM.
 *
 * Idempotent: if the analysis is already synced, returns the existing state
 * without hitting Twenty again.
 */

import { NextRequest, NextResponse } from "next/server";
import { replayTwentySync } from "@/lib/twenty-crm";

export const dynamic = "force-dynamic";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const result = await replayTwentySync(id);
    if (result.ok) {
      return NextResponse.json({
        ok: true,
        opportunityId: result.opportunityId,
        attempt: result.attempt,
      });
    }
    return NextResponse.json(
      { ok: false, error: result.error, attempts: result.attempts },
      { status: 502 },
    );
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "replay failed" },
      { status: 500 },
    );
  }
}
