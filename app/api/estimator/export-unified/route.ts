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
import { log } from "@/lib/logger";
import { logActivity } from "@/services/proposal/server/activityLogService";
import ExcelJS from "exceljs";
import { preloadRateCard, getRateSync } from "@/services/rfp/rateCardLoader";
import { calculateDisplay, type RateCard } from "@/app/components/estimator/EstimatorBridge";

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function createLiveRateCard(): RateCard {
  return new Proxy({} as RateCard, {
    get(_target, prop) {
      if (typeof prop !== "string") return undefined;
      try {
        return getRateSync(prop);
      } catch {
        return undefined;
      }
    },
  });
}

async function alignEstimatorSqFtRate(
  buffer: Buffer | Uint8Array | ArrayBuffer,
  answers: EstimatorAnswers,
): Promise<Buffer> {
  await preloadRateCard();
  const liveRateCard = createLiveRateCard();

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer));

  const ledSheet = workbook.getWorksheet("LED Cost Sheet");
  if (!ledSheet) {
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  answers.displays.forEach((display, index) => {
    const calc = calculateDisplay(display, answers, liveRateCard);
    const row = 4 + index; // LED Cost Sheet data starts at row 4 for base displays
    const rateCell = ledSheet.getCell(row, 16); // P = $/SqFt
    rateCell.value = round2(calc.costPerSqFt);
    rateCell.numFmt = '"$"#,##0.00';
  });

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

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
    const patchedBuffer = await alignEstimatorSqFtRate(buffer, answers);

    const safeName = (answers.projectName || answers.clientName || "Budget")
      .replace(/\s+/g, "_")
      .replace(/[^\w\-_.]/g, "");

    // Log activity if projectId provided
    if (body.projectId) {
      logActivity(body.projectId, "excel_exported", "Exported Excel workbook", body.actorName || null);
    }

    return new Response(patchedBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${safeName}_Unified.xlsx"`,
      },
    });
  } catch (err) {
    log.error("[export-unified] Error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
