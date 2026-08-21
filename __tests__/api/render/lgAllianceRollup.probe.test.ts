/**
 * Reads the LG Alliance rollup against the live CRM report.
 *
 * Jireh, 2026-08-21: "the main tab is still not looking like the actual report
 * on the CRM." The columns matched and the document still did not, because the
 * rows, the section order and the row order inside a section were the report's
 * own and the export's were invented. The only way to know the two agree is to
 * build the sheet from the live view and read it back — so this probe does,
 * and prints the shape it found.
 *
 *   LG_PROBE=1 npx vitest run __tests__/api/render/lgAllianceRollup.probe.test.ts
 *   LG_PROBE=1 LG_PROBE_OUT=/tmp/lg.xlsx npx vitest run ...   # keep the file
 *
 * Off by default: it needs the production CRM and a live API key.
 */
import { describe, expect, it } from "vitest";
import { writeFileSync } from "fs";
import ExcelJS from "exceljs";
import { NextRequest } from "next/server";

const enabled = process.env.LG_PROBE === "1";

describe.skipIf(!enabled)("LG Alliance rollup vs the live CRM report", () => {
  it("reads the report's rows, sections and order", async () => {
    const { GET } = await import(
      "@/app/api/render/lg-alliance-report-xlsx/route"
    );
    const res = await GET(
      new NextRequest("https://proposals.anc.com/api/render/lg-alliance-report-xlsx"),
    );
    expect(res.status).toBe(200);

    const buffer = Buffer.from(await res.arrayBuffer());
    if (process.env.LG_PROBE_OUT) writeFileSync(process.env.LG_PROBE_OUT, buffer);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as any);
    const ws = wb.getWorksheet("Alliance Rollup")!;

    // The section bands, in the order the sheet draws them.
    const sections: { label: string; rows: string[] }[] = [];
    let inTable = false;
    ws.eachRow((row) => {
      const first = String(row.getCell(2).value ?? "").trim();
      if (first === "Opportunity Name") { inTable = true; return; }
      if (!inTable || !first) return;
      if (first.startsWith("Count all")) return;            // section footer
      if (first.startsWith("TOTAL")) return;                // sheet footer
      const isBand = !String(row.getCell(3).value ?? "").trim();
      if (isBand) sections.push({ label: first, rows: [] });
      else sections[sections.length - 1]?.rows.push(first);
    });

    const total = sections.reduce((n, s) => n + s.rows.length, 0);
    console.log(
      `\n${sections.length} sections · ${total} rows\n` +
        sections
          .map((s) => `  ${s.label} (${s.rows.length})\n${s.rows.slice(0, 4).map((r) => `      ${r}`).join("\n")}`)
          .join("\n"),
    );

    expect(sections.length).toBeGreaterThan(0);
    expect(total).toBeGreaterThan(0);

    // Inside a section the report reads alphabetically by opportunity name.
    for (const section of sections) {
      const sorted = [...section.rows].sort((a, b) =>
        a.localeCompare(b, "en", { numeric: true, sensitivity: "base" }),
      );
      expect(section.rows, `${section.label} is out of order`).toEqual(sorted);
    }
  }, 120_000);

  // The view is read over the network, and a metadata hiccup must cost the
  // reader a plainer sheet rather than the whole export.
  it("still renders when the view cannot be read", async () => {
    const real = globalThis.fetch;
    globalThis.fetch = ((url: any, init: any) =>
      String(url).includes("/metadata")
        ? Promise.reject(new Error("metadata is down"))
        : real(url, init)) as typeof fetch;
    try {
      const { GET } = await import(
        "@/app/api/render/lg-alliance-report-xlsx/route"
      );
      const res = await GET(
        new NextRequest("https://proposals.anc.com/api/render/lg-alliance-report-xlsx"),
      );
      expect(res.status).toBe(200);
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(Buffer.from(await res.arrayBuffer()) as any);
      const ws = wb.getWorksheet("Alliance Rollup")!;
      expect(String(ws.getRow(7).getCell(2).value)).toBe("Opportunity Name");
      expect(ws.lastRow!.number).toBeGreaterThan(10);
    } finally {
      globalThis.fetch = real;
    }
  }, 120_000);
});
