import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { log } from "@/lib/logger";

/**
 * GET /api/projects/[id]/embedding-status
 * Lightweight polling endpoint for the async embedding pipeline status.
 * Returns embeddingStatus, aiWorkspaceSlug, and screen count.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const proposal = await prisma.proposal.findUnique({
      where: { id },
      select: {
        embeddingStatus: true,
        aiWorkspaceSlug: true,
        source: true,
        intelligenceBrief: true,
        _count: { select: { screens: true } },
      },
    });

    if (!proposal) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const brief = (proposal.intelligenceBrief as any) || {};

    return NextResponse.json({
      embeddingStatus: proposal.embeddingStatus || null,
      aiWorkspaceSlug: proposal.aiWorkspaceSlug || null,
      source: proposal.source || null,
      screenCount: proposal._count.screens,
      hasExtractedData: !!brief.extractedData,
      filterStats: brief.filterStats || null,
    });
  } catch (error) {
    log.error("GET embedding-status error:", error);
    return NextResponse.json({ error: "Failed to fetch status" }, { status: 500 });
  }
}
