import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// PUT /api/venue-visualizer/hotspots/[id] — update a hotspot
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { zoneType, label, leftPct, topPct, widthPct, heightPct, cssTransform, sortOrder } = body;
    const hotspot = await prisma.screenHotspot.update({
      where: { id },
      data: {
        ...(zoneType !== undefined && { zoneType }),
        ...(label !== undefined && { label }),
        ...(leftPct !== undefined && { leftPct }),
        ...(topPct !== undefined && { topPct }),
        ...(widthPct !== undefined && { widthPct }),
        ...(heightPct !== undefined && { heightPct }),
        ...(cssTransform !== undefined && { cssTransform }),
        ...(sortOrder !== undefined && { sortOrder }),
      },
    });
    return NextResponse.json({ hotspot });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// DELETE /api/venue-visualizer/hotspots/[id]
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await prisma.screenHotspot.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
