import { redirect } from "next/navigation";
import ProposalPage from "@/app/components/ProposalPage";
import { prisma } from "@/lib/prisma";
import { mapDbProposalToFormSchema } from "@/lib/proposals/mapDbProposalToForm";

interface PageProps {
    params: Promise<{ id: string }>;
}

export default async function ProjectEditorPage({ params }: PageProps) {
    const { id } = await params;

    const project = await prisma.proposal.findUnique({
        where: { id },
        include: {
            screens: {
                include: { lineItems: true }
            }
        }
    });



    if (!project) {
        redirect("/projects");
    }

    // Map DB schema to Form schema
    const formData = mapDbProposalToFormSchema(project);

    return (
        <ProposalPage
            initialData={formData}
            projectId={id}
            twentyOpportunityId={project.twentyOpportunityId ?? undefined}
        />
    );
}
