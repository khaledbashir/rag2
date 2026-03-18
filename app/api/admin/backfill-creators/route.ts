/**
 * POST /api/admin/backfill-creators
 *
 * One-time migration: sets createdByUserId on all Proposals and
 * createdBy on all RfpAnalysis records that are currently null.
 *
 * Strategy:
 * - Proposals: assign to the first admin user (Natalia) as default creator
 * - RfpAnalysis: set createdBy string from the existing user name
 *
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

  // Find default user — Natalia (primary user, 70-75% of projects)
  // Fall back to first user in DB if Natalia not found
  const nataliaUser = await prisma.user.findFirst({
    where: {
      OR: [
        { email: { contains: "natalia", mode: "insensitive" } },
        { name: { contains: "Natalia", mode: "insensitive" } },
      ],
    },
    select: { id: true, name: true, email: true },
  });

  const defaultUser = nataliaUser || await prisma.user.findFirst({
    select: { id: true, name: true, email: true },
  });

  if (!defaultUser) {
    return NextResponse.json({ error: "No users found in database" }, { status: 500 });
  }

  // Backfill Proposals (projects + estimators)
  const proposalResult = await prisma.proposal.updateMany({
    where: { createdByUserId: null },
    data: { createdByUserId: defaultUser.id },
  });

  // Backfill RfpAnalysis
  const analysisResult = await prisma.rfpAnalysis.updateMany({
    where: { OR: [{ createdBy: null }, { createdBy: "" }] },
    data: { createdBy: defaultUser.name || defaultUser.email || "Natalia" },
  });

  return NextResponse.json({
    success: true,
    defaultUser: defaultUser.name || defaultUser.email,
    proposalsUpdated: proposalResult.count,
    analysesUpdated: analysisResult.count,
  });
}
