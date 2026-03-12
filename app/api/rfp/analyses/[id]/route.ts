/**
 * GET /api/rfp/analyses/:id — Get full analysis detail
 *
 * Returns complete analysis with screens, requirements, project info, triage.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { needsWestfieldReextract, reextractSavedPdfAnalysis } from "@/services/rfp/unified/healSavedAnalysis";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const analysis = await prisma.rfpAnalysis.findUnique({
    where: { id },
  });

  if (!analysis) {
    return NextResponse.json({ error: "Analysis not found" }, { status: 404 });
  }

  if (needsWestfieldReextract(analysis)) {
    try {
      const healed = await reextractSavedPdfAnalysis(analysis);
      const updated = await prisma.rfpAnalysis.update({
        where: { id },
        data: {
          screens: JSON.parse(JSON.stringify(healed.screens)),
          requirements: JSON.parse(JSON.stringify(healed.requirements)),
          incompleteSpecs: JSON.parse(JSON.stringify(healed.incompleteSpecs)),
          project: JSON.parse(JSON.stringify({
            ...(analysis.project as any || {}),
            ...healed.project,
          })),
          specsFound: healed.screens.length,
        },
      });
      return NextResponse.json(updated);
    } catch {
      // Fall back to the saved row if healing fails.
    }
  }

  return NextResponse.json(analysis);
}

/**
 * PATCH /api/rfp/analyses/:id — Update analysis (e.g., set project name)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json();

  // Allow updating safe fields
  const stringFields = ["projectName", "clientName", "venue", "location"];
  const jsonArrayFields = ["screens", "requirements", "incompleteSpecs"];
  const jsonObjectFields = ["pricingDocument", "mirrorModePricing"];
  const data: Record<string, any> = {};

  for (const key of stringFields) {
    if (key in body && typeof body[key] === "string") {
      data[key] = body[key];
    }
  }
  for (const key of jsonArrayFields) {
    if (key in body && Array.isArray(body[key])) {
      data[key] = body[key];
    }
  }
  for (const key of jsonObjectFields) {
    if (key in body && body[key] != null) {
      data[key] = body[key];
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const updated = await prisma.rfpAnalysis.update({
    where: { id },
    data,
  });

  return NextResponse.json(updated);
}

/**
 * DELETE /api/rfp/analyses/:id — Delete an analysis
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    await prisma.rfpAnalysis.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Analysis not found" }, { status: 404 });
  }
}
