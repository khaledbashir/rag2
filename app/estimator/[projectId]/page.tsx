import { redirect, notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import EstimatorStudio from "@/app/components/estimator/EstimatorStudio";
import Breadcrumbs from "@/app/components/layout/Breadcrumbs";
import CmsSummaryBanner from "@/app/components/estimator/CmsSummaryBanner";

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
            documentConfig: true,
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

    const estimateLabel = (
        (project.estimatorAnswers as { projectName?: string } | null)?.projectName
        || project.clientName
        || "Untitled Estimate"
    ).trim();

    // Hydrate the proposal-level currency + exchange rate onto the estimator
    // answers so the cost sheet, margin analysis, and Excel export scale the
    // same way the proposal PDF does. The proposal wizard is the source of
    // truth — `documentConfig.exchangeRate` is set on Step4Export.
    const documentConfig = (project.documentConfig || {}) as { currency?: string; exchangeRate?: number };
    const storedAnswers = (project.estimatorAnswers || {}) as Record<string, any>;
    const initialAnswers = {
        ...storedAnswers,
        currency: documentConfig.currency ?? storedAnswers.currency ?? "USD",
        exchangeRate: typeof documentConfig.exchangeRate === "number" && documentConfig.exchangeRate > 0
            ? documentConfig.exchangeRate
            : storedAnswers.exchangeRate,
    };

    return (
        <div className="min-h-screen bg-background">
            <div className="px-4 sm:px-6 pt-3 pb-1">
                <Breadcrumbs items={[
                    { label: "Estimates", href: "/estimator" },
                    { label: estimateLabel },
                ]} />
            </div>
            <CmsSummaryBanner projectId={project.id} />
            <EstimatorStudio
                projectId={project.id}
                initialAnswers={initialAnswers as any}
                initialCellOverrides={project.estimatorCellOverrides as any}
                initialCustomSheets={project.estimatorCustomSheets as any}
            />
        </div>
    );
}
