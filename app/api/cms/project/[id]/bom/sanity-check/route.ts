/**
 * GET /api/cms/project/[id]/bom/sanity-check
 *
 * Compares this proposal's current CMS grandSubtotal against historical
 * CMS/LiveSync deals in the CRM. Surfaces a verdict + message the picker
 * UI shows inline.
 */
import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { requireAuth } from "@/lib/apiAuth";
import { log } from "@/lib/logger";
import { runCmsSanityCheck } from "@/services/cms/sanityCheck";

const prisma = new PrismaClient();

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const [, authError] = await requireAuth();
    if (authError) return authError;
    const { id: proposalId } = await params;

    const proposal = await prisma.proposal.findUnique({
      where: { id: proposalId },
      select: { id: true, clientName: true, cmsBom: { select: { grandSubtotal: true } } },
    });
    if (!proposal) return NextResponse.json({ error: "Proposal not found" }, { status: 404 });

    const quoteAmount = Number(proposal.cmsBom?.grandSubtotal ?? 0);
    if (quoteAmount <= 0) {
      return NextResponse.json({
        verdict: "NO_DATA",
        message: "Add line items first — sanity check runs after a quote total exists.",
        comparableCount: 0,
      });
    }

    const result = await runCmsSanityCheck({
      quoteAmount,
      clientName: proposal.clientName,
    });
    return NextResponse.json(result);
  } catch (error) {
    log.error("[cms/sanity-check] error:", error);
    return NextResponse.json({ error: "Failed to run CMS sanity check" }, { status: 500 });
  }
}
