/**
 * Email → CRM intake API.
 *
 * POST — submit an inbound email (subject/from/body/attachment names). The
 *        engine extracts due dates + key info, matches a CRM opportunity,
 *        auto-applies decisive matches, and queues the rest for review.
 *        Auth: admin session, or x-intake-token for machine sources
 *        (mailbox poller, forwarders).
 * GET  — list recent intakes for the /admin/email-to-crm queue.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/apiAuth";
import type { UserRole } from "@/lib/rbac";
import { FEATURES } from "@/lib/featureFlags";
import { processEmailCrmIntake } from "@/services/intake/emailToCrmProcess";
import type { EmailCrmInput } from "@/services/intake/emailToCrmSync";

const ALLOWED_ROLES: UserRole[] = ["ADMIN", "PRODUCT_EXPERT"];

async function authorize(request: NextRequest): Promise<{ ok: boolean; actor: string }> {
  const machineToken = request.headers.get("x-intake-token");
  if (machineToken && process.env.BOT_API_TOKEN && machineToken === process.env.BOT_API_TOKEN) {
    return { ok: true, actor: "machine" };
  }
  const [session, authError] = await requireAuth();
  if (authError) return { ok: false, actor: "" };
  const user = (session as unknown as { user?: { role?: UserRole; email?: string } } | null)?.user;
  if (!user?.role || !ALLOWED_ROLES.includes(user.role)) return { ok: false, actor: "" };
  return { ok: true, actor: user.email || "admin" };
}

export async function POST(request: NextRequest) {
  if (!FEATURES.EMAIL_TO_CRM) {
    return NextResponse.json({ error: "Feature disabled" }, { status: 404 });
  }
  const auth = await authorize(request);
  if (!auth.ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await request.json().catch(() => null)) as
    | (Partial<EmailCrmInput> & { autoApply?: boolean })
    | null;
  if (!body || typeof body.body !== "string" || body.body.trim().length < 20) {
    return NextResponse.json({ error: "Provide the email body (min 20 chars)." }, { status: 400 });
  }

  const input: EmailCrmInput = {
    subject: body.subject?.toString().slice(0, 500),
    fromEmail: body.fromEmail?.toString().slice(0, 200),
    fromName: body.fromName?.toString().slice(0, 200),
    receivedAt: body.receivedAt?.toString(),
    body: body.body,
    attachments: Array.isArray(body.attachments)
      ? body.attachments
          .filter((a) => a && typeof a.name === "string")
          .map((a) => ({ name: a.name.slice(0, 300), sizeBytes: Number(a.sizeBytes) || undefined }))
      : [],
    source: body.source?.toString().slice(0, 50) || (auth.actor === "machine" ? "graph-mailbox" : "manual"),
  };

  const result = await processEmailCrmIntake(input, {
    autoApply: body.autoApply !== false,
    appliedBy: auth.actor === "machine" ? "auto" : auth.actor,
  });

  return NextResponse.json({
    intake: result.intake,
    decision: result.decision,
    applied: result.applied,
  });
}

export async function GET(request: NextRequest) {
  if (!FEATURES.EMAIL_TO_CRM) {
    return NextResponse.json({ error: "Feature disabled" }, { status: 404 });
  }
  const auth = await authorize(request);
  if (!auth.ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const status = request.nextUrl.searchParams.get("status") || undefined;
  const intakes = await prisma.emailCrmIntake.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return NextResponse.json({ intakes });
}
