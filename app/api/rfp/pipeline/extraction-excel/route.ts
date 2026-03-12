/**
 * POST /api/rfp/pipeline/extraction-excel
 *
 * Generates a branded .xlsx workbook with extracted LED specs + requirements.
 * Replaces the old TSV export with a proper Excel download.
 *
 * Body: { analysisId: string }
 * Returns: .xlsx file
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import ExcelJS from "exceljs";
import type {
  ExtractedLEDSpec,
  ExtractedProjectInfo,
  ExtractedRequirement,
} from "@/services/rfp/unified/types";
import { buildProjectSummary, type ProjectSummaryInfo } from "@/services/proposal/server/exportMirrorUglySheetExcel";
import { generateRateCardExcel } from "@/services/rfp/pipeline/generateRateCardExcel";
import { log } from "@/lib/logger";

// ─── Colors ──────────────────────────────────────────────────────────────────

const COLORS = {
  ANC_BLUE: "FF0A52EF",
  DARK_HEADER: "FF1F2937",
  WHITE: "FFFFFFFF",
  LIGHT_GRAY: "FFF8F9FA",
  MEDIUM_GRAY: "FFDEE2E6",
  EMERALD: "FF10B981",
  AMBER: "FFF59E0B",
  AMBER_BG: "FFFFF8E1",
  RED: "FFEF4444",
};

// ─── Styling helpers ─────────────────────────────────────────────────────────

function styleHeaderCell(cell: ExcelJS.Cell, bgColor: string = COLORS.DARK_HEADER): void {
  cell.font = { bold: true, color: { argb: COLORS.WHITE }, size: 11, name: "Calibri" };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bgColor } };
  cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  cell.border = { bottom: { style: "thin", color: { argb: "FF999999" } } };
}

function stripeRow(row: ExcelJS.Row, colCount: number, isEven: boolean): void {
  if (isEven) {
    for (let i = 1; i <= colCount; i++) {
      row.getCell(i).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: COLORS.LIGHT_GRAY },
      };
    }
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const { analysisId } = await request.json();
    if (!analysisId) {
      return NextResponse.json({ error: "analysisId is required" }, { status: 400 });
    }

    const analysis = await prisma.rfpAnalysis.findUnique({ where: { id: analysisId } });
    if (!analysis) {
      return NextResponse.json({ error: "Analysis not found" }, { status: 404 });
    }

    const specs = (analysis.screens as unknown as ExtractedLEDSpec[]) || [];
    const project = (analysis.project as unknown as ExtractedProjectInfo) || {};
    const requirements = (analysis.requirements as unknown as ExtractedRequirement[]) || [];
    const projectName = project.projectName || project.venue || "RFP Analysis";

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "ANC Proposal Engine";
    workbook.created = new Date();

    // ━━━ SHEET 0: Project Summary (first tab) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    const summarySheet = workbook.addWorksheet("Project Summary", {
      properties: { tabColor: { argb: COLORS.DARK_HEADER } },
    });
    const summaryInfo: ProjectSummaryInfo = {
      projectName,
      clientName: project.clientName ?? undefined,
      createdAt: new Date(analysis.createdAt).toLocaleDateString(),
      updatedAt: new Date(analysis.updatedAt || analysis.createdAt).toLocaleDateString(),
      documentMode: "RFP_ANALYSIS",
      displayCount: specs.length,
    };
    buildProjectSummary(summarySheet, summaryInfo);

    // ━━━ SHEET 1: LED Displays ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    const displaySheet = workbook.addWorksheet("LED Displays", {
      properties: { tabColor: { argb: COLORS.ANC_BLUE } },
    });

    // Title
    displaySheet.mergeCells("A1:N1");
    const titleCell = displaySheet.getCell("A1");
    titleCell.value = `LED DISPLAY SPECIFICATIONS — ${projectName.toUpperCase()}`;
    titleCell.font = { size: 14, bold: true, color: { argb: COLORS.WHITE }, name: "Calibri" };
    titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.ANC_BLUE } };
    titleCell.alignment = { horizontal: "center", vertical: "middle" };
    displaySheet.getRow(1).height = 32;

    // Meta
    const metaParts: string[] = [];
    if (project.clientName) metaParts.push(`Client: ${project.clientName}`);
    if (project.venue) metaParts.push(`Venue: ${project.venue}`);
    if (project.location) metaParts.push(`Location: ${project.location}`);
    if (metaParts.length > 0) {
      displaySheet.mergeCells("A2:N2");
      const metaCell = displaySheet.getCell("A2");
      metaCell.value = metaParts.join("  |  ");
      metaCell.font = { size: 10, italic: true, color: { argb: "FF666666" }, name: "Calibri" };
      metaCell.alignment = { horizontal: "center" };
    }

    // Column widths
    const displayCols = [4, 28, 22, 10, 10, 12, 12, 10, 8, 12, 14, 24, 12, 10];
    displayCols.forEach((w, i) => { displaySheet.getColumn(i + 1).width = w; });

    // Headers
    const headerRow = 4;
    const headers = ["#", "Display Name", "Location", "Width (ft)", "Height (ft)", "Pitch (mm)", "Nits", "Env", "Qty", "Service", "Mounting", "Special Requirements", "Type", "Alt ID"];
    const hr = displaySheet.getRow(headerRow);
    headers.forEach((h, i) => {
      hr.getCell(i + 1).value = h;
      styleHeaderCell(hr.getCell(i + 1), COLORS.ANC_BLUE);
    });
    hr.height = 28;

    // Data rows
    specs.forEach((s, idx) => {
      const r = displaySheet.getRow(headerRow + 1 + idx);
      r.getCell(1).value = idx + 1;
      r.getCell(2).value = s.name;
      r.getCell(3).value = s.location;
      r.getCell(4).value = s.widthFt != null ? s.widthFt : "TBD";
      r.getCell(5).value = s.heightFt != null ? s.heightFt : "TBD";
      r.getCell(6).value = s.pixelPitchMm != null ? s.pixelPitchMm : "TBD";
      r.getCell(7).value = s.brightnessNits != null ? s.brightnessNits : "TBD";
      r.getCell(8).value = s.environment;
      r.getCell(9).value = s.quantity;
      r.getCell(10).value = s.serviceType ?? "";
      r.getCell(11).value = s.mountingType ?? "";
      r.getCell(12).value = (s.specialRequirements || []).join(", ");
      r.getCell(13).value = s.isAlternate ? "Alternate" : "Base Bid";
      r.getCell(14).value = s.alternateId || "";

      r.font = { size: 10, name: "Calibri" };
      r.getCell(1).alignment = { horizontal: "center" };
      r.getCell(4).alignment = { horizontal: "right" };
      r.getCell(5).alignment = { horizontal: "right" };
      r.getCell(6).alignment = { horizontal: "right" };
      r.getCell(7).alignment = { horizontal: "right" };
      r.getCell(9).alignment = { horizontal: "center" };
      r.getCell(13).alignment = { horizontal: "center" };
      r.getCell(14).alignment = { horizontal: "center" };

      if (s.isAlternate) {
        // Amber background for alternate rows
        for (let i = 1; i <= displayCols.length; i++) {
          r.getCell(i).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.AMBER_BG } };
        }
      } else {
        stripeRow(r, displayCols.length, idx % 2 === 0);
      }
    });

    // ━━━ SHEET 2: Requirements ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    if (requirements.length > 0) {
      const reqSheet = workbook.addWorksheet("Requirements", {
        properties: { tabColor: { argb: COLORS.EMERALD } },
      });

      // Title
      reqSheet.mergeCells("A1:F1");
      const reqTitle = reqSheet.getCell("A1");
      reqTitle.value = `REQUIREMENTS & KEY POINTS — ${projectName.toUpperCase()}`;
      reqTitle.font = { size: 14, bold: true, color: { argb: COLORS.WHITE }, name: "Calibri" };
      reqTitle.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.EMERALD } };
      reqTitle.alignment = { horizontal: "center", vertical: "middle" };
      reqSheet.getRow(1).height = 32;

      const reqCols = [4, 40, 14, 10, 12, 50];
      reqCols.forEach((w, i) => { reqSheet.getColumn(i + 1).width = w; });

      const reqHeaders = ["#", "Description", "Category", "Status", "Date", "Raw Text"];
      const rhr = reqSheet.getRow(3);
      reqHeaders.forEach((h, i) => {
        rhr.getCell(i + 1).value = h;
        styleHeaderCell(rhr.getCell(i + 1), COLORS.EMERALD);
      });
      rhr.height = 28;

      // Status color map
      const statusColors: Record<string, string> = {
        critical: COLORS.RED,
        risk: COLORS.AMBER,
        verified: COLORS.EMERALD,
      };

      requirements.forEach((req, idx) => {
        const r = reqSheet.getRow(4 + idx);
        r.getCell(1).value = idx + 1;
        r.getCell(2).value = req.description;
        r.getCell(3).value = req.category;
        r.getCell(4).value = req.status;
        r.getCell(5).value = req.date ?? "";
        r.getCell(6).value = req.rawText ?? "";

        r.font = { size: 10, name: "Calibri" };
        r.getCell(1).alignment = { horizontal: "center" };
        r.getCell(2).alignment = { wrapText: true };
        r.getCell(6).alignment = { wrapText: true };

        // Color-code status cell
        const color = statusColors[req.status];
        if (color) {
          r.getCell(4).font = { size: 10, bold: true, color: { argb: color }, name: "Calibri" };
        }

        stripeRow(r, reqCols.length, idx % 2 === 0);
      });
    }

    // ━━━ SHEET 3: Project Info ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    const infoSheet = workbook.addWorksheet("Project Info", {
      properties: { tabColor: { argb: COLORS.MEDIUM_GRAY } },
    });

    infoSheet.getColumn(1).width = 24;
    infoSheet.getColumn(2).width = 50;

    // Title
    infoSheet.mergeCells("A1:B1");
    const infoTitle = infoSheet.getCell("A1");
    infoTitle.value = "PROJECT INFORMATION";
    infoTitle.font = { size: 14, bold: true, color: { argb: COLORS.WHITE }, name: "Calibri" };
    infoTitle.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.DARK_HEADER } };
    infoTitle.alignment = { horizontal: "center", vertical: "middle" };
    infoSheet.getRow(1).height = 32;

    const infoRows: [string, string | boolean | null][] = [
      ["Project Name", project.projectName],
      ["Client", project.clientName],
      ["Venue", project.venue],
      ["Location", project.location],
      ["Environment", project.isOutdoor ? "Outdoor" : "Indoor"],
      ["Union Labor", project.isUnionLabor ? "Yes" : "No"],
      ["Bond Required", project.bondRequired ? "Yes" : "No"],
      ["LED Displays Found", `${specs.length} (${specs.filter(s => !s.isAlternate).length} base bid, ${specs.filter(s => s.isAlternate).length} alternates)`],
      ["Requirements Found", `${requirements.length}`],
      ["Total Pages Analyzed", `${analysis.pageCount || "N/A"}`],
      ["Relevant Pages", `${analysis.relevantPages || "N/A"}`],
      ["Processing Time", `${analysis.processingTimeMs ? (analysis.processingTimeMs / 1000).toFixed(1) + "s" : "N/A"}`],
      ["Analysis Date", new Date(analysis.createdAt).toLocaleDateString()],
    ];

    if ((project.specialRequirements || []).length > 0) {
      infoRows.push(["Special Requirements", project.specialRequirements.join(", ")]);
    }

    infoRows.forEach(([label, value], idx) => {
      const r = infoSheet.getRow(3 + idx);
      r.getCell(1).value = label;
      r.getCell(1).font = { bold: true, size: 10, name: "Calibri" };
      r.getCell(2).value = value != null ? String(value) : "—";
      r.getCell(2).font = { size: 10, name: "Calibri" };
      stripeRow(r, 2, idx % 2 === 0);
    });

    // ━━━ SHEET 4: Margin Analysis ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    let pricedDisplays: any[] = [];
    try {
      const rateCardResult = await generateRateCardExcel({
        project,
        specs,
        quotes: [],
        zoneClass: "standard",
        installComplexity: "standard",
        includeBond: false,
        currency: "USD",
      });
      pricedDisplays = rateCardResult.pricedDisplays || [];
    } catch {
      // If rate card fails, skip MA sheet
    }

    if (pricedDisplays.length > 0) {
      const maSheet = workbook.addWorksheet("Margin Analysis", {
        properties: { tabColor: { argb: "FF217346" } },
      });

      // Title
      maSheet.mergeCells("A1:F1");
      const maTitle = maSheet.getCell("A1");
      maTitle.value = `MARGIN ANALYSIS — ${projectName.toUpperCase()}`;
      maTitle.font = { size: 14, bold: true, color: { argb: COLORS.WHITE }, name: "Calibri" };
      maTitle.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF217346" } };
      maTitle.alignment = { horizontal: "center", vertical: "middle" };
      maSheet.getRow(1).height = 32;

      // Column widths
      const maCols = [4, 40, 16, 16, 16, 12];
      maCols.forEach((w, i) => { maSheet.getColumn(i + 1).width = w; });

      // Headers
      const maHeaders = ["#", "Line Item", "Cost", "Selling Price", "Margin $", "Margin %"];
      const mahr = maSheet.getRow(3);
      maHeaders.forEach((h, i) => {
        mahr.getCell(i + 1).value = h;
        styleHeaderCell(mahr.getCell(i + 1), "FF217346");
      });
      mahr.height = 28;

      // Data rows
      let totalCost = 0;
      let totalSelling = 0;
      pricedDisplays.forEach((d: any, idx: number) => {
        const r = maSheet.getRow(4 + idx);
        const cost = d.totalCost || 0;
        const selling = d.totalSellingPrice || 0;
        const marginDollar = d.marginDollars ?? (selling - cost);
        const marginPct = d.blendedMarginPct ?? (selling > 0 ? (selling - cost) / selling : 0);

        r.getCell(1).value = idx + 1;
        r.getCell(2).value = d.spec?.name || `Display ${idx + 1}`;
        r.getCell(2).font = { bold: true, size: 10, name: "Calibri" };
        r.getCell(3).value = cost;
        r.getCell(3).numFmt = "$#,##0";
        r.getCell(4).value = selling;
        r.getCell(4).numFmt = "$#,##0";
        r.getCell(5).value = marginDollar;
        r.getCell(5).numFmt = "$#,##0";
        r.getCell(6).value = marginPct;
        r.getCell(6).numFmt = "0.0%";

        r.font = { size: 10, name: "Calibri" };
        r.getCell(1).alignment = { horizontal: "center" };
        r.getCell(3).alignment = { horizontal: "right" };
        r.getCell(4).alignment = { horizontal: "right" };
        r.getCell(5).alignment = { horizontal: "right" };
        r.getCell(6).alignment = { horizontal: "center" };

        totalCost += cost;
        totalSelling += selling;

        stripeRow(r, maCols.length, idx % 2 === 0);
      });

      // Total row
      const totalRow = maSheet.getRow(4 + pricedDisplays.length + 1);
      totalRow.getCell(2).value = "TOTAL";
      totalRow.getCell(2).font = { bold: true, size: 11, name: "Calibri" };
      totalRow.getCell(3).value = totalCost;
      totalRow.getCell(3).numFmt = "$#,##0";
      totalRow.getCell(3).font = { bold: true, size: 11, name: "Calibri" };
      totalRow.getCell(4).value = totalSelling;
      totalRow.getCell(4).numFmt = "$#,##0";
      totalRow.getCell(4).font = { bold: true, size: 11, name: "Calibri" };
      totalRow.getCell(5).value = totalSelling - totalCost;
      totalRow.getCell(5).numFmt = "$#,##0";
      totalRow.getCell(5).font = { bold: true, size: 11, name: "Calibri" };
      totalRow.getCell(6).value = totalSelling > 0 ? (totalSelling - totalCost) / totalSelling : 0;
      totalRow.getCell(6).numFmt = "0.0%";
      totalRow.getCell(6).font = { bold: true, size: 11, name: "Calibri" };

      // Bold border on total row
      for (let i = 1; i <= maCols.length; i++) {
        totalRow.getCell(i).border = { top: { style: "double", color: { argb: "FF217346" } } };
      }
    }

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();

    const filename = `${projectName.replace(/\s+/g, "_")}_Extraction_${new Date().toISOString().slice(0, 10)}.xlsx`;

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err: any) {
    log.error("[extraction-excel] Error:", err);
    return NextResponse.json({ error: err.message || "Failed to generate Excel" }, { status: 500 });
  }
}
