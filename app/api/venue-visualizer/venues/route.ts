import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { log } from "@/lib/logger";

// GET /api/venue-visualizer/venues — list all venues with photo counts
export async function GET() {
  try {
    const venues = await prisma.venue.findMany({
      include: {
        photos: {
          where: { isActive: true },
          orderBy: { sortOrder: "asc" },
          include: {
            hotspots: { orderBy: { sortOrder: "asc" } },
          },
        },
        _count: { select: { photos: true } },
      },
      orderBy: { name: "asc" },
    });
    return NextResponse.json({ venues });
  } catch (err) {
    log.error("[venue-visualizer] GET venues error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// POST /api/venue-visualizer/venues — create a venue
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, client, city, state } = body;
    if (!name || !client || !city || !state) {
      return NextResponse.json({ error: "name, client, city, state required" }, { status: 400 });
    }
    const venue = await prisma.venue.create({
      data: { name, client, city, state },
    });
    return NextResponse.json({ venue });
  } catch (err) {
    log.error("[venue-visualizer] POST venue error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
