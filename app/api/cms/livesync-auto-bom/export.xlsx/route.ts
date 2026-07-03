/**
 * POST /api/cms/livesync-auto-bom/export.xlsx
 *
 * Runs the LiveSync auto-BOM engine on the posted screen list and streams an
 * Excel workbook in the CMS_BASE_BOM column layout the integration team reads
 * (section headers, SKU / Cost / Quantity / Total Cost, section totals, grand
 * total), plus a "Selection Logic" tab with the full decision trail, per-line
 * rationale, and review flags.
 */
import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import ExcelJS from "exceljs";
import { requireAuth } from "@/lib/apiAuth";
import { log } from "@/lib/logger";
import {
  buildLivesyncAutoBom,
  type LivesyncJobInput,
  type LivesyncScreenInput,
} from "@/lib/cms/livesyncAutoBom";

const prisma = new PrismaClient();

const SECTIONS: Array<{ title: string; category: string }> = [
  { title: "Server Equipement", category: "SERVER_EQUIPMENT" },
  { title: "Server Addons", category: "SERVER_ADDON" },
  { title: "User Station", category: "USER_STATION" },
  { title: "Interconnect Hardware", category: "INTERCONNECT" },
  { title: "Trigger Hardware", category: "TRIGGER_HARDWARE" },
  { title: "Router Hardware", category: "ROUTER" },
  { title: "KVM Hardware", category: "KVM" },
  { title: "Rack Equipement", category: "RACK" },
  { title: "Integrations", category: "INTEGRATION" },
  { title: "LiveSync License", category: "LICENSE" },
];

export async function POST(request: NextRequest) {
  try {
    const [, authError] = await requireAuth();
    if (authError) return authError;

    const body = await request.json().catch(() => null);
    if (!body || !Array.isArray(body.screens) || body.screens.length === 0) {
      return NextResponse.json({ error: "Provide at least one screen." }, { status: 400 });
    }

    const screens: LivesyncScreenInput[] = (body.screens as Record<string, unknown>[])
      .filter((raw) => Number(raw.pixelWidth) > 0 && Number(raw.pixelHeight) > 0)
      .map((raw, i) => ({
        name: String(raw.name || `Screen ${i + 1}`),
        pixelWidth: Number(raw.pixelWidth),
        pixelHeight: Number(raw.pixelHeight),
        liveVideo: !!raw.liveVideo,
        outdoor: !!raw.outdoor,
        physicalWidthFt: Number(raw.physicalWidthFt) > 0 ? Number(raw.physicalWidthFt) : null,
      }));
    if (screens.length === 0) {
      return NextResponse.json({ error: "No valid screens." }, { status: 400 });
    }

    const job: LivesyncJobInput = {
      screens,
      sportsVenue: body.sportsVenue !== false,
      includeLicense: !!body.includeLicense,
    };
    const jobName = String(body.jobName || "Control System Estimate");

    const catalogItems = await prisma.cmsCatalogItem.findMany({ orderBy: { sortOrder: "asc" } });
    const catalog = catalogItems.map((item) => ({
      sku: item.sku,
      displayName: item.displayName,
      category: item.category as string,
      unitCost: Number(item.unitCost),
      unitPrice: item.unitPrice == null ? null : Number(item.unitPrice),
      isActive: item.isActive,
    }));
    const result = buildLivesyncAutoBom(job, catalog);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "ANC Proposal Engine";
    workbook.created = new Date();

    // ─── Tab 1: BOM in the CMS_BASE_BOM layout ───
    const sheet = workbook.addWorksheet("Livesync CMS BOM");
    sheet.getRow(2).getCell(2).value = jobName;
    sheet.getRow(2).getCell(2).font = { bold: true, size: 14 };
    sheet.getRow(3).getCell(2).value = job.screens
      .map((s) => `${s.name} ${s.pixelWidth}x${s.pixelHeight}${s.liveVideo ? " (live video)" : ""}${s.outdoor ? " (outdoor)" : ""}`)
      .join(" · ");

    let row = 5;
    let grandTotal = 0;
    for (const section of SECTIONS) {
      const items = result.lines.filter((l) => l.category === section.category);
      if (items.length === 0) continue;

      const headerRow = sheet.getRow(row);
      headerRow.getCell(2).value = section.title;
      headerRow.getCell(3).value = "SKU";
      headerRow.getCell(4).value = "Cost";
      headerRow.getCell(5).value = "Quantity";
      headerRow.getCell(6).value = "Total Cost";
      headerRow.getCell(7).value = "Selection Rationale";
      headerRow.font = { bold: true };
      headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9E1F2" } };
      row++;

      let sectionTotal = 0;
      for (const line of items) {
        const r = sheet.getRow(row);
        r.getCell(2).value = line.displayName;
        r.getCell(3).value = line.sku;
        r.getCell(4).value = line.unitPrice;
        r.getCell(5).value = line.quantity;
        r.getCell(6).value = line.lineTotal;
        r.getCell(7).value = line.rationale + (line.flags.length ? ` [REVIEW: ${line.flags.join(" | ")}]` : "");
        r.getCell(4).numFmt = '"$"#,##0.00';
        r.getCell(6).numFmt = '"$"#,##0.00';
        sectionTotal += line.lineTotal;
        row++;
      }
      const totalRow = sheet.getRow(row);
      totalRow.getCell(2).value = "Total";
      totalRow.getCell(6).value = sectionTotal;
      totalRow.getCell(6).numFmt = '"$"#,##0.00';
      totalRow.font = { bold: true };
      grandTotal += sectionTotal;
      row += 2;
    }
    sheet.getRow(row).getCell(2).value = "TOTAL";
    sheet.getRow(row).getCell(4).value = "USD:";
    sheet.getRow(row).getCell(6).value = grandTotal;
    sheet.getRow(row).getCell(6).numFmt = '"$"#,##0.00';
    sheet.getRow(row).font = { bold: true, size: 12 };

    sheet.getColumn(2).width = 42;
    sheet.getColumn(3).width = 26;
    sheet.getColumn(4).width = 12;
    sheet.getColumn(5).width = 10;
    sheet.getColumn(6).width = 14;
    sheet.getColumn(7).width = 90;

    // ─── Tab 2: Selection logic ───
    const logic = workbook.addWorksheet("Selection Logic");
    logic.getRow(2).getCell(2).value = `${jobName} — how the system selected this package`;
    logic.getRow(2).getCell(2).font = { bold: true, size: 14 };

    let lRow = 4;
    logic.getRow(lRow).getCell(2).value = "Step";
    logic.getRow(lRow).getCell(3).value = "Decision";
    logic.getRow(lRow).font = { bold: true };
    logic.getRow(lRow).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9E1F2" } };
    lRow++;
    for (const step of result.reasoning) {
      logic.getRow(lRow).getCell(2).value = step.phase;
      logic.getRow(lRow).getCell(3).value = step.text;
      logic.getRow(lRow).getCell(3).alignment = { wrapText: true, vertical: "top" };
      lRow++;
    }
    lRow += 1;
    logic.getRow(lRow).getCell(2).value = "Needs human review";
    logic.getRow(lRow).font = { bold: true };
    logic.getRow(lRow).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFE59A" } };
    lRow++;
    for (const flag of result.reviewFlags) {
      logic.getRow(lRow).getCell(3).value = flag;
      logic.getRow(lRow).getCell(3).alignment = { wrapText: true, vertical: "top" };
      lRow++;
    }
    logic.getColumn(2).width = 26;
    logic.getColumn(3).width = 120;

    const buffer = await workbook.xlsx.writeBuffer();
    const fileName = `Control_System_BOM_${jobName.replace(/[^A-Za-z0-9]+/g, "_")}.xlsx`;
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  } catch (error) {
    log.error("[livesync-auto-bom/export.xlsx] error:", error);
    return NextResponse.json({ error: "Failed to generate export" }, { status: 500 });
  }
}
