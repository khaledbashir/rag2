/**
 * POST /api/render/repeat-clients-xlsx
 *
 * Pure RENDERER. Takes pre-aggregated rows from the Twenty logic function and
 * returns Jireh's "Repeat Clients" Excel file. NO business logic — no querying
 * Twenty, no aggregation, no filtering. CRM is the system of record; this
 * endpoint just turns rows into an .xlsx that matches the template Jireh sent.
 *
 * Body:
 *   {
 *     rows:     [{ name, firstYear, lifetimeRevenue, lifetimeMargin, dealCount }],
 *     year:     2026,
 *     filename: "ANC - Technology Repeat Clients 2026.xlsx",
 *     returnUrl?: boolean    // if true, return JSON {url} instead of binary
 *   }
 */

import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";

export const runtime = "nodejs";
export const maxDuration = 60;

type Row = {
    name: string;
    firstYear: number | null;
    lifetimeRevenue: number;
    lifetimeMargin: number;
    dealCount: number;
};

async function buildWorkbook(rows: Row[], year: number): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(`${year} Clients`);
    ws.views = [{ showGridLines: false }];

    ws.getRow(3).height = 15.75;
    ws.getRow(4).height = 5.1;

    ws.getCell("C3").value = "Client";
    ws.getCell("D3").value = "Client First-Year of Engagement";
    ws.getCell("E3").value = "Lifetime Client Revenue ($)";
    ws.getCell("F3").value = "Lifetime Client Margin (%)";
    ws.getCell("G3").value = "Total WON Opportunities";
    for (const col of ["C", "D", "E", "F", "G"]) {
        const cell = ws.getCell(`${col}3`);
        cell.font = { bold: true, size: 10 };
        cell.alignment = { vertical: "middle", horizontal: "left" };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFBCD0FC" } };
    }

    rows.forEach((r, i) => {
        const rowIdx = 5 + i;
        ws.getCell(`C${rowIdx}`).value = r.name;
        ws.getCell(`D${rowIdx}`).value = r.firstYear ?? "";
        const revCell = ws.getCell(`E${rowIdx}`);
        revCell.value = r.lifetimeRevenue;
        revCell.numFmt = "$#,##0";
        const pctCell = ws.getCell(`F${rowIdx}`);
        pctCell.value = r.lifetimeRevenue > 0 ? r.lifetimeMargin / r.lifetimeRevenue : 0;
        pctCell.numFmt = "0.0%";
        ws.getCell(`G${rowIdx}`).value = r.dealCount;
    });

    ws.getColumn(1).width = 13;
    ws.getColumn(2).width = 13;
    ws.getColumn(3).width = 60.140625;
    ws.getColumn(4).width = 32.140625;
    ws.getColumn(5).width = 31.5703125;
    ws.getColumn(6).width = 13;
    ws.getColumn(7).width = 24;

    return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const rows = (body.rows || []) as Row[];
        const year = Number(body.year) || new Date().getFullYear();
        const filename = String(body.filename || `Repeat Clients ${year}.xlsx`);
        const returnUrl = !!body.returnUrl;

        const xlsx = await buildWorkbook(rows, year);

        if (returnUrl) {
            const dir = "/tmp/jireh-reports";
            mkdirSync(dir, { recursive: true });
            const id = randomUUID();
            const path = join(dir, `${id}.xlsx`);
            writeFileSync(path, xlsx);
            const url = `https://proposals.anc.com/api/render/repeat-clients-xlsx/${id}/${encodeURIComponent(filename)}`;
            return NextResponse.json({ url, id, filename, bytes: xlsx.length });
        }

        return new NextResponse(new Uint8Array(xlsx), {
            status: 200,
            headers: {
                "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                "Content-Disposition": `attachment; filename="${filename}"`,
                "Cache-Control": "no-cache",
            },
        });
    } catch (err: any) {
        return NextResponse.json({ error: err?.message || String(err) }, { status: 500 });
    }
}
