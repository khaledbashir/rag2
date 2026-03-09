import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { log } from "@/lib/logger";

/**
 * GET /api/demo/vote?featureId=xxx&voterId=yyy
 * Returns vote counts for a feature + the current user's vote direction.
 *
 * POST /api/demo/vote
 * Body: { featureId, direction: "up"|"down"|null, voterId }
 * Upserts or deletes a vote.
 */

export async function GET(req: NextRequest) {
  const featureId = req.nextUrl.searchParams.get("featureId");
  const voterId = req.nextUrl.searchParams.get("voterId") || "";

  if (!featureId) {
    return NextResponse.json({ error: "featureId required" }, { status: 400 });
  }

  const [upCount, downCount, myVote] = await Promise.all([
    prisma.featureVote.count({ where: { featureId, direction: "up" } }),
    prisma.featureVote.count({ where: { featureId, direction: "down" } }),
    voterId
      ? prisma.featureVote.findUnique({
          where: { featureId_voterId: { featureId, voterId } },
          select: { direction: true },
        })
      : null,
  ]);

  return NextResponse.json({
    up: upCount,
    down: downCount,
    myVote: myVote?.direction || null,
  });
}

export async function POST(req: NextRequest) {
  try {
    const { featureId, direction, voterId } = await req.json();

    if (!featureId || !voterId) {
      return NextResponse.json({ error: "featureId and voterId required" }, { status: 400 });
    }

    if (direction === null || direction === "") {
      // Remove vote
      await prisma.featureVote.deleteMany({
        where: { featureId, voterId },
      });
    } else if (direction === "up" || direction === "down") {
      // Upsert vote
      await prisma.featureVote.upsert({
        where: { featureId_voterId: { featureId, voterId } },
        update: { direction },
        create: { featureId, direction, voterId },
      });
    } else {
      return NextResponse.json({ error: "direction must be 'up', 'down', or null" }, { status: 400 });
    }

    // Return updated counts
    const [upCount, downCount] = await Promise.all([
      prisma.featureVote.count({ where: { featureId, direction: "up" } }),
      prisma.featureVote.count({ where: { featureId, direction: "down" } }),
    ]);

    return NextResponse.json({ up: upCount, down: downCount, myVote: direction || null });
  } catch (error: any) {
    log.error("[demo/vote] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
