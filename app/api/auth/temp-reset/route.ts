import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// TEMPORARY — remove immediately after use
export async function POST(req: NextRequest) {
  const { email, password, key } = await req.json();
  if (key !== "anc-temp-reset-2026") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const hash = await bcrypt.hash(password, 12);
  const user = await prisma.user.update({
    where: { email },
    data: { passwordHash: hash },
  });
  return NextResponse.json({ ok: true, email: user.email });
}
