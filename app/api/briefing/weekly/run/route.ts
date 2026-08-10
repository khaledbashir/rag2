/**
 * POST /api/briefing/weekly/run
 * Generates and delivers the weekly "Your Week in Focus" briefing to each
 * configured recipient (WEEKLY_BRIEFING_RECIPIENTS).
 *
 * Body (all optional):
 *   { "scheduled": true }            — cron mode: builds the edition for the
 *                                      current week's Sunday 4 PM
 *                                      America/New_York anchor. The host calls
 *                                      hourly; the on-time firing delivers, and
 *                                      if that firing was missed a later call
 *                                      inside the catch-up grace still delivers
 *                                      the same edition, skipping anyone whose
 *                                      mailbox already holds it.
 *   { "dryRun": true }               — generate, don't deliver (returns sizes).
 *   { "recipients": ["a@anc.com"] } — override the configured recipient list.
 *   { "asOf": "2026-08-09T20:00:00Z" } — build the edition for the week ending
 *                                      at this instant, for re-sending a
 *                                      specific past week on request.
 *
 * Auth: x-intake-token (BOT_API_TOKEN) or ADMIN/PRODUCT_EXPERT session —
 * same contract as the email → CRM poll route.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/apiAuth";
import type { UserRole } from "@/lib/rbac";
import { FEATURES } from "@/lib/featureFlags";
import { briefingDue, runWeeklyBriefing } from "@/services/briefing/weeklyBriefing";

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

  let body: {
    scheduled?: boolean;
    dryRun?: boolean;
    recipients?: string[];
    asOf?: string;
  } = {};
  try {
    body = await request.json();
  } catch {
    // empty body is fine
  }

  let asOf: Date | undefined;
  if (body.asOf) {
    asOf = new Date(body.asOf);
    if (Number.isNaN(asOf.getTime())) {
      return NextResponse.json({ error: "asOf is not a valid date" }, { status: 400 });
    }
  }

  // Scheduled runs are anchored to the week's Sunday 4 PM ET instant, not to
  // the moment the cron happened to fire, so a recovered week is the edition
  // that was owed rather than a partial one.
  let skipAlreadyDelivered = false;
  if (body.scheduled) {
    const due = briefingDue();
    if (!due) {
      return NextResponse.json({
        skipped: true,
        reason: "past the catch-up window for this week's Sunday 4 PM ET briefing",
      });
    }
    asOf = asOf ?? due.anchor;
    skipAlreadyDelivered = due.isCatchUp;
  }

  try {
    const results = await runWeeklyBriefing({
      recipients: Array.isArray(body.recipients) ? body.recipients : undefined,
      dryRun: Boolean(body.dryRun),
      now: asOf,
      skipAlreadyDelivered,
    });
    const failed = results.filter((r) => r.error);
    return NextResponse.json(
      { results },
      { status: failed.length > 0 && failed.length === results.length ? 500 : 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Briefing run failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
