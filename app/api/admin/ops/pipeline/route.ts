import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isPlatformOwner } from "@/lib/platformOwner";

/**
 * GET /api/admin/ops/pipeline
 * Returns win/loss/pipeline analytics for the ops dashboard.
 * Platform owner only.
 *
 * Query params:
 *   period — "30d" | "90d" | "all" (default: "all")
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!isPlatformOwner(session?.user?.email)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const period = searchParams.get("period") || "all";

    // Date filter
    let dateFilter: Date | undefined;
    if (period === "30d") {
      dateFilter = new Date(Date.now() - 30 * 86400000);
    } else if (period === "90d") {
      dateFilter = new Date(Date.now() - 90 * 86400000);
    }

    const where = {
      deletedAt: null,
      ...(dateFilter ? { createdAt: { gte: dateFilter } } : {}),
    };

    // Fetch all proposals with their latest BidVersion for deal values
    const proposals = await prisma.proposal.findMany({
      where,
      select: {
        id: true,
        clientName: true,
        venue: true,
        status: true,
        calculationMode: true,
        createdAt: true,
        updatedAt: true,
        createdByUser: {
          select: { name: true, email: true },
        },
        versions: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { totalSellingPrice: true },
        },
        signatureAuditTrail: {
          orderBy: { signedAt: "desc" },
          take: 1,
          select: { signedAt: true },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    // Categorize proposals
    const won: typeof proposals = [];
    const lost: typeof proposals = [];
    const active: typeof proposals = [];
    const stale: typeof proposals = [];

    const sevenDaysAgo = Date.now() - 7 * 86400000;

    for (const p of proposals) {
      if (p.status === "SIGNED" || p.status === "CLOSED") {
        won.push(p);
      } else if (p.status === "CANCELLED" || p.status === "ARCHIVED") {
        lost.push(p);
      } else {
        active.push(p);
        if (p.updatedAt.getTime() < sevenDaysAgo && p.status === "DRAFT") {
          stale.push(p);
        }
      }
    }

    // Helper to get deal value
    const getValue = (p: (typeof proposals)[0]): number => {
      const v = p.versions[0]?.totalSellingPrice;
      return v ? Number(v) : 0;
    };

    // Aggregate stats
    const wonValue = won.reduce((s, p) => s + getValue(p), 0);
    const lostValue = lost.reduce((s, p) => s + getValue(p), 0);
    const activeValue = active.reduce((s, p) => s + getValue(p), 0);
    const totalDeals = won.length + lost.length;
    const winRate = totalDeals > 0 ? Math.round((won.length / totalDeals) * 100) : 0;

    // Average time to close (for won deals with signature timestamps)
    let avgDaysToClose = 0;
    const closedWithDates = won.filter((p) => p.signatureAuditTrail.length > 0);
    if (closedWithDates.length > 0) {
      const totalDays = closedWithDates.reduce((s, p) => {
        const signedAt = p.signatureAuditTrail[0]?.signedAt?.getTime() ?? p.createdAt.getTime();
        const createdAt = p.createdAt.getTime();
        return s + (signedAt - createdAt) / 86400000;
      }, 0);
      avgDaysToClose = Math.round(totalDays / closedWithDates.length);
    }

    // Per-user breakdown
    const userMap = new Map<string, { name: string; won: number; lost: number; active: number; value: number }>();
    for (const p of proposals) {
      const key = p.createdByUser?.email || "unknown";
      const name = p.createdByUser?.name || p.createdByUser?.email || "Unknown";
      if (!userMap.has(key)) {
        userMap.set(key, { name, won: 0, lost: 0, active: 0, value: 0 });
      }
      const u = userMap.get(key)!;
      if (p.status === "SIGNED" || p.status === "CLOSED") {
        u.won++;
        u.value += getValue(p);
      } else if (p.status === "CANCELLED" || p.status === "ARCHIVED") {
        u.lost++;
      } else {
        u.active++;
      }
    }

    // Build deal list for table view
    const formatDeal = (p: (typeof proposals)[0]) => ({
      id: p.id,
      clientName: p.clientName,
      venue: p.venue,
      status: p.status,
      mode: p.calculationMode,
      value: getValue(p),
      owner: p.createdByUser?.name || p.createdByUser?.email || "—",
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
      signedAt: p.signatureAuditTrail[0]?.signedAt?.toISOString() || null,
    });

    return NextResponse.json({
      summary: {
        totalDeals: proposals.length,
        wonCount: won.length,
        lostCount: lost.length,
        activeCount: active.length,
        staleCount: stale.length,
        wonValue,
        lostValue,
        activeValue,
        winRate,
        avgDaysToClose,
      },
      deals: {
        won: won.map(formatDeal),
        lost: lost.map(formatDeal),
        active: active.map(formatDeal),
      },
      users: Array.from(userMap.entries()).map(([email, data]) => ({
        email,
        ...data,
      })),
    });
  } catch (error) {
    console.error("[GET /api/admin/ops/pipeline] Error:", error);
    return NextResponse.json({ error: "Failed to fetch pipeline data" }, { status: 500 });
  }
}
