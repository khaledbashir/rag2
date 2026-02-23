import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { UserRole } from "@/lib/rbac";
import bcrypt from "bcryptjs";

/**
 * PATCH /api/admin/users/[id]
 * Update user profile: role, name, email, password
 * ADMIN only
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    const userRole = (session?.user as any)?.role as UserRole | undefined;
    const currentUserId = (session?.user as any)?.id;

    if (userRole !== "ADMIN") {
      return NextResponse.json(
        { error: "Forbidden", message: "Only admins can update users" },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await req.json();
    const { role, name, email, password } = body as {
      role?: UserRole;
      name?: string;
      email?: string;
      password?: string;
    };

    const validRoles: UserRole[] = [
      "ADMIN", "ESTIMATOR", "PRODUCT_EXPERT",
      "PROPOSAL_LEAD", "FINANCE", "VIEWER", "OUTSIDER",
    ];

    // Build update payload — only include fields that were sent
    const data: Record<string, any> = {};

    if (role !== undefined) {
      if (!validRoles.includes(role)) {
        return NextResponse.json(
          { error: "Invalid role", message: `Role must be one of: ${validRoles.join(", ")}` },
          { status: 400 }
        );
      }

      // Prevent demoting last admin
      if (id === currentUserId && role !== "ADMIN") {
        const adminCount = await prisma.user.count({ where: { role: "ADMIN" } });
        if (adminCount <= 1) {
          return NextResponse.json(
            { error: "Cannot demote last admin", message: "Promote another user to admin first." },
            { status: 400 }
          );
        }
      }

      data.role = role;
      data.authRole = role === "ADMIN" ? "admin" : "user";
    }

    if (name !== undefined) {
      data.name = name.trim() || null;
    }

    if (email !== undefined) {
      const normalizedEmail = email.trim().toLowerCase();
      if (!normalizedEmail.includes("@")) {
        return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
      }
      // Check uniqueness (exclude current user)
      const existing = await prisma.user.findFirst({
        where: { email: normalizedEmail, id: { not: id } },
      });
      if (existing) {
        return NextResponse.json({ error: "A user with this email already exists" }, { status: 409 });
      }
      data.email = normalizedEmail;
    }

    if (password !== undefined) {
      if (password.length < 6) {
        return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
      }
      data.passwordHash = await bcrypt.hash(password, 12);
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const updatedUser = await prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
      },
    });

    return NextResponse.json({ user: updatedUser });
  } catch (error: any) {
    const { id } = await params;
    console.error(`[PATCH /api/admin/users/${id}] Error:`, error);

    if (error.code === "P2025") {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({ error: "Failed to update user" }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/users/[id]
 * Delete a user account
 * ADMIN only — cannot delete yourself
 */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    const userRole = (session?.user as any)?.role as UserRole | undefined;
    const currentUserId = (session?.user as any)?.id;

    if (userRole !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;

    if (id === currentUserId) {
      return NextResponse.json(
        { error: "Cannot delete yourself", message: "You cannot delete your own account." },
        { status: 400 }
      );
    }

    // Delete sessions first (FK constraint), then user
    await prisma.session.deleteMany({ where: { userId: id } });
    await prisma.account.deleteMany({ where: { userId: id } });
    await prisma.user.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    const { id } = await params;
    console.error(`[DELETE /api/admin/users/${id}] Error:`, error);

    if (error.code === "P2025") {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({ error: "Failed to delete user" }, { status: 500 });
  }
}
