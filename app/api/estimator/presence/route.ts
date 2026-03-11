import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET — All active presence across estimates (for list page)
export async function GET() {
  const cutoff = new Date(Date.now() - 90_000);

  const active = await prisma.userPresence.findMany({
    where: {
      lastSeenAt: { gt: cutoff },
      proposal: { calculationMode: "ESTIMATE" },
    },
    select: {
      proposalId: true,
      userName: true,
      userImage: true,
      lastSeenAt: true,
    },
  });

  // Group by proposalId
  const byProject: Record<string, Array<{ userName: string; userImage: string | null }>> = {};
  for (const p of active) {
    if (!byProject[p.proposalId]) byProject[p.proposalId] = [];
    byProject[p.proposalId].push({ userName: p.userName, userImage: p.userImage });
  }

  return NextResponse.json(byProject);
}
