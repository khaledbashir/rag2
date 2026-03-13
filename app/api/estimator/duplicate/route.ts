/**
 * POST /api/estimator/duplicate
 *
 * Duplicates an ESTIMATE project with all estimator data.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { log } from "@/lib/logger";
import { logActivity } from "@/services/proposal/server/activityLogService";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { projectId } = body;

        if (!projectId) {
            return NextResponse.json({ error: "projectId is required" }, { status: 400 });
        }

        const source = await prisma.proposal.findUnique({
            where: { id: projectId },
        });

        if (!source) {
            return NextResponse.json({ error: "Project not found" }, { status: 404 });
        }

        // Resolve current user for Created By tracking
        const session = await auth();
        const userId = session?.user?.email
            ? (await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } }))?.id
            : null;

        // Clone estimator answers with "(Copy)" suffix on project name
        const answers = (source.estimatorAnswers as any) || {};
        const clonedAnswers = {
            ...answers,
            projectName: `${answers.projectName || "Estimate"} (Copy)`,
        };

        const duplicate = await prisma.proposal.create({
            data: {
                clientName: source.clientName,
                calculationMode: "ESTIMATE",
                status: "DRAFT",
                workspaceId: source.workspaceId,
                ...(userId ? { createdByUserId: userId } : {}),
                estimatorAnswers: clonedAnswers,
                estimatorDisplays: source.estimatorDisplays ?? undefined,
                estimatorDepth: source.estimatorDepth,
                estimatorCellOverrides: source.estimatorCellOverrides ?? undefined,
                estimatorCustomSheets: source.estimatorCustomSheets ?? undefined,
                estimatorRateSnapshot: source.estimatorRateSnapshot ?? undefined,
            },
        });

        await logActivity(duplicate.id, "duplicated", `Duplicated from ${source.clientName}`, session?.user?.name || session?.user?.email || null, { sourceProjectId: projectId }, userId);

        return NextResponse.json({
            success: true,
            projectId: duplicate.id,
        });
    } catch (error) {
        log.error("POST /api/estimator/duplicate error:", error);
        return NextResponse.json({ error: "Duplication failed" }, { status: 500 });
    }
}
