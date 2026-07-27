/**
 * GET /api/render/invoicing-report-xlsx
 *
 * One-click formatted Excel export of the CRM "Invoicing Report" (Krissy).
 * Pulls every auto-created "Invoice — …" task live from the CRM and renders
 * the same Salesforce-style branded workbook as the opportunities export:
 * Opp # / Opportunity / Invoiced / Date Invoiced / Invoiced By / Status,
 * grouped Awaiting Invoice → Invoiced with a running invoiced count on top.
 *
 * Auth-exempt via the /api/render/* allowlist — openable as a direct link.
 */
import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";

export const runtime = "nodejs";
export const maxDuration = 60;

const TWENTY_BASE = "https://abc-twenty.izcgmb.easypanel.host";
const TWENTY_TOKEN =
  process.env.TWENTY_API_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkM2ZiYzI5YS1hNjM1LTQ4YjctOWQ2ZS0yNTA5NDE2NzdmZDAiLCJ0eXBlIjoiQVBJX0tFWSIsIndvcmtzcGFjZUlkIjoiZDNmYmMyOWEtYTYzNS00OGI3LTlkNmUtMjUwOTQxNjc3ZmQwIiwiaWF0IjoxNzc0ODEwNDkyLCJleHAiOjQ5Mjg0MTA0ODcsImp0aSI6IjYxMGEzMWEzLTJhMDgtNDM5MC1iMTU1LTFkN2M3NzY5Y2QxOSJ9.nzknS-bBNuf7y3LUCv2xEa5-9xuJNHBK3GalJwWK3eA";

const TASK_STATUS_LABEL: Record<string, string> = {
  TODO: "To do",
  IN_PROGRESS: "In progress",
  DONE: "Done",
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

// Same filter as the CRM "Invoicing Report" view: title CONTAINS "Invoice —".
async function fetchInvoiceTasks(): Promise<any[]> {
  const out: any[] = [];
  let cursor: string | null = null;
  while (true) {
    const d: any = await gql(
      `query Q($after: String) {
        tasks(
          filter: { title: { ilike: "%Invoice —%" } }
          first: 200
          after: $after
          orderBy: { id: AscNullsLast }
        ) {
          edges { node {
            id title status createdAt
            invoiced dateInvoiced invoicedBy opportunityNumber
            assignee { name { firstName lastName } }
          } }
          pageInfo { hasNextPage endCursor }
        }
      }`,
      { after: cursor },
    );
    for (const e of d.tasks.edges) out.push(e.node);
    if (!d.tasks.pageInfo.hasNextPage) break;
    cursor = d.tasks.pageInfo.endCursor;
  }
  return out;
}

const fmtDate = (s: string | null): string => {
  if (!s) return "";
  const d = new Date(String(s).slice(0, 10) + "T00:00:00");
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US");
};

// Task titles are "Invoice — <opp name> (#<num>)" — recover the opportunity
// name for its own column; fall back to the full title if the shape differs.
const oppNameFromTitle = (title: string): string => {
  const m = String(title || "").match(/^Invoice\s+—\s+(.*?)(?:\s+\(#[^)]*\))?$/);
  return m ? m[1] : String(title || "");
};

export async function GET(_req: NextRequest) {
  try {
    const tasks = await fetchInvoiceTasks();
    const byCreatedDesc = (a: any, b: any) =>
      String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
    const pending = tasks.filter((t) => !t.invoiced).sort(byCreatedDesc);
    const done = tasks.filter((t) => !!t.invoiced).sort(byCreatedDesc);

    // --- Salesforce-style clean report palette (matches opportunities-xlsx) ---
    const PAPER = "FFFAF9F6";
    const PAPER_ALT = "FFF3F1EC";
    const BAND = "FFECE9E1";
    const INK = "FF3A3D42";
    const INK_SOFT = "FF74777C";
    const LINE = "FFD7D3C9";
    const TITLE_GREY = "FF56585B";
    const FONT = "Calibri";
    const OFF = 1;

    const wb = new ExcelJS.Workbook();
    wb.creator = "ANC";
    const ws = wb.addWorksheet("Invoicing Report");
    ws.properties.defaultRowHeight = 16;
    ws.views = [{ showGridLines: false }];

    const cols = [
      { header: "Opp #", key: "num", width: 10 },
      { header: "Opportunity", key: "name", width: 52 },
      { header: "Invoiced", key: "invoiced", width: 10 },
      { header: "Date Invoiced", key: "date", width: 14 },
      { header: "Invoiced By", key: "by", width: 20 },
      { header: "Status", key: "status", width: 12 },
      { header: "Created", key: "created", width: 12 },
    ];
    const NC = cols.length;
    const COL1 = 1 + OFF;
    const COLN = NC + OFF;
    const col = (i: number) => i + 1 + OFF;
    ws.getColumn(1).width = 2.6;
    cols.forEach((c, i) => { ws.getColumn(col(i)).width = c.width; });

    // Title block
    const asOf = new Date().toLocaleString("en-US", {
      year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
    });
    const tTitle = ws.getRow(2);
    tTitle.getCell(COL1).value = "Invoicing Report";
    tTitle.getCell(COL1).font = { name: FONT, size: 18, color: { argb: TITLE_GREY } };
    tTitle.height = 24;
    const tSub = ws.getRow(3);
    tSub.getCell(COL1).value = `As of ${asOf}`;
    tSub.getCell(COL1).font = { name: FONT, size: 10, color: { argb: INK_SOFT } };

    // Running count — visible on open
    const tCount = ws.getRow(4);
    tCount.getCell(COL1).value = `Invoiced ${done.length} of ${tasks.length}` +
      (pending.length ? ` — ${pending.length} awaiting invoice` : " — all invoiced");
    tCount.getCell(COL1).font = { name: FONT, bold: true, size: 11, color: { argb: INK } };

    // Header row
    const HEAD_ROW = 6;
    const head = ws.getRow(HEAD_ROW);
    cols.forEach((c, i) => {
      const cell = head.getCell(col(i));
      cell.value = c.header;
      cell.font = { name: FONT, bold: true, size: 10, color: { argb: INK } };
      cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
      cell.border = { bottom: { style: "medium", color: { argb: "FFB7B2A6" } } };
    });
    head.height = 28;
    ws.views = [{ state: "frozen", ySplit: HEAD_ROW, showGridLines: false }];
    while ((ws.lastRow?.number || 0) < HEAD_ROW) ws.addRow({});

    const addGroup = (label: string, list: any[]) => {
      const gh = ws.addRow({});
      gh.getCell(COL1).value = label;
      gh.getCell(COLN).value = `${list.length} deal${list.length === 1 ? "" : "s"}`;
      gh.getCell(COLN).alignment = { horizontal: "right" };
      gh.getCell(COLN).font = { name: FONT, size: 9, color: { argb: INK_SOFT } };
      for (let c = COL1; c <= COLN; c++) {
        const cell = gh.getCell(c);
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BAND } };
        if (c === COL1) cell.font = { name: FONT, bold: true, size: 11, color: { argb: INK } };
        cell.border = { bottom: { style: "thin", color: { argb: LINE } } };
      }
      gh.height = 20;
      list.forEach((t, i) => {
        const row = ws.addRow({});
        const vals = [
          t.opportunityNumber || "",
          oppNameFromTitle(t.title),
          t.invoiced ? "Yes" : "No",
          fmtDate(t.dateInvoiced),
          t.invoicedBy || "",
          TASK_STATUS_LABEL[t.status] || t.status || "",
          fmtDate(t.createdAt),
        ];
        cols.forEach((_c, ci) => {
          const cell = row.getCell(col(ci));
          cell.value = vals[ci] as any;
          cell.font = { name: FONT, size: 10, color: { argb: INK } };
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: i % 2 ? PAPER_ALT : PAPER } };
          cell.alignment = { vertical: "middle", wrapText: false };
        });
      });
      ws.addRow({});
    };
    if (pending.length) addGroup("Awaiting Invoice", pending);
    if (done.length) addGroup("Invoiced", done);

    // Total line
    const gt = ws.addRow({});
    gt.getCell(COL1).value = `Total — ${tasks.length} deals · ${done.length} invoiced · ${pending.length} awaiting`;
    gt.getCell(COL1).font = { name: FONT, bold: true, size: 11, color: { argb: INK } };
    for (let c = COL1; c <= COLN; c++) {
      gt.getCell(c).border = { top: { style: "medium", color: { argb: "FF8A857A" } } };
    }
    gt.height = 22;

    // Paint the used range off-white so it reads as one clean canvas
    const lastRow = ws.lastRow!.number;
    for (let r = 1; r <= lastRow; r++) {
      const row = ws.getRow(r);
      for (let c = 1; c <= COLN; c++) {
        const cell = row.getCell(c);
        if (!cell.fill || (cell.fill as any).pattern === undefined) {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PAPER } };
        }
      }
    }
    ws.autoFilter = {
      from: { row: HEAD_ROW, column: COL1 },
      to: { row: HEAD_ROW, column: COLN },
    };

    const buf = await wb.xlsx.writeBuffer();
    const stamp = new Date().toISOString().slice(0, 10);
    return new NextResponse(buf as any, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="ANC Invoicing Report ${stamp}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
