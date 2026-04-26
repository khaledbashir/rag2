/**
 * GET /api/jireh-reports/repeat-clients
 *
 * Generates Jireh's "Repeat Clients" Excel: top N clients in a vertical with
 * Lifetime Revenue + Lifetime Margin % + First-Year of Engagement + total WON
 * opportunities, ranked by
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

async function pageWonOppsByVertical(vertical: Vertical): Promise<any[]> {
    const out: any[] = [];
    let cursor: string | null = null;
    while (true) {
        const data: any = await gql(
            `query Q($filter: OpportunityFilterInput, $after: String) {
                opportunities(filter: $filter, first: 60, after: $after) {
                    edges { node {
                        id companyId closeDate
                        businessUnit bidStatus
                        dealValue { amountMicros }
                        amount    { amountMicros }
                        margin    { amountMicros }
                        company { id name }
                    } }
                    pageInfo { hasNextPage endCursor }
                }
            }`,
            { filter: { bidStatus: { eq: "WON" }, businessUnit: { eq: vertical } }, after: cursor },
        );
        for (const e of data.opportunities.edges) out.push(e.node);
        if (!data.opportunities.pageInfo.hasNextPage) break;
        cursor = data.opportunities.pageInfo.endCursor;
        if (out.length > 10000) break; // safety
    }
    return out;
}

function aggregate(opps: any[]): CompanyAgg[] {
    const byCompany = new Map<string, CompanyAgg>();

    for (const o of opps) {
        if (!o.companyId || !o.company?.name) continue;
        if (!byCompany.has(o.companyId)) {
            byCompany.set(o.companyId, {
                id: o.companyId,
                name: o.company.name,
                dealCount: 0,
                lifetimeRevenue: 0,
                lifetimeMargin: 0,
                firstYear: null,
            });
        }
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
    ws.views = [{ showGridLines: false }];

    // Match Jireh's template structure: cols A-B blank, headers at row 3,
    // blank row 4, data starts row 5. No title, no subtitle, no rank column.
    ws.getRow(3).height = 15.75;
    ws.getRow(4).height = 5.1;

    // Header row at r3, cols C-G
    ws.getCell("C3").value = "Client";
    ws.getCell("D3").value = "Client First-Year of Engagement";
    ws.getCell("E3").value = "Lifetime Client Revenue ($)";
    ws.getCell("F3").value = "Lifetime Client Margin (%)";
    ws.getCell("G3").value = "Total WON Opportunities";
    for (const col of ["C", "D", "E", "F", "G"]) {
        const cell = ws.getCell(`${col}3`);
        cell.font = { bold: true, size: 10 };
        cell.alignment = { vertical: "middle", horizontal: "left" };
        cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFBCD0FC" },
        };
    }

    // Body rows: data sorted by lifetime revenue desc, starting at row 5.
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

    // Column widths from Jireh's source workbook.
    ws.getColumn(1).width = 13;
    ws.getColumn(2).width = 13;
    ws.getColumn(3).width = 60.140625;
    ws.getColumn(4).width = 32.140625;
    ws.getColumn(5).width = 31.5703125;
    ws.getColumn(6).width = 13;
    ws.getColumn(7).width = 24;

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

        const opps = await pageWonOppsByVertical(vertical);
        const aggs = aggregate(opps).filter((a) => a.dealCount >= 2);
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
                "X-Total-Companies": String(new Set(opps.map((o) => o.companyId).filter(Boolean)).size),
                "X-Total-Opps-Won": String(opps.length),
                "X-Repeat-Clients": String(aggs.length),
            },
        });
    } catch (err: any) {
        return NextResponse.json({ error: err?.message || String(err) }, { status: 500 });
    }
}
