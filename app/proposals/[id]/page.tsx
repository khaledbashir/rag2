import { prisma } from '@/lib/prisma';
import ProposalPage from '@/app/components/ProposalPage';
import { notFound } from 'next/navigation';

export default async function ProposalRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const proposal = await prisma.proposal.findUnique({ where: { id }, include: { workspace: true } });
  if (!proposal) return notFound();

  // Pass ai meta via props to client wrapper
  return (
    <div className="min-h-screen bg-background">
      {/* Client-side initializer: set localStorage with ai metadata before rendering Commander */}
      <script dangerouslySetInnerHTML={{ __html: `localStorage.setItem('aiWorkspaceSlug',${JSON.stringify(proposal.workspace?.aiWorkspaceSlug ?? '')}); localStorage.setItem('aiThreadId',${JSON.stringify(proposal.aiThreadId ?? '')}); localStorage.setItem('loadingProposalId',${JSON.stringify(proposal.id)});` }} />
      {/* Render the standard ProposalPage which will pick up the loadingProposalId as needed */}
      <ProposalPage />
    </div>
  );
}
