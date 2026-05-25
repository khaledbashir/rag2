/**
 * GET /api/jireh-reports/account-ltv
 *
 * Generates Jireh's "Account Lifetime Value" multi-sheet Excel — same shape
 * as the Hankook_Lifetime_Value_ANC_Final template. Three sheets:
 *
 *   1. Summary       — headline LTV + Q&A grid
 *   2. Deal History  — year-by-year deals + total spend, grand total at end
 *   3. (Teams Funded — only when the account funded multiple teams; skipped
 *       in v1 unless we have reliable team-level data)
 *
 * Query params:
 *   company   exact or fuzzy company name (e.g. "Hankook" matches "Hankook Tire")
 *   id        optional — UUID of the company (overrides `company` if both given)
 *
 * Returns: Excel binary (xlsx).
 */

import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";

export const runtime = "nodejs";
export const maxDuration = 90;

const TWENTY_BASE = "https://abc-twenty.izcgmb.easypanel.host";
const TWENTY_TOKEN = process.env.TWENTY_API_KEY ||
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkM2ZiYzI5YS1hNjM1LTQ4YjctOWQ2ZS0yNTA5NDE2NzdmZDAiLCJ0eXBlIjoiQVBJX0tFWSIsIndvcmtzcGFjZUlkIjoiZDNmYmMyOWEtYTYzNS00OGI3LTlkNmUtMjUwOTQxNjc3ZmQwIiwiaWF0IjoxNzc0ODEwNDkyLCJleHAiOjQ5Mjg0MTA0ODcsImp0aSI6IjYxMGEzMWEzLTJhMDgtNDM5MC1iMTU1LTFkN2M3NzY5Y2QxOSJ9.nzknS-bBNuf7y3LUCv2xEa5-9xuJNHBK3GalJwWK3eA";

type Opp = {
    id: string;
    name: string;
    companyId: string;
    closeDate: string | null;
    substantialCompletionDate: string | null;
    bidStatus: string | null;
    businessUnit: string | null;
    totalProjectRevenue?: { amountMicros: string | number } | null;
    totalProjectMargin?: { amountMicros: string | number } | null;
    revenue2025?: { amountMicros: string | number } | null;
    margin2025?: { amountMicros: string | number } | null;
    revenue2026?: { amountMicros: string | number } | null;
    margin2026?: { amountMicros: string | number } | null;
    revenue2027?: { amountMicros: string | number } | null;
    margin2027?: { amountMicros: string | number } | null;
    revenue2028?: { amountMicros: string | number } | null;
    margin2028?: { amountMicros: string | number } | null;
    revenue2029?: { amountMicros: string | number } | null;
    margin2029?: { amountMicros: string | number } | null;
    revenue2030?: { amountMicros: string | number } | null;
    margin2030?: { amountMicros: string | number } | null;
    revenue2031?: { amountMicros: string | number } | null;
    margin2031?: { amountMicros: string | number } | null;
    revenue2032?: { amountMicros: string | number } | null;
    margin2032?: { amountMicros: string | number } | null;
    revenue2033?: { amountMicros: string | number } | null;
    margin2033?: { amountMicros: string | number } | null;
    revenue2034?: { amountMicros: string | number } | null;
    margin2034?: { amountMicros: string | number } | null;
    revenue2035?: { amountMicros: string | number } | null;
    margin2035?: { amountMicros: string | number } | null;
    revenue2036?: { amountMicros: string | number } | null;
    margin2036?: { amountMicros: string | number } | null;
    dealValue?: { amountMicros: string | number } | null;
    amount?: { amountMicros: string | number } | null;
    margin?: { amountMicros: string | number } | null;
};

type CompanyMatch = {
    id: string;
    name: string;
};

const FISCAL_YEARS = [
    2025, 2026, 2027, 2028, 2029, 2030, 2031, 2032, 2033, 2034, 2035, 2036,
] as const;
const EXCLUDED_LTV_BUSINESS_UNITS = new Set(["MEDIA_SPONSORSHIP"]);

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

async function findCompanies(nameOrId: string, byId: boolean): Promise<CompanyMatch[]> {
    if (byId) {
        const d: any = await gql(
            `query Q($f: CompanyFilterInput) { companies(filter: $f, first: 1) { edges { node { id name } } } }`,
            { f: { id: { eq: nameOrId } } },
        );
        return d.companies.edges.map((e: any) => e.node);
    }

    // Fuzzy account names in migrated CRM data can resolve to several legal
    // entities. Keep all candidates so the report can use the one(s) with WON
    // opportunities instead of grabbing an empty shell record.
    const d: any = await gql(
        `query Q($f: CompanyFilterInput) { companies(filter: $f, first: 20, orderBy: {createdAt: AscNullsLast}) { edges { node { id name } } } }`,
        { f: { name: { ilike: `%${nameOrId}%` } } },
    );
    return d.companies.edges.map((e: any) => e.node);
}

async function pageWonOpps(companyIds: string[]): Promise<Opp[]> {
    const out: Opp[] = [];
    for (let i = 0; i < companyIds.length; i += 50) {
        const chunk = companyIds.slice(i, i + 50);
        let cursor: string | null = null;
        while (true) {
            const d: any = await gql(
                `query Q($f: OpportunityFilterInput, $after: String) {
                    opportunities(filter: $f, first: 60, after: $after) {
                        edges { node {
                            id name companyId closeDate substantialCompletionDate bidStatus businessUnit
                            totalProjectRevenue { amountMicros }
                            totalProjectMargin  { amountMicros }
                            revenue2025 { amountMicros }
                            margin2025  { amountMicros }
                            revenue2026 { amountMicros }
                            margin2026  { amountMicros }
                            revenue2027 { amountMicros }
                            margin2027  { amountMicros }
                            revenue2028 { amountMicros }
                            margin2028  { amountMicros }
                            revenue2029 { amountMicros }
                            margin2029  { amountMicros }
                            revenue2030 { amountMicros }
                            margin2030  { amountMicros }
                            revenue2031 { amountMicros }
                            margin2031  { amountMicros }
                            revenue2032 { amountMicros }
                            margin2032  { amountMicros }
                            revenue2033 { amountMicros }
                            margin2033  { amountMicros }
                            revenue2034 { amountMicros }
                            margin2034  { amountMicros }
                            revenue2035 { amountMicros }
                            margin2035  { amountMicros }
                            revenue2036 { amountMicros }
                            margin2036  { amountMicros }
                            dealValue { amountMicros }
                            amount    { amountMicros }
                            margin    { amountMicros }
                        } }
                        pageInfo { hasNextPage endCursor }
                    }
                }`,
                { f: { companyId: { in: chunk }, bidStatus: { eq: "WON" } }, after: cursor },
            );
            for (const e of d.opportunities.edges) out.push(e.node);
            if (!d.opportunities.pageInfo.hasNextPage) break;
            cursor = d.opportunities.pageInfo.endCursor;
        }
    }
    return out;
}

function moneyDollars(value?: { amountMicros: string | number } | null): number {
    const amount = Number(value?.amountMicros || 0) / 1_000_000;
    return Number.isFinite(amount) ? amount : 0;
}

function fiscalTotal(o: Opp, type: "revenue" | "margin"): number {
    return FISCAL_YEARS.reduce((sum, year) => {
        const key = `${type}${year}` as keyof Opp;
        return sum + moneyDollars(o[key] as { amountMicros: string | number } | null | undefined);
    }, 0);
}

function dealDollars(o: Opp): number {
    // SF migration left many opps with amount.amountMicros = 0 (literal zero)
    // while the real number lives on dealValue. `??` only falls through on
    // null/undefined, so treat 0 as missing and prefer dealValue when amount
    // is unset or zero.
    const total = moneyDollars(o.totalProjectRevenue);
    const fy = fiscalTotal(o, "revenue");
    const dv = moneyDollars(o.dealValue);
    const amt = moneyDollars(o.amount);

    return total || fy || dv || amt;
}

function marginDollars(o: Opp): number {
    const total = moneyDollars(o.totalProjectMargin);
    const fy = fiscalTotal(o, "margin");

    return total || fy || moneyDollars(o.margin);
}

function marginPercent(revenue: number, margin: number): number {
    return revenue !== 0 ? margin / revenue : Number.NaN;
}

function isLtvOpportunity(o: Opp): boolean {
    return !EXCLUDED_LTV_BUSINESS_UNITS.has(o.businessUnit || "") && dealDollars(o) > 0;
}

function sortByAwardDate(a: Opp, b: Opp): number {
    const dateA = new Date(a.closeDate || a.substantialCompletionDate || 0).getTime();
    const dateB = new Date(b.closeDate || b.substantialCompletionDate || 0).getTime();
    return dateA - dateB || a.name.localeCompare(b.name);
}

function fmtUsdShort(n: number): string {
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
    return `$${n.toFixed(0)}`;
}

const COLORS = {
    blue: "FF0A52EF",
    navy: "FF062B6B",
    paleBlue: "FFE8F1FB",
    paleGray: "FFF4F6F9",
    text: "FF0D1B2A",
    white: "FFFFFFFF",
};

function solidFill(argb: string) {
    return { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb } };
}

function buildWorkbook(companyName: string, opps: Opp[]): Promise<Buffer> {
    return new Promise(async (resolve, reject) => {
        try {
            const wb = new ExcelJS.Workbook();

            // Compute aggregates
            const ltvDollars = opps.reduce((s, o) => s + dealDollars(o), 0);
            const dealCount = opps.length;
            const years = opps
                .map((o) => o.closeDate ? parseInt(o.closeDate.slice(0, 4), 10) : null)
                .filter((y): y is number => Number.isFinite(y as any));
            const minYear = years.length ? Math.min(...years) : null;
            const maxYear = years.length ? Math.max(...years) : null;
            const yearSpan = (minYear && maxYear) ? maxYear - minYear + 1 : 0;
            const avgPerYear = yearSpan > 0 ? ltvDollars / yearSpan : 0;

            // distinct verticals
            const verticals = new Set<string>();
            for (const o of opps) if (o.businessUnit) verticals.add(o.businessUnit);
            const verticalLabel = (v: string) => v === "TECHNOLOGY" ? "Technology"
                : v === "VENUE_SERVICES" ? "Venue Services"
                : v === "MEDIA_SPONSORSHIP" ? "Media & Sponsorship"
                : v;
            const verticalListStr = [...verticals].map(verticalLabel).join(", ") || "—";

            const largest = opps.slice().sort((a, b) => dealDollars(b) - dealDollars(a))[0];
            const largestVal = largest ? dealDollars(largest) : 0;
            const largestYear = largest && largest.closeDate ? largest.closeDate.slice(0, 4) : "—";

            const upperName = companyName.toUpperCase();

            // ── Sheet 1: Summary ─────────────────────────────────────────
            const s1 = wb.addWorksheet("Summary");
            s1.views = [{ showGridLines: false }];
            s1.mergeCells("A1:E1");
            s1.mergeCells("A2:E2");
            s1.getCell("A2").value = `${upperName}  —  LIFETIME VALUE SUMMARY`;
            s1.getCell("A2").font = { name: "Arial", bold: true, size: 13, color: { argb: COLORS.white } };
            s1.getCell("A2").fill = solidFill(COLORS.blue);
            s1.getCell("A2").alignment = { horizontal: "center", vertical: "middle" };

            s1.mergeCells("A3:E3");
            s1.getCell("A3").value = `Prepared by ANC  |  Internal Use Only  |  ${yearSpan}+ Year Partnership Overview`;
            s1.getCell("A3").alignment = { horizontal: "center", vertical: "middle" };
            s1.getCell("A3").font = { name: "Arial", size: 9, color: { argb: "FF0B7DDB" } };
            s1.getCell("A3").fill = solidFill(COLORS.paleBlue);

            // Headline number
            s1.mergeCells("B6:D6");
            s1.getCell("B6").value = fmtUsdShort(ltvDollars);
            s1.getCell("B6").font = { name: "Arial", bold: true, size: 36, color: { argb: COLORS.white } };
            s1.getCell("B6").fill = solidFill(COLORS.blue);
            s1.getCell("B6").alignment = { horizontal: "center", vertical: "middle" };

            s1.mergeCells("B7:D7");
            const yrRange = (minYear && maxYear) ? `${minYear}–${maxYear}` : "—";
            s1.getCell("B7").value = `ESTIMATED LIFETIME VALUE TO ${upperName}  |  ${yrRange}  |  Avg. ${fmtUsdShort(avgPerYear)}/year across ${verticalListStr || "—"}`;
            s1.getCell("B7").alignment = { horizontal: "center", vertical: "middle", wrapText: true };
            s1.getCell("B7").font = { name: "Arial", size: 10, color: { argb: COLORS.navy } };
            s1.getCell("B7").fill = solidFill(COLORS.paleBlue);

            // Q&A header
            s1.getCell("B9").value = "QUESTION";
            s1.getCell("C9").value = "ANSWER";
            s1.getCell("D9").value = "CONTEXT";
            for (const c of ["B9", "C9", "D9"]) {
                s1.getCell(c).font = { name: "Arial", size: 10, bold: true, color: { argb: COLORS.white } };
                s1.getCell(c).alignment = { horizontal: "center", vertical: "middle" };
                s1.getCell(c).fill = solidFill(COLORS.blue);
            }

            const qa: Array<[string, string, string]> = [
                [
                    "1.  Number of Deals",
                    `${dealCount} deals`,
                    yearSpan > 0
                        ? `Averaging ${(dealCount / yearSpan).toFixed(1)} deals/year over ${yearSpan} years.`
                        : "—",
                ],
                [
                    "2.  Verticals We've Done With Them",
                    verticalListStr,
                    `${verticals.size} distinct ${verticals.size === 1 ? "vertical" : "verticals"}.`,
                ],
                [
                    "3.  Total Contract Value — YoY",
                    `Avg ${fmtUsdShort(avgPerYear)}/year`,
                    yrRange === "—"
                        ? "No close dates on file."
                        : `${yrRange} aggregate · range subject to refresh.`,
                ],
                [
                    "4.  Largest Single Deal",
                    fmtUsdShort(largestVal),
                    largest ? `${largest.name} (${largestYear})` : "—",
                ],
                [
                    "5.  Customer Lifetime Value",
                    fmtUsdShort(ltvDollars),
                    "Sum of Technology + Venue Services WON opportunities; Media & Sponsorship excluded.",
                ],
            ];

            qa.forEach(([q, a, c], i) => {
                const r = 10 + i * 2;
                s1.getCell(`B${r}`).value = q;
                s1.getCell(`C${r}`).value = a;
                s1.getCell(`D${r}`).value = c;
                s1.getCell(`B${r}`).font = { name: "Arial", size: 10, bold: true, color: { argb: COLORS.white } };
                s1.getCell(`B${r}`).fill = solidFill(COLORS.navy);
                s1.getCell(`B${r}`).alignment = { horizontal: "left", vertical: "middle", wrapText: true };
                s1.getCell(`C${r}`).font = { name: "Arial", size: 10, bold: true, color: { argb: COLORS.navy } };
                s1.getCell(`C${r}`).fill = solidFill(COLORS.paleBlue);
                s1.getCell(`C${r}`).alignment = { horizontal: "center", vertical: "middle", wrapText: true };
                s1.getCell(`D${r}`).font = { name: "Arial", size: 10, color: { argb: COLORS.text } };
                s1.getCell(`D${r}`).fill = solidFill(COLORS.paleGray);
                s1.getCell(`D${r}`).alignment = { horizontal: "left", vertical: "middle", wrapText: true };
            });

            s1.getColumn(1).width = 3;
            s1.getColumn(2).width = 30;
            s1.getColumn(3).width = 18;
            s1.getColumn(4).width = 58.26953125;
            s1.getColumn(5).width = 5.1796875;

            [
                [1, 52], [2, 34], [3, 18], [4, 10], [5, 10], [6, 48],
                [7, 22], [8, 12], [9, 24], [10, 38], [11, 4], [12, 38],
                [13, 4], [14, 38], [15, 4], [16, 38], [17, 4], [18, 38],
                [19, 4], [20, 22],
            ].forEach(([row, height]) => { s1.getRow(row).height = height; });

            const lastQARow = 10 + (qa.length - 1) * 2;
            const footerRow = lastQARow + 2;
            s1.mergeCells(`A${footerRow}:E${footerRow}`);
            s1.getCell(`A${footerRow}`).value = "For deal-by-deal detail see Deal History tab.";
            s1.getCell(`A${footerRow}`).font = { name: "Arial", italic: true, size: 9, color: { argb: "FF6B7280" } };
            s1.getCell(`A${footerRow}`).alignment = { horizontal: "center", vertical: "middle" };

            // ── Sheet 2: Deal History ───────────────────────────────────
            const s2 = wb.addWorksheet("Deal History");
            s2.views = [{ showGridLines: false }];
            s2.mergeCells("A1:H1");
            s2.mergeCells("A2:H2");
            s2.getCell("A2").value = `${upperName}  —  DEAL HISTORY`;
            s2.getCell("A2").font = { name: "Arial", bold: true, size: 13, color: { argb: COLORS.white } };
            s2.getCell("A2").fill = solidFill(COLORS.blue);
            s2.getCell("A2").alignment = { horizontal: "center", vertical: "middle" };

            s2.mergeCells("A3:H3");
            s2.getCell("A3").value = "WON Technology + Venue Services deals · Media & Sponsorship excluded from customer LTV.";
            s2.getCell("A3").alignment = { horizontal: "center", vertical: "middle" };
            s2.getCell("A3").font = { name: "Arial", size: 9, color: { argb: "FF0B7DDB" } };
            s2.getCell("A3").fill = solidFill(COLORS.paleBlue);

            s2.getCell("B5").value = "YEAR";
            s2.getCell("C5").value = "OPPORTUNITY";
            s2.getCell("D5").value = "BUSINESS UNIT";
            s2.getCell("E5").value = "AWARD DATE";
            s2.getCell("F5").value = "REVENUE";
            s2.getCell("G5").value = "MARGIN";
            s2.getCell("H5").value = "MARGIN %";
            for (const c of ["B5", "C5", "D5", "E5", "F5", "G5", "H5"]) {
                s2.getCell(c).font = { name: "Arial", size: 10, bold: true, color: { argb: COLORS.white } };
                s2.getCell(c).alignment = { horizontal: "center", vertical: "middle" };
                s2.getCell(c).fill = solidFill(COLORS.blue);
            }

            const sortedOpps = opps.slice().sort(sortByAwardDate);
            sortedOpps.forEach((opp, i) => {
                const r = 6 + i;
                const awardDate = opp.closeDate || opp.substantialCompletionDate || "";
                const year = awardDate ? parseInt(awardDate.slice(0, 4), 10) : null;
                const revenue = dealDollars(opp);
                const margin = marginDollars(opp);

                s2.getCell(`B${r}`).value = Number.isFinite(year) ? year : "";
                s2.getCell(`C${r}`).value = opp.name;
                s2.getCell(`D${r}`).value = verticalLabel(opp.businessUnit || "");
                const dateValue = awardDate ? new Date(awardDate) : null;
                s2.getCell(`E${r}`).value = dateValue && Number.isFinite(dateValue.getTime()) ? dateValue : "";
                s2.getCell(`E${r}`).numFmt = "m/d/yyyy";
                s2.getCell(`F${r}`).value = revenue;
                s2.getCell(`F${r}`).numFmt = "$#,##0";
                s2.getCell(`G${r}`).value = margin;
                s2.getCell(`G${r}`).numFmt = "$#,##0";
                s2.getCell(`H${r}`).value = marginPercent(revenue, margin);
                s2.getCell(`H${r}`).numFmt = "0.0%";
                for (const col of ["B", "C", "D", "E", "F", "G", "H"]) {
                    s2.getCell(`${col}${r}`).font = { name: "Arial", size: 10, color: { argb: COLORS.text } };
                    s2.getCell(`${col}${r}`).alignment = { vertical: "middle", wrapText: true };
                }
            });

            const totalRow = 6 + sortedOpps.length + 1;
            s2.mergeCells(`B${totalRow}:E${totalRow}`);
            const yrRange2 = (minYear && maxYear) ? `${minYear}–${maxYear}` : "—";
            s2.getCell(`B${totalRow}`).value = `TOTAL  (${yrRange2})`;
            s2.getCell(`B${totalRow}`).font = { name: "Arial", bold: true, color: { argb: COLORS.white } };
            s2.getCell(`B${totalRow}`).fill = solidFill(COLORS.navy);
            s2.getCell(`F${totalRow}`).value = ltvDollars;
            s2.getCell(`F${totalRow}`).numFmt = "$#,##0";
            s2.getCell(`F${totalRow}`).font = { name: "Arial", bold: true, color: { argb: COLORS.navy } };
            s2.getCell(`F${totalRow}`).fill = solidFill(COLORS.paleBlue);
            const marginTotal = opps.reduce((sum, opp) => sum + marginDollars(opp), 0);
            s2.getCell(`G${totalRow}`).value = marginTotal;
            s2.getCell(`G${totalRow}`).numFmt = "$#,##0";
            s2.getCell(`G${totalRow}`).font = { name: "Arial", bold: true, color: { argb: COLORS.navy } };
            s2.getCell(`G${totalRow}`).fill = solidFill(COLORS.paleBlue);
            s2.getCell(`H${totalRow}`).value = marginPercent(ltvDollars, marginTotal);
            s2.getCell(`H${totalRow}`).numFmt = "0.0%";
            s2.getCell(`H${totalRow}`).font = { name: "Arial", bold: true, color: { argb: COLORS.navy } };
            s2.getCell(`H${totalRow}`).fill = solidFill(COLORS.paleBlue);

            s2.getColumn(1).width = 3;
            s2.getColumn(2).width = 10;
            s2.getColumn(3).width = 48;
            s2.getColumn(4).width = 20;
            s2.getColumn(5).width = 14;
            s2.getColumn(6).width = 16;
            s2.getColumn(7).width = 16;
            s2.getColumn(8).width = 12;
            s2.getRow(1).height = 52;
            s2.getRow(2).height = 34;
            s2.getRow(3).height = 18;
            s2.getRow(4).height = 10;
            s2.getRow(5).height = 22;
            for (let row = 6; row < totalRow; row++) s2.getRow(row).height = 22;
            s2.getRow(totalRow).height = 28;

            resolve(Buffer.from(await wb.xlsx.writeBuffer()));
        } catch (e) {
            reject(e);
        }
    });
}

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const company = searchParams.get("company") || "";
        const id = searchParams.get("id") || "";
        if (!company && !id) {
            return NextResponse.json({ error: "Pass either ?company=Name or ?id=<uuid>" }, { status: 400 });
        }

        const matches = await findCompanies(id || company, !!id);
        if (!matches.length) {
            return NextResponse.json({ error: `Company not found for "${company || id}".` }, { status: 404 });
        }

        const allWonOpps = await pageWonOpps(matches.map((match) => match.id));
        const opps = allWonOpps.filter(isLtvOpportunity);
        if (opps.length === 0) {
            return NextResponse.json({ error: `No WON opportunities found for "${company || matches[0].name}".` }, { status: 404 });
        }

        const companyIdsWithWonOpps = new Set(opps.map((opp) => opp.companyId));
        const contributingCompanies = matches.filter((match) => companyIdsWithWonOpps.has(match.id));
        const reportName = id
            ? contributingCompanies[0]?.name ?? matches[0].name
            : (/hankook/i.test(company) ? "Hankook Tire" : (company || contributingCompanies[0]?.name || matches[0].name));

        const xlsx = await buildWorkbook(reportName, opps);
        const filename = `${reportName} - Lifetime Value ANC.xlsx`;

        return new NextResponse(new Uint8Array(xlsx), {
            status: 200,
            headers: {
                "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                "Content-Disposition": `attachment; filename="${filename}"`,
                "Cache-Control": "no-cache",
                "X-Company-Id": contributingCompanies.map((match) => match.id).join(","),
                "X-Company-Name": contributingCompanies.map((match) => match.name).join(", "),
                "X-Won-Opps": String(opps.length),
                "X-LTV-Excluded-Media-Sponsorship": String(allWonOpps.length - opps.length),
            },
        });
    } catch (err: any) {
        return NextResponse.json({ error: err?.message || String(err) }, { status: 500 });
    }
}
