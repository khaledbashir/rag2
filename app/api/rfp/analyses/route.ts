/**
 * GET /api/rfp/analyses — List all RFP analyses (history)
 *
 * Returns paginated, searchable list of past analyses.
 * Query params: ?search=buffalo&limit=20&offset=0
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const search = url.searchParams.get("search") || "";
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "20"), 100);
  const offset = parseInt(url.searchParams.get("offset") || "0");

  const where = search
    ? {
        OR: [
          { projectName: { contains: search, mode: "insensitive" as const } },
          { clientName: { contains: search, mode: "insensitive" as const } },
          { venue: { contains: search, mode: "insensitive" as const } },
          { filename: { contains: search, mode: "insensitive" as const } },
        ],
      }
    : {};

  const [analyses, total] = await Promise.all([
    prisma.rfpAnalysis.findMany({
      where,
      select: {
        id: true,
        projectName: true,
        clientName: true,
        venue: true,
        location: true,
        filename: true,
        fileSize: true,
        pageCount: true,
        relevantPages: true,
        specsFound: true,
        processingTimeMs: true,
        status: true,
        createdBy: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.rfpAnalysis.count({ where }),
  ]);

  return NextResponse.json({ analyses, total, limit, offset });
}
