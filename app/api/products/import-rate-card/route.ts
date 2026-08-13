/**
 * POST /api/products/import-rate-card
 *
 * Upload an NX Yaham rate card workbook — either the ANC (direct) or the LGEUS
 * flavour — and land it on the catalog and, for the LGEUS card, on the
 * estimator's `led_cost.*` rates.
 *
 * Replaces the hand-written `prisma/seed-yaham-*.ts` / `seed-lgeus-*.ts` files.
 * Those had to be retyped for every new card, which is how the estimator ended
 * up quoting February prices in August.
 *
 * multipart/form-data:
 *   file              the .xlsx Natalia sent (required)
 *   dryRun            "true" to report the diff without writing
 *   includeShipping   "false" to leave vessel shipping out of led_cost
 *
 * Idempotent: re-importing the same card reports every row unchanged.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/apiAuth";
import { importNxRateCard } from "@/services/pricing/importNxRateCard";
import { log } from "@/lib/logger";

export async function POST(request: NextRequest) {
  try {
    const [session, authError] = await requireAuth();
    if (authError) return authError;

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const dryRun = String(formData.get("dryRun") ?? "") === "true";
    const includeShippingInLedCost = String(formData.get("includeShipping") ?? "true") !== "false";

    const report = await importNxRateCard(
      prisma,
      Buffer.from(await file.arrayBuffer()),
      file.name,
      {
        dryRun,
        includeShippingInLedCost,
        changedBy:
          (session as unknown as { user?: { email?: string } } | null)?.user?.email ??
          "nx-rate-card-import",
      }
    );

    log.info(
      `[import-rate-card] ${report.dryRun ? "DRY RUN " : ""}${report.variant} ${file.name} — ` +
        `${report.products.created} created, ${report.products.updated} updated, ` +
        `${report.products.retired} retired, ${report.estimatorRates.changes.length} rates touched`
    );

    return NextResponse.json({ success: true, report });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Rate card import failed";
    log.error("[import-rate-card] Error:", error);
    // A workbook that is not an NX rate card is the user's most likely mistake,
    // and the parser says exactly what it looked for — so pass that through
    // rather than burying it behind a generic 500.
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
