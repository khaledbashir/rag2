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

  // Fetch all users with their roles and last login
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      lastLoginAt: true,
    },
    orderBy: { email: "asc" },
  });

  // Format for client component
  const formattedUsers = users.map((user) => ({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role as UserRole,
    lastLogin: user.lastLoginAt
      ? user.lastLoginAt.toISOString()
      : null,
  }));

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
        <AdminUsersClient initialUsers={formattedUsers} />
      </div>
    </div>
  );
}
