/**
 * GET /api/cms/project/[id]/bom/export.xlsx
 *
 * Generates a BOM Excel file matching the column layout of Natalia's
 * CMS_BASE_BOM (1).xlsx — two tabs (Livesync CMS Laptop + Livesync License)
 * with category sections, totals, and the same column order the integration
 * team already reads.
 */
import { NextRequest, NextResponse } from "next/server";
import { PrismaClient, CmsCategory } from "@prisma/client";
import ExcelJS from "exceljs";
import { requireAuth } from "@/lib/apiAuth";
import { log } from "@/lib/logger";

const prisma = new PrismaClient();

const HARDWARE_SECTIONS: Array<{ title: string; category: CmsCategory }> = [
  { title: "Server Equipement", category: "SERVER_EQUIPMENT" },
  { title: "Server Addons", category: "SERVER_ADDON" },
  { title: "User Station", category: "USER_STATION" },
  { title: "Interconnect Hardware", category: "INTERCONNECT" },
  { title: "Trigger Hardware", category: "TRIGGER_HARDWARE" },
  { title: "Scaler", category: "SCALER" },
  { title: "Router Hardware", category: "ROUTER" },
  { title: "KVM Hardware", category: "KVM" },
  { title: "Broardcast DA Equipement", category: "BROADCAST_DA" },
  { title: "Rack Equipement", category: "RACK" },
  { title: "Training", category: "TRAINING" },
  { title: "Integrations", category: "INTEGRATION" },
  { title: "Shipping", category: "SHIPPING" },
];

const LICENSE_SECTIONS: Array<{ title: string; category: CmsCategory }> = [
  { title: "LiveSync License", category: "LICENSE" },
  { title: "Software Support", category: "SUPPORT_TIER" },
];

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const [, authError] = await requireAuth();
    if (authError) return authError;
    const { id: proposalId } = await params;

    const proposal = await prisma.proposal.findUnique({
      where: { id: proposalId },
      select: { id: true, clientName: true, venue: true },
    });
    if (!proposal) return NextResponse.json({ error: "Proposal not found" }, { status: 404 });

    const bom = await prisma.cmsProjectBom.findUnique({
      where: { proposalId },
      include: { lineItems: { include: { catalogItem: true } } },
    });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "ANC Proposal Engine";
    workbook.created = new Date();

    // ─── Tab 1: Hardware ───
    const hwSheet = workbook.addWorksheet("Livesync CMS Laptop");
    hwSheet.getRow(2).getCell(2).value = `${proposal.clientName ?? "Project"} — ${proposal.venue ?? ""}`.trim();
    hwSheet.getRow(2).getCell(2).font = { bold: true, size: 14 };

    let row = 10;
    let hardwareGrandTotal = 0;
    for (const section of HARDWARE_SECTIONS) {
      const items = (bom?.lineItems ?? [])
        .filter((li) => li.catalogItem.category === section.category && Number(li.quantity) > 0)
        .sort((a, b) => a.catalogItem.sortOrder - b.catalogItem.sortOrder);

      // Section header
      const headerRow = hwSheet.getRow(row);
      headerRow.getCell(2).value = section.title;
      headerRow.getCell(3).value = "SKU";
      headerRow.getCell(4).value = "Cost";
      headerRow.getCell(5).value = "Quantity";
      headerRow.getCell(6).value = "Total Cost";
      headerRow.getCell(7).value = "Customer Notes";
      headerRow.getCell(9).value = "Heat Load BTU";
      headerRow.getCell(10).value = "Max Watt";
      headerRow.getCell(11).value = "Internal Notes";
      headerRow.font = { bold: true };
      headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9E1F2" } };
      row++;

      let sectionTotal = 0;
      for (const li of items) {
        const qty = Number(li.quantity);
        const unit = Number(li.unitPriceSnapshot ?? li.unitCostSnapshot);
        const total = qty * unit;
        sectionTotal += total;
        const r = hwSheet.getRow(row);
        r.getCell(2).value = li.catalogItem.displayName;
        r.getCell(3).value = li.catalogItem.sku;
        r.getCell(4).value = unit;
        r.getCell(5).value = qty;
        r.getCell(6).value = total;
        r.getCell(7).value = li.catalogItem.customerNotes ?? "";
        r.getCell(9).value = li.catalogItem.heatLoadBtu != null ? Number(li.catalogItem.heatLoadBtu) * qty : "";
        r.getCell(10).value = li.catalogItem.maxWatt ?? "";
        r.getCell(11).value = li.catalogItem.internalNotes ?? "";
        r.getCell(4).numFmt = '"$"#,##0.00';
        r.getCell(6).numFmt = '"$"#,##0.00';
        row++;
      }

      // Section total
      const totalRow = hwSheet.getRow(row);
      totalRow.getCell(2).value = "Total";
      totalRow.getCell(6).value = sectionTotal;
      totalRow.getCell(6).numFmt = '"$"#,##0.00';
      totalRow.font = { bold: true };
      hardwareGrandTotal += sectionTotal;
      row += 2;
    }

    // Grand total
    hwSheet.getRow(row).getCell(2).value = "TOTAL";
    hwSheet.getRow(row).getCell(4).value = "USD:";
    hwSheet.getRow(row).getCell(6).value = hardwareGrandTotal;
    hwSheet.getRow(row).getCell(6).numFmt = '"$"#,##0.00';
    hwSheet.getRow(row).font = { bold: true, size: 12 };

    hwSheet.getColumn(2).width = 42;
    hwSheet.getColumn(3).width = 28;
    hwSheet.getColumn(4).width = 12;
    hwSheet.getColumn(5).width = 10;
    hwSheet.getColumn(6).width = 14;
    hwSheet.getColumn(7).width = 30;
    hwSheet.getColumn(9).width = 16;
    hwSheet.getColumn(10).width = 12;
    hwSheet.getColumn(11).width = 36;

    // ─── Tab 2: License ───
    const lcSheet = workbook.addWorksheet("Livesync License");
    lcSheet.getRow(2).getCell(2).value = `${proposal.clientName ?? "Project"} — ${proposal.venue ?? ""}`.trim();
    lcSheet.getRow(2).getCell(2).font = { bold: true, size: 14 };

    let lcRow = 10;
    let licenseGrandTotal = 0;
    for (const section of LICENSE_SECTIONS) {
      const items = (bom?.lineItems ?? [])
        .filter((li) => li.catalogItem.category === section.category && Number(li.quantity) > 0)
        .sort((a, b) => a.catalogItem.sortOrder - b.catalogItem.sortOrder);

      const headerRow = lcSheet.getRow(lcRow);
      headerRow.getCell(2).value = section.title;
      headerRow.getCell(3).value = "Cost";
      headerRow.getCell(4).value = "Quantity";
      headerRow.getCell(5).value = "Total Cost";
      headerRow.font = { bold: true };
      headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9E1F2" } };
      lcRow++;

      let sectionTotal = 0;
      for (const li of items) {
        const qty = Number(li.quantity);
        const unit = Number(li.unitPriceSnapshot ?? li.unitCostSnapshot);
        const total = qty * unit;
        sectionTotal += total;
        const r = lcSheet.getRow(lcRow);
        r.getCell(2).value = li.catalogItem.displayName;
        r.getCell(3).value = unit;
        r.getCell(4).value = qty;
        r.getCell(5).value = total;
        r.getCell(3).numFmt = '"$"#,##0.00';
        r.getCell(5).numFmt = '"$"#,##0.00';
        lcRow++;
      }
      const totalRow = lcSheet.getRow(lcRow);
      totalRow.getCell(2).value = `${section.title} Total`;
      totalRow.getCell(5).value = sectionTotal;
      totalRow.getCell(5).numFmt = '"$"#,##0.00';
      totalRow.font = { bold: true };
      licenseGrandTotal += sectionTotal;
      lcRow += 2;
    }
    lcSheet.getRow(lcRow).getCell(2).value = "SUB TOTAL";
    lcSheet.getRow(lcRow).getCell(3).value = "USD:";
    lcSheet.getRow(lcRow).getCell(5).value = licenseGrandTotal;
    lcSheet.getRow(lcRow).getCell(5).numFmt = '"$"#,##0.00';
    lcSheet.getRow(lcRow).font = { bold: true, size: 12 };

    lcSheet.getColumn(2).width = 42;
    lcSheet.getColumn(3).width = 14;
    lcSheet.getColumn(4).width = 10;
    lcSheet.getColumn(5).width = 14;

    const buffer = await workbook.xlsx.writeBuffer();
    const fileName = `CMS_BOM_${(proposal.clientName ?? "project").replace(/\s+/g, "_")}.xlsx`;

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  } catch (error) {
    log.error("[cms/bom/export.xlsx] error:", error);
    return NextResponse.json({ error: "Failed to generate BOM export" }, { status: 500 });
  }
}
