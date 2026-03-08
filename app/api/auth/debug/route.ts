import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { auth } from "@/auth";
import { isPlatformOwner } from "@/lib/platformOwner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/auth/debug
 * Diagnostic endpoint — tests user lookup and password verification.
 * ADMIN ONLY — requires platform owner authentication.
 *
 * Body: { email: string, password: string }
 */
export async function POST(req: NextRequest) {
  try {
    // Auth gate: platform owner only
    const session = await auth();
    if (!isPlatformOwner(session?.user?.email)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

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
      steps.push(`User NOT FOUND for "${normalizedEmail}"`);
      return NextResponse.json({ error: "User not found", steps });
    }

    steps.push(`User found: ${user.email} (role: ${user.role}, name: ${user.name || "none"})`);
    steps.push(`Last login: ${user.lastLoginAt?.toISOString() || "never"}`);
    steps.push(`Has passwordHash: ${!!user.passwordHash}`);

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
        return NextResponse.json({ error: "Password does not match", steps });
      }
    } catch (bcryptErr: any) {
      steps.push(`bcrypt EXCEPTION: ${bcryptErr.message}`);
      return NextResponse.json({ error: "bcrypt comparison failed", steps });
    }

    steps.push("ALL CHECKS PASSED — login should work");

    return NextResponse.json({ success: true, steps });
  } catch (err: any) {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * GET /api/auth/debug
 * Quick diagnostic — DB status and user count.
 * ADMIN ONLY — requires platform owner authentication.
 */
export async function GET() {
  try {
    const session = await auth();
    if (!isPlatformOwner(session?.user?.email)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.$queryRaw`SELECT 1`;
    const userCount = await prisma.user.count();

    return NextResponse.json({
      database: "connected",
      userCount,
      authSecret: process.env.AUTH_SECRET ? "set" : "MISSING",
    });
  } catch (err: any) {
    return NextResponse.json({ database: "FAILED", error: err.message }, { status: 500 });
  }
}
