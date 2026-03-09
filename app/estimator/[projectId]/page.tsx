import { redirect, notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import EstimatorStudio from "@/app/components/estimator/EstimatorStudio";
import Breadcrumbs from "@/app/components/layout/Breadcrumbs";

export default async function EstimatorProjectPage({
    params,
}: {
    params: Promise<{ projectId: string }>;
}) {
    const session = await auth();
    if (!session?.user) {
        redirect("/");
    }

    const { projectId } = await params;

    const project = await prisma.proposal.findUnique({
        where: { id: projectId },
        select: {
            id: true,
            calculationMode: true,
            clientName: true,
            estimatorAnswers: true,
            estimatorDisplays: true,
            estimatorDepth: true,
            estimatorCellOverrides: true,
            estimatorCustomSheets: true,
            estimatorRateSnapshot: true,
        },
    });

    if (!project) {
        notFound();
    }

    if (project.calculationMode !== "ESTIMATE") {
        // Not an estimator project — redirect to standard editor
        redirect(`/projects/${projectId}`);
    }

    return (
        <div className="min-h-screen bg-background">
            <div className="px-4 sm:px-6 pt-3 pb-1">
                <Breadcrumbs items={[
                    { label: "Estimates", href: "/estimator" },
                    { label: project.clientName || "Untitled Estimate" },
                ]} />
            </div>
            <EstimatorStudio
                projectId={project.id}
                initialAnswers={project.estimatorAnswers as any}
                initialCellOverrides={project.estimatorCellOverrides as any}
                initialCustomSheets={project.estimatorCustomSheets as any}
            />
        </div>
    );
}
