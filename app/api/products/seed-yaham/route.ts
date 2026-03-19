/**
 * POST /api/products/seed-yaham
 *
 * Seeds/updates Yaham NX Rate Card products with dual brightness variants.
 * Idempotent — safe to run multiple times (upserts by modelNumber).
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/apiAuth";
import { seedYahamRateCard } from "@/prisma/seed-yaham-ratecard";

export async function POST() {
  try {
    const [, authError] = await requireAuth();
    if (authError) return authError;

    const result = await seedYahamRateCard();
    return NextResponse.json({
      success: true,
      message: `Yaham rate card seeded: ${result.created} created, ${result.updated} updated, ${result.total} total products`,
      ...result,
    });
  } catch (error: any) {
    console.error("[seed-yaham] Error:", error);
    return NextResponse.json({ error: error.message || "Seed failed" }, { status: 500 });
  }
}
