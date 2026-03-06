/**
 * Parser Regression Test Suite
 *
 * Tests ALL ANC Excel files in /docs/ to ensure the pricing parser
 * handles every template without crashing. Prevents recurring parser
 * failures from reaching Natalia.
 *
 * Run: npx tsx scripts/test-parser-regression.ts
 *
 * Expected behavior:
 *   - Files WITH a Margin Analysis tab → must parse successfully
 *   - Files WITHOUT an MA tab (product data forms, specs) → skip gracefully
 *   - NO file should crash the parser
 */

import ExcelJS from "exceljs";
import { findColumnHeaders, ColumnMap } from "../services/pricing/parser/columnDetection";
import { parseAllRows, findHeaderRowIndex } from "../services/pricing/parser/rowParser";
import { findTableBoundaries, findGlobalDocumentTotal } from "../services/pricing/parser/boundaryDetection";
import { extractTable } from "../services/pricing/parser/tableExtraction";
import * as fs from "fs";
import * as path from "path";

// ─── Known test files and expectations ──────────────────────────────────────
// Each entry defines what we expect from the parser for that file.
// "skip" means the file has no MA tab and should be skipped gracefully.

interface FileExpectation {
  file: string;
  expectMA: boolean;          // Does it have a Margin Analysis tab?
  minTables?: number;         // Minimum tables expected
  minItems?: number;          // Minimum total line items across all tables
  hasGlobalTotal?: boolean;   // Should findGlobalDocumentTotal return a value?
  notes?: string;
}

const TEST_FILES: FileExpectation[] = [
  {
    file: "Copy of Cost Analysis - Lulah Hills - 2026-03-06 (1).xlsx",
    expectMA: true,
    minTables: 1,
    minItems: 3,
    hasGlobalTotal: false,      // Single-table — no global total needed
    notes: "Single-table MA with warranty rows (empty formula results). Was failing before orphan fix.",
  },
  {
    file: "UNC---Kenan-Stadium-RFP---Cost-Analysis-audit.xlsx",
    expectMA: true,
    minTables: 1,
    minItems: 1,
    notes: "UNC Kenan Stadium audit — standard ANC template.",
  },
  {
    file: "UNC---Kenan-Stadium-RFP---Cost-Analysis-audit (1).xlsx",
    expectMA: true,
    minTables: 1,
    minItems: 1,
    notes: "UNC Kenan Stadium audit (copy).",
  },
  {
    file: "Denver-Summit-FC-audit.xlsx",
    expectMA: true,
    minTables: 1,
    minItems: 1,
    notes: "Denver Summit FC audit — standard ANC template.",
  },
  {
    file: "COAT-Specs.xlsx",
    expectMA: false,
    notes: "Product data form — no MA tab expected.",
  },
  {
    file: "COAT-Specs-FILLED.xlsx",
    expectMA: false,
    notes: "Filled product data form — no MA tab expected.",
  },
  {
    file: "Capital One Arena - Bid Package 4_Product_Data_Forms.xlsx",
    expectMA: false,
    notes: "Bid package product data forms — no MA tab expected.",
  },
  {
    file: "Capital One Arena - Product Data Forms (FILLED).xlsx",
    expectMA: false,
    notes: "Filled product data forms — no MA tab expected.",
  },
  {
    file: "11 63 10 PRODUCT DATA FORM - COAT PHASES 3-7 (2).xlsx",
    expectMA: false,
    notes: "COAT product data form — no MA tab expected.",
  },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function readSheetToData(ws: ExcelJS.Worksheet, maxCols: number = 20): any[][] {
  const data: any[][] = [];
  for (let r = 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const cells: any[] = [];
    for (let c = 1; c <= maxCols; c++) {
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
  return data;
}

function findMASheet(wb: ExcelJS.Workbook): ExcelJS.Worksheet | undefined {
  // Try exact "Margin Analysis" first, then fuzzy
  return wb.worksheets.find(
    (s) => s.name.toLowerCase().includes("margin analysis") && !s.name.toLowerCase().includes("cms")
  );
}

// ─── Main test runner ───────────────────────────────────────────────────────

interface TestResult {
  file: string;
  status: "PASS" | "FAIL" | "SKIP";
  maSheet?: string;
  tables?: number;
  totalItems?: number;
  globalTotal?: number | null;
  errors: string[];
  warnings: string[];
}

async function testFile(expectation: FileExpectation): Promise<TestResult> {
  const filePath = path.join("/root/rag2/docs", expectation.file);
  const result: TestResult = {
    file: expectation.file,
    status: "SKIP",
    errors: [],
    warnings: [],
  };

  // Check file exists
  if (!fs.existsSync(filePath)) {
    result.status = "FAIL";
    result.errors.push("File not found");
    return result;
  }

  try {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(filePath);

    // Find MA sheet
    const ma = findMASheet(wb);
    if (!ma) {
      if (expectation.expectMA) {
        result.status = "FAIL";
        result.errors.push("Expected MA tab but none found");
      } else {
        result.status = "SKIP";
      }
      return result;
    }

    result.maSheet = ma.name;

    if (!expectation.expectMA) {
      result.warnings.push("Found unexpected MA tab — testing anyway");
    }

    // Convert to data array
    const data = readSheetToData(ma);

    // Step 1: Column detection
    const colMap = findColumnHeaders(data);
    if (!colMap) {
      result.status = "FAIL";
      result.errors.push("Column detection returned null — no Cost/Selling Price columns found");
      // Log first 8 non-empty rows for debugging
      const preview = data.slice(0, 15).map((r, i) => {
        const vals = r.slice(0, 8).map((v: any) => String(v || "").substring(0, 25));
        return vals.some((v: string) => v) ? `R${i}: ${vals.join(" | ")}` : null;
      }).filter(Boolean);
      result.errors.push("Preview: " + preview.slice(0, 5).join("\n  "));
      return result;
    }

    // Step 2: Parse rows
    const rows = parseAllRows(data, colMap);
    if (rows.length === 0) {
      result.status = "FAIL";
      result.errors.push("parseAllRows returned 0 rows");
      return result;
    }

    // Check for reasonable row type distribution
    const headers = rows.filter(r => r.isHeader);
    const items = rows.filter(r => !r.isEmpty && !r.isHeader && !r.isSubtotal && !r.isTax && !r.isBond && !r.isTariff && !r.isGrandTotal && !r.isAlternateHeader);

    // Step 3: Boundary detection
    const boundaries = findTableBoundaries(rows);
    result.tables = boundaries.length;

    if (boundaries.length === 0) {
      result.status = "FAIL";
      result.errors.push("findTableBoundaries returned 0 boundaries");
      return result;
    }

    if (expectation.minTables && boundaries.length < expectation.minTables) {
      result.status = "FAIL";
      result.errors.push(`Expected >= ${expectation.minTables} tables, got ${boundaries.length}`);
    }

    // Step 4: Table extraction
    let totalItems = 0;
    const tableErrors: string[] = [];
    for (let i = 0; i < boundaries.length; i++) {
      try {
        const table = extractTable(rows, boundaries[i], i, "USD");
        totalItems += table.items.length;

        // Sanity checks per table
        if (!boundaries[i].isAlternateSection) {
          if (table.items.length === 0) {
            tableErrors.push(`Table "${table.name}": 0 items`);
          }
          if (table.grandTotal < 0) {
            result.warnings.push(`Table "${table.name}": negative grandTotal ${table.grandTotal}`);
          }
        }
      } catch (e: any) {
        result.status = "FAIL";
        result.errors.push(`extractTable crashed on boundary ${i}: ${e.message}`);
      }
    }

    result.totalItems = totalItems;
    if (tableErrors.length > 0) {
      result.warnings.push(...tableErrors);
    }

    if (expectation.minItems && totalItems < expectation.minItems) {
      result.status = "FAIL";
      result.errors.push(`Expected >= ${expectation.minItems} total items, got ${totalItems}`);
    }

    // Step 5: Global document total
    const globalTotal = findGlobalDocumentTotal(rows, boundaries);
    result.globalTotal = globalTotal;

    if (expectation.hasGlobalTotal === true && globalTotal === null) {
      result.status = "FAIL";
      result.errors.push("Expected global document total but got null");
    }

    // If we got here without setting FAIL, it's a PASS
    if (result.status !== "FAIL") {
      result.status = "PASS";
    }
  } catch (e: any) {
    result.status = "FAIL";
    result.errors.push(`CRASH: ${e.message}`);
  }

  return result;
}

async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  ANC PARSER REGRESSION TEST SUITE");
  console.log("═══════════════════════════════════════════════════════════════\n");

  // Also discover any Excel files not in our expectations list
  const docsDir = "/root/rag2/docs";
  const allXlsx = fs.readdirSync(docsDir).filter(f => f.endsWith(".xlsx"));
  const knownFiles = new Set(TEST_FILES.map(t => t.file));
  const unknownFiles = allXlsx.filter(f => !knownFiles.has(f));

  if (unknownFiles.length > 0) {
    console.log(`WARNING: ${unknownFiles.length} Excel file(s) not in test expectations:`);
    unknownFiles.forEach(f => console.log(`  - ${f}`));
    console.log("  Add these to TEST_FILES in test-parser-regression.ts\n");
  }

  const results: TestResult[] = [];

  for (const expectation of TEST_FILES) {
    // Suppress console.log/warn from parser during tests
    const origLog = console.log;
    const origWarn = console.warn;
    const logs: string[] = [];
    console.log = (...args: any[]) => logs.push(args.join(" "));
    console.warn = (...args: any[]) => logs.push("[WARN] " + args.join(" "));

    const result = await testFile(expectation);
    results.push(result);

    // Restore console
    console.log = origLog;
    console.warn = origWarn;

    // Print result
    const icon = result.status === "PASS" ? "PASS" : result.status === "SKIP" ? "SKIP" : "FAIL";
    const shortName = expectation.file.substring(0, 55);
    console.log(`[${icon}] ${shortName}`);

    if (result.maSheet) {
      console.log(`       MA: "${result.maSheet}" | Tables: ${result.tables} | Items: ${result.totalItems} | Global: ${result.globalTotal !== null && result.globalTotal !== undefined ? "$" + Math.round(result.globalTotal) : "none"}`);
    }

    if (result.errors.length > 0) {
      result.errors.forEach(e => console.log(`       ERROR: ${e}`));
    }
    if (result.warnings.length > 0) {
      result.warnings.forEach(w => console.log(`       WARN: ${w}`));
    }
    if (expectation.notes) {
      console.log(`       Note: ${expectation.notes}`);
    }
    console.log();
  }

  // Also test unknown files (discovery mode — just ensure no crashes)
  if (unknownFiles.length > 0) {
    console.log("─── Discovery: testing unknown files for crashes ───\n");
    for (const file of unknownFiles) {
      const discoveryExpectation: FileExpectation = {
        file,
        expectMA: false, // Don't assert — just don't crash
        notes: "Auto-discovered file — not in expected registry",
      };

      const origLog = console.log;
      const origWarn = console.warn;
      console.log = () => {};
      console.warn = () => {};
      const result = await testFile(discoveryExpectation);
      console.log = origLog;
      console.warn = origWarn;

      // For discovery files, SKIP is fine, PASS is great, FAIL is the problem
      const icon = result.status === "FAIL" ? "FAIL" : result.status === "PASS" ? "PASS" : "SKIP";
      console.log(`[${icon}] ${file}`);
      if (result.errors.length > 0) {
        result.errors.forEach(e => console.log(`       ERROR: ${e}`));
      }
    }
    console.log();
  }

  // ─── Summary ──────────────────────────────────────────────────────────────
  console.log("═══════════════════════════════════════════════════════════════");
  const passed = results.filter(r => r.status === "PASS").length;
  const failed = results.filter(r => r.status === "FAIL").length;
  const skipped = results.filter(r => r.status === "SKIP").length;
  console.log(`  RESULTS: ${passed} passed, ${failed} failed, ${skipped} skipped (no MA tab)`);
  console.log("═══════════════════════════════════════════════════════════════");

  if (failed > 0) {
    console.log("\nFAILED FILES:");
    results.filter(r => r.status === "FAIL").forEach(r => {
      console.log(`  ${r.file}`);
      r.errors.forEach(e => console.log(`    - ${e}`));
    });
  }

  // ─── Parser compatibility report ──────────────────────────────────────────
  console.log("\n── PARSER COMPATIBILITY REPORT ──");
  console.log("What the parser HANDLES:");
  console.log("  - Column headers: Cost, Selling Price, Margin $, Margin %");
  console.log("  - Section headers with 'Selling Price' in sell column (ANC pattern)");
  console.log("  - Row types: SUBTOTAL, TAX, BOND, TARIFF, GRAND TOTAL");
  console.log("  - Alternate sections (Add/Deduct from Above)");
  console.log("  - Single-table MA (orphan boundary detection)");
  console.log("  - Multi-table MA (multiple screens with per-screen totals)");
  console.log("  - BASE BID GRAND TOTAL after all sections");
  console.log("  - Rows with empty formula results (warranty rows etc.)");
  console.log("  - Text values: Included, Excluded, N/A, TBD");
  console.log("\nWhat will BREAK the parser:");
  console.log("  - No 'Cost' and 'Selling Price' columns in first 40 rows");
  console.log("  - Completely different column naming (e.g. 'Total $' instead of 'Selling Price')");
  console.log("  - Merged cells spanning across Cost/Sell columns");
  console.log("  - MA tab not named 'Margin Analysis'");
  console.log("  - Rows where numeric data is stored as text strings");

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
