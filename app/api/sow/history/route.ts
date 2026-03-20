/**
 * GET /api/sow/history — List all SOW generations (history)
 *
 * Returns paginated, searchable list of past SOW generations.
 * Query params: ?search=pacers&limit=20&offset=0
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
          { fileName: { contains: search, mode: "insensitive" as const } },
        ],
      }
    : {};

  const [records, total] = await Promise.all([
    prisma.sOWHistory.findMany({
      where,
      select: {
        id: true,
        projectName: true,
        clientName: true,
        venue: true,
        displayCount: true,
        hasUnionLabor: true,
        hasNightWork: true,
        fileName: true,
        createdBy: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.sOWHistory.count({ where }),
  ]);

  return NextResponse.json({ records, total, limit, offset });
}
