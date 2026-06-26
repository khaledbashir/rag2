import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { log } from "@/lib/logger";
import { parseEmailToQuoteIntake } from "@/services/intake/emailToQuoteIntake";
import { reviewEmailToQuoteWithAi } from "@/services/intake/emailToQuoteAiReview";
import { logActivity } from "@/services/proposal/server/activityLogService";

export const dynamic = "force-dynamic";

interface EmailToQuoteRequest {
    subject?: string;
    body?: string;
    createDraft?: boolean;
    useAiReview?: boolean;
    workspaceId?: string;
}

export async function POST(request: NextRequest) {
    try {
        const body = (await request.json()) as EmailToQuoteRequest;
        if (!body.body || typeof body.body !== "string") {
            return NextResponse.json({ error: "Email body is required" }, { status: 400 });
        }

        const intake = parseEmailToQuoteIntake({
            subject: body.subject,
            body: body.body,
            source: "email",
        });

        if (body.useAiReview !== false) {
            intake.aiReview = await reviewEmailToQuoteWithAi({
                subject: body.subject,
                body: body.body,
                intake,
            });
        }

        if (!body.createDraft) {
            return NextResponse.json({ ok: true, intake });
        }

        const session = await auth();
        if (!session?.user?.email) {
            return NextResponse.json({ error: "Authentication required to create a draft" }, { status: 401 });
        }

        const user = await prisma.user.findUnique({
            where: { email: session.user.email },
            select: { id: true },
        });

        const workspace = body.workspaceId
            ? await prisma.workspace.findUnique({ where: { id: body.workspaceId } })
            : await prisma.workspace.create({
                data: {
                    name: intake.title,
                    users: {
                        connectOrCreate: {
                            where: { email: session.user.email },
                            create: { email: session.user.email, name: session.user.name || null },
                        },
                    },
                },
            });

        if (!workspace) {
            return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
        }

        const project = await prisma.proposal.create({
            data: {
                workspaceId: workspace.id,
                clientName: intake.title,
                venue: intake.venueName || intake.estimatorAnswers.location || null,
                calculationMode: "ESTIMATE",
                documentMode: "BUDGET",
                status: "DRAFT",
                estimatorDepth: "rom",
                estimatorAnswers: intake.estimatorAnswers as any,
                estimatorDisplays: intake.estimatorAnswers.displays as any,
                additionalNotes: [
                    intake.summary,
                    intake.aiReview?.summary ? `AI review: ${intake.aiReview.summary}` : "",
                    intake.aiReview?.questions.length ? `AI review questions:\n${intake.aiReview.questions.map((question) => `- ${question.question}`).join("\n")}` : "",
                    "",
                    "Inbound email intake:",
                    body.body.trim(),
                ].filter(Boolean).join("\n"),
                internalAudit: JSON.stringify({
                    source: "email-to-quote-intake",
                    requester: {
                        name: intake.requesterName,
                        title: intake.requesterTitle,
                        phone: intake.requesterPhone,
                        address: intake.requesterAddress,
                    },
                    requestedBreakdown: intake.requestedBreakdown,
                    missingAssumptions: intake.missingAssumptions,
                    projects: intake.projects,
                    aiReview: intake.aiReview,
                }),
                ...(user ? { createdByUserId: user.id } : {}),
            },
        });

        await logActivity(
            project.id,
            "created",
            "Email-to-quote intake draft created",
            session.user.name || session.user.email,
            {
                source: "email-to-quote-intake",
                projectCount: intake.projects.length,
                displayCount: intake.estimatorAnswers.displays.length,
            },
            user?.id,
        );

        return NextResponse.json({
            ok: true,
            intake,
            project: {
                id: project.id,
                workspaceId: workspace.id,
                url: `/estimator/${project.id}`,
            },
        }, { status: 201 });
    } catch (error) {
        log.error("[email-to-quote intake] failed:", error);
        return NextResponse.json(
            { error: "Failed to process email intake", details: error instanceof Error ? error.message : String(error) },
            { status: 500 },
        );
    }
}
