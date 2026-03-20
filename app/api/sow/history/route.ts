/**
 * GET  /api/sow/history — List all SOW generations (history)
 * POST /api/sow/history — Save a SOW draft (without generating DOCX)
 * PATCH /api/sow/history — Update an existing SOW draft
 *
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
        status: true,
        createdBy: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.sOWHistory.count({ where }),
  ]);

  return NextResponse.json({ records, total, limit, offset });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.projectName) {
      return NextResponse.json({ error: "projectName is required" }, { status: 400 });
    }

    const record = await prisma.sOWHistory.create({
      data: {
        projectName: body.projectName,
        clientName: body.clientName || "",
        venue: body.venue || "",
        generationInput: body.formState || {},
        displayCount: body.displayCount || 0,
        hasUnionLabor: body.hasUnionLabor || false,
        hasNightWork: body.hasNightWork || false,
        fileName: "",
        status: "draft",
      },
    });

    return NextResponse.json({ id: record.id, ok: true });
  } catch (error) {
    console.error("[sow/history] POST error:", error);
    return NextResponse.json({ error: "Failed to save SOW draft" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    await prisma.sOWHistory.update({
      where: { id: body.id },
      data: {
        projectName: body.projectName,
        clientName: body.clientName || "",
        venue: body.venue || "",
        generationInput: body.formState || {},
        displayCount: body.displayCount || 0,
        hasUnionLabor: body.hasUnionLabor || false,
        hasNightWork: body.hasNightWork || false,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[sow/history] PATCH error:", error);
    return NextResponse.json({ error: "Failed to update SOW" }, { status: 500 });
  }
}
