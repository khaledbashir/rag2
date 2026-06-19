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
import { scaleWorkbookByFx } from "@/services/pricing/scaleWorkbookByFx";
import { log } from "@/lib/logger";
import { logActivity } from "@/services/proposal/server/activityLogService";
import { universalCrmPush, saveCrmArtifact } from "@/services/integrations/twenty/crmAutomation";
import { augmentCoverPage } from "@/services/proposal/server/augmentCoverPage";

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
    const { workbook: wb } = await generateScopingWorkbook(options);

    // Apply user-entered USD→target exchange rate to every currency-formatted cell.
    const needsFxScale = typeof answers.exchangeRate === "number"
        && Number.isFinite(answers.exchangeRate)
        && answers.exchangeRate > 0
        && answers.exchangeRate !== 1;
    if (needsFxScale) {
      scaleWorkbookByFx(wb, answers.exchangeRate);
    }

    // Estimator-only: append Natalia's cover-page sections (Information Needed +
    // Warranty Options) to the Project Overview sheet. The RFP path never calls
    // this, so RFP output stays byte-identical.
    const a = answers as typeof answers & {
      venueName?: string; venueAddress?: string; paymentTerms?: string;
      substantialCompletionDate?: string; changeOrders?: string;
      laborWarranty?: string; eventSupport?: string; preSeasonChecks?: string;
    };
    const wYears = parseInt(a.warrantyYears, 10);
    augmentCoverPage(wb, {
      clientName: a.clientName,
      venueName: a.venueName || a.projectName,
      venueAddress: a.venueAddress || a.location,
      paymentTerms: a.paymentTerms,
      supplyOnly: a.servicesMargin === 0,
      substantialCompletionDate: a.substantialCompletionDate,
      changeOrders: a.changeOrders,
      partsWarranty: a.includeWarranty !== "none" && Number.isFinite(wYears) && wYears > 0
        ? `${wYears} year${wYears > 1 ? "s" : ""}`
        : undefined,
      laborWarranty: a.laborWarranty,
      eventSupport: a.eventSupport,
      preSeasonChecks: a.preSeasonChecks,
    });

    // Always re-serialize (we mutated the workbook).
    const buffer = (await wb.xlsx.writeBuffer()) as unknown as Buffer;

    const safeName = (answers.projectName || answers.clientName || "Budget")
      .replace(/\s+/g, "_")
      .replace(/[^\w\-_.]/g, "");
    const exportFilename = `${safeName}_Unified.xlsx`;

    // Log activity if projectId provided
    if (body.projectId) {
      logActivity(body.projectId, "excel_exported", "Exported Excel workbook", body.actorName || null);

      saveCrmArtifact({
        buffer,
        preferredFilename: exportFilename,
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      })
        .then((artifact) =>
          universalCrmPush({
            proposalId: body.projectId,
            actionType: "excel_uploaded",
            title: "Proposal Engine: latest scoping workbook",
            markdownText: "Latest scoping workbook exported from Proposal Engine.",
            artifacts: [
              {
                label: "Scoping workbook",
                url: artifact.downloadUrl,
                filename: artifact.filename,
              },
            ],
          }),
        )
        .catch((error) => log.warn("[export-unified] CRM artifact sync failed:", error?.message || error));
    }

    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${exportFilename}"`,
      },
    });
  } catch (err) {
    log.error("[export-unified] Error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
