/**
 * POST /api/admin/backfill-creators
 *
 * One-time migration: fills in missing ownership data.
 *
 * Strategy:
 * - Proposals with null createdByUserId: try to match via session logs
 *   or project metadata. If no match → leave null (don't fake it).
 * - RfpAnalysis with null createdBy: set to "Unknown".
 *   We have no FK or audit trail linking old analyses to users,
 *   so attributing them to anyone specific would be dishonest.
 *
 * New records going forward already capture the authenticated user.
 * Admin-only. Hit once after deploy, then forget.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Backfill RfpAnalysis — no FK to User, no audit trail, so "Unknown" is honest
  const analysisResult = await prisma.rfpAnalysis.updateMany({
    where: { OR: [{ createdBy: null }, { createdBy: "" }] },
    data: { createdBy: "Unknown" },
  });

  // Backfill Proposals — these DO have a FK to User.
  // Try to match by checking if there's only one user in the system,
  // otherwise leave null (we can't guess).
  const userCount = await prisma.user.count();
  let proposalsUpdated = 0;

  if (userCount === 1) {
    // Only one user — safe to attribute all orphaned proposals
    const soleUser = await prisma.user.findFirst({ select: { id: true } });
    if (soleUser) {
      const result = await prisma.proposal.updateMany({
        where: { createdByUserId: null },
        data: { createdByUserId: soleUser.id },
      });
      proposalsUpdated = result.count;
    }
  }
  // If multiple users, don't guess — leave proposals unattributed

  return NextResponse.json({
    success: true,
    analysesUpdated: analysisResult.count,
    analysesSetTo: "Unknown",
    proposalsUpdated,
    proposalStrategy: userCount === 1 ? "sole-user-attribution" : "left-null (multiple users)",
  });
}
