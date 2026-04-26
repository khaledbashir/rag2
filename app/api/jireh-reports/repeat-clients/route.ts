/**
 * GET /api/jireh-reports/repeat-clients
 *
 * Generates Jireh's "Repeat Clients" Excel: top N clients in a vertical with
 * Lifetime Revenue + Lifetime Margin % + First-Year of Engagement, ranked by
 * lifetime revenue. Mirrors the format of the file Jireh sent on 2026-04-26.
 *
 * Query params:
 *   vertical   TECHNOLOGY | VENUE_SERVICES | MEDIA_SPONSORSHIP   (default: TECHNOLOGY)
 *   top        number of rows to keep                            (default: 10, max: 50)
 *
 * Public to Scout/AI but NOT to the open internet — guarded by a header.
 * Returns: Excel binary (application/vnd.openxmlformats-officedocument.spreadsheetml.sheet)
 */

import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";

export const runtime = "nodejs";
export const maxDuration = 90;

const TWENTY_BASE = "https://abc-twenty.izcgmb.easypanel.host";
const TWENTY_TOKEN = process.env.TWENTY_API_KEY ||
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkM2ZiYzI5YS1hNjM1LTQ4YjctOWQ2ZS0yNTA5NDE2NzdmZDAiLCJ0eXBlIjoiQVBJX0tFWSIsIndvcmtzcGFjZUlkIjoiZDNmYmMyOWEtYTYzNS00OGI3LTlkNmUtMjUwOTQxNjc3ZmQwIiwiaWF0IjoxNzc0ODEwNDkyLCJleHAiOjQ5Mjg0MTA0ODcsImp0aSI6IjYxMGEzMWEzLTJhMDgtNDM5MC1iMTU1LTFkN2M3NzY5Y2QxOSJ9.nzknS-bBNuf7y3LUCv2xEa5-9xuJNHBK3GalJwWK3eA";

type Vertical = "TECHNOLOGY" | "VENUE_SERVICES" | "MEDIA_SPONSORSHIP";

type CompanyAgg = {
    id: string;
    name: string;
    dealCount: number;
    lifetimeRevenue: number;   // dollars
    lifetimeMargin: number;    // dollars
    firstYear: number | null;
};

async function gql<T = any>(query: string, variables?: Record<string, unknown>): Promise<T> {
    const res = await fetch(`${TWENTY_BASE}/graphql`, {
        method: "POST",
        headers: { Authorization: `Bearer ${TWENTY_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ query, variables }),
    });
    const body = await res.json();
    if (body.errors?.length) throw new Error(body.errors.map((e: any) => e.message).join("; "));
    return body.data;
}

async function pageCompanies(vertical: Vertical): Promise<Array<{ id: string; name: string }>> {
    const out: Array<{ id: string; name: string }> = [];
    let cursor: string | null = null;
    while (true) {
        const data: any = await gql(
            `query Q($filter: CompanyFilterInput, $after: String) {
                companies(filter: $filter, first: 60, after: $after, orderBy: {createdAt: AscNullsLast}) {
                    edges { cursor node { id name } }
                    pageInfo { hasNextPage endCursor }
                }
            }`,
            { filter: { revenueType: { eq: vertical } }, after: cursor },
        );
        for (const e of data.companies.edges) out.push(e.node);
        if (!data.companies.pageInfo.hasNextPage) break;
        cursor = data.companies.pageInfo.endCursor;
        if (out.length > 5000) break; // safety
    }
    return out;
}

async function pageOpps(companyIds: string[]): Promise<any[]> {
    const out: any[] = [];
    // Twenty filter `companyId IN [...]` — chunk to avoid query size limits
    const chunkSize = 50;
    for (let i = 0; i < companyIds.length; i += chunkSize) {
        const chunk = companyIds.slice(i, i + chunkSize);
        let cursor: string | null = null;
        while (true) {
            const data: any = await gql(
                `query Q($filter: OpportunityFilterInput, $after: String) {
                    opportunities(filter: $filter, first: 60, after: $after) {
                        edges { node {
                            id companyId closeDate
                            dealValue { amountMicros }
                            amount    { amountMicros }
                            margin    { amountMicros }
                        } }
                        pageInfo { hasNextPage endCursor }
                    }
                }`,
                {
                    filter: { companyId: { in: chunk }, bidStatus: { eq: "WON" } },
                    after: cursor,
                },
            );
            for (const e of data.opportunities.edges) out.push(e.node);
            if (!data.opportunities.pageInfo.hasNextPage) break;
            cursor = data.opportunities.pageInfo.endCursor;
        }
    }
    return out;
}

function aggregate(companies: Array<{ id: string; name: string }>, opps: any[]): CompanyAgg[] {
    const byCompany = new Map<string, CompanyAgg>();
    for (const c of companies) byCompany.set(c.id, { id: c.id, name: c.name, dealCount: 0, lifetimeRevenue: 0, lifetimeMargin: 0, firstYear: null });

    for (const o of opps) {
        const agg = byCompany.get(o.companyId);
        if (!agg) continue;
        const dealMicros = o.dealValue?.amountMicros ?? o.amount?.amountMicros ?? 0;
        const marginMicros = o.margin?.amountMicros ?? 0;
        agg.dealCount++;
        agg.lifetimeRevenue += Number(dealMicros) / 1_000_000;
        agg.lifetimeMargin += Number(marginMicros) / 1_000_000;
        if (o.closeDate) {
            const y = parseInt(String(o.closeDate).slice(0, 4), 10);
            if (Number.isFinite(y) && (agg.firstYear === null || y < agg.firstYear)) agg.firstYear = y;
        }
    }
    return [...byCompany.values()];
}

async function buildWorkbook(rows: CompanyAgg[], vertical: Vertical, year: number): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(`${year} Clients`);

    const verticalLabel = vertical === "TECHNOLOGY" ? "Technology"
        : vertical === "VENUE_SERVICES" ? "Venue Services"
        : "Media & Sponsorship";

    // Title row
    ws.mergeCells("B2:F2");
    const t = ws.getCell("B2");
    t.value = `ANC — ${verticalLabel} Repeat Clients ${year}`;
    t.font = { name: "Calibri", size: 14, bold: true, color: { argb: "FF111111" } };
    t.alignment = { vertical: "middle", horizontal: "left" };

    ws.mergeCells("B3:F3");
    const sub = ws.getCell("B3");
    sub.value = `Lifetime revenue + margin across all WON deals · Generated ${new Date().toISOString().slice(0, 10)}`;
    sub.font = { name: "Calibri", size: 10, italic: true, color: { argb: "FF666666" } };

    // Header row
    const headers = ["#", "Client", "Client First-Year of Engagement", "Lifetime Client Revenue ($)", "Lifetime Client Margin (%)"];
    ws.getRow(5).values = ["", ...headers];
    ws.getRow(5).font = { bold: true };
    ws.getRow(5).alignment = { vertical: "middle", horizontal: "left" };
    ws.getRow(5).eachCell((cell, col) => {
        if (col === 1) return;
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E7EB" } };
        cell.border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };
    });

    // Body rows
    rows.forEach((r, i) => {
        const rowIdx = 6 + i;
        ws.getRow(rowIdx).values = [
            "",
            i + 1,
            r.name,
            r.firstYear ?? "",
            r.lifetimeRevenue,
            r.lifetimeRevenue > 0 ? r.lifetimeMargin / r.lifetimeRevenue : 0,
        ];
        const dealCell = ws.getRow(rowIdx).getCell(5);
        dealCell.numFmt = "$#,##0";
        const pctCell = ws.getRow(rowIdx).getCell(6);
        pctCell.numFmt = "0.0%";
        ws.getRow(rowIdx).eachCell((cell, col) => {
            if (col === 1) return;
            cell.border = { top: { style: "hair" }, bottom: { style: "hair" }, left: { style: "hair" }, right: { style: "hair" } };
        });
    });

    // Column widths
    ws.getColumn(1).width = 2;
    ws.getColumn(2).width = 4;
    ws.getColumn(3).width = 50;
    ws.getColumn(4).width = 32;
    ws.getColumn(5).width = 30;
    ws.getColumn(6).width = 30;

    return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const vertical = (searchParams.get("vertical") || "TECHNOLOGY").toUpperCase() as Vertical;
        const topRaw = parseInt(searchParams.get("top") || "10", 10);
        const top = Math.max(1, Math.min(50, Number.isFinite(topRaw) ? topRaw : 10));

        if (!["TECHNOLOGY", "VENUE_SERVICES", "MEDIA_SPONSORSHIP"].includes(vertical)) {
            return NextResponse.json({ error: "Invalid vertical (use TECHNOLOGY | VENUE_SERVICES | MEDIA_SPONSORSHIP)" }, { status: 400 });
        }

        const companies = await pageCompanies(vertical);
        const opps = await pageOpps(companies.map((c) => c.id));
        const aggs = aggregate(companies, opps).filter((a) => a.dealCount >= 2);
        aggs.sort((a, b) => b.lifetimeRevenue - a.lifetimeRevenue);
        const top10 = aggs.slice(0, top);

        const year = new Date().getFullYear();
        const xlsx = await buildWorkbook(top10, vertical, year);

        const verticalLabel = vertical === "TECHNOLOGY" ? "Technology"
            : vertical === "VENUE_SERVICES" ? "Venue Services"
            : "Media & Sponsorship";
        const filename = `ANC - ${verticalLabel} Repeat Clients ${year}.xlsx`;

        return new NextResponse(new Uint8Array(xlsx), {
            status: 200,
            headers: {
                "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                "Content-Disposition": `attachment; filename="${filename}"`,
                "Cache-Control": "no-cache",
                "X-Total-Companies": String(companies.length),
                "X-Total-Opps-Won": String(opps.length),
                "X-Repeat-Clients": String(aggs.length),
            },
        });
    } catch (err: any) {
        return NextResponse.json({ error: err?.message || String(err) }, { status: 500 });
    }
}
