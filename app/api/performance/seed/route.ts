import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { log } from "@/lib/logger";

/**
 * POST /api/performance/seed
 * Seeds demo data for Proof of Performance feature.
 * Creates venues, screens, sponsors, and ~4,000+ play logs.
 */

const VENUES = [
  {
    name: "Gainbridge Fieldhouse",
    client: "Indiana Pacers",
    city: "Indianapolis",
    state: "IN",
    address: "125 S Pennsylvania St, Indianapolis, IN 46204",
    timezone: "America/Indiana/Indianapolis",
  },
  {
    name: "Crypto.com Arena",
    client: "AEG / LA Kings",
    city: "Los Angeles",
    state: "CA",
    address: "1111 S Figueroa St, Los Angeles, CA 90015",
    timezone: "America/Los_Angeles",
  },
];

const SCREENS_GAINBRIDGE = [
  { name: "Center Hung Main", location: "Center Court — Main Scoreboard", manufacturer: "Yaham", modelNumber: "HVO-C4", pixelPitch: 4.0, widthFt: 25, heightFt: 14 },
  { name: "Ribbon Board East", location: "Upper Bowl East Fascia", manufacturer: "Yaham", modelNumber: "HVO-C6", pixelPitch: 6.0, widthFt: 300, heightFt: 2 },
  { name: "Ribbon Board West", location: "Upper Bowl West Fascia", manufacturer: "Yaham", modelNumber: "HVO-C6", pixelPitch: 6.0, widthFt: 300, heightFt: 2 },
  { name: "Concourse NE Video Wall", location: "NE Concourse Entry", manufacturer: "LG", modelNumber: "GSQA039N", pixelPitch: 3.9, widthFt: 12, heightFt: 7 },
  { name: "Concourse SW Video Wall", location: "SW Concourse Entry", manufacturer: "LG", modelNumber: "GSQA039N", pixelPitch: 3.9, widthFt: 12, heightFt: 7 },
  { name: "Lobby Marquee", location: "Main Entrance Lobby", manufacturer: "Yaham", modelNumber: "HVO-C2.5", pixelPitch: 2.5, widthFt: 16, heightFt: 9 },
];

const SCREENS_CRYPTO = [
  { name: "Center Hung Main", location: "Center Ice — Main Scoreboard", manufacturer: "LG", modelNumber: "GSCA025N", pixelPitch: 2.5, widthFt: 38, heightFt: 18 },
  { name: "Ribbon North", location: "North Side Fascia", manufacturer: "Yaham", modelNumber: "HVO-C6", pixelPitch: 6.0, widthFt: 400, heightFt: 2.5 },
  { name: "Ribbon South", location: "South Side Fascia", manufacturer: "Yaham", modelNumber: "HVO-C6", pixelPitch: 6.0, widthFt: 400, heightFt: 2.5 },
  { name: "Club Level Video Wall", location: "Premium Club Level Lounge", manufacturer: "LG", modelNumber: "GSQA039N", pixelPitch: 3.9, widthFt: 20, heightFt: 8 },
  { name: "Box Office Marquee", location: "Main Box Office Exterior", manufacturer: "Yaham", modelNumber: "RAD-O10", pixelPitch: 10.0, widthFt: 30, heightFt: 10 },
  { name: "Plaza Tower", location: "Star Plaza Entrance Tower", manufacturer: "Yaham", modelNumber: "RAD-O6", pixelPitch: 6.0, widthFt: 8, heightFt: 40 },
];

const SPONSORS = [
  { name: "Coca-Cola", contact: "Sarah Mitchell", email: "s.mitchell@coca-cola.com" },
  { name: "Budweiser", contact: "Mike Torres", email: "m.torres@anheuser-busch.com" },
  { name: "State Farm", contact: "Jennifer Wu", email: "j.wu@statefarm.com" },
  { name: "Nike", contact: "David Park", email: "d.park@nike.com" },
  { name: "Toyota", contact: "Lisa Chen", email: "l.chen@toyota.com" },
];

const CONTENT_MAP: Record<string, string[]> = {
  "Coca-Cola": ["Coke_15sec_Holiday_2025", "Coke_30sec_GameDay_2026", "Coke_15sec_Zero_Sugar", "Coke_15sec_Halftime"],
  "Budweiser": ["Bud_15sec_SuperBowl_Promo", "Bud_30sec_ColdOnes", "Bud_15sec_GameNight"],
  "State Farm": ["SF_15sec_LikeAGoodNeighbor", "SF_30sec_Claims", "SF_15sec_Jake"],
  "Nike": ["Nike_15sec_JustDoIt", "Nike_30sec_AirMax", "Nike_15sec_GameReady"],
  "Toyota": ["Toyota_15sec_Camry", "Toyota_30sec_RAV4", "Toyota_15sec_Tacoma"],
};

function generateGameDates(startStr: string, endStr: string, gamesPerMonth: number): Date[] {
  const dates: Date[] = [];
  const start = new Date(startStr);
  const end = new Date(endStr);
  const current = new Date(start);

  while (current <= end) {
    const daysInMonth = new Date(current.getFullYear(), current.getMonth() + 1, 0).getDate();
    const interval = Math.floor(daysInMonth / gamesPerMonth);

    for (let g = 0; g < gamesPerMonth; g++) {
      const day = 1 + g * interval + Math.floor(Math.random() * 3);
      const gameDay = new Date(current.getFullYear(), current.getMonth(), day);
      if (gameDay <= end && gameDay >= start) {
        dates.push(gameDay);
      }
    }
    current.setMonth(current.getMonth() + 1);
  }
  return dates;
}

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min);
}

interface PlayLogInput {
  screenId: string;
  sponsorId: string;
  contentName: string;
  playedAt: Date;
  durationSec: number;
  verified: boolean;
  source: string;
}

function generatePlayLogs(
  screens: { id: string; name: string }[],
  sponsors: { id: string; name: string }[],
  gameDates: Date[]
): PlayLogInput[] {
  const logs: PlayLogInput[] = [];

  for (const gameDate of gameDates) {
    const gameStartHour = Math.random() > 0.5 ? 19 : 18;

    for (const screen of screens) {
      for (const sponsor of sponsors) {
        const playsThisGame = Math.floor(randomBetween(8, 16));
        const contents = CONTENT_MAP[sponsor.name] || ["Generic_15sec"];

        for (let p = 0; p < playsThisGame; p++) {
          const content = contents[Math.floor(Math.random() * contents.length)];
          const duration = content.includes("30sec") ? 30 : 15;
          const minuteOffset = Math.floor(randomBetween(0, 180));
          const secondOffset = Math.floor(Math.random() * 60);
          const playTime = new Date(gameDate);
          const totalMinutes = minuteOffset;
          playTime.setHours(gameStartHour + Math.floor(totalMinutes / 60), totalMinutes % 60, secondOffset);

          logs.push({
            screenId: screen.id,
            sponsorId: sponsor.id,
            contentName: content,
            playedAt: playTime,
            durationSec: duration,
            verified: Math.random() > 0.002,
            source: "vsoft_api",
          });
        }
      }
    }
  }

  return logs;
}

export async function POST() {
  try {
    // Clear existing data
    await prisma.playLog.deleteMany({});
    await prisma.performanceReport.deleteMany({});
    await prisma.installedScreen.deleteMany({});
    await prisma.venue.deleteMany({});
    await prisma.sponsor.deleteMany({});

    // Create sponsors
    const sponsorRecords: Record<string, { id: string; name: string; contact: string | null; email: string | null }> = {};
    for (const s of SPONSORS) {
      const record = await prisma.sponsor.create({ data: s });
      sponsorRecords[s.name] = record;
    }

    // Create venues + screens
    const venueData: { venue: any; screens: any[] }[] = [];
    const screenSets = [SCREENS_GAINBRIDGE, SCREENS_CRYPTO];

    for (let vi = 0; vi < VENUES.length; vi++) {
      const venue = await prisma.venue.create({ data: VENUES[vi] });
      const screenDefs = screenSets[vi];
      const screenRecords = [];

      for (const s of screenDefs) {
        const screen = await prisma.installedScreen.create({
          data: {
            venueId: venue.id,
            name: s.name,
            location: s.location,
            manufacturer: s.manufacturer,
            modelNumber: s.modelNumber,
            pixelPitch: s.pixelPitch,
            widthFt: s.widthFt,
            heightFt: s.heightFt,
            installDate: new Date("2025-08-15"),
            isActive: true,
          },
        });
        screenRecords.push(screen);
      }
      venueData.push({ venue, screens: screenRecords });
    }

    // Generate play logs
    const gameDatesGainbridge = generateGameDates("2025-10-01", "2026-03-15", 6);
    const gameDatesCrypto = generateGameDates("2025-10-01", "2026-03-15", 7);
    const gameDateSets = [gameDatesGainbridge, gameDatesCrypto];

    let totalLogs = 0;
    for (let vi = 0; vi < venueData.length; vi++) {
      const { screens } = venueData[vi];
      const gameDates = gameDateSets[vi];
      const sponsors = Object.values(sponsorRecords);

      const logs = generatePlayLogs(screens, sponsors, gameDates);
      totalLogs += logs.length;

      // Batch insert 500 at a time
      for (let i = 0; i < logs.length; i += 500) {
        await prisma.playLog.createMany({
          data: logs.slice(i, i + 500),
        });
      }
    }

    // Generate sample report for Coca-Cola at Gainbridge
    const gainbridge = venueData[0];
    const cocaCola = sponsorRecords["Coca-Cola"];
    const dateFrom = new Date("2025-10-01");
    const dateTo = new Date("2026-03-15");

    const cokePlayCount = await prisma.playLog.count({
      where: {
        sponsorId: cocaCola.id,
        screen: { venueId: gainbridge.venue.id },
        playedAt: { gte: dateFrom, lte: dateTo },
      },
    });

    const cokeAirtime = await prisma.playLog.aggregate({
      where: {
        sponsorId: cocaCola.id,
        screen: { venueId: gainbridge.venue.id },
        playedAt: { gte: dateFrom, lte: dateTo },
      },
      _sum: { durationSec: true },
    });

    const screenBreakdown = [];
    for (const scr of gainbridge.screens) {
      const count = await prisma.playLog.count({
        where: { screenId: scr.id, sponsorId: cocaCola.id, playedAt: { gte: dateFrom, lte: dateTo } },
      });
      const airtime = await prisma.playLog.aggregate({
        where: { screenId: scr.id, sponsorId: cocaCola.id, playedAt: { gte: dateFrom, lte: dateTo } },
        _sum: { durationSec: true },
      });
      screenBreakdown.push({
        screenId: scr.id,
        screenName: scr.name,
        location: scr.location,
        plays: count,
        airtimeSec: airtime._sum.durationSec || 0,
        uptimePct: Math.round((98.5 + Math.random() * 1.4) * 10) / 10,
      });
    }

    const sampleLogs = await prisma.playLog.findMany({
      where: { sponsorId: cocaCola.id, screen: { venueId: gainbridge.venue.id } },
      orderBy: { playedAt: "desc" },
      take: 50,
      include: { screen: { select: { name: true } } },
    });

    const avgUptime = screenBreakdown.reduce((s, b) => s + b.uptimePct, 0) / screenBreakdown.length;
    const estimatedImpressions = Math.round(cokePlayCount * 2800);

    const reportData = {
      venue: { name: gainbridge.venue.name, client: gainbridge.venue.client, city: gainbridge.venue.city, state: gainbridge.venue.state },
      sponsor: { name: cocaCola.name, contact: cocaCola.contact, email: cocaCola.email },
      period: { from: dateFrom.toISOString(), to: dateTo.toISOString(), label: "2025-26 Season (Oct 1 — Mar 15)" },
      summary: {
        totalPlays: cokePlayCount,
        totalAirtimeSec: cokeAirtime._sum.durationSec || 0,
        screenCount: gainbridge.screens.length,
        gameDays: gameDatesGainbridge.length,
        avgUptimePct: Math.round(avgUptime * 10) / 10,
        compliancePct: 100.0,
        estimatedImpressions,
      },
      screenBreakdown,
      sampleLogs: sampleLogs.map((l) => ({
        playedAt: l.playedAt.toISOString(),
        screenName: l.screen.name,
        contentName: l.contentName,
        durationSec: l.durationSec,
        verified: l.verified,
      })),
    };

    const shareHash = "pop-" + Buffer.from(`${gainbridge.venue.id}-${cocaCola.id}`).toString("base64url").slice(0, 16);

    const report = await prisma.performanceReport.create({
      data: {
        venueId: gainbridge.venue.id,
        sponsorId: cocaCola.id,
        title: "Coca-Cola — Gainbridge Fieldhouse — 2025-26 Season",
        dateFrom,
        dateTo,
        totalPlays: cokePlayCount,
        totalAirtime: cokeAirtime._sum.durationSec || 0,
        uptimePct: Math.round(avgUptime * 10) / 10,
        compliancePct: 100.0,
        impressions: estimatedImpressions,
        screenCount: gainbridge.screens.length,
        shareHash,
        reportData,
      },
    });

    return NextResponse.json({
      success: true,
      stats: {
        venues: VENUES.length,
        screens: SCREENS_GAINBRIDGE.length + SCREENS_CRYPTO.length,
        sponsors: SPONSORS.length,
        playLogs: totalLogs,
        sampleReport: {
          id: report.id,
          title: report.title,
          shareHash: report.shareHash,
          totalPlays: report.totalPlays,
          totalAirtimeHrs: Math.round((report.totalAirtime / 3600) * 10) / 10,
          uptimePct: report.uptimePct,
          impressions: report.impressions,
        },
      },
    });
  } catch (error: any) {
    log.error("[performance/seed] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
