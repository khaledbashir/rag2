import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/services/proposal/server/activityLogService";
import { log } from "@/lib/logger";

/**
 * GET /api/projects/[id]/activities
 * Fetch activity log for a proposal (reverse-chronological, max 50)
 */
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    try {
        const activities = await prisma.activityLog.findMany({
            where: { proposalId: id },
            orderBy: { createdAt: "desc" },
            take: 50,
            select: {
                id: true,
                action: true,
                description: true,
                actor: true,
                createdAt: true,
            },
        });

        return NextResponse.json({ activities });
    } catch (error) {
        log.error("GET /api/projects/[id]/activities error:", error);
        return NextResponse.json(
            { error: "Failed to fetch activities" },
            { status: 500 }
        );
    }
}

/**
 * POST /api/projects/[id]/activities
 * Log an activity (e.g., from client-side after PDF export)
 */
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    try {
        const body = await req.json();
        const { action, description, actor, metadata } = body;

        if (!action || !description) {
            return NextResponse.json(
                { error: "action and description are required" },
                { status: 400 }
            );
        }

        await logActivity(id, action, description, actor, metadata);
        return NextResponse.json({ success: true });
    } catch (error) {
        log.error("POST /api/projects/[id]/activities error:", error);
        return NextResponse.json(
            { error: "Failed to log activity" },
            { status: 500 }
        );
    }
}
