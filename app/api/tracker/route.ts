/**
 * GET /api/tracker — List all tracker items
 * POST /api/tracker — Seed/reset/add tracker items
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Phase 2 completion criteria items
const PHASE2_ITEMS = [
  { category: "Core Engine", description: "Engine accurately recognizes all LED products from RFP/Excel", sortOrder: 1 },
  { category: "Core Engine", description: "Products match correct specs when selected (pitch, dimensions, resolution)", sortOrder: 2 },
  { category: "Core Engine", description: "Pricing math reconciles correctly with source quotes ($/sqft × sqft × qty)", sortOrder: 3 },
  { category: "Core Engine", description: "Electrical install estimate is within reasonable ballpark (208V circuit formula)", sortOrder: 4 },
  { category: "Quote Workflow", description: "Generate ready-to-send Excel sheet for Electrician (circuits, power, voltage)", sortOrder: 5 },
  { category: "Quote Workflow", description: "Generate ready-to-send Excel sheet for Installer (structural, weight, rigging)", sortOrder: 6 },
  { category: "Quote Workflow", description: "Generate ready-to-send Excel sheet for LED Supplier (pitch, sqft, panels)", sortOrder: 7 },
  { category: "Quote Workflow", description: "Upload returned hard quotes (Excel) and match to analysis specs", sortOrder: 8 },
  { category: "Quote Workflow", description: "Override internal estimates with confirmed hard quotes per display", sortOrder: 9 },
  { category: "Validation", description: "Bon Secours LED sqft discrepancy resolved (356 vs 176 — was qty doubling bug)", sortOrder: 10 },
  { category: "Validation", description: "Display cost traces back to source quote and logic is correct", sortOrder: 11 },
  { category: "Validation", description: "Math aligns with Phoenix quote numbers", sortOrder: 12 },
  { category: "Output", description: "Bid form specs auto-populated (detect blocks, fuzzy match, fill vendor column)", sortOrder: 13 },
  { category: "Output", description: "Scope of Work generator operational (AI + template hybrid, risk-aware)", sortOrder: 14 },
  { category: "Output", description: "Drop final Excel into system and generate PDF proposal", sortOrder: 15 },
];

// Safe query helpers — new tables may not exist until next deploy
async function getItemsWithComments() {
  try {
    return await prisma.trackerItem.findMany({
      orderBy: { sortOrder: "asc" },
      include: {
        comments: { orderBy: { createdAt: "desc" }, take: 5 },
        _count: { select: { comments: true } },
      },
    });
  } catch {
    return await prisma.trackerItem.findMany({ orderBy: { sortOrder: "asc" } });
  }
}

async function getActivity() {
  try {
    return await prisma.trackerActivity.findMany({ orderBy: { createdAt: "desc" }, take: 30 });
  } catch {
    return [];
  }
}

export async function GET() {
  try {
    let items = await getItemsWithComments();

    // Auto-seed if empty
    if (items.length === 0) {
      await Promise.all(
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
      items = await getItemsWithComments();
      return NextResponse.json({ items, seeded: true });
    }

    const activity = await getActivity();
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
      try { await prisma.trackerActivity.deleteMany(); } catch { /* */ }
      try { await prisma.trackerComment.deleteMany(); } catch { /* */ }
      await prisma.trackerItem.deleteMany();
      await Promise.all(
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
      const items = await getItemsWithComments();
      return NextResponse.json({ items, reset: true });
    }

    if (action === "add") {
      const { description, category = "Custom", author = "System" } = body;
      if (!description || !description.trim()) {
        return NextResponse.json({ error: "description is required" }, { status: 400 });
      }
      const maxItem = await prisma.trackerItem.findFirst({
        orderBy: { sortOrder: "desc" },
        select: { sortOrder: true },
      });
      const item = await prisma.trackerItem.create({
        data: {
          description: description.trim(),
          category,
          sortOrder: (maxItem?.sortOrder || 0) + 1,
          status: "claimed",
          column: "awaiting_review",
          claimedBy: author,
          claimedAt: new Date(),
        },
      });
      try {
        await prisma.trackerActivity.create({
          data: { itemId: item.id, actor: author, action: "added", details: description.trim().substring(0, 80) },
        });
      } catch { /* */ }
      return NextResponse.json({ item });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed";
    console.error("[tracker] POST error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
