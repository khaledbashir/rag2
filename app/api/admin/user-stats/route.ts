import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { UserRole } from "@/lib/rbac";

/**
 * GET /api/admin/user-stats
 * Returns per-user proposal + activity stats for the admin dashboard.
 * ADMIN only.
 */
export async function GET() {
  try {
    const session = await auth();
    const userRole = (session?.user as any)?.role as UserRole | undefined;
    if (userRole !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Run all queries in parallel
    const [users, proposalCounts, activityCounts, recentActivities, statusBreakdown] =
      await Promise.all([
        // All users
        prisma.user.findMany({
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            lastLoginAt: true,
          },
          orderBy: { email: "asc" },
        }),

        // Proposal count per user
        prisma.proposal.groupBy({
          by: ["createdByUserId"],
          _count: { id: true },
          where: { createdByUserId: { not: null } },
        }),

        // Activity count per user (via their proposals)
        prisma.$queryRaw<{ userId: string; count: bigint }[]>`
          SELECT p."createdByUserId" as "userId", COUNT(a.id)::bigint as count
          FROM "ActivityLog" a
          JOIN "Proposal" p ON a."proposalId" = p.id
          WHERE p."createdByUserId" IS NOT NULL
          GROUP BY p."createdByUserId"
        `,

        // Most recent activity per user
        prisma.$queryRaw<{ userId: string; lastActivity: Date; lastAction: string }[]>`
          SELECT DISTINCT ON (p."createdByUserId")
            p."createdByUserId" as "userId",
            a."createdAt" as "lastActivity",
            a.action as "lastAction"
          FROM "ActivityLog" a
          JOIN "Proposal" p ON a."proposalId" = p.id
          WHERE p."createdByUserId" IS NOT NULL
          ORDER BY p."createdByUserId", a."createdAt" DESC
        `,

        // Proposal status breakdown per user
        prisma.proposal.groupBy({
          by: ["createdByUserId", "status"],
          _count: { id: true },
          where: { createdByUserId: { not: null } },
        }),
      ]);

    // Build lookup maps
    const proposalCountMap = new Map(
      proposalCounts.map((r) => [r.createdByUserId, r._count.id])
    );
    const activityCountMap = new Map(
      activityCounts.map((r) => [r.userId, Number(r.count)])
    );
    const recentActivityMap = new Map(
      recentActivities.map((r) => [r.userId, { at: r.lastActivity, action: r.lastAction }])
    );

    // Build status breakdown map: userId → { DRAFT: 2, APPROVED: 1, ... }
    const statusMap = new Map<string, Record<string, number>>();
    for (const row of statusBreakdown) {
      const uid = row.createdByUserId;
      if (!uid) continue;
      if (!statusMap.has(uid)) statusMap.set(uid, {});
      statusMap.get(uid)![row.status] = row._count.id;
    }

    // Merge into user objects
    const userStats = users.map((user) => {
      const recent = recentActivityMap.get(user.id);
      return {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        lastLogin: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
        proposalCount: proposalCountMap.get(user.id) ?? 0,
        activityCount: activityCountMap.get(user.id) ?? 0,
        lastActivity: recent ? recent.at : null,
        lastAction: recent ? recent.action : null,
        statusBreakdown: statusMap.get(user.id) ?? {},
      };
    });

    // Platform-wide totals
    const totals = {
      totalUsers: users.length,
      totalProposals: proposalCounts.reduce((sum, r) => sum + r._count.id, 0),
      totalActivities: activityCounts.reduce((sum, r) => sum + Number(r.count), 0),
      activeThisWeek: users.filter((u) => {
        if (!u.lastLoginAt) return false;
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        return u.lastLoginAt > weekAgo;
      }).length,
    };

    return NextResponse.json({ users: userStats, totals });
  } catch (error) {
    console.error("[GET /api/admin/user-stats] Error:", error);
    return NextResponse.json({ error: "Failed to fetch user stats" }, { status: 500 });
  }
}
