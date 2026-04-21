import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/services/proposal/server/activityLogService";
import { getDefaultAnswers } from "@/app/components/estimator/questions";

/**
 * /estimator/new — Auto-creates a new ESTIMATE project and redirects.
 * Every estimate gets saved from the start.
 */
export default async function NewEstimatePage() {
    const session = await auth();
    if (!session?.user) {
        redirect("/");
    }

    // Create workspace + estimate project
    const workspace = await prisma.workspace.create({
        data: {
            name: "Estimate",
            users: {
                connectOrCreate: {
                    where: { email: session.user.email || "noreply@anc.com" },
                    create: { email: session.user.email || "noreply@anc.com" },
                },
            },
        },
    });

    // Resolve user ID for Created By tracking
    const user = await prisma.user.findUnique({
        where: { email: session.user.email || "noreply@anc.com" },
        select: { id: true },
    });

    const project = await prisma.proposal.create({
        data: {
            workspaceId: workspace.id,
            clientName: "New Estimate",
            calculationMode: "ESTIMATE",
            status: "DRAFT",
            estimatorAnswers: getDefaultAnswers(),
            ...(user ? { createdByUserId: user.id } : {}),
        },
    });

    await logActivity(project.id, "created", "Estimate created", session.user.name || session.user.email, null, user?.id);

    redirect(`/estimator/${project.id}`);
}
