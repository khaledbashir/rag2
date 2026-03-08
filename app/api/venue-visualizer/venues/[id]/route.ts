import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/venue-visualizer/venues/[id] — venue detail with photos + hotspots
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const venue = await prisma.venue.findUnique({
      where: { id },
      include: {
        photos: {
          where: { isActive: true },
          orderBy: { sortOrder: "asc" },
          include: {
            hotspots: { orderBy: { sortOrder: "asc" } },
          },
        },
      },
    });
    if (!venue) return NextResponse.json({ error: "Venue not found" }, { status: 404 });
    return NextResponse.json({ venue });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// DELETE /api/venue-visualizer/venues/[id]
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await prisma.venue.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
