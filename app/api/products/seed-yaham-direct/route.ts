/**
 * POST /api/products/seed-yaham-direct
 *
 * Seeds the Yaham Direct rate card — 04.15.26 version, Exwork basis pricing.
 * Hard-deletes the 17 soft-deleted LG LED rows and upserts 31 split-brightness
 * Yaham SKUs as the parallel "no-markup" catalog beside LG USA.
 * Idempotent — safe to re-run.
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/apiAuth";
import { seedYahamDirectRateCard } from "@/prisma/seed-yaham-direct";

export async function POST() {
  try {
    const [, authError] = await requireAuth();
    if (authError) return authError;

    const result = await seedYahamDirectRateCard();
    return NextResponse.json({
      success: true,
      message: `Yaham direct rate card seeded: ${result.deletedOldLG} old LG rows deleted, ${result.created} created, ${result.updated} updated (${result.total} total)`,
      ...result,
    });
  } catch (error: any) {
    console.error("[seed-yaham-direct] Error:", error);
    return NextResponse.json({ error: error.message || "Seed failed" }, { status: 500 });
  }
}
