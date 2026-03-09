import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { log } from "@/lib/logger";

const SEED_DATA = [
  {
    name: "M&T Bank Stadium",
    client: "Baltimore Ravens",
    city: "Baltimore",
    state: "MD",
    photos: [
      {
        label: "Center Field Overview (Empty)",
        imageUrl: "/venues/ravens-mt-bank-center.jpg",
        sortOrder: 0,
        hotspots: [
          { zoneType: "scoreboard", label: "Main Video Board", leftPct: 18, topPct: 5, widthPct: 64, heightPct: 30 },
          { zoneType: "ribbon", label: "Upper Ribbon Board", leftPct: 10, topPct: 42, widthPct: 80, heightPct: 12 },
        ],
      },
      {
        label: "Field Level North",
        imageUrl: "/venues/ravens-mt-bank-field-level.jpg",
        sortOrder: 1,
        hotspots: [
          { zoneType: "scoreboard", label: "Main Video Board", leftPct: 22, topPct: 2, widthPct: 50, heightPct: 32 },
          { zoneType: "ribbon", label: "Ribbon Board", leftPct: 5, topPct: 38, widthPct: 90, heightPct: 15 },
        ],
      },
    ],
  },
  {
    name: "Levi's Stadium",
    client: "San Francisco 49ers",
    city: "Santa Clara",
    state: "CA",
    photos: [
      {
        label: "Upper Deck Game Day",
        imageUrl: "/venues/levis-stadium-upper-deck.jpg",
        sortOrder: 0,
        hotspots: [
          { zoneType: "scoreboard", label: "Main Scoreboard", leftPct: 32, topPct: 2, widthPct: 30, heightPct: 22 },
          { zoneType: "ribbon", label: "Ribbon Board", leftPct: 5, topPct: 28, widthPct: 90, heightPct: 8 },
          { zoneType: "fascia", label: "Upper Fascia", leftPct: 8, topPct: 22, widthPct: 55, heightPct: 5 },
        ],
      },
    ],
  },
];

export async function POST() {
  try {
    let venuesCreated = 0;
    let photosCreated = 0;
    let hotspotsCreated = 0;

    for (const venueData of SEED_DATA) {
      // Upsert venue by name+client
      let venue = await prisma.venue.findFirst({
        where: { name: venueData.name, client: venueData.client },
      });

      if (!venue) {
        venue = await prisma.venue.create({
          data: {
            name: venueData.name,
            client: venueData.client,
            city: venueData.city,
            state: venueData.state,
          },
        });
        venuesCreated++;
      }

      for (const photoData of venueData.photos) {
        // Check if photo already exists
        let photo = await prisma.venuePhoto.findFirst({
          where: { venueId: venue.id, imageUrl: photoData.imageUrl },
        });

        if (!photo) {
          photo = await prisma.venuePhoto.create({
            data: {
              venueId: venue.id,
              label: photoData.label,
              imageUrl: photoData.imageUrl,
              sortOrder: photoData.sortOrder,
            },
          });
          photosCreated++;
        }

        // Create hotspots if photo has none
        const existingHotspots = await prisma.screenHotspot.count({ where: { photoId: photo.id } });
        if (existingHotspots === 0) {
          for (const hs of photoData.hotspots) {
            await prisma.screenHotspot.create({
              data: {
                photoId: photo.id,
                zoneType: hs.zoneType,
                label: hs.label,
                leftPct: hs.leftPct,
                topPct: hs.topPct,
                widthPct: hs.widthPct,
                heightPct: hs.heightPct,
              },
            });
            hotspotsCreated++;
          }
        }
      }
    }

    return NextResponse.json({
      ok: true,
      message: `Seed complete: ${venuesCreated} venues, ${photosCreated} photos, ${hotspotsCreated} hotspots created`,
      venuesCreated,
      photosCreated,
      hotspotsCreated,
    });
  } catch (err) {
    log.error("[venue-visualizer] Seed error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
