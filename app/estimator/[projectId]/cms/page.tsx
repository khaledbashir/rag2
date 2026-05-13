import { redirect, notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { FEATURES } from "@/lib/featureFlags";
import CmsBomStudio from "./CmsBomStudio";

export default async function CmsBomPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  if (!FEATURES.CMS_PRICING) notFound();

  const session = await auth();
  if (!session?.user) redirect("/");

  const { projectId } = await params;
  const project = await prisma.proposal.findUnique({
    where: { id: projectId },
    select: { id: true, clientName: true, venue: true },
  });
  if (!project) notFound();

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-baseline justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
              Control System
            </p>
            <h1 className="text-2xl font-normal serif-vault">
              {project.clientName ?? "Untitled"}
              {project.venue ? <span className="text-muted-foreground text-base ml-2">— {project.venue}</span> : null}
            </h1>
          </div>
          <a
            href={`/estimator/${projectId}`}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← Back to LED estimate
          </a>
        </div>
        <CmsBomStudio projectId={projectId} />
      </div>
    </div>
  );
}
