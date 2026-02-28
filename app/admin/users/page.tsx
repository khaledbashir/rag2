import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import Unauthorized from "@/app/components/reusables/Unauthorized";
import AdminUsersClient from "./AdminUsersClient";
import type { UserRole } from "@/lib/rbac";

export default async function AdminUsersPage() {
  const session = await auth();
  const userRole = (session?.user as any)?.role as UserRole | undefined;

  // Check RBAC permission
  const allowedRoles: UserRole[] = ["ADMIN"];
  const hasAccess = userRole && allowedRoles.includes(userRole);

  if (!hasAccess) {
    return <Unauthorized allowedRoles={allowedRoles} featureName="User Management" />;
  }

  // Run all queries in parallel for speed
  const [users, proposalCounts, activityCounts, recentActivities] = await Promise.all([
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

    prisma.proposal.groupBy({
      by: ["createdByUserId"],
      _count: { id: true },
      where: { createdByUserId: { not: null } },
    }),

    prisma.$queryRaw<{ userId: string; count: bigint }[]>`
      SELECT p."createdByUserId" as "userId", COUNT(a.id)::bigint as count
      FROM "ActivityLog" a
      JOIN "Proposal" p ON a."proposalId" = p.id
      WHERE p."createdByUserId" IS NOT NULL
      GROUP BY p."createdByUserId"
    `,

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

  // Format for client component
  const formattedUsers = users.map((user) => {
    const recent = recentActivityMap.get(user.id);
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role as UserRole,
      lastLogin: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
      proposalCount: proposalCountMap.get(user.id) ?? 0,
      activityCount: activityCountMap.get(user.id) ?? 0,
      lastActivity: recent ? recent.at.toISOString() : null,
      lastAction: recent ? recent.action : null,
    };
  });

  // Platform totals
  const totals = {
    totalUsers: users.length,
    totalProposals: proposalCounts.reduce((sum, r) => sum + r._count.id, 0),
    activeThisWeek: users.filter((u) => {
      if (!u.lastLoginAt) return false;
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      return u.lastLoginAt > weekAgo;
    }).length,
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto py-10 px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-normal text-foreground serif-vault">
            User Management
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Manage user roles and permissions across the ANC Proposal Engine.
          </p>
        </div>

        {/* Admin UI */}
        <AdminUsersClient initialUsers={formattedUsers} totals={totals} />
      </div>
    </div>
  );
}
