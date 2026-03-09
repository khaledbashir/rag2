import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { randomUUID } from "crypto";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { log } from "@/lib/logger";

/**
 * POST /api/agent-skill/generate-excel
 *
 * Generates a multi-sheet margin analysis Excel workbook from project data.
 * Called by the AnythingLLM "generate-margin-analysis" agent skill.
 *
 * No auth required — this endpoint only generates a read-only file.
 *
 * Returns: { success, download_url, filename, summary }
 */

const EXPORT_DIR = "/tmp/anc-exports";

// Colors
const FRENCH_BLUE = "0A52EF";
const DARK_BG = "1A1A2E";
const GREEN = "27AE60";
const RED = "E74C3C";
const YELLOW = "F39C12";
const LIGHT_GRAY = "F5F5F5";
const WHITE = "FFFFFF";

function fmt(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function marginColor(pct: number): string {
  if (pct >= 35) return GREEN;
  if (pct >= 25) return YELLOW;
  return RED;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Accept raw JSON or nested project_data_json string
    let data = body;
    if (typeof body.project_data_json === "string") {
      data = JSON.parse(body.project_data_json);
    } else if (body.project_data_json) {
      data = body.project_data_json;
    }

    const projectName = data.project_name || "Untitled Project";
    const estimateType = data.estimate_type || "Budget Estimate";
    const currency = data.currency || "USD";
    const dateStr = data.date || new Date().toISOString().split("T")[0];

    if (!data.displays || !Array.isArray(data.displays) || data.displays.length === 0) {
      return NextResponse.json(
        { error: "At least one display is required in the 'displays' array" },
        { status: 400 }
      );
    }

    const wb = new ExcelJS.Workbook();
    wb.creator = "ANC Proposal Engine";
    wb.created = new Date();

    // ===== SHEET 1: EXECUTIVE SUMMARY =====
    const ws1 = wb.addWorksheet("Executive Summary", {
      properties: { tabColor: { argb: FRENCH_BLUE } },
    });

    ws1.columns = [
      { width: 38 },
      { width: 20 },
      { width: 20 },
      { width: 20 },
      { width: 15 },
    ];

    // Title
    ws1.mergeCells("A1:E1");
    const titleCell = ws1.getCell("A1");
    titleCell.value = "ANC — MARGIN ANALYSIS";
    titleCell.font = { name: "Work Sans", size: 18, bold: true, color: { argb: WHITE } };
    titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: FRENCH_BLUE } };
    titleCell.alignment = { horizontal: "center", vertical: "middle" };
    ws1.getRow(1).height = 45;

    // Project info
    ws1.mergeCells("A2:E2");
    const subCell = ws1.getCell("A2");
    subCell.value = `${projectName} — ${estimateType}`;
    subCell.font = { name: "Work Sans", size: 12, color: { argb: WHITE } };
    subCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: DARK_BG } };
    subCell.alignment = { horizontal: "center", vertical: "middle" };
    ws1.getRow(2).height = 30;

    // Date row
    ws1.mergeCells("A3:E3");
    ws1.getCell("A3").value = `Date: ${dateStr}  |  Currency: ${currency}  |  Type: ${estimateType}`;
    ws1.getCell("A3").font = { name: "Work Sans", size: 10, italic: true };
    ws1.getCell("A3").alignment = { horizontal: "center" };
    ws1.getRow(3).height = 25;

    ws1.getRow(4).height = 10;

    // Grand Total box
    const summaryHeaderRow = ws1.addRow(["GRAND TOTAL", "Cost", "Selling Price", "Margin $", "Margin %"]);
    summaryHeaderRow.eachCell((cell, colNum) => {
      if (colNum === 1) {
        cell.font = { name: "Work Sans", size: 14, bold: true, color: { argb: WHITE } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: FRENCH_BLUE } };
      } else {
        cell.font = { name: "Work Sans", size: 11, bold: true, color: { argb: WHITE } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: DARK_BG } };
      }
      cell.alignment = { horizontal: "center" };
    });

    const grandCost = data.grand_total_cost || 0;
    const grandSelling = data.grand_total_selling || 0;
    const grandMargin = data.grand_total_margin || 0;
    const grandMarginPct = data.grand_total_margin_pct || 0;

    const grandRow = ws1.addRow(["", grandCost, grandSelling, grandMargin, grandMarginPct / 100]);
    grandRow.getCell(2).numFmt = "$#,##0";
    grandRow.getCell(3).numFmt = "$#,##0";
    grandRow.getCell(4).numFmt = "$#,##0";
    grandRow.getCell(5).numFmt = "0.0%";
    grandRow.eachCell((cell, colNum) => {
      if (colNum > 1) {
        cell.font = { name: "Work Sans", size: 14, bold: true };
        cell.alignment = { horizontal: "center" };
        cell.border = { bottom: { style: "medium", color: { argb: FRENCH_BLUE } } };
      }
    });
    ws1.getRow(ws1.rowCount).height = 35;

    ws1.addRow([]);

    // Line items table
    const headerRow = ws1.addRow(["Line Item", "Cost", "Selling Price", "Margin $", "Margin %"]);
    headerRow.eachCell((cell) => {
      cell.font = { name: "Work Sans", size: 11, bold: true, color: { argb: WHITE } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: FRENCH_BLUE } };
      cell.alignment = { horizontal: "center" };
      cell.border = { bottom: { style: "thin" } };
    });

    // Add displays
    let rowIdx = 0;
    for (const d of data.displays) {
      const detailStr = d.details
        ? ` (${d.details.Dimensions || ""} ${d.details["Pixel Pitch"] || ""})`
        : "";
      const row = ws1.addRow([
        `${d.name || "Display"}${detailStr}`,
        d.cost || 0,
        d.selling_price || 0,
        d.margin_dollars || 0,
        (d.margin_pct || 0) / 100,
      ]);
      row.getCell(2).numFmt = "$#,##0";
      row.getCell(3).numFmt = "$#,##0";
      row.getCell(4).numFmt = "$#,##0";
      row.getCell(5).numFmt = "0%";
      row.eachCell((cell, colNum) => {
        cell.font = { name: "Work Sans", size: 10 };
        cell.alignment = { horizontal: colNum === 1 ? "left" : "center" };
        if (rowIdx % 2 === 0) {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: LIGHT_GRAY } };
        }
      });
      // Color margin
      const mc = row.getCell(5);
      mc.font = { name: "Work Sans", size: 10, bold: true, color: { argb: marginColor(d.margin_pct || 0) } };
      rowIdx++;
    }

    // Add services
    if (data.services && Array.isArray(data.services)) {
      for (const s of data.services) {
        const row = ws1.addRow([
          s.category || "Service",
          s.cost || 0,
          s.selling_price || 0,
          s.margin_dollars || 0,
          (s.margin_pct || 0) / 100,
        ]);
        row.getCell(2).numFmt = "$#,##0";
        row.getCell(3).numFmt = "$#,##0";
        row.getCell(4).numFmt = "$#,##0";
        row.getCell(5).numFmt = "0%";
        row.eachCell((cell, colNum) => {
          cell.font = { name: "Work Sans", size: 10 };
          cell.alignment = { horizontal: colNum === 1 ? "left" : "center" };
          if (rowIdx % 2 === 0) {
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: LIGHT_GRAY } };
          }
        });
        const mc = row.getCell(5);
        mc.font = { name: "Work Sans", size: 10, bold: true, color: { argb: marginColor(s.margin_pct || 0) } };
        rowIdx++;
      }
    }

    // Tax / Bond
    if (data.tax_amount && data.tax_amount > 0) {
      ws1.addRow([data.tax_label || "Tax", data.tax_amount, data.tax_amount, 0, 0]);
    }
    if (data.bond_amount && data.bond_amount > 0) {
      ws1.addRow([data.bond_label || "Bond", data.bond_amount, data.bond_amount, 0, 0]);
    }

    // Total row
    ws1.addRow([]);
    const totalRow = ws1.addRow(["TOTAL", grandCost, grandSelling, grandMargin, grandMarginPct / 100]);
    totalRow.getCell(2).numFmt = "$#,##0";
    totalRow.getCell(3).numFmt = "$#,##0";
    totalRow.getCell(4).numFmt = "$#,##0";
    totalRow.getCell(5).numFmt = "0.0%";
    totalRow.eachCell((cell) => {
      cell.font = { name: "Work Sans", size: 12, bold: true };
      cell.border = {
        top: { style: "double", color: { argb: FRENCH_BLUE } },
        bottom: { style: "double", color: { argb: FRENCH_BLUE } },
      };
    });

    // ===== SHEET 2: DISPLAY SPECS =====
    const ws2 = wb.addWorksheet("Display Specifications", {
      properties: { tabColor: { argb: GREEN } },
    });

    ws2.columns = [{ width: 35 }, { width: 25 }, { width: 20 }, { width: 20 }];

    ws2.mergeCells("A1:D1");
    ws2.getCell("A1").value = "DISPLAY SPECIFICATIONS";
    ws2.getCell("A1").font = { name: "Work Sans", size: 16, bold: true, color: { argb: WHITE } };
    ws2.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: GREEN } };
    ws2.getCell("A1").alignment = { horizontal: "center" };
    ws2.getRow(1).height = 40;
    ws2.addRow([]);

    for (const d of data.displays) {
      const specHeaderRow = ws2.addRow([d.name || "Display", "", "", ""]);
      specHeaderRow.getCell(1).font = { name: "Work Sans", size: 13, bold: true, color: { argb: WHITE } };
      specHeaderRow.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: FRENCH_BLUE } };
      ws2.mergeCells(`A${ws2.rowCount}:D${ws2.rowCount}`);

      if (d.details && typeof d.details === "object") {
        let si = 0;
        for (const [key, val] of Object.entries(d.details)) {
          const specRow = ws2.addRow([key, String(val)]);
          specRow.eachCell((cell) => {
            cell.font = { name: "Work Sans", size: 10 };
            if (si % 2 === 0) {
              cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: LIGHT_GRAY } };
            }
          });
          si++;
        }
      }

      // Cost summary for this display
      ws2.addRow([]);
      const costHeader = ws2.addRow(["", "Cost", "Selling", "Margin"]);
      costHeader.eachCell((cell, colNum) => {
        if (colNum > 1) {
          cell.font = { name: "Work Sans", size: 10, bold: true, color: { argb: WHITE } };
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: DARK_BG } };
          cell.alignment = { horizontal: "center" };
        }
      });
      const costDataRow = ws2.addRow(["", d.cost || 0, d.selling_price || 0, (d.margin_pct || 0) + "%"]);
      costDataRow.getCell(2).numFmt = "$#,##0";
      costDataRow.getCell(3).numFmt = "$#,##0";
      costDataRow.eachCell((cell, colNum) => {
        if (colNum > 1) {
          cell.font = { name: "Work Sans", size: 11, bold: true };
          cell.alignment = { horizontal: "center" };
        }
      });

      ws2.addRow([]);
    }

    // ===== SHEET 3: MARGIN WATERFALL =====
    const ws3 = wb.addWorksheet("Margin Waterfall", {
      properties: { tabColor: { argb: YELLOW } },
    });

    ws3.columns = [
      { width: 32 },
      { width: 18 },
      { width: 18 },
      { width: 15 },
      { width: 20 },
    ];

    ws3.mergeCells("A1:E1");
    ws3.getCell("A1").value = "MARGIN WATERFALL ANALYSIS";
    ws3.getCell("A1").font = { name: "Work Sans", size: 16, bold: true, color: { argb: WHITE } };
    ws3.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: YELLOW } };
    ws3.getCell("A1").alignment = { horizontal: "center" };
    ws3.getRow(1).height = 40;

    ws3.addRow([]);

    const mwHeaderRow = ws3.addRow(["Category", "Cost", "Selling Price", "Margin %", "Margin $"]);
    mwHeaderRow.eachCell((cell) => {
      cell.font = { name: "Work Sans", size: 11, bold: true, color: { argb: WHITE } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: DARK_BG } };
      cell.alignment = { horizontal: "center" };
    });
    mwHeaderRow.getCell(1).alignment = { horizontal: "left" };

    // All items combined
    const allItems = [
      ...data.displays.map((d: any) => ({
        cat: d.name || "Display",
        cost: d.cost || 0,
        sell: d.selling_price || 0,
        pct: d.margin_pct || 0,
        margin: d.margin_dollars || 0,
      })),
      ...(data.services || []).map((s: any) => ({
        cat: s.category || "Service",
        cost: s.cost || 0,
        sell: s.selling_price || 0,
        pct: s.margin_pct || 0,
        margin: s.margin_dollars || 0,
      })),
    ];

    allItems.forEach((m, i) => {
      const row = ws3.addRow([m.cat, m.cost, m.sell, m.pct / 100, m.margin]);
      row.getCell(2).numFmt = "$#,##0";
      row.getCell(3).numFmt = "$#,##0";
      row.getCell(4).numFmt = "0%";
      row.getCell(5).numFmt = "$#,##0";
      row.eachCell((cell, colNum) => {
        cell.font = { name: "Work Sans", size: 10 };
        cell.alignment = { horizontal: colNum === 1 ? "left" : "center" };
        if (i % 2 === 0) {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: LIGHT_GRAY } };
        }
      });

      // Color-code margin cell
      const pctCell = row.getCell(4);
      const bgColor = m.pct >= 35 ? "D5F5E3" : m.pct >= 25 ? "FEF9E7" : "FDEDEC";
      pctCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bgColor } };
      pctCell.font = { name: "Work Sans", size: 10, bold: true, color: { argb: marginColor(m.pct) } };
    });

    ws3.addRow([]);
    const totalMRow = ws3.addRow(["TOTAL", grandCost, grandSelling, grandMarginPct / 100, grandMargin]);
    totalMRow.getCell(2).numFmt = "$#,##0";
    totalMRow.getCell(3).numFmt = "$#,##0";
    totalMRow.getCell(4).numFmt = "0.0%";
    totalMRow.getCell(5).numFmt = "$#,##0";
    totalMRow.eachCell((cell) => {
      cell.font = { name: "Work Sans", size: 12, bold: true };
      cell.border = {
        top: { style: "double", color: { argb: FRENCH_BLUE } },
        bottom: { style: "double", color: { argb: FRENCH_BLUE } },
      };
    });

    // Key metrics
    ws3.addRow([]);
    ws3.addRow([]);
    const keyHeaderRow = ws3.addRow(["KEY METRICS", "", "", "", ""]);
    ws3.mergeCells(`A${ws3.rowCount}:E${ws3.rowCount}`);
    keyHeaderRow.getCell(1).font = { name: "Work Sans", size: 12, bold: true, color: { argb: WHITE } };
    keyHeaderRow.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: FRENCH_BLUE } };
    keyHeaderRow.getCell(1).alignment = { horizontal: "center" };

    const totalSqFt = data.displays.reduce((sum: number, d: any) => {
      const sqft = d.details?.["Sq Ft"] || d.details?.sqft || 0;
      return sum + Number(sqft);
    }, 0);

    ws3.addRow(["Blended Margin", `${grandMarginPct}%`]);
    ws3.addRow(["Total Profit", fmt(grandMargin)]);
    if (totalSqFt > 0) {
      ws3.addRow(["Cost per Sq Ft", fmt(Math.round(grandCost / totalSqFt))]);
      ws3.addRow(["Selling Price per Sq Ft", fmt(Math.round(grandSelling / totalSqFt))]);
    }

    // Print setup
    [ws1, ws2, ws3].forEach((ws) => {
      ws.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1 };
    });

    // Save file
    await mkdir(EXPORT_DIR, { recursive: true });
    const fileId = randomUUID();
    const safeName = projectName.replace(/[^a-zA-Z0-9_\-\s]/g, "").replace(/\s+/g, "_");
    const filename = `${safeName}_Margin_Analysis_${fileId.slice(0, 8)}.xlsx`;
    const filePath = path.join(EXPORT_DIR, filename);

    await wb.xlsx.writeFile(filePath);

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://basheer-therag2.prd42b.easypanel.host";
    const downloadUrl = `${baseUrl}/api/agent-skill/download-excel?file=${encodeURIComponent(filename)}`;

    log.info(`[AGENT-SKILL] Generated Excel: ${filename} for "${projectName}"`);

    return NextResponse.json(
      {
        success: true,
        download_url: downloadUrl,
        filename,
        summary: {
          project: projectName,
          displays: data.displays.length,
          total_cost: grandCost,
          total_selling: grandSelling,
          margin_pct: grandMarginPct,
          sheets: ["Executive Summary", "Display Specifications", "Margin Waterfall"],
        },
      },
      { status: 201 }
    );
  } catch (error) {
    log.error("[AGENT-SKILL] Generate Excel failed:", error);
    return NextResponse.json(
      {
        error: "Failed to generate Excel",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
