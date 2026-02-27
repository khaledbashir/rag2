import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { UserRole } from "@/lib/rbac";
import bcrypt from "bcryptjs";

/**
 * GET /api/admin/users
 * Fetch all users with their roles
 * ADMIN only
 */
export async function GET() {
  try {
    const session = await auth();
    const userRole = (session?.user as any)?.role as UserRole | undefined;

    // Only ADMIN can list users
    if (userRole !== "ADMIN") {
      return NextResponse.json(
        { error: "Forbidden", message: "Only admins can list users" },
        { status: 403 }
      );
    }

    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        authRole: true,
        emailVerified: true,
        lastLoginAt: true,
      },
      orderBy: { email: "asc" },
    });

    // Format response with last login
    const formattedUsers = users.map((user) => ({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      authRole: user.authRole,
      emailVerified: user.emailVerified,
      lastLogin: user.lastLoginAt
        ? new Date(user.lastLoginAt).toISOString()
        : null,
    }));

    return NextResponse.json({ users: formattedUsers });
  } catch (error) {
    console.error("[GET /api/admin/users] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch users" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/users
 * Create a new user (credentials-based)
 * ADMIN only
 */
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    const userRole = (session?.user as any)?.role as UserRole | undefined;

    if (userRole !== "ADMIN") {
      return NextResponse.json(
        { error: "Forbidden", message: "Only admins can create users" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { email, name, password, role } = body;

    if (!email || typeof email !== "string" || !email.includes("@")) {
      return NextResponse.json(
        { error: "Valid email is required" },
        { status: 400 }
      );
    }

    if (!password || typeof password !== "string" || password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters" },
        { status: 400 }
      );
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Check if user already exists
    const existing = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existing) {
      return NextResponse.json(
        { error: "A user with this email already exists" },
        { status: 409 }
      );
    }

    const validRoles: UserRole[] = [
      "ADMIN", "ESTIMATOR", "PRODUCT_EXPERT",
      "PROPOSAL_LEAD", "FINANCE", "VIEWER", "OUTSIDER",
    ];
    const assignedRole: UserRole = validRoles.includes(role) ? role : "VIEWER";

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        name: name?.trim() || null,
        passwordHash,
        role: assignedRole,
        authRole: assignedRole === "ADMIN" ? "admin" : "user",
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
      },
    });

    console.log(`[POST /api/admin/users] Created user: ${user.email} (${user.role})`);

    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/admin/users] Error:", error);
    return NextResponse.json(
      { error: "Failed to create user" },
      { status: 500 }
    );
  }
}
