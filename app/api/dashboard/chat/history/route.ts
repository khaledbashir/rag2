import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/dashboard/chat/history
 * Load the current user's most recent dashboard chat session.
 */
export async function GET() {
  try {
    const session = await auth();
    const userId = (session?.user as any)?.id;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const chat = await prisma.dashboardChatSession.findFirst({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      select: { id: true, messages: true, title: true, updatedAt: true },
    });

    return NextResponse.json({ chat: chat || null });
  } catch (err: any) {
    console.error("[Dashboard Chat History] GET error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * PATCH /api/dashboard/chat/history
 * Persist the current dashboard chat messages.
 * Creates a new session if none exists, otherwise upserts the latest.
 */
export async function PATCH(req: NextRequest) {
  try {
    const session = await auth();
    const userId = (session?.user as any)?.id;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { messages, title, sessionId } = await req.json();
    if (!Array.isArray(messages)) {
      return NextResponse.json({ error: "messages must be an array" }, { status: 400 });
    }

    const truncated = messages.slice(-100);

    let chat;
    if (sessionId) {
      chat = await prisma.dashboardChatSession.update({
        where: { id: sessionId },
        data: { messages: truncated, title: title || undefined },
        select: { id: true, updatedAt: true },
      });
    } else {
      const existing = await prisma.dashboardChatSession.findFirst({
        where: { userId },
        orderBy: { updatedAt: "desc" },
        select: { id: true },
      });

      if (existing) {
        chat = await prisma.dashboardChatSession.update({
          where: { id: existing.id },
          data: { messages: truncated, title: title || undefined },
          select: { id: true, updatedAt: true },
        });
      } else {
        chat = await prisma.dashboardChatSession.create({
          data: { userId, messages: truncated, title: title || undefined },
          select: { id: true, updatedAt: true },
        });
      }
    }

    return NextResponse.json({ success: true, sessionId: chat.id });
  } catch (err: any) {
    console.error("[Dashboard Chat History] PATCH error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
