/**
 * Resolves the cost→sell basis for the Control System (LiveSync) auto-BOM.
 *
 * The CMS catalog stores unit COST and, for every SKU today, no sell price. The
 * LiveSync margin already exists on the rate card as `margin.livesync` and the
 * house model is the divisor form used across the estimator (lib/estimator.ts:
 * P = C / (1 - M)). This reads the live rate — including any edit made in
 * /admin/rate-card — and reports where it came from, so the number on the sheet
 * is traceable rather than asserted.
 *
 * Read-only use of the shared rate-card loader. No RFP file is modified.
 */
import { prisma } from "@/lib/prisma";
import { getMargin } from "@/services/rfp/rateCardLoader";
import type { LivesyncPricingContext } from "@/lib/cms/livesyncAutoBom";

export const LIVESYNC_MARGIN_KEY = "margin.livesync";

export async function resolveLivesyncPricing(): Promise<LivesyncPricingContext> {
  const margin = await getMargin("livesync");

  let marginSource = "the built-in LiveSync margin default";
  try {
    const entry = await prisma.rateCardEntry.findUnique({
      where: { key: LIVESYNC_MARGIN_KEY },
      select: { label: true, provenance: true, confidence: true, isActive: true },
    });
    if (entry?.isActive) {
      const provenance = entry.provenance ? ` — ${entry.provenance}` : "";
      marginSource = `the rate card (${entry.label}, ${entry.confidence}${provenance})`;
    }
  } catch {
    // Rate card unreachable: getMargin already fell back to the built-in
    // default, and the source string above says exactly that.
  }

  return { margin, marginSource };
}
