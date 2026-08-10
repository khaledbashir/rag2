/**
 * GET /api/render/user-activity-report-xlsx
 *
 * CRM user-activity report (Jireh 2026-08-10): daily, weekly, and monthly
 * active users plus each person's last activity, as a branded workbook in the
 * same house style as the invoicing and opportunities exports.
 *
 * "Active" = performed a recorded action in the CRM. The CRM keeps no login or
 * page-view log, so a read-only session does not register; the workbook states
 * that on its face rather than letting the number be read as logins.
 *
 * `?format=json` returns the same figures as JSON for agents and dashboards.
 *
 * Auth-exempt via the /api/render/* allowlist — openable as a direct link.
 */
import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import {
  BUCKET_LABELS,
  BUCKET_ORDER,
  buildUserActivityReport,
  humanizeActionName,
  type MemberActivityInput,
} from "@/services/reports/userActivity";

export const runtime = "nodejs";
export const maxDuration = 60;

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

/**
 * The timeline holds ~900k rows, so the report never scans it. It reads the
 * member roster once, then asks for each member's single most recent event —
 * which yields both "last activity" and the active-window counts.
 */
async function fetchMemberActivity(): Promise<MemberActivityInput[]> {
  const roster: any = await gql(
    `query { workspaceMembers(first: 200) { edges { node {
      id userEmail name { firstName lastName }
    } } } }`,
  );

  const members = (roster.workspaceMembers?.edges || []).map((e: any) => e.node);

  return Promise.all(
    members.map(async (member: any) => {
      const name = [member.name?.firstName, member.name?.lastName]
        .filter(Boolean)
        .join(" ")
        .trim();
      let lastActivityAt: string | null = null;
      let lastActionName: string | null = null;
      try {
        const d: any = await gql(
          `query Q($id: UUID!) { timelineActivities(
             filter: { workspaceMemberId: { eq: $id } }
             orderBy: { createdAt: DescNullsLast }
             first: 1
           ) { edges { node { createdAt name } } } }`,
          { id: member.id },
        );
        const node = d.timelineActivities?.edges?.[0]?.node;
        if (node) {
          lastActivityAt = node.createdAt;
          lastActionName = node.name;
        }
      } catch {
        // One member's lookup failing must not sink the whole report — they
        // simply read as having no recorded activity.
      }
      return {
        id: member.id,
        name: name || member.userEmail || "Unknown",
        email: member.userEmail || "",
        lastActivityAt,
        lastActionName,
      };
    }),
  );
}

function fmtDateTime(value: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-US", {
    year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

export async function GET(request: NextRequest) {
  try {
    const members = await fetchMemberActivity();
    const report = buildUserActivityReport(members);

    if (new URL(request.url).searchParams.get("format") === "json") {
      return NextResponse.json(report);
    }

    // --- house report palette (matches invoicing-report-xlsx) ---
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
    const ws = wb.addWorksheet("User Activity");
    ws.properties.defaultRowHeight = 16;

    const cols = [
      { header: "Name", key: "name", width: 26 },
      { header: "Email", key: "email", width: 34 },
      { header: "Last Activity", key: "last", width: 22 },
      { header: "Last Action", key: "action", width: 26 },
      { header: "Days Since", key: "days", width: 12 },
    ];
    const NC = cols.length;
    const COL1 = 1 + OFF;
    const COLN = NC + OFF;
    const col = (i: number) => i + 1 + OFF;
    ws.getColumn(1).width = 2.6;
    cols.forEach((c, i) => { ws.getColumn(col(i)).width = c.width; });

    const asOf = new Date(report.generatedAt).toLocaleString("en-US", {
      year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
    });

    const tTitle = ws.getRow(2);
    tTitle.getCell(COL1).value = "User Activity Report";
    tTitle.getCell(COL1).font = { name: FONT, size: 18, color: { argb: TITLE_GREY } };
    tTitle.height = 24;

    const tSub = ws.getRow(3);
    tSub.getCell(COL1).value = `As of ${asOf}`;
    tSub.getCell(COL1).font = { name: FONT, size: 10, color: { argb: INK_SOFT } };

    const s = report.summary;
    const tCount = ws.getRow(4);
    tCount.getCell(COL1).value =
      `Daily active ${s.daily} · Weekly active ${s.weekly} · Monthly active ${s.monthly}` +
      ` — of ${s.totalMembers} people on the workspace`;
    tCount.getCell(COL1).font = { name: FONT, bold: true, size: 11, color: { argb: INK } };

    const tNote = ws.getRow(5);
    tNote.getCell(COL1).value =
      "Active means the person created or changed something in the CRM. Viewing without making a change is not recorded.";
    tNote.getCell(COL1).font = { name: FONT, size: 9, italic: true, color: { argb: INK_SOFT } };

    const HEAD_ROW = 7;
    const head = ws.getRow(HEAD_ROW);
    cols.forEach((c, i) => {
      const cell = head.getCell(col(i));
      cell.value = c.header;
      cell.font = { name: FONT, bold: true, size: 10, color: { argb: INK } };
      cell.alignment = { vertical: "middle", horizontal: c.key === "days" ? "right" : "left", wrapText: true };
      cell.border = { bottom: { style: "medium", color: { argb: "FFB7B2A6" } } };
    });
    head.height = 24;
    ws.views = [{ state: "frozen", ySplit: HEAD_ROW, showGridLines: false }];
    while ((ws.lastRow?.number || 0) < HEAD_ROW) ws.addRow({});

    for (const bucket of BUCKET_ORDER) {
      const list = report.rows.filter((r) => r.bucket === bucket);
      if (list.length === 0) continue;

      const gh = ws.addRow({});
      gh.getCell(COL1).value = BUCKET_LABELS[bucket];
      gh.getCell(COLN).value = `${list.length} ${list.length === 1 ? "person" : "people"}`;
      gh.getCell(COLN).alignment = { horizontal: "right" };
      gh.getCell(COLN).font = { name: FONT, size: 9, color: { argb: INK_SOFT } };
      for (let c = COL1; c <= COLN; c++) {
        const cell = gh.getCell(c);
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BAND } };
        if (c === COL1) cell.font = { name: FONT, bold: true, size: 11, color: { argb: INK } };
        cell.border = { bottom: { style: "thin", color: { argb: LINE } } };
      }
      gh.height = 20;

      list.forEach((r, i) => {
        const row = ws.addRow({});
        const vals = [
          r.name,
          r.email,
          r.lastActivityAt ? fmtDateTime(r.lastActivityAt) : "Never",
          humanizeActionName(r.lastActionName),
          r.daysSinceLastActivity === null ? "" : r.daysSinceLastActivity,
        ];
        cols.forEach((c, ci) => {
          const cell = row.getCell(col(ci));
          cell.value = vals[ci] as any;
          cell.font = { name: FONT, size: 10, color: { argb: INK } };
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: i % 2 ? PAPER_ALT : PAPER } };
          cell.alignment = {
            vertical: "middle",
            horizontal: c.key === "days" ? "right" : "left",
          };
          cell.border = { bottom: { style: "hair", color: { argb: LINE } } };
        });
      });
    }

    const buffer = await wb.xlsx.writeBuffer();
    const stamp = new Date(report.generatedAt).toISOString().slice(0, 10);
    return new NextResponse(Buffer.from(buffer), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="ANC_User_Activity_${stamp}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error: any) {
    console.error("[user-activity-report] failed", error);
    return NextResponse.json(
      { error: error?.message || "Failed to build the user activity report" },
      { status: 500 },
    );
  }
}
