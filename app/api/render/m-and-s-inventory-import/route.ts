/**
 * POST /api/render/m-and-s-inventory-import
 *
 * Round-trip companion to /api/render/m-and-s-inventory-xlsx. Accepts the edited
 * workbook (multipart "file"), reads the "Deal Value" sheet, and writes Slot Rate
 * + ANC Margin back onto each placement (keyed by the Placement ID column).
 * Margin % is recomputed automatically (margin / rate * 100).
 *
 * Only the Deal Value sheet is read — game grid edits are not ingested here.
 * Rows with a blank Slot Rate AND blank ANC Margin are skipped (no fabrication).
 *
 * Behind FEATURES.M_AND_S_OPERATING_LAYER — same gate as the export.
 */

import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { FEATURES } from "@/lib/featureFlags";

export const runtime = "nodejs";
export const maxDuration = 120;

const TWENTY_BASE = "https://abc-twenty.izcgmb.easypanel.host";
const TWENTY_API_KEY =
  process.env.TWENTY_API_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkM2ZiYzI5YS1hNjM1LTQ4YjctOWQ2ZS0yNTA5NDE2NzdmZDAiLCJ0eXBlIjoiQVBJX0tFWSIsIndvcmtzcGFjZUlkIjoiZDNmYmMyOWEtYTYzNS00OGI3LTlkNmUtMjUwOTQxNjc3ZmQwIiwiaWF0IjoxNzc0ODEwNDkyLCJleHAiOjQ5Mjg0MTA0ODcsImp0aSI6IjYxMGEzMWEzLTJhMDgtNDM5MC1iMTU1LTFkN2M3NzY5Y2QxOSJ9.nzknS-bBNuf7y3LUCv2xEa5-9xuJNHBK3GalJwWK3eA";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

function cellNumber(v: ExcelJS.CellValue): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return v;
  if (typeof v === "object" && "result" in v && typeof v.result === "number") return v.result;
  const n = Number(String(v).replace(/[$,%\s]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function cellString(v: ExcelJS.CellValue): string {
  if (v == null) return "";
  if (typeof v === "object" && "text" in v && typeof v.text === "string") return v.text.trim();
  return String(v).trim();
}

export async function POST(req: NextRequest) {
  if (!FEATURES.M_AND_S_OPERATING_LAYER) {
    return NextResponse.json({ error: "Not enabled" }, { status: 404 });
  }

  let buf: Buffer;
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file uploaded (field 'file')" }, { status: 400 });
    }
    buf = Buffer.from(await file.arrayBuffer());
  } catch (err) {
    return NextResponse.json(
      { error: `Could not read upload: ${err instanceof Error ? err.message : String(err)}` },
      { status: 400 },
    );
  }

  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
  } catch {
    return NextResponse.json({ error: "File is not a valid .xlsx workbook" }, { status: 400 });
  }

  const sheet = wb.getWorksheet("Deal Value");
  if (!sheet) {
    return NextResponse.json(
      { error: 'Workbook has no "Deal Value" sheet — re-download the export and edit that sheet.' },
      { status: 400 },
    );
  }

  // Map header -> column index from row 1.
  const headerRow = sheet.getRow(1);
  const col: Record<string, number> = {};
  headerRow.eachCell((cell, c) => {
    const h = cellString(cell.value).toLowerCase();
    if (h.startsWith("placement id")) col.id = c;
    else if (h.startsWith("slot rate")) col.slotRate = c;
    else if (h.startsWith("anc margin")) col.ancMargin = c;
  });
  if (!col.id || !col.slotRate || !col.ancMargin) {
    return NextResponse.json(
      { error: "Deal Value sheet missing expected columns (Placement ID / Slot Rate / ANC Margin)" },
      { status: 400 },
    );
  }

  const results = { updated: 0, skipped: 0, badId: 0, errors: [] as string[] };

  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const id = cellString(row.getCell(col.id).value);
    if (!id) continue;
    if (!UUID_RE.test(id)) {
      results.badId++;
      continue;
    }
    const rate = cellNumber(row.getCell(col.slotRate).value);
    const margin = cellNumber(row.getCell(col.ancMargin).value);

    // No fabrication: skip rows where both are blank.
    if (rate == null && margin == null) {
      results.skipped++;
      continue;
    }

    const data: Record<string, unknown> = {};
    if (rate != null) data.slotRate = { amountMicros: Math.round(rate * 1_000_000), currencyCode: "USD" };
    if (margin != null) data.ancMargin = { amountMicros: Math.round(margin * 1_000_000), currencyCode: "USD" };
    if (rate != null && rate !== 0 && margin != null) {
      data.marginPercent = Math.round((margin / rate) * 1000) / 10;
    }

    try {
      await gql(
        `mutation Upd($id: ID!, $data: MediaPlacementUpdateInput!) {
          updateMediaPlacement(id: $id, data: $data) { id }
        }`,
        { id, data },
      );
      results.updated++;
    } catch (err) {
      results.errors.push(`${id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return NextResponse.json({
    ok: results.errors.length === 0,
    ...results,
    errors: results.errors.slice(0, 25),
  });
}
