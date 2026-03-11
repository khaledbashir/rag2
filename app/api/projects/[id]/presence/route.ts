import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// POST — Heartbeat: upsert presence
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, name: true, image: true },
  });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  await prisma.userPresence.upsert({
    where: { proposalId_userId: { proposalId: id, userId: user.id } },
    update: { lastSeenAt: new Date(), userName: user.name || session.user.email || "Unknown", userImage: user.image },
    create: { proposalId: id, userId: user.id, userName: user.name || session.user.email || "Unknown", userImage: user.image },
  });

  return NextResponse.json({ ok: true });
}

// GET — List active users (seen in last 90 seconds)
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cutoff = new Date(Date.now() - 90_000);

  const active = await prisma.userPresence.findMany({
    where: { proposalId: id, lastSeenAt: { gt: cutoff } },
    select: { userId: true, userName: true, userImage: true, lastSeenAt: true },
    orderBy: { lastSeenAt: "desc" },
  });

  // Cleanup stale entries older than 5 minutes
  prisma.userPresence.deleteMany({
    where: { proposalId: id, lastSeenAt: { lt: new Date(Date.now() - 300_000) } },
  }).catch(() => {});

  return NextResponse.json({ users: active });
}

// DELETE — Clear presence on unmount
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ ok: true });
  const { id } = await params;

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  });
  if (!user) return NextResponse.json({ ok: true });

  await prisma.userPresence.deleteMany({
    where: { proposalId: id, userId: user.id },
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}
