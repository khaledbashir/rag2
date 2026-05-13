/**
 * GET /api/cms/project/[id]/bom/prior-projects
 *
 * For the current proposal's client (matched by clientName), find the most
 * recent prior proposal with a CMS BOM. Returns the line items so the picker
 * can offer "Load from <prior project>" prefill.
 */
import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { requireAuth } from "@/lib/apiAuth";
import { log } from "@/lib/logger";

const prisma = new PrismaClient();

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const [, authError] = await requireAuth();
    if (authError) return authError;
    const { id: proposalId } = await params;

    const proposal = await prisma.proposal.findUnique({
      where: { id: proposalId },
      select: { id: true, clientName: true },
    });
    if (!proposal) return NextResponse.json({ error: "Proposal not found" }, { status: 404 });

    const priorBoms = await prisma.cmsProjectBom.findMany({
      where: {
        proposalId: { not: proposalId },
        proposal: { clientName: { equals: proposal.clientName, mode: "insensitive" }, deletedAt: null },
        grandSubtotal: { gt: 0 },
      },
      include: {
        proposal: { select: { id: true, clientName: true, venue: true, updatedAt: true } },
        lineItems: { include: { catalogItem: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 5,
    });

    return NextResponse.json({
      clientName: proposal.clientName,
      priorProjects: priorBoms.map((b) => ({
        proposalId: b.proposalId,
        venue: b.proposal.venue,
        updatedAt: b.proposal.updatedAt,
        grandSubtotal: b.grandSubtotal,
        lineItems: b.lineItems.map((li) => ({
          catalogItemId: li.catalogItemId,
          sku: li.catalogItem.sku,
          displayName: li.catalogItem.displayName,
          quantity: li.quantity,
        })),
      })),
    });
  } catch (error) {
    log.error("[cms/prior-projects] error:", error);
    return NextResponse.json({ error: "Failed to fetch prior projects" }, { status: 500 });
  }
}
