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

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

async function alignEstimatorSqFtRate(buffer: Buffer | Uint8Array | ArrayBuffer): Promise<Buffer> {
  await preloadRateCard();
  const sparePartsPct = getRateSync("spare_parts.led_pct", 0.05);
  const spareMultiplier = 1 + sparePartsPct;

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer));

  const productSheet = workbook.getWorksheet("_Products");
  const ledSheet = workbook.getWorksheet("LED Cost Sheet");
  if (!productSheet || !ledSheet) {
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  const baseRateByProduct = new Map<string, number>();
  for (let row = 1; row <= productSheet.rowCount; row++) {
    const name = String(productSheet.getCell(row, 1).value ?? "").trim();
    if (!name) continue;

    const loadedRate = Number(productSheet.getCell(row, 4).value ?? 0);
    const baseRate = loadedRate > 0 ? round2(loadedRate / spareMultiplier) : 0;
    productSheet.getCell(row, 4).value = baseRate;
    baseRateByProduct.set(name, baseRate);
  }

  for (let row = 4; row <= ledSheet.rowCount; row++) {
    const label = String(ledSheet.getCell(row, 1).value ?? "").trim().toUpperCase();
    if (!label) continue;
    if (label.startsWith("TOTAL")) break;

    const productName = String(ledSheet.getCell(row, 6).value ?? "").trim();
    const sqft = Number(ledSheet.getCell(row, 13).value ?? 0);
    const currentRateCell = ledSheet.getCell(row, 16);
    const currentRate = Number(currentRateCell.value ?? 0);
    const baseRate = baseRateByProduct.get(productName);

    // TV/LCD rows store per-unit pricing here, not $/sqft.
    if (!baseRate || sqft <= 0 || !Number.isFinite(currentRate) || currentRate <= 0) continue;

    currentRateCell.value = {
      formula: `IFERROR(VLOOKUP(F${row},'_Products'!$A$1:$G$${productSheet.rowCount},4,FALSE),0)`,
      result: baseRate,
    };
  }

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
