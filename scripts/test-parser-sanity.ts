/**
 * Parser Sanity Test — runs pricing parser against test fixtures
 * and verifies tax rate, selling price, and formula data integrity.
 *
 * Usage: npx tsx scripts/test-parser-sanity.ts
 */

import * as fs from "fs";
import * as path from "path";
import * as xlsx from "xlsx";
import { findColumnHeaders } from "../services/pricing/parser/columnDetection";
import { parseAllRows, parseNumber } from "../services/pricing/parser/rowParser";
import { findTableBoundaries } from "../services/pricing/parser/boundaryDetection";
import { extractTable } from "../services/pricing/parser/tableExtraction";

const FIXTURES_DIR = path.join(__dirname, "../test-fixtures/pricing");
const DOCS_DIR = path.join(__dirname, "../docs");

interface TestResult {
  file: string;
  sheet: string;
  tables: number;
  issues: string[];
  passed: boolean;
}

const results: TestResult[] = [];

function testFile(filePath: string): void {
  const fileName = path.basename(filePath);
  console.log(`\n${"=".repeat(70)}`);
  console.log(`TESTING: ${fileName}`);
  console.log("=".repeat(70));

  const buffer = fs.readFileSync(filePath);
  const workbook = xlsx.read(buffer, { type: "buffer" });

  // Find MA sheet
  const maSheetName = workbook.SheetNames.find((n) =>
    /margin\s*analysis/i.test(n)
  );
  if (!maSheetName) {
    console.log("  ⏭  No Margin Analysis sheet — skipping");
    return;
  }

  const sheet = workbook.Sheets[maSheetName];
  const data: any[][] = xlsx.utils.sheet_to_json(sheet, {
    header: 1,
    defval: null,
    raw: true,
  });

  const issues: string[] = [];

  // Step 1: Column detection
  const colMap = findColumnHeaders(data);
  if (!colMap) {
    issues.push("FAIL: Column detection returned null — no cost+sell columns found");
    results.push({ file: fileName, sheet: maSheetName, tables: 0, issues, passed: false });
    return;
  }
  console.log(`  ✓ Columns: label@${colMap.label}, cost@${colMap.cost}, sell@${colMap.sell}`);

  // Step 2: Parse rows
  const rows = parseAllRows(data, colMap);
  console.log(`  ✓ Parsed ${rows.length} rows`);

  // Step 3: Find boundaries
  const boundaries = findTableBoundaries(rows, "");
  console.log(`  ✓ Found ${boundaries.length} table boundaries`);

  if (boundaries.length === 0) {
    issues.push("WARN: No table boundaries detected");
  }

  // Step 4: Extract tables and verify
  const tables = boundaries.map((b, i) => extractTable(rows, b, i, "USD"));

  for (const table of tables) {
    console.log(`\n  TABLE: "${table.name}" (${table.items.length} items)`);

    // Check selling prices
    const zeroSellItems = table.items.filter((item) => item.sellingPrice === 0 && !item.isIncluded);
    const totalItems = table.items.filter((item) => !item.isIncluded);
    if (zeroSellItems.length > 0 && totalItems.length > 0) {
      const pct = Math.round((zeroSellItems.length / totalItems.length) * 100);
      if (pct > 80) {
        issues.push(
          `WARN: "${table.name}" — ${zeroSellItems.length}/${totalItems.length} (${pct}%) items have $0 selling price`
        );
        console.log(`    ⚠ ${pct}% of items have $0 selling price`);
        // Show first 3 samples
        zeroSellItems.slice(0, 3).forEach((item) => {
          console.log(`      → "${item.description}" sell=$0 cost=${item.cost ?? "N/A"}`);
        });
      }
    }

    // Check tax rate sanity
    if (table.tax) {
      console.log(
        `    Tax: rate=${table.tax.rate}, amount=${table.tax.amount}, label="${table.tax.label}"`
      );
      if (table.tax.rate > 0.50) {
        issues.push(
          `FAIL: "${table.name}" tax rate ${table.tax.rate} exceeds 50% — misparsed dollar amount`
        );
        console.log(`    ✗ TAX RATE ${table.tax.rate} IS INSANE — should be 0-0.15 range`);
      } else if (table.tax.rate > 0.25) {
        issues.push(
          `WARN: "${table.name}" tax rate ${table.tax.rate} seems high (>25%)`
        );
        console.log(`    ⚠ Tax rate ${table.tax.rate} seems high`);
      } else if (table.tax.rate > 0) {
        console.log(`    ✓ Tax rate ${table.tax.rate} looks reasonable`);
      }
    } else {
      console.log(`    — No tax row detected`);
    }

    // Check bond sanity
    if (table.bond > 0) {
      const bondRate = table.subtotal > 0 ? table.bond / table.subtotal : 0;
      console.log(`    Bond: $${table.bond.toFixed(2)} (rate≈${(bondRate * 100).toFixed(2)}%)`);
      if (bondRate > 0.10) {
        issues.push(
          `WARN: "${table.name}" implied bond rate ${(bondRate * 100).toFixed(1)}% exceeds 10%`
        );
      }
    }

    // Check grand total consistency
    const expectedGrandTotal = table.subtotal + (table.tax?.amount || 0) + table.bond;
    if (table.grandTotal > 0 && Math.abs(table.grandTotal - expectedGrandTotal) > 1) {
      console.log(
        `    ⚠ Grand total mismatch: reported=${table.grandTotal.toFixed(2)} vs computed=${expectedGrandTotal.toFixed(2)}`
      );
    }

    // Sample first 3 items
    table.items.slice(0, 3).forEach((item) => {
      console.log(
        `    • "${item.description}" → sell=$${item.sellingPrice.toLocaleString()} cost=${
          item.cost != null ? "$" + item.cost.toLocaleString() : "N/A"
        }`
      );
    });
  }

  const passed = issues.filter((i) => i.startsWith("FAIL")).length === 0;
  results.push({
    file: fileName,
    sheet: maSheetName,
    tables: tables.length,
    issues,
    passed,
  });
}

// Run against all available test files
const testFiles = [
  ...fs.readdirSync(FIXTURES_DIR).filter((f) => f.endsWith(".xlsx")).map((f) => path.join(FIXTURES_DIR, f)),
  ...fs.readdirSync(DOCS_DIR).filter((f) => f.endsWith(".xlsx") && /audit/i.test(f)).map((f) => path.join(DOCS_DIR, f)),
];

// Also check root-level Excel files
const rootXlsx = fs.readdirSync(path.join(__dirname, "..")).filter((f) => f.endsWith(".xlsx"));
for (const f of rootXlsx) {
  testFiles.push(path.join(__dirname, "..", f));
}

if (testFiles.length === 0) {
  console.log("No test fixtures found. Place .xlsx files in test-fixtures/pricing/");
  process.exit(1);
}

console.log(`Found ${testFiles.length} test file(s)\n`);

for (const f of testFiles) {
  try {
    testFile(f);
  } catch (err: any) {
    console.error(`  ✗ ERROR: ${err.message}`);
    results.push({
      file: path.basename(f),
      sheet: "N/A",
      tables: 0,
      issues: [`ERROR: ${err.message}`],
      passed: false,
    });
  }
}

// Summary
console.log(`\n\n${"=".repeat(70)}`);
console.log("SUMMARY");
console.log("=".repeat(70));

let allPassed = true;
for (const r of results) {
  const status = r.passed ? "✓ PASS" : "✗ FAIL";
  console.log(`${status}  ${r.file} (${r.sheet}, ${r.tables} tables)`);
  for (const issue of r.issues) {
    console.log(`        ${issue}`);
    if (issue.startsWith("FAIL")) allPassed = false;
  }
}

console.log(`\n${results.length} file(s) tested. ${allPassed ? "ALL PASSED ✓" : "SOME FAILED ✗"}`);
process.exit(allPassed ? 0 : 1);
