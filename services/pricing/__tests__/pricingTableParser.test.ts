import { describe, it, expect, vi, beforeAll } from "vitest";
import * as XLSX from "xlsx";
import { parsePricingTablesWithValidation } from "@/services/pricing/pricingTableParser";

// ============================================================================
// MOCK: Sentry (not available in test environment)
// ============================================================================
vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

// ============================================================================
// MOCK: respMatrixParser (not under test — isolate pricingTableParser)
// ============================================================================
vi.mock("@/services/pricing/respMatrixParser", () => ({
  parseRespMatrixDetailed: () => ({
    matrix: null,
    sheetCandidates: [],
    usedSheet: null,
    errors: [],
  }),
}));

// ============================================================================
// HELPER: Build in-memory workbook from AOA data
// ============================================================================

function buildMockWorkbook(sheetName: string, rows: any[][]): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return wb;
}

function buildMultiSheetWorkbook(
  sheets: Array<{ name: string; rows: any[][] }>
): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(s.rows);
    XLSX.utils.book_append_sheet(wb, ws, s.name);
  }
  return wb;
}

// ============================================================================
// STANDARD ROW TEMPLATES
// ============================================================================

/** Standard header row with Cost + Selling Price columns at indices 1 and 2 */
const STD_HEADER = ["", "Cost", "Selling Price"];

/** Build a line item row: [description, cost, sellingPrice] */
function lineItem(desc: string, cost: number, sell: number): any[] {
  return [desc, cost, sell];
}

/** Build a grand total row */
function grandTotal(cost: number, sell: number): any[] {
  return ["Grand Total", cost, sell];
}

/** Build a tax row */
function taxRow(amount: number, label = "Tax"): any[] {
  return [label, 0, amount];
}

/** Build a bond row */
function bondRow(amount: number): any[] {
  return ["Bond", 0, amount];
}

// Suppress console.log/warn noise from the parser during tests
beforeAll(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

// ============================================================================
// 1. SHEET DETECTION
// ============================================================================

describe("Sheet Detection", () => {
  it("returns null document + error when workbook has no matching sheet name", () => {
    const wb = buildMockWorkbook("Random Sheet", [
      ["A", "B", "C"],
      [1, 2, 3],
    ]);
    const result = parsePricingTablesWithValidation(wb, "test.xlsx");
    expect(result.document).toBeNull();
    expect(result.validation.status).toBe("FAIL");
    expect(result.validation.errors.length).toBeGreaterThan(0);
    expect(result.validation.errors[0]).toContain("No Margin Analysis tab found");
  });

  it('finds sheet named "Margin Analysis"', () => {
    const wb = buildMockWorkbook("Margin Analysis", [
      STD_HEADER,
      lineItem("Item A", 100, 200),
      grandTotal(100, 200),
    ]);
    const result = parsePricingTablesWithValidation(wb, "test.xlsx");
    expect(result.document).not.toBeNull();
    expect(result.document!.sourceSheet).toBe("Margin Analysis");
  });

  it('finds sheet named "Margin-Analysis (CAD)" (fuzzy match with currency)', () => {
    const wb = buildMockWorkbook("Margin-Analysis (CAD)", [
      STD_HEADER,
      lineItem("Item A", 100, 200),
      grandTotal(100, 200),
    ]);
    const result = parsePricingTablesWithValidation(wb, "test.xlsx");
    expect(result.document).not.toBeNull();
    expect(result.document!.sourceSheet).toBe("Margin-Analysis (CAD)");
  });

  it('finds sheet named "Margin Analysis (USD)"', () => {
    const wb = buildMockWorkbook("Margin Analysis (USD)", [
      STD_HEADER,
      lineItem("Item A", 100, 200),
      grandTotal(100, 200),
    ]);
    const result = parsePricingTablesWithValidation(wb, "test.xlsx");
    expect(result.document).not.toBeNull();
    expect(result.document!.sourceSheet).toBe("Margin Analysis (USD)");
  });

  it("detects correct currency from sheet name (CAD vs USD)", () => {
    const wbCad = buildMockWorkbook("Margin Analysis (CAD)", [
      STD_HEADER,
      lineItem("Item A", 100, 200),
      grandTotal(100, 200),
    ]);
    const wbUsd = buildMockWorkbook("Margin Analysis (USD)", [
      STD_HEADER,
      lineItem("Item A", 100, 200),
      grandTotal(100, 200),
    ]);
    const resultCad = parsePricingTablesWithValidation(wbCad, "test.xlsx");
    const resultUsd = parsePricingTablesWithValidation(wbUsd, "test.xlsx");
    expect(resultCad.document!.currency).toBe("CAD");
    expect(resultUsd.document!.currency).toBe("USD");
  });

  it("detects GBP from a versioned margin analysis sheet name", () => {
    const wb = buildMockWorkbook("Margin Analysis (GBP)(v2)", [
      STD_HEADER,
      lineItem("Item A", 100, 200),
      grandTotal(100, 200),
    ]);
    const result = parsePricingTablesWithValidation(wb, "test.xlsx");
    expect(result.document).not.toBeNull();
    expect(result.document!.sourceSheet).toBe("Margin Analysis (GBP)(v2)");
    expect(result.document!.currency).toBe("GBP");
  });

  it("prefers a populated margin analysis sheet over an earlier empty match", () => {
    const wb = buildMultiSheetWorkbook([
      { name: "Margin Analysis (USD)", rows: [STD_HEADER] },
      {
        name: "Margin Analysis (GBP)(v1)",
        rows: [STD_HEADER, lineItem("Item A", 100, 200), grandTotal(100, 200)],
      },
    ]);
    const result = parsePricingTablesWithValidation(wb, "test.xlsx");
    expect(result.document).not.toBeNull();
    expect(result.document!.sourceSheet).toBe("Margin Analysis (GBP)(v1)");
    expect(result.document!.currency).toBe("GBP");
  });

  it("detects GBP from Excel currency formatting when the sheet name is generic", () => {
    const wb = buildMockWorkbook("Margin Analysis", [
      STD_HEADER,
      lineItem("Item A", 100, 200),
      grandTotal(100, 200),
    ]);
    const ws = wb.Sheets["Margin Analysis"] as XLSX.WorkSheet & Record<string, any>;
    ws.B2.z = '"£"#,##0';
    ws.B2.w = "£100";
    ws.C2.z = '"£"#,##0';
    ws.C2.w = "£200";

    const result = parsePricingTablesWithValidation(wb, "test.xlsx");
    expect(result.document).not.toBeNull();
    expect(result.document!.currency).toBe("GBP");
  });
});

// ============================================================================
// 2. COLUMN HEADER DETECTION
// ============================================================================

describe("Column Header Detection", () => {
  it('detects standard headers: "Cost", "Selling Price" in first 40 rows', () => {
    // Put headers at row 5 (0-indexed) with some blank rows above
    const rows: any[][] = [
      [], [], [], [], [],
      ["", "Cost", "Selling Price"],
      lineItem("Widget", 50, 100),
      grandTotal(50, 100),
    ];
    const wb = buildMockWorkbook("Margin Analysis", rows);
    const result = parsePricingTablesWithValidation(wb, "test.xlsx");
    expect(result.document).not.toBeNull();
    expect(result.document!.tables.length).toBeGreaterThan(0);
  });

  it('detects alternate headers: "Budgeted Cost", "Revenue"', () => {
    const rows: any[][] = [
      ["", "Budgeted Cost", "Revenue"],
      lineItem("Consulting", 500, 1000),
      grandTotal(500, 1000),
    ];
    const wb = buildMockWorkbook("Margin Analysis", rows);
    const result = parsePricingTablesWithValidation(wb, "test.xlsx");
    expect(result.document).not.toBeNull();
    expect(result.document!.tables.length).toBeGreaterThan(0);
  });

  it("returns error when no valid column headers found", () => {
    const rows: any[][] = [
      ["Foo", "Bar", "Baz"],
      ["A", 1, 2],
      ["B", 3, 4],
    ];
    const wb = buildMockWorkbook("Margin Analysis", rows);
    const result = parsePricingTablesWithValidation(wb, "test.xlsx");
    expect(result.document).toBeNull();
    expect(result.validation.status).toBe("FAIL");
    expect(result.validation.errors[0]).toContain("column headers");
  });
});

// ============================================================================
// 3. SINGLE SECTION PARSING
// ============================================================================

describe("Single Section Parsing", () => {
  it("parses a simple single-section workbook with header row + 3 line items + grand total", () => {
    const rows: any[][] = [
      STD_HEADER,
      ["LED Display Panel", 10000, 15000],
      ["Installation", 5000, 8000],
      ["Electrical Work", 3000, 5000],
      ["Grand Total", 18000, 28000],
    ];
    const wb = buildMockWorkbook("Margin Analysis", rows);
    const result = parsePricingTablesWithValidation(wb, "test.xlsx");
    expect(result.document).not.toBeNull();
    const doc = result.document!;

    // Should have at least one table
    expect(doc.tables.length).toBeGreaterThanOrEqual(1);

    // Find the table that contains our items (might be last if a synthetic rollup is prepended)
    const table = doc.tables.find((t) => t.items.length === 3) ?? doc.tables[doc.tables.length - 1];
    expect(table.items.length).toBe(3);
    expect(table.items[0].description).toBe("LED Display Panel");
    expect(table.items[0].sellingPrice).toBe(15000);
    expect(table.items[1].description).toBe("Installation");
    expect(table.items[1].sellingPrice).toBe(8000);
    expect(table.items[2].description).toBe("Electrical Work");
    expect(table.items[2].sellingPrice).toBe(5000);
    expect(table.grandTotal).toBe(28000);
  });

  it("correctly identifies and skips subtotal rows (blank label with numbers)", () => {
    const rows: any[][] = [
      STD_HEADER,
      ["LED Panels", 10000, 15000],
      ["Mounting Hardware", 2000, 3000],
      ["", 12000, 18000], // Subtotal row — blank label, has numbers
      ["Grand Total", 12000, 18000],
    ];
    const wb = buildMockWorkbook("Margin Analysis", rows);
    const result = parsePricingTablesWithValidation(wb, "test.xlsx");
    const doc = result.document!;
    const table = doc.tables.find((t) => t.items.length === 2) ?? doc.tables[doc.tables.length - 1];
    // The blank row should be skipped — only 2 real items
    expect(table.items.length).toBe(2);
    expect(table.items.map((i) => i.description)).toEqual([
      "LED Panels",
      "Mounting Hardware",
    ]);
  });

  it("correctly captures tax row", () => {
    const rows: any[][] = [
      STD_HEADER,
      ["LED Display", 10000, 15000],
      ["Tax", 0, 1950],
      ["Grand Total", 10000, 16950],
    ];
    const wb = buildMockWorkbook("Margin Analysis", rows);
    const result = parsePricingTablesWithValidation(wb, "test.xlsx");
    const doc = result.document!;
    const table = doc.tables.find((t) => t.tax !== null) ?? doc.tables[doc.tables.length - 1];
    expect(table.tax).not.toBeNull();
    expect(table.tax!.amount).toBe(1950);
  });

  it("correctly captures bond row", () => {
    const rows: any[][] = [
      STD_HEADER,
      ["LED Display", 10000, 15000],
      ["Bond", 0, 225],
      ["Grand Total", 10225, 15225],
    ];
    const wb = buildMockWorkbook("Margin Analysis", rows);
    const result = parsePricingTablesWithValidation(wb, "test.xlsx");
    const doc = result.document!;
    const table = doc.tables.find((t) => t.bond > 0) ?? doc.tables[doc.tables.length - 1];
    expect(table.bond).toBe(225);
  });
});

// ============================================================================
// 4. MULTI-SECTION PARSING
// ============================================================================

describe("Multi-Section Parsing", () => {
  function buildTwoSectionWorkbook() {
    const rows: any[][] = [
      STD_HEADER,
      // Section 1
      ["LED Display", "", ""],          // Section header (text only, no numbers)
      ["LG 1.2mm Panel", 20000, 30000],
      ["LED Controller", 3000, 5000],
      ["Grand Total", 23000, 35000],
      // Section 2
      ["Installation", "", ""],         // Section header
      ["Structural Steel", 8000, 12000],
      ["Electrical Work", 5000, 8000],
      ["Grand Total", 13000, 20000],
    ];
    return buildMockWorkbook("Margin Analysis", rows);
  }

  it("parses workbook with 2 sections with correct table count and section names", () => {
    const wb = buildTwoSectionWorkbook();
    const result = parsePricingTablesWithValidation(wb, "test.xlsx");
    const doc = result.document!;

    // Filter out any synthetic rollup tables
    const realTables = doc.tables.filter(
      (t) => t.name !== "Project Grand Total"
    );
    expect(realTables.length).toBe(2);
    expect(realTables[0].name).toBe("LED Display");
    expect(realTables[1].name).toBe("Installation");
  });

  it("grand totals are independent per section", () => {
    const wb = buildTwoSectionWorkbook();
    const result = parsePricingTablesWithValidation(wb, "test.xlsx");
    const doc = result.document!;

    const realTables = doc.tables.filter(
      (t) => t.name !== "Project Grand Total"
    );
    expect(realTables[0].grandTotal).toBe(35000);
    expect(realTables[1].grandTotal).toBe(20000);
  });

  it("document total equals sum of section grand totals when no global total row exists", () => {
    const wb = buildTwoSectionWorkbook();
    const result = parsePricingTablesWithValidation(wb, "test.xlsx");
    const doc = result.document!;

    const realTables = doc.tables.filter(
      (t) => t.name !== "Project Grand Total"
    );
    const sumOfSections = realTables.reduce((s, t) => s + t.grandTotal, 0);
    expect(doc.documentTotal).toBe(sumOfSections);
  });
});

// ============================================================================
// 5. ALTERNATES
// ============================================================================

describe("Alternates", () => {
  it('detects "Alternates - Add to Cost" header and captures alternate line items', () => {
    const rows: any[][] = [
      STD_HEADER,
      ["Main Display Section", "", ""],  // Section header
      ["LG 1.2mm Panel", 20000, 30000],
      ["Grand Total", 20000, 30000],
      ["Alternates - Add to Cost", "", ""],  // Alternate header
      ["Alt - Upgrade to 0.9mm", 5000, 8000],
      ["Alt - Add Weatherproofing", 2000, 3500],
    ];
    const wb = buildMockWorkbook("Margin Analysis", rows);
    const result = parsePricingTablesWithValidation(wb, "test.xlsx");
    const doc = result.document!;

    // Alternates are now promoted to standalone sections (isAlternateSection=true)
    const altSection = doc.tables.find((t) => t.isAlternateSection);
    expect(altSection).toBeDefined();
    expect(altSection!.items.length).toBe(2);
  });

  it("alternate items have correct descriptions and price differences", () => {
    const rows: any[][] = [
      STD_HEADER,
      ["LED Section", "", ""],
      ["Standard Panel", 10000, 15000],
      ["Grand Total", 10000, 15000],
      ["Alternates - Add to Cost", "", ""],
      ["Alt - Premium Panel Upgrade", 3000, 5000],
      ["Alt - Anti-Glare Coating", 1000, 1500],
    ];
    const wb = buildMockWorkbook("Margin Analysis", rows);
    const result = parsePricingTablesWithValidation(wb, "test.xlsx");
    const doc = result.document!;
    const altSection = doc.tables.find((t) => t.isAlternateSection)!;

    expect(altSection.items[0].description).toBe(
      "Alt - Premium Panel Upgrade"
    );
    expect(altSection.items[0].sellingPrice).toBe(5000);
    expect(altSection.items[1].description).toBe(
      "Alt - Anti-Glare Coating"
    );
    expect(altSection.items[1].sellingPrice).toBe(1500);
  });
});

// ============================================================================
// 6. GRAND TOTAL DETECTION
// ============================================================================

describe("Grand Total Detection", () => {
  it('detects "Sub Total (Bid Form)" as grand total row', () => {
    const rows: any[][] = [
      STD_HEADER,
      ["LED Panels", 10000, 15000],
      ["Installation", 5000, 8000],
      ["Sub Total (Bid Form)", 15000, 23000],
    ];
    const wb = buildMockWorkbook("Margin Analysis", rows);
    const result = parsePricingTablesWithValidation(wb, "test.xlsx");
    const doc = result.document!;

    // The parser should recognize "Sub Total (Bid Form)" as a grand total
    const hasTable = doc.tables.some(
      (t) => t.grandTotal === 23000
    );
    expect(hasTable).toBe(true);
  });

  it('detects "Project Grand Total" as grand total row', () => {
    const rows: any[][] = [
      STD_HEADER,
      ["LED Panels", 10000, 15000],
      ["Installation", 5000, 8000],
      ["Project Grand Total", 15000, 23000],
    ];
    const wb = buildMockWorkbook("Margin Analysis", rows);
    const result = parsePricingTablesWithValidation(wb, "test.xlsx");
    const doc = result.document!;

    const hasTable = doc.tables.some((t) => t.grandTotal === 23000);
    expect(hasTable).toBe(true);
  });

  it("synthetic roll-up table is prepended when global total exists but no explicit summary section", () => {
    // Layout: global total row, then two detail sections
    const rows: any[][] = [
      STD_HEADER,
      // Summary-level rows before first section header
      ["LED Display", 20000, 30000],
      ["Installation", 13000, 20000],
      ["Grand Total", 33000, 50000],
      // Detail section 1
      ["LED Display", "", ""],  // section header
      ["LG Panel", 20000, 30000],
      ["Grand Total", 20000, 30000],
      // Detail section 2
      ["Installation", "", ""],  // section header
      ["Steel Work", 13000, 20000],
      ["Grand Total", 13000, 20000],
    ];
    const wb = buildMockWorkbook("Margin Analysis", rows);
    const result = parsePricingTablesWithValidation(wb, "test.xlsx");
    const doc = result.document!;

    // Should have a synthetic rollup or summary table
    const hasSummaryLikeTable = doc.tables.some(
      (t) =>
        t.name.toLowerCase().includes("total") ||
        t.name.toLowerCase().includes("summary")
    );
    expect(hasSummaryLikeTable).toBe(true);
    expect(doc.documentTotal).toBe(50000);
  });
});

// ============================================================================
// 7. STRICT MODE
// ============================================================================

describe("Strict Mode", () => {
  it("in strict mode, returns error when no sections detected", () => {
    // Valid sheet but no recognizable pricing structure
    const rows: any[][] = [
      ["", "Cost", "Selling Price"],
      // All blank rows — no data
      ["", "", ""],
      ["", "", ""],
    ];
    const wb = buildMockWorkbook("Margin Analysis", rows);
    const result = parsePricingTablesWithValidation(wb, "test.xlsx", {
      strict: true,
    });
    expect(result.document).toBeNull();
    expect(result.validation.status).toBe("FAIL");
    expect(result.validation.errors.length).toBeGreaterThan(0);
  });

  it("in strict mode, returns error when a section has zero items", () => {
    const rows: any[][] = [
      STD_HEADER,
      ["Empty Section", "", ""],    // Section header with no items following
      ["Grand Total", 0, 0],
    ];
    const wb = buildMockWorkbook("Margin Analysis", rows);
    const result = parsePricingTablesWithValidation(wb, "test.xlsx", {
      strict: true,
    });
    expect(result.document).toBeNull();
    expect(result.validation.status).toBe("FAIL");
  });

  it("in non-strict mode (default), falls back gracefully to single-table mode", () => {
    // Data rows exist but no section headers — parser should fall back
    const rows: any[][] = [
      STD_HEADER,
      ["LED Panel", 10000, 15000],
      ["Controller", 2000, 3000],
    ];
    const wb = buildMockWorkbook("Margin Analysis", rows);
    const result = parsePricingTablesWithValidation(wb, "test.xlsx");
    expect(result.document).not.toBeNull();
    expect(result.document!.tables.length).toBeGreaterThanOrEqual(1);

    // Should find our items
    const allItems = result.document!.tables.flatMap((t) => t.items);
    expect(allItems.length).toBe(2);
    expect(allItems[0].description).toBe("LED Panel");
    expect(allItems[1].description).toBe("Controller");
  });
});

// ============================================================================
// 8. EDGE CASES
// ============================================================================

describe("Edge Cases", () => {
  it("handles currency formatting in cells ($1,234.56 → 1234.56)", () => {
    const rows: any[][] = [
      STD_HEADER,
      ["Premium Display", "$10,000.00", "$15,000.50"],
      ["Grand Total", "$10,000.00", "$15,000.50"],
    ];
    const wb = buildMockWorkbook("Margin Analysis", rows);
    const result = parsePricingTablesWithValidation(wb, "test.xlsx");
    const doc = result.document!;
    const allItems = doc.tables.flatMap((t) => t.items);
    const displayItem = allItems.find((i) => i.description === "Premium Display");
    expect(displayItem).toBeDefined();
    expect(displayItem!.sellingPrice).toBeCloseTo(15000.50, 2);
  });

  it("handles parenthetical negatives (($500) → -500)", () => {
    const rows: any[][] = [
      STD_HEADER,
      ["LED Section", "", ""],
      ["Standard Panel", 10000, 15000],
      ["Grand Total", 10000, 15000],
      ["Alternates - Add to Cost", "", ""],
      ["Alt - Downgrade savings", "($500)", "($800)"],
    ];
    const wb = buildMockWorkbook("Margin Analysis", rows);
    const result = parsePricingTablesWithValidation(wb, "test.xlsx");
    const doc = result.document!;
    // Alternates promoted to standalone section
    const altSection = doc.tables.find((t) => t.isAlternateSection);
    expect(altSection).toBeDefined();
    // Parenthetical ($800) should parse as -800
    expect(altSection!.items[0].sellingPrice).toBe(-800);
  });

  it('handles "N/A" and "INCLUDED" cell values — N/A gets textValue, INCLUDED gets isIncluded', () => {
    const rows: any[][] = [
      STD_HEADER,
      ["Warranty Extension", "N/A", 0],
      ["Project Management", "INCLUDED", 0],
      ["LED Panel", 10000, 15000],
      ["Grand Total", 10000, 15000],
    ];
    const wb = buildMockWorkbook("Margin Analysis", rows);
    const result = parsePricingTablesWithValidation(wb, "test.xlsx");
    const doc = result.document!;
    const allItems = doc.tables.flatMap((t) => t.items);

    // "N/A" in cost column: isIncluded=false, textValue="N/A" (not "INCLUDED")
    const warranty = allItems.find((i) => i.description === "Warranty Extension");
    expect(warranty).toBeDefined();
    expect(warranty!.isIncluded).toBe(false);
    expect(warranty!.textValue).toBe("N/A");
    expect(warranty!.sellingPrice).toBe(0);

    // "INCLUDED" in cost column: isIncluded=true, textValue="INCLUDED"
    const pm = allItems.find((i) => i.description === "Project Management");
    expect(pm).toBeDefined();
    expect(pm!.isIncluded).toBe(true);
    expect(pm!.textValue).toBe("INCLUDED");
    expect(pm!.sellingPrice).toBe(0);

    // The real item should be normal
    const panel = allItems.find((i) => i.description === "LED Panel");
    expect(panel).toBeDefined();
    expect(panel!.sellingPrice).toBe(15000);
    expect(panel!.isIncluded).toBe(false);
    expect(panel!.textValue).toBeUndefined();
  });

  it("preserves trailing line items when Selling Price is blank but Cost is present", () => {
    const rows: any[][] = [
      STD_HEADER,
      ["Main Display", 10000, 15000],
      ["Control System", 2500, ""],
      ["Warranty", 1200, ""],
      ["Grand Total", 13700, 15000],
    ];
    const wb = buildMockWorkbook("Margin Analysis", rows);
    const result = parsePricingTablesWithValidation(wb, "test.xlsx");
    const doc = result.document!;
    const allItems = doc.tables.flatMap((t) => t.items);

    const control = allItems.find((i) => i.description === "Control System");
    const warranty = allItems.find((i) => i.description === "Warranty");
    expect(control).toBeDefined();
    expect(warranty).toBeDefined();
    expect(control!.sellingPrice).toBe(2500);
    expect(warranty!.sellingPrice).toBe(1200);
  });

  it("text-only rows after sections with column headers stay as line items, not new sections", () => {
    // Simulates real ANC Excel: section headers have "Cost"/"Selling Price" in cost/sell cells.
    // "Control System" and "Warranty" are text-only rows (no price) that should NOT create
    // new sections — they should be captured as $0 line items in the preceding section.
    const rows: any[][] = [
      ["", "Cost", "Selling Price"],
      ["Base Option #1 - Eagles Nest", "Cost", "Selling Price"],  // Real section header with column headers
      ["LED Display", 100000, 200000],
      ["Structural Materials", 30000, 50000],
      ["Control System", "", ""],        // Text-only row — NOT a section header
      ["Warranty", "", ""],              // Text-only row — NOT a section header
      ["Grand Total", 130000, 250000],
    ];
    const wb = buildMockWorkbook("Margin Analysis", rows);
    const result = parsePricingTablesWithValidation(wb, "test.xlsx");
    const doc = result.document!;

    // Should be exactly 1 real section (plus possible synthetic rollup)
    const realTables = doc.tables.filter(
      (t) => t.name !== "Project Grand Total"
    );
    expect(realTables.length).toBe(1);
    expect(realTables[0].name).toBe("Base Option #1 - Eagles Nest");

    // Control System and Warranty should be line items, not lost
    const allItems = realTables[0].items;
    const control = allItems.find((i) => i.description === "Control System");
    const warranty = allItems.find((i) => i.description === "Warranty");
    expect(control).toBeDefined();
    expect(warranty).toBeDefined();
    expect(control!.isIncluded).toBe(true);
    expect(warranty!.isIncluded).toBe(true);
  });

  it('"Excluded" items get isExcluded=true and textValue, not isIncluded', () => {
    const rows: any[][] = [
      STD_HEADER,
      ["LED Display", 10000, 15000],
      ["Content Management System", "Excluded", "Excluded"],
      ["Grand Total", 10000, 15000],
    ];
    const wb = buildMockWorkbook("Margin Analysis", rows);
    const result = parsePricingTablesWithValidation(wb, "test.xlsx");
    const doc = result.document!;
    const allItems = doc.tables.flatMap((t) => t.items);

    const cms = allItems.find((i) => i.description === "Content Management System");
    expect(cms).toBeDefined();
    expect(cms!.isExcluded).toBe(true);
    expect(cms!.isIncluded).toBe(false);
    expect(cms!.textValue).toBe("Excluded");
    expect(cms!.sellingPrice).toBe(0);
  });

  it("Excel error strings (#VALUE!, #REF!) do not create ghost section headers", () => {
    const rows: any[][] = [
      STD_HEADER,
      ["LED Display", 10000, 15000],
      ["CMS Integration", "#VALUE!", "#VALUE!"],
      ["Warranty", "#REF!", 5000],
      ["Grand Total", 10000, 20000],
    ];
    const wb = buildMockWorkbook("Margin Analysis", rows);
    const result = parsePricingTablesWithValidation(wb, "test.xlsx");
    const doc = result.document!;

    // Error rows should NOT create new sections — they should stay as line items
    const realTables = doc.tables.filter((t) => t.name !== "Project Grand Total");
    expect(realTables.length).toBe(1);

    const allItems = realTables[0].items;
    // CMS with #VALUE! in both columns: hasErrorData=true, treated as line item
    const cms = allItems.find((i) => i.description === "CMS Integration");
    expect(cms).toBeDefined();

    // Warranty with #REF! in cost but 5000 in sell: normal line item
    const warranty = allItems.find((i) => i.description === "Warranty");
    expect(warranty).toBeDefined();
    expect(warranty!.sellingPrice).toBe(5000);
  });

  it("keeps INCLUDED text rows as real line items", () => {
    const rows: any[][] = [
      STD_HEADER,
      ["Main Display", 10000, 15000],
      ["Control System", "INCLUDED", ""],
      ["Warranty", "", "INCLUDED"],
      ["Grand Total", 10000, 15000],
    ];
    const wb = buildMockWorkbook("Margin Analysis", rows);
    const result = parsePricingTablesWithValidation(wb, "test.xlsx");
    const doc = result.document!;
    const allItems = doc.tables.flatMap((t) => t.items);

    const control = allItems.find((i) => i.description === "Control System");
    const warranty = allItems.find((i) => i.description === "Warranty");
    expect(control).toBeDefined();
    expect(warranty).toBeDefined();
    expect(control!.isIncluded).toBe(true);
    expect(warranty!.isIncluded).toBe(true);
    expect(control!.sellingPrice).toBe(0);
    expect(warranty!.sellingPrice).toBe(0);
  });
});
