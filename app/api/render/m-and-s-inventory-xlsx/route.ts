/**
 * GET /api/render/m-and-s-inventory-xlsx
 *
 * Streams a live Excel inventory file matching the format Grant + Jireh's M&S
 * team currently uses. Pulls placements + Nielsen verifications + contracts
 * directly from the CRM, then writes one workbook with:
 *   - One sheet per home team that has placements (Game Date, Time, Home, Away,
 *     networks, position columns with sponsor + inning per slot)
 *   - One "Sponsor Inventory" sheet listing every sponsor-team contract with
 *     contracted vs actual delivered counts
 *
 * Query params:
 *   ?season=2026   restrict to a season (default: 2026)
 *   ?league=MLB    restrict to a league (default: MLB)
 *
 * Behind FEATURES.M_AND_S_OPERATING_LAYER — flip to false to kill-switch.
 */

import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { FEATURES } from "@/lib/featureFlags";

export const runtime = "nodejs";
export const maxDuration = 90;

const TWENTY_BASE = "https://abc-twenty.izcgmb.easypanel.host";
const TWENTY_API_KEY =
  process.env.TWENTY_API_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkM2ZiYzI5YS1hNjM1LTQ4YjctOWQ2ZS0yNTA5NDE2NzdmZDAiLCJ0eXBlIjoiQVBJX0tFWSIsIndvcmtzcGFjZUlkIjoiZDNmYmMyOWEtYTYzNS00OGI3LTlkNmUtMjUwOTQxNjc3ZmQwIiwiaWF0IjoxNzc0ODEwNDkyLCJleHAiOjQ5Mjg0MTA0ODcsImp0aSI6IjYxMGEzMWEzLTJhMDgtNDM5MC1iMTU1LTFkN2M3NzY5Y2QxOSJ9.nzknS-bBNuf7y3LUCv2xEa5-9xuJNHBK3GalJwWK3eA";

type Placement = {
  id: string;
  gameDate: string | null;
  gameTime: string | null;
  inningScheduled: string | null;
  placementType: string | null;
  executionStatus: string | null;
  homeTVNetwork: string | null;
  awayTVNetwork: string | null;
  nationalTVNetwork: string | null;
  league: string | null;
  season: number | null;
  homeTeam: { id: string; name: string } | null;
  awayTeam: { id: string; name: string } | null;
  sponsor: { id: string; name: string } | null;
  slotRate: { amountMicros: number | null } | null;
  ancMargin: { amountMicros: number | null } | null;
  marginPercent: number | null;
};

type Contract = {
  id: string;
  league: string;
  season: number;
  contractedGames: number | null;
  contractedLabel: string | null;
  notes: string | null;
  sponsor: { name: string } | null;
  team: { name: string } | null;
};

const SHORT_TEAM: Record<string, string> = {
  "Arizona Diamondbacks": "D-backs",
  "New York Mets | Citi Field": "Mets",
  "New York Yankees | Yankee Stadium": "Yankees",
  "Boston Red Sox / Fenway Park": "Red Sox",
  "Philadelphia Phillies": "Phillies",
  "Pittsburgh Pirates": "Pirates",
  "Pittsburgh Pirates (PNC Park)": "Pirates",
  "Milwaukee Brewers": "Brewers",
  "Detroit Tigers": "Tigers",
  "Kansas City Royals": "Royals",
  "Los Angeles Angels": "Angels",
  "Miami Marlins": "Marlins",
  "St. Louis Cardinals": "Cardinals",
  "Toronto Blue Jays": "Blue Jays",
  "Seattle Mariners": "Mariners",
  "Tampa Bay Rays": "Rays",
  "Washington Nationals": "Nationals",
  "Cincinnati Reds": "Reds",
  "Colorado Rockies": "Rockies",
  "Chicago White Sox": "White Sox",
  "Chicago Cubs": "Cubs",
  "Houston Astros (Daikin Park)": "Astros",
  "San Diego Padres": "Padres",
  "Atlanta Braves": "Braves",
  "Minnesota Twins": "Twins",
  "Cleveland Guardians": "Guardians",
  "Los Angeles Dodgers": "Dodgers",
  "San Francisco Giants": "Giants",
  "Baltimore Orioles": "Orioles",
  "Athletics (Las Vegas Athletics)": "Athletics",
};

const SHORT_SPONSOR: Record<string, string> = {
  "Tire Rack.com": "Tire Rack",
  "Hankook Tire America Corp.": "Hankook",
  "Lucas Oil Products Inc": "Lucas Oil",
  "Lumber Liquidators Flooring": "Lumber Liquidators",
  "LG Electronics": "LG",
  "Kumho Tire": "Kumho",
  "Kenda Tire": "Kenda",
  "Bigelow Tea": "Bigelow",
  "Cabinets To Go": "Cabinets To Go",
  "Authority Brands": "Authority Brands",
  "Discount Tire": "Discount Tire",
};

const POSITION_LABEL: Record<string, string> = {
  HOMEPLATE_FULL_1: "Homeplate Full #1",
  HOMEPLATE_FULL_2: "Homeplate Full #2",
  HOMEPLATE_HALF_1: "Homeplate Half #1",
  HOMEPLATE_HALF_2: "Homeplate Half #2",
  SMALL_HOMEPLATE_1: "Small Homeplate #1",
  SMALL_HOMEPLATE_2: "Small Homeplate #2",
  OTHER: "Other",
};

async function gql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(`${TWENTY_BASE}/graphql`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TWENTY_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });
  const body: { data?: T; errors?: Array<{ message: string }> } = await res.json();
  if (!res.ok || body.errors?.length) {
    throw new Error(`Twenty GraphQL ${res.status}: ${JSON.stringify(body.errors || body)}`);
  }
  if (!body.data) throw new Error("No data");
  return body.data;
}

async function fetchAllPlacements(season: number, league: string): Promise<Placement[]> {
  const out: Placement[] = [];
  let after: string | null = null;
  while (true) {
    const data: {
      mediaPlacements: {
        edges: Array<{ node: Placement; cursor: string }>;
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
      };
    } = await gql(
      `query Pg($filter: MediaPlacementFilterInput, $first: Int, $after: String) {
        mediaPlacements(filter: $filter, first: $first, after: $after) {
          edges { node {
            id gameDate gameTime inningScheduled placementType executionStatus
            homeTVNetwork awayTVNetwork nationalTVNetwork league season
            homeTeam { id name } awayTeam { id name } sponsor { id name }
            slotRate { amountMicros } ancMargin { amountMicros } marginPercent
          } cursor }
          pageInfo { hasNextPage endCursor }
        }
      }`,
      {
        filter: { season: { eq: season }, league: { eq: league } },
        first: 200,
        after,
      },
    );
    out.push(...data.mediaPlacements.edges.map((e) => e.node));
    if (!data.mediaPlacements.pageInfo.hasNextPage) break;
    after = data.mediaPlacements.pageInfo.endCursor;
  }
  return out;
}

async function fetchAllContracts(season: number, league: string): Promise<Contract[]> {
  const out: Contract[] = [];
  let after: string | null = null;
  while (true) {
    const data: {
      sponsorTeamContracts: {
        edges: Array<{ node: Contract; cursor: string }>;
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
      };
    } = await gql(
      `query Pg($filter: SponsorTeamContractFilterInput, $first: Int, $after: String) {
        sponsorTeamContracts(filter: $filter, first: $first, after: $after) {
          edges { node {
            id league season contractedGames contractedLabel notes
            sponsor { name } team { name }
          } cursor }
          pageInfo { hasNextPage endCursor }
        }
      }`,
      {
        filter: { season: { eq: season }, league: { eq: league } },
        first: 200,
        after,
      },
    );
    out.push(...data.sponsorTeamContracts.edges.map((e) => e.node));
    if (!data.sponsorTeamContracts.pageInfo.hasNextPage) break;
    after = data.sponsorTeamContracts.pageInfo.endCursor;
  }
  return out;
}

function shortTeam(name: string | null | undefined) {
  if (!name) return "";
  return SHORT_TEAM[name] || name;
}

function shortSponsor(name: string | null | undefined) {
  if (!name) return "";
  return SHORT_SPONSOR[name] || name;
}

// Excel forbids * ? : \ / [ ] in sheet names, ≤31 chars, no leading/trailing apostrophe.
function safeSheetName(name: string): string {
  return (name || "")
    .replace(/[\*\?:\\\/\[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^'+|'+$/g, "")
    .slice(0, 31)
    .trim();
}

async function buildWorkbook(season: number, league: string): Promise<Buffer> {
  const [placements, contracts] = await Promise.all([
    fetchAllPlacements(season, league),
    fetchAllContracts(season, league),
  ]);

  const wb = new ExcelJS.Workbook();
  wb.creator = "ANC CRM — M&S Operating Layer";
  wb.created = new Date();

  // ----- Summary sheet -----
  const summary = wb.addWorksheet("Summary", { views: [{ showGridLines: false }] });
  summary.columns = [
    { header: "Sponsor", key: "sponsor", width: 28 },
    { header: "Team", key: "team", width: 26 },
    { header: "League", key: "league", width: 10 },
    { header: "Season", key: "season", width: 8 },
    { header: "Contracted", key: "contracted", width: 14 },
    { header: "Actual (delivered/scheduled)", key: "actual", width: 28 },
    { header: "Variance", key: "variance", width: 12 },
    { header: "Notes", key: "notes", width: 40 },
  ];
  summary.getRow(1).font = { bold: true };
  summary.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE6F4FF" },
  };

  // Tally actuals: count placements by sponsor+homeTeam (where executionStatus is anything but POSTPONED)
  const actuals = new Map<string, number>();
  for (const p of placements) {
    const sName = p.sponsor?.name;
    const tName = p.homeTeam?.name;
    if (!sName || !tName) continue;
    if (p.executionStatus === "POSTPONED") continue;
    const k = `${sName} ${tName}`;
    actuals.set(k, (actuals.get(k) || 0) + 1);
  }

  // Sort contracts: sponsor name asc, team name asc
  const sortedContracts = [...contracts].sort((a, b) => {
    const aS = a.sponsor?.name || "";
    const bS = b.sponsor?.name || "";
    if (aS !== bS) return aS.localeCompare(bS);
    return (a.team?.name || "").localeCompare(b.team?.name || "");
  });

  for (const c of sortedContracts) {
    const sName = c.sponsor?.name || "";
    const tName = c.team?.name || "";
    const key = `${sName} ${tName}`;
    const actual = actuals.get(key) || 0;
    const contracted = c.contractedGames || 0;
    const contractedDisplay = contracted > 0 ? contracted : (c.contractedLabel || "");
    const variance = contracted > 0 ? actual - contracted : "";
    summary.addRow({
      sponsor: shortSponsor(sName),
      team: shortTeam(tName),
      league: c.league,
      season: c.season,
      contracted: contractedDisplay,
      actual,
      variance,
      notes: c.notes || "",
    });
  }

  // Color-code Variance column
  summary.eachRow({ includeEmpty: false }, (row, rowNum) => {
    if (rowNum === 1) return;
    const v = row.getCell("variance").value;
    if (typeof v === "number") {
      row.getCell("variance").fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: v >= 0 ? "FFD4F4DD" : "FFFADBD8" },
      };
    }
  });

  // ----- Per-team sheets -----
  const byHomeTeam = new Map<string, Placement[]>();
  for (const p of placements) {
    const t = p.homeTeam?.name;
    if (!t) continue;
    if (!byHomeTeam.has(t)) byHomeTeam.set(t, []);
    byHomeTeam.get(t)!.push(p);
  }

  // For each team, group placements by gameDate, then list sponsors per date
  const sortedTeams = [...byHomeTeam.keys()].sort();
  const usedSheetNames = new Set<string>();
  for (const team of sortedTeams) {
    let sheetName = safeSheetName(shortTeam(team) || team);
    // Excel requires unique, non-empty, ≤31-char sheet names.
    let base = sheetName || "Team";
    let n = 2;
    while (usedSheetNames.has(sheetName)) {
      sheetName = `${base.slice(0, 28)} ${n++}`;
    }
    usedSheetNames.add(sheetName);
    const ws = wb.addWorksheet(sheetName, { views: [{ showGridLines: false }] });

    ws.getCell("A1").value = `${season} ANC ${league} Inventory`;
    ws.getCell("A1").font = { bold: true, size: 12 };
    ws.getCell("A2").value = `Team: ${team}`;
    ws.getCell("A2").font = { italic: true, size: 10 };
    ws.mergeCells("A1:H1");
    ws.mergeCells("A2:H2");

    // Header row at row 4
    const headerRow = ws.getRow(4);
    headerRow.values = [
      "Game Date",
      "Time (EST)",
      "Away Team",
      "Home TV Network",
      "Away TV Network",
      "National TV Network",
      "Sponsor",
      "Position",
      "Inning",
      "Status",
    ];
    headerRow.font = { bold: true, size: 10 };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE6F4FF" },
    };
    [12, 10, 22, 22, 22, 22, 22, 22, 10, 16].forEach((w, i) => {
      ws.getColumn(i + 1).width = w;
    });

    // Sort by date+time, then position
    const teamPlacements = byHomeTeam.get(team)!.slice().sort((a, b) => {
      const da = (a.gameDate || "") + (a.gameTime || "");
      const db = (b.gameDate || "") + (b.gameTime || "");
      if (da !== db) return da.localeCompare(db);
      return (a.placementType || "").localeCompare(b.placementType || "");
    });

    for (const p of teamPlacements) {
      const row = ws.addRow([
        p.gameDate ? new Date(p.gameDate) : "",
        p.gameTime || "",
        shortTeam(p.awayTeam?.name),
        p.homeTVNetwork || "",
        p.awayTVNetwork || "",
        p.nationalTVNetwork || "",
        shortSponsor(p.sponsor?.name),
        POSITION_LABEL[p.placementType || ""] || "",
        p.inningScheduled || "",
        p.executionStatus || "",
      ]);
      row.getCell(1).numFmt = "yyyy-mm-dd";
      // Color execution status
      const status = p.executionStatus;
      if (status === "EXECUTED") {
        row.getCell(10).font = { color: { argb: "FF2E7D32" }, bold: true };
      } else if (status === "NOT_EXECUTED") {
        row.getCell(10).font = { color: { argb: "FFC62828" }, bold: true };
      } else if (status === "NATIONAL_GAME") {
        row.getCell(10).font = { color: { argb: "FF1565C0" }, bold: true };
      } else if (status === "POSTPONED") {
        row.getCell(10).font = { color: { argb: "FFEF6C00" }, bold: true };
      }
    }

    // Freeze header
    ws.views = [{ state: "frozen", ySplit: 4, showGridLines: false }];
  }

  // ----- Deal Value sheet (round-trip: M&S team fills Slot Rate + ANC Margin, re-upload) -----
  const val = wb.addWorksheet("Deal Value", { views: [{ showGridLines: false }] });
  val.columns = [
    { header: "Placement ID (do not edit)", key: "id", width: 38 },
    { header: "Game Date", key: "date", width: 12 },
    { header: "Home Team", key: "home", width: 22 },
    { header: "Away Team", key: "away", width: 22 },
    { header: "Sponsor", key: "sponsor", width: 22 },
    { header: "Position", key: "position", width: 20 },
    { header: "Slot Rate ($)", key: "slotRate", width: 14 },
    { header: "ANC Margin ($)", key: "ancMargin", width: 16 },
    { header: "Margin % (auto)", key: "marginPct", width: 14 },
  ];
  val.getRow(1).font = { bold: true };
  val.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE6F4FF" } };
  const valSorted = placements.slice().sort((a, b) => {
    const da = (a.gameDate || "") + (a.gameTime || "");
    const db = (b.gameDate || "") + (b.gameTime || "");
    if (da !== db) return da.localeCompare(db);
    return (a.homeTeam?.name || "").localeCompare(b.homeTeam?.name || "");
  });
  for (const p of valSorted) {
    const r = val.addRow({
      id: p.id,
      date: p.gameDate ? new Date(p.gameDate) : "",
      home: shortTeam(p.homeTeam?.name),
      away: shortTeam(p.awayTeam?.name),
      sponsor: shortSponsor(p.sponsor?.name),
      position: POSITION_LABEL[p.placementType || ""] || "",
      slotRate: p.slotRate?.amountMicros != null ? p.slotRate.amountMicros / 1_000_000 : "",
      ancMargin: p.ancMargin?.amountMicros != null ? p.ancMargin.amountMicros / 1_000_000 : "",
      marginPct: p.marginPercent != null ? p.marginPercent : "",
    });
    r.getCell("date").numFmt = "yyyy-mm-dd";
    r.getCell("slotRate").numFmt = '#,##0.00';
    r.getCell("ancMargin").numFmt = '#,##0.00';
    r.getCell("marginPct").numFmt = '0.0"%"';
    r.getCell("id").font = { color: { argb: "FF9A9A96" }, size: 9 };
  }
  val.views = [{ state: "frozen", ySplit: 1, showGridLines: false }];

  return Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer);
}

export async function GET(req: NextRequest) {
  if (!FEATURES.M_AND_S_OPERATING_LAYER) {
    return NextResponse.json({ error: "Not enabled" }, { status: 404 });
  }
  const url = new URL(req.url);
  const season = Number(url.searchParams.get("season") || "2026");
  const league = (url.searchParams.get("league") || "MLB").toUpperCase();
  try {
    const buf = await buildWorkbook(season, league);
    const filename = `ANC ${league} Inventory ${season}.xlsx`;
    return new Response(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
