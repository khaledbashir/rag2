/**
 * PATCH /api/intake/email-to-crm/[id]
 * Body: { action: "apply", opportunityId, applyProposalDueDate? }
 *     | { action: "dismiss" }
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/apiAuth";
import type { UserRole } from "@/lib/rbac";
import { FEATURES } from "@/lib/featureFlags";
import { applyStoredIntake } from "@/services/intake/emailToCrmProcess";

const ALLOWED_ROLES: UserRole[] = ["ADMIN", "PRODUCT_EXPERT"];

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!FEATURES.EMAIL_TO_CRM) {
    return NextResponse.json({ error: "Feature disabled" }, { status: 404 });
  }
  const [session, authError] = await requireAuth();
  if (authError) return authError;
  const user = (session as unknown as { user?: { role?: UserRole; email?: string } } | null)?.user;
  if (!user?.role || !ALLOWED_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as
    | { action?: string; opportunityId?: string; applyProposalDueDate?: boolean }
    | null;

  if (body?.action === "dismiss") {
    const intake = await prisma.emailCrmIntake.update({
      where: { id },
      data: { status: "dismissed", appliedBy: user.email || "admin" },
    });
    return NextResponse.json({ intake });
  }

  if (body?.action === "apply") {
    if (!body.opportunityId) {
      return NextResponse.json({ error: "opportunityId is required." }, { status: 400 });
    }
    try {
      const intake = await applyStoredIntake(id, body.opportunityId, {
        applyProposalDueDate: body.applyProposalDueDate,
        appliedBy: user.email || "admin",
      });
      return NextResponse.json({ intake });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Apply failed.";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
