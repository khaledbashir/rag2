/**
 * Diagnose why parser fails on Lulah Hills Excel
 * Run: npx tsx scripts/test-lulah-hills.ts
 */
import ExcelJS from "exceljs";
import { findColumnHeaders } from "../services/pricing/parser/columnDetection";
import { parseAllRows } from "../services/pricing/parser/rowParser";
import { findTableBoundaries, findGlobalDocumentTotal } from "../services/pricing/parser/boundaryDetection";
import { extractTable } from "../services/pricing/parser/tableExtraction";

async function test() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile("/root/rag2/docs/Copy of Cost Analysis - Lulah Hills - 2026-03-06 (1).xlsx");

  const ma = wb.worksheets.find((s) => s.name.toLowerCase().includes("margin analysis") && !s.name.toLowerCase().includes("cms"));
  if (!ma) { console.log("NO MA SHEET"); return; }
  console.log("MA sheet:", ma.name, "rows:", ma.rowCount);

  // Convert to data array
  const data: any[][] = [];
  for (let r = 1; r <= ma.rowCount; r++) {
    const row = ma.getRow(r);
    const cells: any[] = [];
    for (let c = 1; c <= 10; c++) {
      const cell = row.getCell(c);
      const v = cell.value;
      if (v && typeof v === "object" && "formula" in v) {
        cells.push((v as any).result ?? "");
      } else {
        cells.push(v ?? "");
      }
    }
    data.push(cells);
  }

  // Show raw data
  console.log("\nRaw data rows:");
  data.forEach((r, i) => {
    const display = r.slice(0, 7).map((v: any) => typeof v === "number" ? Math.round(v) : String(v || "").substring(0, 30));
    if (display.some((d: any) => d)) console.log(`  [${i}]`, JSON.stringify(display));
  });

  // Step 1: Column detection
  const colMap = findColumnHeaders(data);
  console.log("\nColumn map:", colMap);

  if (!colMap) {
    console.log("FAILED: Column detection returned null — this is why parser fails");
    // Try to figure out why
    for (let i = 0; i < Math.min(data.length, 10); i++) {
      const row = data[i];
      const norm = row.map((c: any) => String(c ?? "").toLowerCase().trim());
      console.log(`  Row ${i}: ${JSON.stringify(norm.slice(0, 7))}`);
      if (norm.includes("cost") || norm.includes("selling price")) {
        console.log("    ^ Found cost/selling price keywords here");
      }
    }
    return;
  }

  // Step 2: Parse rows
  const rows = parseAllRows(data, colMap);
  console.log("\nParsed rows:", rows.length);
  rows.forEach((r) => {
    if (!r.isEmpty) {
      const flags = [
        r.isHeader && "HDR", r.isSubtotal && "SUB", r.isTax && "TAX",
        r.isBond && "BND", r.isTariff && "TAR", r.isGrandTotal && "GT",
        r.isAlternateHeader && "AHDR", r.isAlternateLine && "ALT",
        r.hasColumnHeaders && "COL",
      ].filter(Boolean).join(",");
      console.log(`  R${r.rowIndex}: ${flags || "item"} "${r.label.substring(0, 40)}" cost=${Number.isFinite(r.cost) ? Math.round(r.cost) : "-"} sell=${Number.isFinite(r.sell) ? Math.round(r.sell) : "-"}`);
    }
  });

  // Step 3: Boundaries
  const boundaries = findTableBoundaries(rows);
  console.log("\nBoundaries:", boundaries.length);
  boundaries.forEach((b, i) => console.log(`  [${i}] "${b.name}" rows ${b.startRow}-${b.endRow}${b.isAlternateSection ? " (ALT)" : ""}`));

  // Step 4: Tables
  const tables = boundaries.map((b, i) => extractTable(rows, b, i, "USD"));
  console.log("\nTables:", tables.length);
  tables.forEach((t) => {
    console.log(`  "${t.name}": items=${t.items.length} sub=$${Math.round(t.subtotal)} tax=$${Math.round(t.tax?.amount || 0)} bond=$${Math.round(t.bond)} gt=$${Math.round(t.grandTotal)}`);
    t.items.forEach((item, i) => console.log(`    [${i}] "${item.description.substring(0, 40)}" $${Math.round(item.sellingPrice)}`));
  });

  const globalTotal = findGlobalDocumentTotal(rows, boundaries);
  console.log("\nGlobal total:", globalTotal);
}

test().catch((e) => console.error(e));
