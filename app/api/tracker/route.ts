/**
 * GET /api/tracker — List all tracker items with comments
 * POST /api/tracker — Seed/reset tracker items (admin)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Phase 2 completion criteria items
const PHASE2_ITEMS = [
  // Core Engine
  { category: "Core Engine", description: "Engine accurately recognizes all LED products from RFP/Excel", sortOrder: 1 },
  { category: "Core Engine", description: "Products match correct specs when selected (pitch, dimensions, resolution)", sortOrder: 2 },
  { category: "Core Engine", description: "Pricing math reconciles correctly with source quotes ($/sqft × sqft × qty)", sortOrder: 3 },
  { category: "Core Engine", description: "Electrical install estimate is within reasonable ballpark (208V circuit formula)", sortOrder: 4 },
  // Quote Workflow
  { category: "Quote Workflow", description: "Generate ready-to-send Excel sheet for Electrician (circuits, power, voltage)", sortOrder: 5 },
  { category: "Quote Workflow", description: "Generate ready-to-send Excel sheet for Installer (structural, weight, rigging)", sortOrder: 6 },
  { category: "Quote Workflow", description: "Generate ready-to-send Excel sheet for LED Supplier (pitch, sqft, panels)", sortOrder: 7 },
  { category: "Quote Workflow", description: "Upload returned hard quotes (Excel) and match to analysis specs", sortOrder: 8 },
  { category: "Quote Workflow", description: "Override internal estimates with confirmed hard quotes per display", sortOrder: 9 },
  // Validation & Reconciliation
  { category: "Validation", description: "Bon Secours LED sqft discrepancy resolved (356 vs 176 — was qty doubling bug)", sortOrder: 10 },
  { category: "Validation", description: "Display cost traces back to source quote and logic is correct", sortOrder: 11 },
  { category: "Validation", description: "Math aligns with Phoenix quote numbers", sortOrder: 12 },
  // Output
  { category: "Output", description: "Bid form specs auto-populated (detect blocks, fuzzy match, fill vendor column)", sortOrder: 13 },
  { category: "Output", description: "Scope of Work generator operational (AI + template hybrid, risk-aware)", sortOrder: 14 },
  { category: "Output", description: "Drop final Excel into system and generate PDF proposal", sortOrder: 15 },
];

export async function GET() {
  try {
    const items = await prisma.trackerItem.findMany({
      orderBy: { sortOrder: "asc" },
      include: {
        comments: { orderBy: { createdAt: "desc" }, take: 5 },
        _count: { select: { comments: true } },
      },
    });

    // If no items exist yet, auto-seed
    if (items.length === 0) {
      const seeded = await Promise.all(
        PHASE2_ITEMS.map((item) =>
          prisma.trackerItem.create({
            data: {
              ...item,
              status: "claimed",
              column: "awaiting_review",
              claimedBy: "Ahmad",
              claimedAt: new Date(),
            },
            include: {
              comments: true,
              _count: { select: { comments: true } },
            },
          }),
        ),
      );
      return NextResponse.json({ items: seeded, seeded: true });
    }

    // Get recent global activity
    const activity = await prisma.trackerActivity.findMany({
      orderBy: { createdAt: "desc" },
      take: 30,
    });

    return NextResponse.json({ items, activity });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to load tracker";
    console.error("[tracker] GET error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    if (action === "reset") {
      // Delete all and re-seed
      await prisma.trackerActivity.deleteMany();
      await prisma.trackerComment.deleteMany();
      await prisma.trackerItem.deleteMany();
      const seeded = await Promise.all(
        PHASE2_ITEMS.map((item) =>
          prisma.trackerItem.create({
            data: {
              ...item,
              status: "claimed",
              column: "awaiting_review",
              claimedBy: "Ahmad",
              claimedAt: new Date(),
            },
          }),
        ),
      );
      return NextResponse.json({ items: seeded, reset: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed";
    console.error("[tracker] POST error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
