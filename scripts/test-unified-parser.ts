/**
 * Test: Unified Excel format → pricingTableParser round-trip
 *
 * Simulates the Margin Analysis tab from generateScopingWorkbook.ts
 * and feeds it through the parser to verify compatibility.
 *
 * Run: npx tsx scripts/test-unified-parser.ts
 */

import { parseAllRows, findHeaderRowIndex } from "../services/pricing/parser/rowParser";
import { findTableBoundaries, findGlobalDocumentTotal } from "../services/pricing/parser/boundaryDetection";
import { extractTable } from "../services/pricing/parser/tableExtraction";
import { findColumnHeaders } from "../services/pricing/parser/columnDetection";

// ─── Simulate unified MA tab data ──────────────────────────────────────────
// Matches the exact layout from generateScopingWorkbook.ts buildMarginAnalysis()

const data: any[][] = [
  // Row 0: Title
  ["", "Project Name — Margin Analysis", "", "", "", ""],
  // Row 1: Meta
  ["", "Client | 2026-03-06 | ANC Proposal Engine", "", "", "", ""],
  // Row 2: blank
  ["", "", "", "", "", ""],
  // Row 3: Column headers
  ["", "Zone / Category", "Cost", "Selling Price", "Margin $", "Margin %"],

  // ─── Screen 1: North Main Videoboard ───
  // Row 4: Screen header (text + "Selling Price" in col D)
  ["", "North Main Videoboard — North End Zone", "", "Selling Price", "", ""],
  // Row 5-10: Category rows
  ["", "    LED Hardware", 150000, 214285.71, 64285.71, 0.30],
  ["", "    Structural Materials", 25000, 31250, 6250, 0.20],
  ["", "    Structural Labor & LED Installation", 40000, 50000, 10000, 0.20],
  ["", "    Electrical & Data", 15000, 18750, 3750, 0.20],
  ["", "    PM / General Conditions / Travel", 10000, 12500, 2500, 0.20],
  ["", "    Engineering & Permits", 5000, 6250, 1250, 0.20],
  // Row 11: SUBTOTAL
  ["", "    SUBTOTAL", 245000, 333035.71, 88035.71, 0.264],
  // Row 12: TAX
  ["", "    TAX", "", 0, "", ""],
  // Row 13: BOND
  ["", "    BOND", "", 4995.54, "", ""],
  // Row 14: TARIFF
  ["", "    TARIFF", "", 0, "", ""],
  // Row 15: GRAND TOTAL
  ["", "    GRAND TOTAL", 245000, 338031.25, 93031.25, 0.275],

  // Row 16: blank separator
  ["", "", "", "", "", ""],

  // ─── Screen 2: South Ribbon Board ───
  // Row 17: Screen header
  ["", "South Ribbon Board — South End Zone", "", "Selling Price", "", ""],
  // Row 18-22: Category rows
  ["", "    LED Hardware", 80000, 114285.71, 34285.71, 0.30],
  ["", "    Structural Materials", 12000, 15000, 3000, 0.20],
  ["", "    Structural Labor & LED Installation", 20000, 25000, 5000, 0.20],
  ["", "    Electrical & Data", 8000, 10000, 2000, 0.20],
  ["", "    PM / General Conditions / Travel", 5000, 6250, 1250, 0.20],
  // Row 23: SUBTOTAL
  ["", "    SUBTOTAL", 125000, 170535.71, 45535.71, 0.267],
  // Row 24: TAX
  ["", "    TAX", "", 0, "", ""],
  // Row 25: BOND
  ["", "    BOND", "", 2558.04, "", ""],
  // Row 26: TARIFF
  ["", "    TARIFF", "", 6000, "", ""],
  // Row 27: GRAND TOTAL
  ["", "    GRAND TOTAL", 125000, 179093.75, 54093.75, 0.302],

  // Row 28: Alt header
  ["", "    Alternates — Add/Deduct from Above", "", "", "", ""],
  // Row 29: Alt line
  ["", "      Alt: Upgrade to 4mm pitch", 5000, 8500, "", ""],

  // Row 30: blank separator
  ["", "", "", "", "", ""],

  // ─── CMS placeholder ───
  // Row 31
  ["", "CMS (Content Management System)", 0, 0, 0, 0.35],
  // ─── Scoring placeholder ───
  // Row 32
  ["", "Scoring System", 0, 0, 0, 0.10],

  // Row 33: blank separator
  ["", "", "", "", "", ""],

  // ─── BASE BID GRAND TOTAL ───
  // Row 34
  ["", "BASE BID GRAND TOTAL", 370000, 517125, 147125, 0.284],
];

// ─── Run the parser ────────────────────────────────────────────────────────

console.log("=== UNIFIED EXCEL PARSER COMPATIBILITY TEST ===\n");

// Step 1: Column detection
const columnMapResult = findColumnHeaders(data);
if (!columnMapResult) {
  console.log("1. Column Detection: FAIL — no columns detected");
  process.exit(1);
}
const columnMap = columnMapResult;
console.log("1. Column Detection:");
console.log(`   label=${columnMap.label}, cost=${columnMap.cost}, sell=${columnMap.sell}, margin=${columnMap.margin}, marginPct=${columnMap.marginPct}`);
const colOk = columnMap.label === 1 && columnMap.cost === 2 && columnMap.sell === 3;
console.log(`   ${colOk ? "PASS" : "FAIL"}: Columns mapped correctly\n`);

// Step 2: Row parsing
const rows = parseAllRows(data, columnMap);
console.log(`2. Row Parsing: ${rows.length} rows parsed`);

// Check key row types
const headers = rows.filter(r => r.isHeader);
const subtotals = rows.filter(r => r.isSubtotal);
const taxes = rows.filter(r => r.isTax);
const bonds = rows.filter(r => r.isBond);
const tariffs = rows.filter(r => r.isTariff);
const grandTotals = rows.filter(r => r.isGrandTotal);
const altHeaders = rows.filter(r => r.isAlternateHeader);
const altLines = rows.filter(r => r.isAlternateLine);

console.log(`   Headers:       ${headers.length} (expect 2 screen headers)`);
console.log(`   Subtotals:     ${subtotals.length} (expect 2)`);
console.log(`   Tax rows:      ${taxes.length} (expect 2)`);
console.log(`   Bond rows:     ${bonds.length} (expect 2)`);
console.log(`   Tariff rows:   ${tariffs.length} (expect 2)`);
console.log(`   Grand totals:  ${grandTotals.length} (expect 3: 2 screens + BASE BID)`);
console.log(`   Alt headers:   ${altHeaders.length} (expect 1)`);
console.log(`   Alt lines:     ${altLines.length} (expect 1)`);

const headerNames = headers.map(h => h.label);
console.log(`   Header names: ${JSON.stringify(headerNames)}`);

let pass = true;
const check = (name: string, actual: number, expected: number) => {
  const ok = actual === expected;
  if (!ok) { pass = false; console.log(`   FAIL: ${name} — got ${actual}, expected ${expected}`); }
  return ok;
};

check("headers", headers.length, 2);
check("subtotals", subtotals.length, 2);
check("taxes", taxes.length, 2);
check("bonds", bonds.length, 2);
check("tariffs", tariffs.length, 2);
check("grandTotals", grandTotals.length, 3);
check("altHeaders", altHeaders.length, 1);
check("altLines", altLines.length, 1);

// Verify screen headers have hasColumnHeaders (critical for isViableSectionStart)
const screen1Header = headers[0];
const screen2Header = headers[1];
console.log(`   Screen 1 hasColumnHeaders: ${screen1Header?.hasColumnHeaders} (expect true)`);
console.log(`   Screen 2 hasColumnHeaders: ${screen2Header?.hasColumnHeaders} (expect true)`);
if (!screen1Header?.hasColumnHeaders || !screen2Header?.hasColumnHeaders) {
  pass = false;
  console.log("   FAIL: Screen headers missing hasColumnHeaders");
}

// Verify alt header detected correctly
const altH = altHeaders[0];
console.log(`   Alt header label: "${altH?.label}" isAlternateHeader=${altH?.isAlternateHeader}`);

// Verify CMS/Scoring are NOT detected as headers (they have numeric data)
const cmsRow = rows.find(r => r.label.includes("CMS"));
const scoringRow = rows.find(r => r.label.includes("Scoring"));
console.log(`   CMS isHeader: ${cmsRow?.isHeader} (expect false — has numeric data)`);
console.log(`   Scoring isHeader: ${scoringRow?.isHeader} (expect false — has numeric data)`);

console.log(`\n   ${pass ? "ALL PASS" : "SOME FAILED"}\n`);

// Step 3: Boundary detection
const boundaries = findTableBoundaries(rows);
console.log(`3. Boundary Detection: ${boundaries.length} boundaries found`);
boundaries.forEach((b, i) => {
  console.log(`   [${i}] "${b.name}" rows ${b.startRow}-${b.endRow} ${b.isAlternateSection ? "(ALT)" : ""}`);
});

const mainBoundaries = boundaries.filter(b => !b.isAlternateSection);
const altBoundaries = boundaries.filter(b => b.isAlternateSection);
console.log(`   Main sections: ${mainBoundaries.length} (expect 2 screens)`);
console.log(`   Alt sections:  ${altBoundaries.length} (expect 1)`);

const boundaryPass = mainBoundaries.length >= 2 && altBoundaries.length === 1;
console.log(`   ${boundaryPass ? "PASS" : "FAIL"}: Boundary detection\n`);

// Step 4: Table extraction
console.log("4. Table Extraction:");
const tables = boundaries.map((b, i) => extractTable(rows, b, i, "USD"));
tables.forEach((t, i) => {
  console.log(`   [${i}] "${t.name}"`);
  console.log(`       Items: ${t.items.length}, Subtotal: $${t.subtotal}, Tax: $${t.tax?.amount || 0}, Bond: $${t.bond}, Tariff: $${t.tariff}, GrandTotal: $${t.grandTotal}`);
  if (t.alternates.length > 0) {
    console.log(`       Alternates: ${t.alternates.map(a => `"${a.description}" $${a.priceDifference}`).join(", ")}`);
  }
});

// Verify first screen table
const screen1 = tables.find(t => t.name.includes("North Main"));
if (screen1) {
  const s1Pass = screen1.items.length >= 5 && screen1.subtotal > 0 && screen1.grandTotal > 0 && screen1.tariff === 0;
  console.log(`\n   Screen 1 items: ${screen1.items.length} (expect 6 categories)`);
  console.log(`   Screen 1 tariff: $${screen1.tariff} (expect 0)`);
  console.log(`   Screen 1 bond: $${screen1.bond} (expect ~4995)`);
  console.log(`   Screen 1 grandTotal: $${screen1.grandTotal} (expect ~338031)`);
  console.log(`   ${s1Pass ? "PASS" : "FAIL"}: Screen 1 extraction`);
} else {
  console.log("   FAIL: Screen 1 not found in tables");
}

// Verify second screen table
const screen2 = tables.find(t => t.name.includes("South Ribbon"));
if (screen2) {
  const s2Pass = screen2.items.length >= 4 && screen2.tariff === 6000 && screen2.grandTotal > 0;
  console.log(`\n   Screen 2 items: ${screen2.items.length} (expect 5 categories)`);
  console.log(`   Screen 2 tariff: $${screen2.tariff} (expect 6000)`);
  console.log(`   Screen 2 bond: $${screen2.bond} (expect ~2558)`);
  console.log(`   Screen 2 grandTotal: $${screen2.grandTotal} (expect ~179093)`);
  console.log(`   ${s2Pass ? "PASS" : "FAIL"}: Screen 2 extraction`);
} else {
  console.log("   FAIL: Screen 2 not found in tables");
}

// Verify alt section
const altSection = tables.find(t => t.isAlternateSection);
if (altSection) {
  console.log(`\n   Alt section: "${altSection.name}", items: ${altSection.items.length}`);
  altSection.items.forEach((item, i) => console.log(`     [${i}] "${item.description}" $${item.sellingPrice}`));
  console.log(`   ${altSection.items.length >= 1 ? "PASS" : "FAIL"}: Alt section has items`);
} else {
  console.log("   FAIL: Alt section not found");
}

// Step 5: Global document total (BASE BID GRAND TOTAL)
console.log("\n5. Global Document Total:");
const globalTotal = findGlobalDocumentTotal(rows, boundaries);
console.log(`   Found: $${globalTotal} (expect $517125)`);
const gtPass = globalTotal !== null && Math.abs(globalTotal - 517125) < 1;
console.log(`   ${gtPass ? "PASS" : "FAIL"}: Global document total\n`);

// ─── Final summary ─────────────────────────────────────────────────────────
console.log("=== SUMMARY ===");
const allChecks = [colOk, pass, boundaryPass, !!screen1, !!screen2, !!altSection, gtPass];
const passCount = allChecks.filter(Boolean).length;
console.log(`${passCount}/${allChecks.length} checks passed`);
if (passCount === allChecks.length) {
  console.log("RESULT: Parser fully compatible with unified Excel format");
} else {
  console.log("RESULT: Some checks failed — see details above");
}
process.exit(passCount === allChecks.length ? 0 : 1);
