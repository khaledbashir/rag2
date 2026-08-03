/**
 * POST /api/briefing/weekly/run
 * Generates and delivers the weekly "Your Week in Focus" briefing to each
 * configured recipient (WEEKLY_BRIEFING_RECIPIENTS).
 *
 * Body (all optional):
 *   { "scheduled": true }            — cron mode: only proceeds inside the
 *                                      Sunday 4 PM America/New_York window,
 *                                      so the 20:00+21:00 UTC double-fire
 *                                      sends exactly once year-round.
 *   { "dryRun": true }               — generate, don't deliver (returns sizes).
 *   { "recipients": ["a@anc.com"] } — override the configured recipient list.
 *
 * Auth: x-intake-token (BOT_API_TOKEN) or ADMIN/PRODUCT_EXPERT session —
 * same contract as the email → CRM poll route.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/apiAuth";
import type { UserRole } from "@/lib/rbac";
import { FEATURES } from "@/lib/featureFlags";
import { isInSendWindow, runWeeklyBriefing } from "@/services/briefing/weeklyBriefing";

export const maxDuration = 300;

const ALLOWED_ROLES: UserRole[] = ["ADMIN", "PRODUCT_EXPERT"];

export async function POST(request: NextRequest) {
  if (!FEATURES.WEEKLY_BRIEFING) {
    return NextResponse.json({ error: "Feature disabled" }, { status: 404 });
  }

  const machineToken = request.headers.get("x-intake-token");
  const machineOk = Boolean(
    machineToken && process.env.BOT_API_TOKEN && machineToken === process.env.BOT_API_TOKEN,
  );
  if (!machineOk) {
    const [session, authError] = await requireAuth();
    if (authError) return authError;
    const role = (session as unknown as { user?: { role?: UserRole } } | null)?.user?.role;
    if (!role || !ALLOWED_ROLES.includes(role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  let body: { scheduled?: boolean; dryRun?: boolean; recipients?: string[] } = {};
  try {
    body = await request.json();
  } catch {
    // empty body is fine
  }

  if (body.scheduled && !isInSendWindow()) {
    return NextResponse.json({ skipped: true, reason: "outside Sunday 4 PM ET window" });
  }

  try {
    const results = await runWeeklyBriefing({
      recipients: Array.isArray(body.recipients) ? body.recipients : undefined,
      dryRun: Boolean(body.dryRun),
    });
    const failed = results.filter((r) => r.error);
    return NextResponse.json(
      { results },
      { status: failed.length === results.length ? 500 : 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Briefing run failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
