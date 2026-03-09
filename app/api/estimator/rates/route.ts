import { NextResponse } from "next/server";
import { getFullRateCard } from "@/services/rfp/rateCardLoader";
import { requireAuth } from "@/lib/apiAuth";
import { log } from "@/lib/logger";

/**
 * GET /api/estimator/rates
 * Returns the full rate card as Record<string, number>.
 * Merges DB values over hardcoded defaults (30s cache in rateCardLoader).
 */
export async function GET() {
    try {
        const [, authError] = await requireAuth();
        if (authError) return authError;
        const rates = await getFullRateCard();
        return NextResponse.json({ rates });
    } catch (error) {
        log.error("GET /api/estimator/rates error:", error);
        return NextResponse.json(
            { error: "Failed to load rate card" },
            { status: 500 }
        );
    }
}
