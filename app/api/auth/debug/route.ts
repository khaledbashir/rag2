import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/auth/debug
 * Diagnostic endpoint — tests user lookup and password verification.
 * Returns detailed failure reason without exposing password hashes.
 * 
 * Body: { email: string, password: string }
 * 
 * REMOVE OR PROTECT THIS ENDPOINT AFTER DEBUGGING.
 */
export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();
    const steps: string[] = [];

    if (!email || !password) {
      return NextResponse.json({ error: "Send { email, password }", steps });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    steps.push(`Email normalized: "${normalizedEmail}"`);

    // Step 1: DB connection
    try {
      await prisma.$queryRaw`SELECT 1`;
      steps.push("Database: connected");
    } catch (dbErr: any) {
      steps.push(`Database: FAILED — ${dbErr.message}`);
      return NextResponse.json({ error: "Database connection failed", steps });
    }

    // Step 2: User lookup
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        passwordHash: true,
        lastLoginAt: true,
      },
    });

    if (!user) {
      const allUsers = await prisma.user.findMany({
        select: { email: true, role: true },
        orderBy: { email: "asc" },
      });
      steps.push(`User NOT FOUND for "${normalizedEmail}"`);
      steps.push(`Existing users: ${allUsers.map(u => u.email).join(", ") || "(none)"}`);
      return NextResponse.json({ error: "User not found", steps });
    }

    steps.push(`User found: ${user.email} (role: ${user.role}, name: ${user.name || "none"})`);
    steps.push(`Last login: ${user.lastLoginAt?.toISOString() || "never"}`);
    steps.push(`Has passwordHash: ${!!user.passwordHash} (length: ${user.passwordHash?.length || 0})`);

    if (!user.passwordHash) {
      steps.push("FAIL: No passwordHash stored — this user was created without a password (OAuth only?)");
      return NextResponse.json({ error: "No password set for this user", steps });
    }

    // Step 3: Password comparison
    const passwordStr = String(password);
    steps.push(`Password provided: ${passwordStr.length} characters`);

    try {
      const match = await bcrypt.compare(passwordStr, user.passwordHash);
      steps.push(`bcrypt.compare result: ${match}`);

      if (!match) {
        // Test if the hash is valid bcrypt format
        const isValidHash = /^\$2[aby]?\$\d{1,2}\$.{53}$/.test(user.passwordHash);
        steps.push(`Hash format valid: ${isValidHash}`);
        steps.push(`Hash prefix: ${user.passwordHash.slice(0, 7)}...`);
        return NextResponse.json({ error: "Password does not match", steps });
      }
    } catch (bcryptErr: any) {
      steps.push(`bcrypt EXCEPTION: ${bcryptErr.message}`);
      return NextResponse.json({ error: "bcrypt comparison failed", steps });
    }

    steps.push("ALL CHECKS PASSED — login should work");

    return NextResponse.json({ success: true, steps });
  } catch (err: any) {
    return NextResponse.json({ error: err.message, stack: err.stack?.split("\n").slice(0, 5) }, { status: 500 });
  }
}

/**
 * GET /api/auth/debug
 * Quick diagnostic — lists users (no passwords) and DB status.
 */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        authRole: true,
        lastLoginAt: true,
        passwordHash: false,
      },
      orderBy: { email: "asc" },
    });

    return NextResponse.json({
      database: "connected",
      userCount: users.length,
      users: users.map(u => ({
        email: u.email,
        name: u.name,
        role: u.role,
        authRole: u.authRole,
        lastLogin: u.lastLoginAt?.toISOString() || "never",
      })),
      authSecret: process.env.AUTH_SECRET ? `set (${process.env.AUTH_SECRET.length} chars)` : "MISSING",
    });
  } catch (err: any) {
    return NextResponse.json({ database: "FAILED", error: err.message }, { status: 500 });
  }
}
