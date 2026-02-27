/**
 * POST /api/rfp/pipeline/extract-bid-form-specs
 *
 * Extract LED specs directly from a bid form Excel's Column B values.
 * Used when the RFP technical spec document isn't available or extraction
 * found fewer specs than the bid form contains.
 *
 * Body: FormData with:
 *   - bidForm: File (the .xlsx bid form)
 *   - analysisId?: string (optional — if provided, supplements existing specs in DB)
 *
 * Returns: { specs: ExtractedLEDSpec[], blockCount: number }
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { extractSpecsFromBidForm } from "@/services/rfp/pipeline/bidFormFiller";
import type { ExtractedLEDSpec } from "@/services/rfp/unified/types";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const bidFormFile = formData.get("bidForm") as File | null;
    const analysisId = formData.get("analysisId") as string | null;

    if (!bidFormFile) {
      return NextResponse.json(
        { error: "bidForm file is required" },
        { status: 400 }
      );
    }

    if (
      !bidFormFile.name.endsWith(".xlsx") &&
      !bidFormFile.name.endsWith(".xls")
    ) {
      return NextResponse.json(
        { error: "Bid form must be an Excel file (.xlsx)" },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await bidFormFile.arrayBuffer());
    const { specs, blockCount } = await extractSpecsFromBidForm(buffer);

    console.log(
      `[extract-bid-form-specs] Found ${specs.length} specs from ${blockCount} blocks in ${bidFormFile.name}`
    );

    // If analysisId provided, merge with existing DB specs
    if (analysisId) {
      const analysis = await prisma.rfpAnalysis.findUnique({
        where: { id: analysisId },
      });

      if (analysis) {
        const existingScreens =
          (analysis.screens as unknown as ExtractedLEDSpec[]) || [];

        // Merge: keep PDF-extracted specs, add bid form specs that don't exist
        const merged = mergeSpecs(existingScreens, specs);

        await prisma.rfpAnalysis.update({
          where: { id: analysisId },
          data: { screens: merged as any },
        });

        console.log(
          `[extract-bid-form-specs] Merged: ${existingScreens.length} existing + ${specs.length} bid form → ${merged.length} total`
        );

        return NextResponse.json({
          specs: merged,
          blockCount,
          merged: true,
          previousCount: existingScreens.length,
          newCount: merged.length,
        });
      }
    }

    return NextResponse.json({ specs, blockCount, merged: false });
  } catch (err: any) {
    console.error("[extract-bid-form-specs] Error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to extract specs from bid form" },
      { status: 500 }
    );
  }
}

/**
 * Merge PDF-extracted specs with bid form specs.
 *
 * KEY RULE: The bid form is a structured, reliable source. When the bid form
 * has MORE specs than PDF extraction found, the bid form is the authority —
 * use bid form as the base and only enrich from PDF (not the other way around).
 * This prevents bad PDF extraction data (wrong dimensions, phantom displays)
 * from contaminating the output.
 */
function mergeSpecs(
  pdfSpecs: ExtractedLEDSpec[],
  bidFormSpecs: ExtractedLEDSpec[]
): ExtractedLEDSpec[] {
  // If bid form has more or equal specs, it's the authority — use it as base
  if (bidFormSpecs.length >= pdfSpecs.length) {
    const merged = bidFormSpecs.map((s) => ({ ...s }));

    // For each bid form spec, see if PDF has extra info to enrich
    const usedPdfIndices = new Set<number>();
    for (const bfSpec of merged) {
      let bestMatch = -1;
      let bestScore = 0;
      for (let i = 0; i < pdfSpecs.length; i++) {
        if (usedPdfIndices.has(i)) continue;
        const score = specMatchScore(bfSpec, pdfSpecs[i]);
        if (score > bestScore) { bestScore = score; bestMatch = i; }
      }
      if (bestMatch >= 0 && bestScore > 0.5) {
        usedPdfIndices.add(bestMatch);
        const pdfSpec = pdfSpecs[bestMatch];
        // Only enrich fields the bid form doesn't have
        if (!bfSpec.location && pdfSpec.location) bfSpec.location = pdfSpec.location;
        if (!bfSpec.serviceType && pdfSpec.serviceType) bfSpec.serviceType = pdfSpec.serviceType;
        if (!bfSpec.mountingType && pdfSpec.mountingType) bfSpec.mountingType = pdfSpec.mountingType;
        if (bfSpec.specialRequirements.length === 0 && pdfSpec.specialRequirements.length > 0) {
          bfSpec.specialRequirements = pdfSpec.specialRequirements;
        }
        if (bfSpec.sourcePages.length === 0 && pdfSpec.sourcePages.length > 0) {
          bfSpec.sourcePages = pdfSpec.sourcePages;
        }
      }
    }

    return merged;
  }

  // PDF has more specs than bid form — PDF is authority (rare, but handle it)
  const merged = [...pdfSpecs];
  const usedPdfIndices = new Set<number>();

  for (const bfSpec of bidFormSpecs) {
    let bestMatch = -1;
    let bestScore = 0;
    for (let i = 0; i < pdfSpecs.length; i++) {
      if (usedPdfIndices.has(i)) continue;
      const score = specMatchScore(bfSpec, pdfSpecs[i]);
      if (score > bestScore) { bestScore = score; bestMatch = i; }
    }
    if (bestMatch >= 0 && bestScore > 0.4) {
      usedPdfIndices.add(bestMatch);
      // Supplement PDF spec with bid form data
      const existing = merged[bestMatch];
      if (existing.widthFt == null && bfSpec.widthFt != null) existing.widthFt = bfSpec.widthFt;
      if (existing.heightFt == null && bfSpec.heightFt != null) existing.heightFt = bfSpec.heightFt;
      if (existing.widthPx == null && bfSpec.widthPx != null) existing.widthPx = bfSpec.widthPx;
      if (existing.heightPx == null && bfSpec.heightPx != null) existing.heightPx = bfSpec.heightPx;
      if (existing.pixelPitchMm == null && bfSpec.pixelPitchMm != null) existing.pixelPitchMm = bfSpec.pixelPitchMm;
      if (existing.brightnessNits == null && bfSpec.brightnessNits != null) existing.brightnessNits = bfSpec.brightnessNits;
      if (existing.quantity === 1 && bfSpec.quantity > 1) existing.quantity = bfSpec.quantity;
    } else {
      merged.push(bfSpec);
    }
  }

  return merged;
}

function specMatchScore(a: ExtractedLEDSpec, b: ExtractedLEDSpec): number {
  let score = 0;
  let maxScore = 0;

  // Name match (token overlap)
  maxScore += 40;
  const tokA = new Set(a.name.toLowerCase().replace(/[^a-z0-9]/g, " ").trim().split(/\s+/).filter(t => t.length > 2));
  const tokB = new Set(b.name.toLowerCase().replace(/[^a-z0-9]/g, " ").trim().split(/\s+/).filter(t => t.length > 2));
  if (tokA.size > 0 && tokB.size > 0) {
    let overlap = 0;
    for (const t of tokA) {
      if (tokB.has(t)) overlap++;
      else for (const tb of tokB) { if (tb.includes(t) || t.includes(tb)) { overlap += 0.5; break; } }
    }
    score += (overlap / Math.max(tokA.size, tokB.size)) * 40;
  }

  // Pitch match
  maxScore += 30;
  if (a.pixelPitchMm != null && b.pixelPitchMm != null) {
    if (Math.abs(a.pixelPitchMm - b.pixelPitchMm) < 0.5) score += 30;
    else if (Math.abs(a.pixelPitchMm - b.pixelPitchMm) < 2) score += 10;
  }

  // Dimension match
  maxScore += 20;
  if (a.widthFt != null && b.widthFt != null && a.heightFt != null && b.heightFt != null) {
    if (Math.abs(a.widthFt - b.widthFt) < 5 && Math.abs(a.heightFt - b.heightFt) < 2) {
      score += 20;
    }
  }

  // Alternate flag
  maxScore += 10;
  if ((a.isAlternate ?? false) === (b.isAlternate ?? false)) score += 10;

  return maxScore > 0 ? score / maxScore : 0;
}
