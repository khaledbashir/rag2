import { prisma } from '@/lib/prisma';
import ProposalPage from '@/app/components/ProposalPage';
import Breadcrumbs from '@/app/components/layout/Breadcrumbs';
import { notFound } from 'next/navigation';

export default async function ProposalRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const proposal = await prisma.proposal.findUnique({ where: { id }, include: { workspace: true } });
  if (!proposal) return notFound();

  const projectName = proposal.clientName || 'Untitled Project';

  return (
    <div className="min-h-screen bg-background">
      <div className="px-4 sm:px-6 pt-3 pb-1">
        <Breadcrumbs items={[
          { label: 'Projects', href: '/projects' },
          { label: projectName },
        ]} />
      </div>
      <script dangerouslySetInnerHTML={{ __html: `localStorage.setItem('aiWorkspaceSlug',${JSON.stringify(proposal.workspace?.aiWorkspaceSlug ?? '')}); localStorage.setItem('aiThreadId',${JSON.stringify(proposal.aiThreadId ?? '')}); localStorage.setItem('loadingProposalId',${JSON.stringify(proposal.id)});` }} />
      <ProposalPage />
    </div>
  );
}
