import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { log } from "@/lib/logger";

/**
 * POST /api/performance/activate
 *
 * Converts a SIGNED/CLOSED proposal into a Venue + InstalledScreens
 * for Proof of Performance tracking.
 *
 * Body: { proposalId: string }
 *
 * The bridge between pre-sale (proposals) and post-sale (performance tracking):
 *   Proposal.clientName  → Venue.client
 *   Proposal.venue       → Venue.name
 *   Proposal.clientCity  → Venue.city
 *   Proposal.screens[]   → InstalledScreen[] (with real specs)
 */
export async function POST(req: Request) {
  try {
    const { proposalId } = await req.json();

    if (!proposalId) {
      return NextResponse.json({ error: "proposalId is required" }, { status: 400 });
    }

    // Fetch the proposal with screens
    const proposal = await prisma.proposal.findUnique({
      where: { id: proposalId },
      include: {
        screens: {
          include: {
            manufacturerProduct: {
              select: { manufacturer: true, modelNumber: true },
            },
          },
        },
      },
    });

    if (!proposal) {
      return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
    }

    // Check if already activated
    const existingVenue = await prisma.venue.findFirst({
      where: { sourceProposalId: proposalId },
    });
    if (existingVenue) {
      return NextResponse.json({
        error: "This project has already been activated for performance tracking",
        venueId: existingVenue.id,
      }, { status: 409 });
    }

    // Parse location — proposals store city in clientCity, state might be in address or separate
    const city = proposal.clientCity || "";
    // Try to extract state from city field (e.g., "Indianapolis, IN") or from address
    const cityParts = city.split(",").map(s => s.trim());
    const venueCityName = cityParts[0] || city || "Unknown";
    const venueState = cityParts[1] || "";

    // Venue name: use proposal.venue if set, otherwise derive from client + project
    const venueName = proposal.venue || `${proposal.clientName} Venue`;

    // Create Venue
    const venue = await prisma.venue.create({
      data: {
        name: venueName,
        client: proposal.clientName,
        city: venueCityName,
        state: venueState,
        address: proposal.clientAddress || undefined,
        sourceProposalId: proposalId,
      },
    });

    // Create InstalledScreens from proposal ScreenConfigs
    const installedScreens = [];
    for (const screen of proposal.screens) {
      const manufacturer = screen.manufacturerProduct?.manufacturer || "TBD";
      const modelNumber = screen.manufacturerProduct?.modelNumber || undefined;
      const displayName = screen.customDisplayName || screen.externalName || screen.name;

      const installed = await prisma.installedScreen.create({
        data: {
          venueId: venue.id,
          name: displayName,
          location: screen.group || undefined,
          manufacturer,
          modelNumber,
          pixelPitch: screen.pixelPitch,
          widthFt: screen.width,
          heightFt: screen.height,
          installDate: proposal.lockedAt || new Date(),
          isActive: true,
        },
      });
      installedScreens.push(installed);
    }

    // Also check if there are estimator displays (from the Estimator flow)
    // These are stored as JSON in proposal.estimatorDisplays
    const estimatorDisplays = proposal.estimatorDisplays as any[] | null;
    if (estimatorDisplays && Array.isArray(estimatorDisplays) && proposal.screens.length === 0) {
      for (const disp of estimatorDisplays) {
        const installed = await prisma.installedScreen.create({
          data: {
            venueId: venue.id,
            name: disp.displayName || disp.name || `Display`,
            location: disp.locationType || undefined,
            manufacturer: disp.productName || disp.manufacturer || "TBD",
            modelNumber: disp.modelNumber || undefined,
            pixelPitch: parseFloat(disp.pixelPitch) || 0,
            widthFt: disp.widthFt || 0,
            heightFt: disp.heightFt || 0,
            installDate: proposal.lockedAt || new Date(),
            isActive: true,
          },
        });
        installedScreens.push(installed);
      }
    }

    return NextResponse.json({
      success: true,
      venue: {
        id: venue.id,
        name: venue.name,
        client: venue.client,
        city: venue.city,
        state: venue.state,
        sourceProposalId: venue.sourceProposalId,
      },
      screens: installedScreens.map(s => ({
        id: s.id,
        name: s.name,
        manufacturer: s.manufacturer,
        pixelPitch: s.pixelPitch,
        widthFt: s.widthFt,
        heightFt: s.heightFt,
      })),
      message: `Activated ${venue.name} with ${installedScreens.length} screens for performance tracking.`,
    });
  } catch (error: any) {
    log.error("[performance/activate] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
