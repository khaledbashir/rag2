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
import { normalizeEstimatorAnswers, type EstimatorAnswers } from "@/app/components/estimator/questions";
import { log } from "@/lib/logger";
import { logActivity } from "@/services/proposal/server/activityLogService";
import ExcelJS from "exceljs";
type ExcelFormulaValue = { formula?: string; result?: unknown };

function cellNumber(cell: ExcelJS.Cell): number {
  const value = cell.value as ExcelFormulaValue | number | null;
  if (typeof value === "number") return value;
  if (value && typeof value === "object" && typeof value.result === "number") return value.result;
  return 0;
}

async function alignEstimatorSqFtRate(
  buffer: Buffer | Uint8Array | ArrayBuffer,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer));

  const ledSheet = workbook.getWorksheet("LED Cost Sheet");
  if (!ledSheet) {
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  for (let row = 4; row <= ledSheet.rowCount; row++) {
    const label = String(ledSheet.getCell(row, 1).value ?? "").trim().toUpperCase();
    if (!label) continue;
    if (label.startsWith("TOTAL")) break;

    const totalSqFt = cellNumber(ledSheet.getCell(row, 13)); // M
    const displayCost = cellNumber(ledSheet.getCell(row, 17)); // Q
    const rateCell = ledSheet.getCell(row, 16); // P = $/SqFt
    const rateResult = totalSqFt > 0 ? displayCost / totalSqFt : 0;
    rateCell.value = {
      formula: `IFERROR(Q${row}/M${row},0)`,
      result: rateResult,
    };
    rateCell.numFmt = '"$"#,##0';
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const answers: EstimatorAnswers = normalizeEstimatorAnswers(body.answers);

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
    const patchedBuffer = await alignEstimatorSqFtRate(buffer);

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
