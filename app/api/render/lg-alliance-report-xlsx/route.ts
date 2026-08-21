/**
 * GET /api/render/lg-alliance-report-xlsx
 *
 * The detailed LG report (Jireh, 2026-08-14) — his "LG ANC Marketing Breakdown
 * Tier Detail" workbook rebuilt from live CRM data instead of by hand.
 *
 * Scoped to Technology deals only, per Jireh: the LG alliance is a Technology
 * partnership, so a Venue Services deal that happens to name LG as the vendor
 * does not belong in the rollup.
 *
 * Three sheets:
 *   Alliance Rollup — every LG opportunity grouped by tier, in the CRM's own
 *                     columns and order (Jireh, 2026-08-17), led by the
 *                     Technology Vendor PO Value with its source and the 8%
 *                     alliance fee beside it.
 *   By Fiscal Year  — the money phased across FY2025-FY2032, split open vs won.
 *   Deal Detail     — the flat list with every field, for pivoting.
 *
 * Query params: `?scope=open|won|active|all` (default active = open + won),
 * `?rate=0.08`,
 * `?format=json` for agents and dashboards.
 *
 * Auth-exempt via the /api/render/* allowlist — openable as a direct link.
 */
import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { renderCorsHeaders, withRenderCors } from "@/lib/http/renderCors";
import {
  ALLIANCE_RATE_DEFAULT,
  FISCAL_YEARS,
  buildLgAllianceReport,
  businessUnitLabel,
  sectionsFromViewGroups,
  fiscalYearLabel,
  humanizeStatus,
  normalizeFiscalYears,
  winConfidenceLabel,
  type LgDealInput,
  type LgAllianceReport,
  type ReportScope,
} from "@/services/reports/lgAlliance";
import {
  ALLIANCE_FEE_KEY,
  PO_FIELD,
  PO_SOURCE_KEY,
  buildSelection,
  cellValue,
  isSponsorshipYearField,
  rollupLayout,
  type MirrorColumn,
  type RollupColumn,
} from "@/services/reports/viewMirror";
import {
  layoutFromView,
  sortByViewSorts,
  type FieldMeta,
  type LaidOutColumn,
  type ViewSort,
} from "@/services/reports/viewExportLayout";
import { buildViewFilter } from "@/services/reports/viewFilterTranslate";
import {
  aggregateFormula,
  aggregateLabel,
  composedTotalFormula,
  computeAggregate,
  isMoneyResult,
} from "@/services/reports/viewAggregates";
import {
  BAND,
  BAND_STRONG,
  FONT,
  GUTTER,
  INK,
  INK_SOFT,
  LINE,
  bandRow,
  dataRow,
  money,
  writeSheetHeader,
  writeTableHeader,
  type ColumnSpec,
  type SheetValue,
} from "@/services/reports/workbookStyle";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: renderCorsHeaders(req) });
}

const TWENTY_BASE = "https://abc-twenty.izcgmb.easypanel.host";
const TWENTY_TOKEN =
  process.env.TWENTY_API_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkM2ZiYzI5YS1hNjM1LTQ4YjctOWQ2ZS0yNTA5NDE2NzdmZDAiLCJ0eXBlIjoiQVBJX0tFWSIsIndvcmtzcGFjZUlkIjoiZDNmYmMyOWEtYTYzNS00OGI3LTlkNmUtMjUwOTQxNjc3ZmQwIiwiaWF0IjoxNzc0ODEwNDkyLCJleHAiOjQ5Mjg0MTA0ODcsImp0aSI6IjYxMGEzMWEzLTJhMDgtNDM5MC1iMTU1LTFkN2M3NzY5Y2QxOSJ9.nzknS-bBNuf7y3LUCv2xEa5-9xuJNHBK3GalJwWK3eA";

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

/** Twenty stores currency as micros. */
function dollars(field: any): number | null {
  const micros = field?.amountMicros;
  if (micros === null || micros === undefined) return null;
  return Number(micros) / 1_000_000;
}

/**
 * The saved view the report mirrors. Jireh edits its columns directly, and the
 * Deal Detail sheet follows whatever he leaves there.
 */
const LG_VIEW_ID = "ee5690f5-c80c-4f8c-b0f5-53f5e664eba0";
const OPPORTUNITY_OBJECT_ID = "c779922d-cf25-4a5e-9382-23eb1c02199e";

async function metaGql<T = any>(query: string): Promise<T> {
  const res = await fetch(`${TWENTY_BASE}/metadata`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TWENTY_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const body = await res.json();
  if (body.errors?.length) throw new Error(body.errors.map((e: any) => e.message).join("; "));
  return body.data;
}

/**
 * Everything the sheet takes from the saved view: its columns and their
 * totals, its filters, its sorts, and the order it bands its sections in.
 *
 * Jireh, 2026-08-21: "the main tab is still not looking like the actual report
 * on the CRM." It was mirroring his columns and nothing else — so the sheet
 * carried 127 rows against the report's 105 (the report hides On Hold, the
 * sheet counted it as live pipeline), banded No Sponsorship above Needs Review
 * where he had dragged it below, and listed each section biggest-PO-first while
 * the report reads alphabetically. Same columns, different document. The view
 * now decides all four.
 */
export type ViewMirror = {
  /** The view's own name, so the sheet can say which report it is. */
  name: string;
  columns: LaidOutColumn[];
  /** Columns on the view whose type the sheet cannot render. */
  skipped: string[];
  /** The view's filters, translated for the data API. */
  filter?: Record<string, unknown>;
  sorts: ViewSort[];
  fields: Record<string, FieldMeta>;
  /** The field the report groups by, so its own sort is not applied twice. */
  groupFieldId?: string;
  /** Section values in the report's band order, with the CRM's labels. */
  sectionOrder: string[];
  sectionLabels: Record<string, string>;
};

const NO_VIEW: ViewMirror = {
  name: "",
  columns: [],
  skipped: [],
  sorts: [],
  fields: {},
  sectionOrder: [],
  sectionLabels: {},
};

type SelectOption = { value: string; label: string; position?: number };

/**
 * Reads the view.
 *
 * A failure here must not take the export down — the report is still useful on
 * its own column set — so the caller falls back to NO_VIEW and the sheet
 * degrades to the layout it had before it mirrored anything.
 */
async function fetchView(): Promise<ViewMirror> {
  const data = await metaGql<any>(`query {
    getView(id: "${LG_VIEW_ID}") {
      name
      mainGroupByFieldMetadataId
      viewFields { fieldMetadataId isVisible position aggregateOperation }
      viewFilters { fieldMetadataId operand value viewFilterGroupId }
      viewFilterGroups { id logicalOperator parentViewFilterGroupId }
      viewSorts { fieldMetadataId direction }
      viewGroups { fieldValue position isVisible }
    }
    object(id: "${OPPORTUNITY_OBJECT_ID}") {
      fieldsList {
        id name type label options
        relation { targetObjectMetadata { nameSingular } }
      }
    }
  }`);

  const view = data.getView;
  if (!view) throw new Error("the LG Alliance view is no longer readable");

  const fields: Record<string, FieldMeta> = {};
  const options: Record<string, SelectOption[]> = {};
  for (const f of data.object?.fieldsList || []) {
    fields[f.id] = {
      name: f.name,
      type: f.type,
      label: f.label || f.name,
      relationTarget: f.relation?.targetObjectMetadata?.nameSingular,
    };
    if (Array.isArray(f.options)) options[f.id] = f.options;
  }

  const { columns, skipped } = layoutFromView(view.viewFields || [], fields);

  // The section order is the view's own, NOT the field's option order: the two
  // disagree on this view, and the report is what he is reading.
  const sectionOrder = [...(view.viewGroups || [])]
    .filter((g: any) => g.isVisible !== false)
    .sort((a: any, b: any) => Number(a.position) - Number(b.position))
    .map((g: any) => String(g.fieldValue ?? ""));

  const groupFieldId: string | undefined = view.mainGroupByFieldMetadataId || undefined;
  const sectionLabels: Record<string, string> = {};
  for (const option of (groupFieldId && options[groupFieldId]) || []) {
    sectionLabels[option.value] = option.label;
  }

  return {
    name: view.name || "",
    columns,
    skipped,
    filter: buildViewFilter(view.viewFilters || [], view.viewFilterGroups || [], fields),
    sorts: view.viewSorts || [],
    fields,
    groupFieldId,
    sectionOrder,
    sectionLabels,
  };
}

/**
 * The row order inside a section, taken from the view's sorts.
 *
 * The grouping field's own sort is dropped: the sections are already banded in
 * the view's group order, and comparing a SELECT as text would band them
 * alphabetically by stored value rather than the order he dragged them into.
 */
function viewRowOrder(
  mirror: ViewMirror,
): ((rows: LgAllianceReport["rows"]) => LgAllianceReport["rows"]) | undefined {
  const sorts = mirror.sorts.filter((s) => s.fieldMetadataId !== mirror.groupFieldId);
  if (!sorts.length) return undefined;
  return (rows) => {
    const wrapped = rows.map((row) => ({
      ...((row as unknown as { raw?: Record<string, any> }).raw || {}),
      __row: row,
    }));
    const ordered = sortByViewSorts(wrapped, sorts, mirror.fields).map((w) => w.__row);
    // Section first, his order within it — the rollup bands by section anyway,
    // and it keeps the flat Deal Detail tab reading in the report's order
    // rather than alphabetically straight through the sections.
    return ordered.sort((a, b) => a.tierRank - b.tierRank);
  };
}

const YEAR_FIELDS = FISCAL_YEARS.map(
  (y) => `revenue${y} { amountMicros } margin${y} { amountMicros }`,
).join(" ");

/** The years the LG FY picklist — and so the sponsorship fields — cover. */
const SPONSORSHIP_YEARS = [2026, 2027, 2028, 2029, 2030, 2031, 2032] as const;
const SPONSORSHIP_YEAR_FIELDS = SPONSORSHIP_YEARS.map(
  (y) => `sponsorship${y} { amountMicros }`,
).join(" ");

/**
 * Pages the LG opportunities.
 *
 * The cursor orders by `id`, not `createdAt` — ordering on a non-unique column
 * made the cursor skip and repeat pages (203 records came back as 143 rows with
 * 90 unique ids). Any paged read here must order by something unique.
 */
type LgDeal = LgDealInput & { raw: Record<string, any> };

/**
 * The filter the report falls back to when the view cannot be read: the LG
 * alliance is a Technology partnership, so a Venue Services deal naming LG as
 * its vendor is not part of it.
 */
const FALLBACK_FILTER = {
  technologyVendorPartner: { eq: "LG" },
  businessUnit: { eq: "TECHNOLOGY" },
};

async function fetchLgDeals(
  mirrored: MirrorColumn[],
  filter?: Record<string, unknown>,
): Promise<LgDeal[]> {
  // Fields the query already names by hand; the mirror adds only what is new.
  const HAND_SELECTED = [
    "id", "name", "opportunityNumber", "bidStatus", "league", "winConfidence",
    "closeDate", "lgTier", "lgFiscalYear", "lgBusinessUnits", "lgDescription",
    "lgNotes", "poValue", "sponsorshipValue", "totalProjectRevenue",
    "totalProjectMargin", "company",
  ];
  const mirroredSelection = buildSelection(mirrored, HAND_SELECTED);

  const query = `query LgDeals($filter: OpportunityFilterInput, $after: String) {
    opportunities(
      filter: $filter
      orderBy: { id: AscNullsLast }
      first: 60
      after: $after
    ) {
      pageInfo { hasNextPage endCursor }
      edges { node {
        id name opportunityNumber bidStatus league winConfidence closeDate
        lgTier lgFiscalYear lgBusinessUnits lgDescription lgNotes
        poValue { amountMicros }
        sponsorshipValue { amountMicros }
        totalProjectRevenue { amountMicros }
        totalProjectMargin { amountMicros }
        ${YEAR_FIELDS}
        ${SPONSORSHIP_YEAR_FIELDS}
        company { name }
        ${mirroredSelection}
      } }
    }
  }`;

  const deals: LgDeal[] = [];
  let after: string | null = null;
  // Bounded so a cursor that ever stops advancing cannot spin forever.
  for (let page = 0; page < 100; page++) {
    const data: any = await gql(query, { filter: filter || FALLBACK_FILTER, after });
    const conn = data.opportunities;
    for (const edge of conn.edges) {
      const n = edge.node;
      const revenueByYear: Record<number, number> = {};
      const marginByYear: Record<number, number> = {};
      const sponsorshipByYear: Record<number, number> = {};
      for (const y of SPONSORSHIP_YEARS) {
        const s = dollars(n[`sponsorship${y}`]);
        if (s) sponsorshipByYear[y] = s;
      }
      for (const y of FISCAL_YEARS) {
        const r = dollars(n[`revenue${y}`]);
        const m = dollars(n[`margin${y}`]);
        if (r) revenueByYear[y] = r;
        if (m) marginByYear[y] = m;
      }
      deals.push({
        id: n.id,
        name: n.name || "(unnamed)",
        opportunityNumber: n.opportunityNumber || null,
        account: n.company?.name || null,
        bidStatus: n.bidStatus || null,
        league: n.league || null,
        winConfidence: n.winConfidence || null,
        awardDate: n.closeDate || null,
        tier: n.lgTier || null,
        fiscalYears: normalizeFiscalYears(n.lgFiscalYear),
        businessUnits: Array.isArray(n.lgBusinessUnits) ? n.lgBusinessUnits : [],
        description: n.lgDescription || null,
        notes: n.lgNotes || null,
        poValue: dollars(n.poValue),
        sponsorshipValue: dollars(n.sponsorshipValue),
        revenue: dollars(n.totalProjectRevenue),
        margin: dollars(n.totalProjectMargin),
        revenueByYear,
        marginByYear,
        sponsorshipByYear,
        raw: n,
      });
    }
    if (!conn.pageInfo.hasNextPage) break;
    after = conn.pageInfo.endCursor;
  }
  return deals;
}

function fmtDate(value: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  // Award dates are stored at midnight UTC; formatting in UTC keeps a
  // March 15 value from rendering as March 14 for a US reader.
  return d.toLocaleDateString("en-US", {
    year: "numeric", month: "short", day: "numeric", timeZone: "UTC",
  });
}

function pct(rate: number): string {
  return `${(rate * 100).toFixed(rate * 100 % 1 === 0 ? 0 : 1)}%`;
}

const usdExact = (value: number) =>
  value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/**
 * Where a sheet's Sponsorship Value column sits relative to its per-year
 * sponsorship columns (Jireh, 2026-08-18: "is it possible to make the
 * sponsorship years total up to sponsorship total with a formula?").
 *
 * The total becomes a live `=SUM(...)` over the year cells, so a reader can
 * change a year in Excel and watch the total, the tier band and the sheet
 * total move with it. Null when the sheet carries no year columns to add up.
 */
type SponsorshipLayout = { totalIndex: number; yearIndices: number[]; years: number[] };

function sponsorshipLayoutFor(keys: string[]): SponsorshipLayout | null {
  const totalIndex = keys.indexOf("sponsorshipValue");
  const yearIndices: number[] = [];
  const years: number[] = [];
  keys.forEach((key, i) => {
    if (!isSponsorshipYearField(key)) return;
    yearIndices.push(i);
    years.push(Number(key.slice("sponsorship".length)));
  });
  if (totalIndex < 0 || !yearIndices.length) return null;
  return { totalIndex, yearIndices, years };
}

/** The column letter for a 0-based table column, allowing for the gutter. */
function columnLetter(ws: ExcelJS.Worksheet, index: number): string {
  return ws.getColumn(index + 1 + GUTTER).letter;
}

/** `M9:R9` when the columns run together, `M9,P9` when they do not. */
function cellRange(ws: ExcelJS.Worksheet, indices: number[], rowNumber: number): string {
  const contiguous = indices.every((v, i) => i === 0 || v === indices[i - 1] + 1);
  if (contiguous && indices.length > 1) {
    return `${columnLetter(ws, indices[0])}${rowNumber}:${columnLetter(ws, indices[indices.length - 1])}${rowNumber}`;
  }
  return indices.map((i) => `${columnLetter(ws, i)}${rowNumber}`).join(",");
}

/**
 * Turns one row's Sponsorship Value cell into the sum of its year cells.
 *
 * A row that carries a total but has never been phased by year keeps the
 * entered figure — summing empty cells would wipe it off the sheet — and says
 * so in a note. A row whose years disagree with the entered total shows the
 * years, and the note carries what the CRM holds.
 */
function applySponsorshipFormula(
  ws: ExcelJS.Worksheet,
  row: ExcelJS.Row,
  layout: SponsorshipLayout,
  r: LgAllianceReport["rows"][number],
): void {
  const cell = row.getCell(layout.totalIndex + 1 + GUTTER);
  const yearTotal = layout.years.reduce((sum, y) => sum + (r.sponsorshipByYear?.[y] || 0), 0);
  const entered = r.sponsorshipValue || 0;

  if (!yearTotal) {
    if (entered) {
      cell.note =
        "Not phased by fiscal year yet — this is the Sponsorship Value entered in the CRM.";
    }
    return;
  }

  money(cell, { formula: `SUM(${cellRange(ws, layout.yearIndices, row.number)})`, result: yearTotal });
  if (entered && Math.abs(entered - yearTotal) >= 1) {
    cell.note =
      `Adds the fiscal year columns (${usdExact(yearTotal)}). ` +
      `Sponsorship Value in the CRM: ${usdExact(entered)}.`;
  }
}

function buildWorkbook(
  report: LgAllianceReport,
  scope: ReportScope,
  mirror: ViewMirror,
): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "ANC";
  const rate = report.allianceRate;
  const asOf = new Date(report.generatedAt).toLocaleString("en-US", {
    year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
  const reportName = mirror.name || "the LG Alliance Detail list";
  const scopeLabel =
    scope === "open"
      ? "Open pipeline only"
      : scope === "won"
        ? "Won deals only"
        : scope === "all"
          // With the view's own filters applied, "all" means every row the
          // report shows — which is not the same as every LG deal in the CRM.
          ? mirror.filter
            ? `Every row on the ${reportName} report`
            : "All LG deals, including lost and no-bid"
          : "Open pipeline and won deals";

  // ---------------------------------------------------------------- sheet 1
  const roll = wb.addWorksheet("Alliance Rollup");
  roll.properties.defaultRowHeight = 16;

  // Every column the report shows, in its order, with its own footer total.
  const layout: RollupColumn[] = mirror.columns.length
    ? rollupLayout(mirror.columns, pct(rate))
    : LEGACY_ROLLUP_LAYOUT(rate);
  const rollCols: ColumnSpec[] = layout.map((c) => c.spec);
  const indexOf = (key: string) => layout.findIndex((c) => c.key === key);
  const poColumn = indexOf(PO_FIELD);
  const allianceColumn = indexOf(ALLIANCE_FEE_KEY);
  const poSourceColumn = indexOf(PO_SOURCE_KEY);
  const sponsorship = sponsorshipLayoutFor(layout.map((c) => c.key));

  const headRow = writeSheetHeader(roll, {
    title: "LG Alliance — Tier Detail",
    subtitle: `As of ${asOf} · Technology · ${scopeLabel} · alliance rate ${pct(rate)}`,
    headline:
      `PO ${usd(report.totals.po)} across ${report.totals.deals} LG deals · ` +
      `alliance ${pct(rate)} ${usd(report.totals.allianceFee)}` +
      (report.totals.sponsorship ? ` · sponsorship ${usd(report.totals.sponsorship)}` : ""),
    note:
      `This tab is the ${reportName} report in the CRM: its rows, its columns, ` +
      "its sections in their order, and each column's own total. " +
      `Technology Vendor PO Value is entered on ${report.totals.dealsWithPo} of ` +
      `${report.totals.deals} deals (${usd(report.totals.poEntered)}). ` +
      (report.rowsWithoutPo
        ? `The other ${report.rowsWithoutPo} stand in Revenue — Total Project ` +
          `(${usd(report.totals.poEstimated)}) and are marked Estimated in the PO Source column. `
        : "") +
      `The alliance ${pct(rate)} column and the PO Source tag are this report's own — ` +
      "the fee is the PO cell beside it times the rate. " +
      (sponsorship
        ? "Sponsorship Value adds up its fiscal year columns as a live formula. "
        : "") +
      "Every money total is a live formula over the rows above it, so filtering " +
      "the sheet moves the totals exactly as filtering the report does." +
      (mirror.skipped.length ? ` Not carried across: ${mirror.skipped.join(", ")}.` : ""),
  });

  // Two columns pinned — the CRM keeps the opportunity and account in view.
  writeTableHeader(roll, rollCols, headRow, Math.min(2, rollCols.length));

  // A thin legend naming each column's total the way the CRM names it, so
  // "Sum of Sponsorship Value" and "Count all" read the same on both surfaces.
  const hasAggregates = layout.some((c) => c.aggregate);
  if (hasAggregates) {
    const legend = roll.addRow({});
    layout.forEach((col, i) => {
      const cell = legend.getCell(i + 1 + GUTTER);
      if (col.aggregate) cell.value = aggregateLabel(col.aggregate, col.spec.header);
      cell.font = { name: FONT, size: 8, italic: true, color: { argb: INK_SOFT } };
      cell.alignment = { horizontal: col.spec.money ? "right" : "left" };
    });
    legend.height = 13;
    roll.views = [
      {
        state: "frozen",
        ySplit: legend.number,
        xSplit: Math.min(2, rollCols.length) + GUTTER,
        showGridLines: false,
      },
    ];
  }

  /** Every row's cells, laid out once — the footers read them back. */
  const cellsOf = new Map<LgAllianceReport["rows"][number], (string | number | null)[]>();
  for (const r of report.rows) {
    cellsOf.set(r, rollupValues(r, (r as unknown as { raw?: Record<string, any> }).raw || {}, layout));
  }

  /** What a row contributes to the sponsorship column as the sheet writes it. */
  const yearTotalOf = (r: LgAllianceReport["rows"][number]) =>
    sponsorship
      ? sponsorship.years.reduce((sum, y) => sum + (r.sponsorshipByYear?.[y] || 0), 0)
      : 0;
  const effectiveSponsorship = (r: LgAllianceReport["rows"][number]) =>
    yearTotalOf(r) || r.sponsorshipValue || 0;

  /** The value a footer counts for one row in one column. */
  const valueAt = (r: LgAllianceReport["rows"][number], index: number) => {
    if (sponsorship && index === sponsorship.totalIndex) return effectiveSponsorship(r);
    return cellsOf.get(r)?.[index] ?? null;
  };

  const countText = (value: number | null) =>
    value === null ? "—" : Number.isInteger(value) ? String(value) : value.toFixed(1);

  /**
   * A section footer, or the sheet's own — the CRM's footer row, in the CRM's
   * words. `block` is the run of data rows a section covers; the sheet total
   * instead names the section footers, because a range over the data would add
   * those footers in a second time.
   */
  const writeFooter = (
    rows: LgAllianceReport["rows"],
    block: { from: number; to: number } | number[],
    opts: { label?: string; height?: number; fill?: string } = {},
  ): ExcelJS.Row => {
    const row = bandRow(roll, rollCols, rollCols.map(() => null), {
      fill: opts.fill || BAND,
      height: opts.height,
    });
    let labelWritten = false;
    layout.forEach((col, index) => {
      if (!col.aggregate) return;
      const cell = row.getCell(index + 1 + GUTTER);
      const letter = columnLetter(roll, index);
      const computed = computeAggregate(col.aggregate, rows.map((r) => valueAt(r, index)));
      const formula = Array.isArray(block)
        ? composedTotalFormula(col.aggregate, letter, block)
        : aggregateFormula(col.aggregate, letter, block.from, block.to);

      if (col.spec.money && isMoneyResult(col.aggregate, true)) {
        money(cell, formula ? { formula, result: computed ?? 0 } : (computed ?? 0));
      } else {
        // A count reads as the CRM writes it — "Count all 5", not a bare 5.
        const text = `${aggregateLabel(col.aggregate, col.spec.header)} ${countText(computed)}`;
        if (index === 0 && opts.label) {
          cell.value = `${opts.label} · ${text}`;
          labelWritten = true;
        } else {
          cell.value = text;
        }
      }
      cell.font = { name: FONT, bold: true, size: 10, color: { argb: INK } };
    });
    // The PO Source column has no CRM total; the sheet says how much of the
    // block's PO is paper someone actually typed.
    if (poSourceColumn >= 0) {
      const entered = rows.filter((r) => r.poBasis === "po").length;
      row.getCell(poSourceColumn + 1 + GUTTER).value = `${entered}/${rows.length} entered`;
    }
    if (opts.label && !labelWritten) row.getCell(1 + GUTTER).value = opts.label;
    return row;
  };

  /** A section header — the CRM's group chip, on its own row. */
  const writeSectionHeader = (label: string) => {
    const values: SheetValue[] = rollCols.map(() => null);
    values[0] = label;
    return bandRow(roll, rollCols, values, { fill: BAND_STRONG });
  };

  const sectionFooters: number[] = [];
  for (const tier of report.tiers) {
    writeSectionHeader(tier.label);
    const first = (roll.lastRow?.number || headRow) + 1;

    tier.rows.forEach((r, i) => {
      const row = dataRow(roll, rollCols, cellsOf.get(r) as SheetValue[], i);
      // An estimated PO is flagged where it is read rather than only in the
      // note at the top, so a subtotal is never mistaken for booked paper.
      if (r.poBasis === "revenue" && poColumn >= 0) {
        const cell = row.getCell(poColumn + 1 + GUTTER);
        cell.note = "No Technology Vendor PO Value entered — this is Revenue — Total Project.";
        cell.font = { name: FONT, size: 10, color: { argb: INK_SOFT }, italic: true };
      }
      if (sponsorship) applySponsorshipFormula(roll, row, sponsorship, r);
      // The fee is literally the PO cell times the rate, so the sheet says so.
      if (poColumn >= 0 && allianceColumn >= 0) {
        money(row.getCell(allianceColumn + 1 + GUTTER), {
          formula: `${columnLetter(roll, poColumn)}${row.number}*${rate}`,
          result: r.allianceFee,
        });
      }
    });

    const footer = writeFooter(tier.rows, { from: first, to: first + tier.rows.length - 1 });
    sectionFooters.push(footer.number);
  }

  writeFooter(report.rows, sectionFooters, {
    label: "TOTAL",
    height: 22,
    fill: BAND_STRONG,
  });

  // ---------------------------------------------------------------- sheet 2
  const fy = wb.addWorksheet("By Fiscal Year");
  fy.properties.defaultRowHeight = 16;

  const fyCols: ColumnSpec[] = [
    { header: "Fiscal Year", width: 14 },
    { header: "Open Revenue", width: 16, money: true },
    { header: "Open Margin", width: 15, money: true },
    { header: "Won Revenue", width: 16, money: true },
    { header: "Won Margin", width: 15, money: true },
    { header: "Open Sponsorship", width: 17, money: true },
    { header: "Won Sponsorship", width: 17, money: true },
    { header: "Total Revenue", width: 16, money: true },
    { header: "Cost", width: 15, money: true },
    { header: `Alliance ${pct(rate)}`, width: 15, money: true },
  ];

  const fyHead = writeSheetHeader(fy, {
    title: "LG Alliance — Fiscal Year Phasing",
    subtitle: `As of ${asOf} · ${scopeLabel}`,
    note:
      "Phased from the per-year revenue, margin and sponsorship carried on each deal. " +
      "Sponsorship splits open vs won the same way the project money does.",
  });
  writeTableHeader(fy, fyCols, fyHead);

  const fyRows = report.byFiscalYear.filter(
    (r) => r.revenue !== 0 || r.cost !== 0 || r.sponsorship !== 0,
  );
  fyRows.forEach((r, i) => {
    dataRow(fy, fyCols, [
      `FY${r.year}`,
      r.openRevenue, r.openMargin, r.wonRevenue, r.wonMargin,
      r.openSponsorship, r.wonSponsorship,
      r.revenue, r.cost, r.allianceFee,
    ], i);
  });
  const fyTotal = (pick: (r: (typeof fyRows)[number]) => number) =>
    fyRows.reduce((sum, r) => sum + pick(r), 0);
  bandRow(fy, fyCols, [
    "TOTAL",
    fyTotal((r) => r.openRevenue), fyTotal((r) => r.openMargin),
    fyTotal((r) => r.wonRevenue), fyTotal((r) => r.wonMargin),
    fyTotal((r) => r.openSponsorship), fyTotal((r) => r.wonSponsorship),
    fyTotal((r) => r.revenue), fyTotal((r) => r.cost),
    fyTotal((r) => r.allianceFee),
  ], { fill: BAND_STRONG, height: 22 });

  // Two supporting breakdowns beneath the year table.
  const sub = (title: string, rows: { label: string; deals: number; po: number }[]) => {
    fy.addRow({});
    const h = fy.addRow({});
    h.getCell(1 + GUTTER).value = title;
    h.getCell(1 + GUTTER).font = { name: FONT, bold: true, size: 11, color: { argb: INK } };
    h.height = 20;
    const cols: ColumnSpec[] = [
      { header: "", width: 24 },
      { header: "Deals", width: 10, align: "right" },
      { header: "PO Value", width: 16, money: true },
    ];
    const hr = fy.addRow({});
    cols.forEach((c, i) => {
      const cell = hr.getCell(i + 1 + GUTTER);
      cell.value = c.header;
      cell.font = { name: FONT, bold: true, size: 9, color: { argb: INK_SOFT } };
      cell.alignment = { horizontal: c.align || (c.money ? "right" : "left") };
      cell.border = { bottom: { style: "thin", color: { argb: LINE } } };
    });
    rows.forEach((r, i) => dataRow(fy, cols, [r.label, r.deals, r.po], i));
  };
  sub("By LG business unit", report.byBusinessUnit);
  sub("By league", report.byLeague);

  // ---------------------------------------------------------------- sheet 3
  const detail = wb.addWorksheet("Deal Detail");
  detail.properties.defaultRowHeight = 16;

  // The Deal Detail sheet mirrors the saved view: his columns, his order. The
  // one figure the report calculates rather than stores — the alliance fee —
  // follows the PO it is a percentage of, the same as on the rollup.
  const mirrored = mirror.columns;
  const detailLayout: { key: string; column?: MirrorColumn; spec: ColumnSpec }[] = [];
  if (mirrored.length) {
    const feeColumn = {
      key: ALLIANCE_FEE_KEY,
      spec: { header: `Alliance ${pct(rate)}`, width: 14, money: true },
    };
    detailLayout.push({ key: "opportunityNumber", spec: { header: "Opp #", width: 11 } });
    for (const c of mirrored) {
      detailLayout.push({
        key: c.fieldName,
        column: c,
        spec: { header: c.label, width: c.width, money: c.money, wrap: c.wrap },
      });
      if (c.fieldName === PO_FIELD) detailLayout.push(feeColumn);
    }
    if (!mirrored.some((c) => c.fieldName === PO_FIELD)) detailLayout.push(feeColumn);
  }
  const detailCols: ColumnSpec[] = detailLayout.length
    ? detailLayout.map((c) => c.spec)
    : LEGACY_DETAIL_COLS(rate);
  const detailSponsorship = sponsorshipLayoutFor(detailLayout.map((c) => c.key));

  const dHead = writeSheetHeader(detail, {
    title: "LG Alliance — Deal Detail",
    subtitle: `As of ${asOf} · ${scopeLabel} · ${report.rows.length} deals`,
    note: mirrored.length
      ? "Mirrors the LG Alliance Detail list in the CRM — the same columns, in the same order, so anything added there lands here. " +
        `Alliance ${pct(rate)} is calculated by this report from the PO beside it.` +
        (detailSponsorship
          ? " Sponsorship Value adds up its fiscal year columns as a live formula."
          : "") +
        (mirror.skipped.length
          ? ` Not carried across: ${mirror.skipped.join(", ")}.`
          : "")
      : "One row per LG opportunity, straight from the CRM. Technology Vendor PO Value is blank where none has been entered.",
  });
  writeTableHeader(detail, detailCols, dHead);

  report.rows.forEach((r, i) => {
    const raw = (r as unknown as { raw?: Record<string, any> }).raw || {};
    const values: SheetValue[] = detailLayout.length
      ? detailLayout.map((c) => {
          if (c.key === "opportunityNumber") return r.opportunityNumber || "";
          if (c.key === ALLIANCE_FEE_KEY) return r.allianceFee;
          return c.column ? cellValue(c.column, raw, fmtDate) : "";
        })
      : LEGACY_DETAIL_VALUES(r);
    const row = dataRow(detail, detailCols, values, i);
    if (detailSponsorship) applySponsorshipFormula(detail, row, detailSponsorship, r);
  });

  detail.autoFilter = {
    from: { row: dHead, column: 1 + GUTTER },
    to: { row: dHead + report.rows.length, column: detailCols.length + GUTTER },
  };

  return wb;
}

/**
 * How to fill a rollup column from the report row when there is no mirrored
 * view column behind it — the fallback layout, and any column the mirror
 * dropped. Keyed by the CRM's field names so both paths agree.
 */
const ROLLUP_FALLBACKS: Record<
  string,
  (r: LgAllianceReport["rows"][number]) => string | number | null
> = {
  company: (r) => r.account || "",
  lgTier: (r) => (r.tier ? r.tierLabel : ""),
  lgFiscalYear: (r) => fiscalYearLabel(r.fiscalYears),
  bidStatus: (r) => humanizeStatus(r.bidStatus),
  lgBusinessUnits: (r) => r.businessUnits.map(businessUnitLabel).join(", "),
  sponsorshipValue: (r) => r.sponsorshipValue,
  closeDate: (r) => fmtDate(r.awardDate),
  totalProjectRevenue: (r) => r.revenue,
  totalProjectMargin: (r) => r.margin,
  league: (r) => (r.league ? humanizeStatus(r.league) : ""),
  winConfidence: (r) => winConfidenceLabel(r.winConfidence),
  lgDescription: (r) => r.description || "",
  lgNotes: (r) => r.notes || "",
};

/** One rollup row, in the layout's column order. */
function rollupValues(
  r: LgAllianceReport["rows"][number],
  raw: Record<string, any>,
  layout: RollupColumn[],
): (string | number | null)[] {
  return layout.map((col) => {
    switch (col.key) {
      // The working PO — the entered value, or the revenue standing in for it.
      case PO_FIELD:
        return r.po;
      case PO_SOURCE_KEY:
        return r.poBasis === "po" ? "Entered" : "Estimated";
      case ALLIANCE_FEE_KEY:
        return r.allianceFee;
      // The CRM shows the name alone; the sheet keeps the opportunity number
      // with it so a row can be looked up without opening the record.
      case "name":
        return r.opportunityNumber ? `${r.name}  (#${r.opportunityNumber})` : r.name;
      default:
        if (col.column) return cellValue(col.column, raw, fmtDate);
        return ROLLUP_FALLBACKS[col.key]?.(r) ?? "";
    }
  });
}

/**
 * The rollup layout for when the view cannot be read — the CRM's labels and
 * order, hard-coded, so a metadata hiccup still produces the same sheet.
 */
function LEGACY_ROLLUP_LAYOUT(rate: number): RollupColumn[] {
  return [
    { key: "name", spec: { header: "Opportunity Name", width: 38, wrap: true } },
    { key: "company", spec: { header: "Company", width: 26 } },
    { key: "lgTier", spec: { header: "LG Tier", width: 11 } },
    { key: "lgFiscalYear", spec: { header: "LG FY", width: 16, wrap: true } },
    { key: "bidStatus", spec: { header: "Opportunity Status", width: 16 } },
    { key: "lgBusinessUnits", spec: { header: "LG Business Units", width: 22, wrap: true } },
    { key: PO_FIELD, spec: { header: "Technology Vendor PO Value", width: 19, money: true } },
    { key: PO_SOURCE_KEY, spec: { header: "PO Source", width: 13, align: "center" } },
    { key: ALLIANCE_FEE_KEY, spec: { header: `Alliance ${pct(rate)}`, width: 14, money: true } },
    { key: "sponsorshipValue", spec: { header: "Sponsorship Value", width: 17, money: true } },
    { key: "closeDate", spec: { header: "Award Date", width: 14 } },
    { key: "totalProjectRevenue", spec: { header: "Revenue — Total Project", width: 18, money: true } },
    { key: "totalProjectMargin", spec: { header: "Margin — Total Project", width: 18, money: true } },
    { key: "league", spec: { header: "Account Type / League", width: 16 } },
    { key: "lgDescription", spec: { header: "LG Description", width: 42, wrap: true } },
    { key: "lgNotes", spec: { header: "Internal Notes", width: 42, wrap: true } },
  ];
}

/**
 * The column set the sheet used before it mirrored the view. Kept as the
 * fallback for when the view cannot be read, so a metadata hiccup degrades to
 * the old report instead of no report.
 */
function LEGACY_DETAIL_COLS(rate: number): ColumnSpec[] {
  return [
    { header: "Opp #", width: 11 },
    { header: "Account", width: 26 },
    { header: "Opportunity", width: 38, wrap: true },
    { header: "Tier", width: 11 },
    { header: "FY", width: 16, wrap: true },
    { header: "Status", width: 16 },
    { header: "Win Confidence", width: 13, align: "right" },
    { header: "League", width: 14 },
    { header: "Award Date", width: 14 },
    { header: "Technology Vendor PO Value", width: 18, money: true },
    { header: `Alliance ${pct(rate)}`, width: 14, money: true },
    { header: "Sponsorship Value", width: 16, money: true },
    { header: "Revenue — Total Project", width: 17, money: true },
    { header: "Margin — Total Project", width: 17, money: true },
    { header: "LG Business Units", width: 22, wrap: true },
    { header: "Description", width: 42, wrap: true },
    { header: "Internal Notes", width: 42, wrap: true },
  ];
}

function LEGACY_DETAIL_VALUES(r: LgAllianceReport["rows"][number]): (string | number | null)[] {
  return [
    r.opportunityNumber || "",
    r.account || "",
    r.name,
    r.tier ? r.tierLabel : "",
    fiscalYearLabel(r.fiscalYears),
    humanizeStatus(r.bidStatus),
    winConfidenceLabel(r.winConfidence),
    r.league ? humanizeStatus(r.league) : "",
    fmtDate(r.awardDate),
    r.poValue,
    r.allianceFee,
    r.sponsorshipValue,
    r.revenue,
    r.margin,
    r.businessUnits.map(businessUnitLabel).join(", "),
    r.description || "",
    r.notes || "",
  ];
}

function usd(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}m`;
  if (abs >= 1_000) return `$${Math.round(value / 1_000)}k`;
  return `$${Math.round(value)}`;
}

export async function GET(request: NextRequest) {
  try {
    const params = new URL(request.url).searchParams;
    const scopeParam = params.get("scope");
    const requested: ReportScope =
      scopeParam === "open" || scopeParam === "won" || scopeParam === "all"
        ? scopeParam
        : "active";
    const rateParam = Number(params.get("rate"));
    const allianceRate =
      Number.isFinite(rateParam) && rateParam > 0 && rateParam < 1
        ? rateParam
        : ALLIANCE_RATE_DEFAULT;

    // A metadata failure must not cost the whole export — fall back to the
    // report's own column set, filter and order, and carry on.
    let mirror: ViewMirror = NO_VIEW;
    try {
      mirror = await fetchView();
    } catch (error) {
      console.error("[lg-alliance-report] could not read the view", error);
    }

    // The view already says which deals belong on the report, so no further
    // scoping is applied unless the caller asks for one by hand.
    const scope: ReportScope = scopeParam ? requested : mirror.filter ? "all" : "active";

    const deals = await fetchLgDeals(mirror.columns, mirror.filter);
    const report = buildLgAllianceReport(deals, {
      allianceRate,
      scope,
      sections: mirror.sectionOrder.length
        ? sectionsFromViewGroups(mirror.sectionOrder, mirror.sectionLabels)
        : undefined,
      sortRows: viewRowOrder(mirror),
    });

    if (params.get("format") === "json") {
      return withRenderCors(NextResponse.json(report), request);
    }

    const wb = buildWorkbook(report, scope, mirror);
    const buffer = await wb.xlsx.writeBuffer();
    const stamp = new Date(report.generatedAt).toISOString().slice(0, 10);
    return withRenderCors(new NextResponse(Buffer.from(buffer), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="ANC_LG_Alliance_Report_${stamp}.xlsx"`,
        "Cache-Control": "no-store",
      },
    }), request);
  } catch (error: any) {
    console.error("[lg-alliance-report] failed", error);
    return withRenderCors(
      NextResponse.json({ error: error?.message || "Failed to build the LG alliance report" }, { status: 500 }),
      request,
    );
  }
}
