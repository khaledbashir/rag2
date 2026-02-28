import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isPlatformOwner } from "@/lib/platformOwner";

/**
 * GET /api/admin/ops/activity-feed
 * Returns recent activity across ALL proposals with user + client info.
 * Platform owner only.
 *
 * Query params:
 *   limit  — number of entries (default 50, max 200)
 *   cursor — createdAt ISO string for pagination (fetch older than this)
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    const email = session?.user?.email;

    if (!isPlatformOwner(email)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(Number(searchParams.get("limit")) || 50, 200);
    const cursor = searchParams.get("cursor");

    const activities = await prisma.activityLog.findMany({
      where: cursor
        ? { createdAt: { lt: new Date(cursor) } }
        : undefined,
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        action: true,
        description: true,
        actor: true,
        createdAt: true,
        metadata: true,
        proposal: {
          select: {
            id: true,
            clientName: true,
            venue: true,
            createdByUser: {
              select: {
                name: true,
                email: true,
              },
            },
          },
        },
      },
    });

    const feed = activities.map((a) => ({
      id: a.id,
      action: a.action,
      description: a.description,
      actor: a.actor,
      createdAt: a.createdAt.toISOString(),
      metadata: a.metadata,
      proposalId: a.proposal.id,
      clientName: a.proposal.clientName,
      venue: a.proposal.venue,
      ownerName: a.proposal.createdByUser?.name || a.proposal.createdByUser?.email || null,
    }));

    const nextCursor =
      activities.length === limit
        ? activities[activities.length - 1].createdAt.toISOString()
        : null;

    return NextResponse.json({ feed, nextCursor });
  } catch (error) {
    console.error("[GET /api/admin/ops/activity-feed] Error:", error);
    return NextResponse.json({ error: "Failed to fetch activity feed" }, { status: 500 });
  }
}
