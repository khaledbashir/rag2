/**
 * POST /api/intake/email-to-crm/poll
 * Drains unread messages from the Microsoft 365 intake mailbox through the
 * email → CRM engine. Intended to be hit by cron every few minutes.
 * Auth: x-intake-token (BOT_API_TOKEN) or admin session.
 * Returns 503 until the MSGRAPH_* env vars are configured.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/apiAuth";
import type { UserRole } from "@/lib/rbac";
import { FEATURES } from "@/lib/featureFlags";
import { graphConfigured, pollIntakeMailbox } from "@/services/intake/emailCrmGraphSource";

const ALLOWED_ROLES: UserRole[] = ["ADMIN", "PRODUCT_EXPERT"];

export async function POST(request: NextRequest) {
  if (!FEATURES.EMAIL_TO_CRM) {
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

  if (!graphConfigured()) {
    return NextResponse.json(
      { error: "Mailbox intake not configured yet — see docs/email-to-crm-setup.md." },
      { status: 503 },
    );
  }

  try {
    const result = await pollIntakeMailbox();
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Poll failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
