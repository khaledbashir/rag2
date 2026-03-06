/**
 * POST /api/estimator/export-unified
 *
 * Budget builder unified Excel export — maps EstimatorAnswers to
 * ScopingWorkbookOptions and calls the same generator as the RFP path.
 *
 * Body: { answers: EstimatorAnswers }
 * Returns: .xlsx file (same format as RFP scoping workbook)
 */

import { NextRequest, NextResponse } from "next/server";
import { mapEstimatorToScoping } from "@/services/rfp/pipeline/estimatorToScopingMapper";
import { generateScopingWorkbook } from "@/services/rfp/pipeline/generateScopingWorkbook";
import type { EstimatorAnswers } from "@/app/components/estimator/questions";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const answers: EstimatorAnswers = body.answers;

    if (!answers || !answers.displays?.length) {
      return NextResponse.json(
        { error: "answers with at least one display is required" },
        { status: 400 }
      );
    }

    // Map Budget estimator data → scoping workbook options
    const options = mapEstimatorToScoping(answers);

    // Generate using the same generator as RFP path
    const { buffer } = await generateScopingWorkbook(options);

    const safeName = (answers.projectName || answers.clientName || "Budget")
      .replace(/\s+/g, "_")
      .replace(/[^\w\-_.]/g, "");

    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${safeName}_Unified.xlsx"`,
      },
    });
  } catch (err) {
    console.error("[export-unified] Error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
