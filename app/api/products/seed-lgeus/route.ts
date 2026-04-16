/**
 * POST /api/products/seed-lgeus
 *
 * Seeds the LG USA (LGEUS) rate card — 04.15.26 version.
 * Retires the stale 02.16.26 rows and upserts 31 split-brightness SKUs.
 * Idempotent — safe to re-run.
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/apiAuth";
import { seedLGEUSRateCard } from "@/prisma/seed-lgeus-ratecard";

export async function POST() {
  try {
    const [, authError] = await requireAuth();
    if (authError) return authError;

    const result = await seedLGEUSRateCard();
    return NextResponse.json({
      success: true,
      message: `LG USA rate card seeded: ${result.retired} retired, ${result.created} created, ${result.updated} updated (${result.total} total)`,
      ...result,
    });
  } catch (error: any) {
    console.error("[seed-lgeus] Error:", error);
    return NextResponse.json({ error: error.message || "Seed failed" }, { status: 500 });
  }
}
