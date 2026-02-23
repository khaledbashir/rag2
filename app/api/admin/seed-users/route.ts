import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

/**
 * POST /api/admin/seed-users
 * One-time seed for ANC team accounts.
 * Protected by a secret token to prevent abuse.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();

    // Simple token protection
    if (body.token !== "anc-seed-2026") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const hash = await bcrypt.hash("AncTeam2026!", 12);

    const users = [
      { email: "jbillings@anc.com", name: "Jireh Billings", role: "ADMIN" },
      { email: "jeremy.riley@anc.com", name: "Jeremy Riley", role: "ADMIN" },
      { email: "matthew.hobbs@anc.com", name: "Matthew Hobbs", role: "ADMIN" },
      { email: "eric@ctenmedia.com", name: "Eric Gruner", role: "ADMIN" },
      { email: "cdinh@anc.com", name: "Charlie Dinh", role: "VIEWER" },
    ];

    const results = [];

    for (const u of users) {
      try {
        const created = await prisma.user.create({
          data: {
            email: u.email,
            name: u.name,
            passwordHash: hash,
            role: u.role,
            authRole: u.role === "ADMIN" ? "admin" : "user",
          },
        });
        results.push({ email: created.email, name: created.name, role: created.role, status: "created" });
      } catch (err: any) {
        if (err.code === "P2002") {
          results.push({ email: u.email, status: "already_exists" });
        } else {
          results.push({ email: u.email, status: "error", message: err.message });
        }
      }
    }

    return NextResponse.json({ results });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
