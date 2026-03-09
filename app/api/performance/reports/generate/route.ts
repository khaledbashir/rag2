import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { log } from "@/lib/logger";

/**
 * POST /api/performance/reports/generate
 * Generate a new Proof of Performance report for a venue + sponsor + date range.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { venueId, sponsorId, dateFrom, dateTo } = body;

    if (!venueId || !sponsorId || !dateFrom || !dateTo) {
      return NextResponse.json(
        { error: "venueId, sponsorId, dateFrom, and dateTo are required" },
        { status: 400 }
      );
    }

    const venue = await prisma.venue.findUnique({
      where: { id: venueId },
      include: { screens: { where: { isActive: true } } },
    });
    if (!venue) return NextResponse.json({ error: "Venue not found" }, { status: 404 });

    const sponsor = await prisma.sponsor.findUnique({ where: { id: sponsorId } });
    if (!sponsor) return NextResponse.json({ error: "Sponsor not found" }, { status: 404 });

    const from = new Date(dateFrom);
    const to = new Date(dateTo);

    // Count total plays
    const totalPlays = await prisma.playLog.count({
      where: {
        sponsorId,
        screen: { venueId },
        playedAt: { gte: from, lte: to },
      },
    });

    // Total airtime
    const airtimeAgg = await prisma.playLog.aggregate({
      where: {
        sponsorId,
        screen: { venueId },
        playedAt: { gte: from, lte: to },
      },
      _sum: { durationSec: true },
    });
    const totalAirtime = airtimeAgg._sum.durationSec || 0;

    // Per-screen breakdown
    const screenBreakdown = [];
    for (const scr of venue.screens) {
      const plays = await prisma.playLog.count({
        where: { screenId: scr.id, sponsorId, playedAt: { gte: from, lte: to } },
      });
      const airtime = await prisma.playLog.aggregate({
        where: { screenId: scr.id, sponsorId, playedAt: { gte: from, lte: to } },
        _sum: { durationSec: true },
      });

      // Uptime: query verified vs total
      const totalForScreen = await prisma.playLog.count({
        where: { screenId: scr.id, playedAt: { gte: from, lte: to } },
      });
      const verifiedForScreen = await prisma.playLog.count({
        where: { screenId: scr.id, playedAt: { gte: from, lte: to }, verified: true },
      });
      const uptimePct = totalForScreen > 0
        ? Math.round((verifiedForScreen / totalForScreen) * 1000) / 10
        : 100;

      screenBreakdown.push({
        screenId: scr.id,
        screenName: scr.name,
        location: scr.location,
        manufacturer: scr.manufacturer,
        pixelPitch: scr.pixelPitch,
        widthFt: scr.widthFt,
        heightFt: scr.heightFt,
        plays,
        airtimeSec: airtime._sum.durationSec || 0,
        uptimePct,
      });
    }

    const avgUptime = screenBreakdown.length > 0
      ? Math.round((screenBreakdown.reduce((s, b) => s + b.uptimePct, 0) / screenBreakdown.length) * 10) / 10
      : 100;

    // Unique game days
    const distinctDays = await prisma.playLog.findMany({
      where: { sponsorId, screen: { venueId }, playedAt: { gte: from, lte: to } },
      distinct: ["playedAt"],
      select: { playedAt: true },
    });
    // Group by day
    const daySet = new Set(distinctDays.map((d) => d.playedAt.toISOString().slice(0, 10)));

    // Sample logs (most recent 50)
    const sampleLogs = await prisma.playLog.findMany({
      where: { sponsorId, screen: { venueId } },
      orderBy: { playedAt: "desc" },
      take: 50,
      include: { screen: { select: { name: true } } },
    });

    const estimatedImpressions = Math.round(totalPlays * 2800);
    const compliancePct = 100.0;

    // Build period label
    const fromLabel = from.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    const toLabel = to.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

    const reportData = {
      venue: { name: venue.name, client: venue.client, city: venue.city, state: venue.state },
      sponsor: { name: sponsor.name, contact: sponsor.contact, email: sponsor.email },
      period: { from: from.toISOString(), to: to.toISOString(), label: `${fromLabel} — ${toLabel}` },
      summary: {
        totalPlays,
        totalAirtimeSec: totalAirtime,
        screenCount: venue.screens.length,
        gameDays: daySet.size,
        avgUptimePct: avgUptime,
        compliancePct,
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

    const { randomBytes } = await import("crypto");
    const shareHash = "pop-" + randomBytes(12).toString("base64url");
    const title = `${sponsor.name} — ${venue.name} — ${fromLabel} to ${toLabel}`;

    const report = await prisma.performanceReport.create({
      data: {
        venueId,
        sponsorId,
        title,
        dateFrom: from,
        dateTo: to,
        totalPlays,
        totalAirtime,
        uptimePct: avgUptime,
        compliancePct,
        impressions: estimatedImpressions,
        screenCount: venue.screens.length,
        shareHash,
        reportData,
      },
      include: {
        venue: { select: { id: true, name: true, client: true } },
        sponsor: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ report });
  } catch (error: any) {
    log.error("[performance/reports/generate] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
