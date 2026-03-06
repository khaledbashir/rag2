/**
 * Excel Normalizer — "Frankenstein" file handler
 *
 * When the standard pricingTableParser can't read a file (no Margin Analysis sheet,
 * weird column layouts, non-standard structure), this module:
 *
 * 1. Analyzes all sheets to find pricing-like data
 * 2. Suggests column mappings via heuristics
 * 3. Builds a standard PricingDocument from user-confirmed mappings
 *
 * Output feeds into the exact same pipeline as the standard parser —
 * same PricingTable[], same Mirror Mode rendering. No math, ever.
 */

import {
    type PricingDocument,
    type PricingTable,
    type PricingLineItem,
    type AlternateItem,
    createTableId,
    detectCurrency,
} from "@/types/pricing";

// ============================================================================
// TYPES
// ============================================================================

export type ColumnRole =
    | "description"
    | "selling_price"
    | "cost"
    | "margin_pct"
    | "margin_dollar"
    | "skip";

export interface ColumnMapping {
    /** Column index → assigned role */
    columns: Record<number, ColumnRole>;
    /** Which row is the header row (0-indexed) */
    headerRow: number;
    /** How sections are separated */
    sectionMode: "blank_rows" | "bold_text" | "single_table";
    /** Selected sheet name */
    sheetName: string;
}

export interface SheetAnalysis {
    sheetName: string;
    headers: string[];
    sampleRows: string[][];
    rowCount: number;
    colCount: number;
    /** Heuristic confidence score (0-100) */
    score: number;
    /** Auto-detected column suggestions */
    suggestions: Record<number, ColumnRole>;
    /** Auto-detected header row */
    suggestedHeaderRow: number;
}

// ============================================================================
// SHEET ANALYSIS — Scan workbook for pricing-like data
// ============================================================================

/**
 * Analyze all sheets in a workbook and rank them by likelihood of containing pricing data.
 * Uses the grid data from ExcelPreview (already parsed client-side).
 */
export function analyzeSheets(
    sheets: Array<{ name: string; grid: string[][] }>
): SheetAnalysis[] {
    return sheets
        .map((sheet) => analyzeOneSheet(sheet.name, sheet.grid))
        .sort((a, b) => b.score - a.score);
}

function analyzeOneSheet(sheetName: string, grid: string[][]): SheetAnalysis {
    if (grid.length === 0) {
        return {
            sheetName,
            headers: [],
            sampleRows: [],
            rowCount: 0,
            colCount: 0,
            score: 0,
            suggestions: {},
            suggestedHeaderRow: 0,
        };
    }

    // Find the header row — the row with the most non-empty text cells
    // that also contains pricing-like keywords
    const headerRow = detectHeaderRow(grid);
    const headers = grid[headerRow] || [];
    const colCount = headers.length;

    // Grab sample data rows (skip empty rows, take first 15)
    const dataRows = grid
        .slice(headerRow + 1)
        .filter((row) => row.some((cell) => cell.trim() !== ""))
        .slice(0, 15);

    // Score this sheet for pricing-like content
    const score = scoreSheet(sheetName, headers, dataRows);

    // Suggest column roles based on header text and data patterns
    const suggestions = suggestColumns(headers, dataRows);

    return {
        sheetName,
        headers,
        sampleRows: dataRows,
        rowCount: grid.length,
        colCount,
        score,
        suggestions,
        suggestedHeaderRow: headerRow,
    };
}

// ============================================================================
// HEADER ROW DETECTION
// ============================================================================

const HEADER_KEYWORDS = [
    "description", "item", "work", "scope", "line",
    "price", "pricing", "amount", "total", "cost",
    "selling", "sell", "bid", "quote",
    "margin", "markup",
    "qty", "quantity", "unit",
];

function detectHeaderRow(grid: string[][]): number {
    let bestRow = 0;
    let bestScore = -1;

    // Only scan first 20 rows
    const scanLimit = Math.min(grid.length, 20);

    for (let r = 0; r < scanLimit; r++) {
        const row = grid[r];
        if (!row || row.every((c) => !c.trim())) continue;

        let rowScore = 0;
        const nonEmptyCells = row.filter((c) => c.trim() !== "").length;

        // Must have at least 2 non-empty cells to be a header
        if (nonEmptyCells < 2) continue;

        // Score each cell for header-like keywords
        for (const cell of row) {
            const lower = cell.toLowerCase().trim();
            if (!lower) continue;

            for (const kw of HEADER_KEYWORDS) {
                if (lower.includes(kw)) {
                    rowScore += 10;
                    break;
                }
            }

            // Penalty: if cell looks like a number/currency, probably not a header
            if (/^\$?[\d,]+\.?\d*$/.test(lower.replace(/\s/g, ""))) {
                rowScore -= 5;
            }
        }

        // Bonus for having multiple header keywords
        if (rowScore > bestScore) {
            bestScore = rowScore;
            bestRow = r;
        }
    }

    return bestRow;
}

// ============================================================================
// SHEET SCORING — How likely is this sheet to contain pricing data?
// ============================================================================

const PRICING_SHEET_KEYWORDS = [
    "margin", "analysis", "pricing", "cost", "bid",
    "budget", "estimate", "quote", "proposal", "summary",
    "total", "breakdown", "schedule",
];

const EXCLUDE_SHEET_KEYWORDS = [
    "drawing", "layout", "picture", "image", "photo",
    "chart", "graph", "cover", "template", "instructions",
];

function scoreSheet(sheetName: string, headers: string[], dataRows: string[][]): number {
    let score = 0;
    const lowerName = sheetName.toLowerCase();

    // Sheet name scoring
    for (const kw of PRICING_SHEET_KEYWORDS) {
        if (lowerName.includes(kw)) score += 15;
    }
    for (const kw of EXCLUDE_SHEET_KEYWORDS) {
        if (lowerName.includes(kw)) score -= 30;
    }

    // Header keyword scoring
    for (const h of headers) {
        const lower = h.toLowerCase().trim();
        if (lower.includes("description") || lower.includes("item") || lower.includes("work")) score += 10;
        if (lower.includes("price") || lower.includes("amount") || lower.includes("selling")) score += 10;
        if (lower.includes("cost")) score += 8;
        if (lower.includes("total")) score += 5;
    }

    // Data row scoring — look for currency-like values
    let numericCols = 0;
    let textCols = 0;
    if (dataRows.length > 0) {
        for (let c = 0; c < Math.min(headers.length, 20); c++) {
            const colValues = dataRows.map((row) => row[c] || "").filter((v) => v.trim());
            const numericCount = colValues.filter((v) =>
                /^\$?[\d,]+\.?\d*$/.test(v.replace(/\s/g, ""))
            ).length;
            const textCount = colValues.filter((v) =>
                v.length > 3 && !/^\$?[\d,]+\.?\d*$/.test(v.replace(/\s/g, ""))
            ).length;

            if (numericCount > colValues.length * 0.4) numericCols++;
            if (textCount > colValues.length * 0.4) textCols++;
        }
    }

    // A pricing sheet typically has 1+ text columns and 1+ numeric columns
    if (textCols >= 1 && numericCols >= 1) score += 20;
    if (numericCols >= 2) score += 10;

    // Row count — pricing sheets usually have 5+ rows of data
    if (dataRows.length >= 5) score += 10;
    if (dataRows.length >= 15) score += 5;

    // Penalty for very few rows
    if (dataRows.length < 3) score -= 10;

    return Math.max(0, score);
}

// ============================================================================
// COLUMN SUGGESTION — Heuristics to auto-detect column roles
// ============================================================================

function suggestColumns(headers: string[], dataRows: string[][]): Record<number, ColumnRole> {
    const suggestions: Record<number, ColumnRole> = {};

    for (let c = 0; c < headers.length; c++) {
        const headerLower = (headers[c] || "").toLowerCase().trim();
        const colValues = dataRows.map((row) => row[c] || "").filter((v) => v.trim());

        // By header text
        if (headerLower.includes("description") || headerLower.includes("item") ||
            headerLower.includes("work") || headerLower.includes("scope") ||
            headerLower === "line" || headerLower === "name") {
            suggestions[c] = "description";
            continue;
        }

        if (headerLower.includes("selling") || headerLower.includes("sell price") ||
            headerLower === "price" || headerLower === "pricing" ||
            headerLower === "amount" || headerLower.includes("bid")) {
            suggestions[c] = "selling_price";
            continue;
        }

        if (headerLower === "cost" || headerLower.includes("our cost") ||
            headerLower.includes("unit cost") || headerLower.includes("ext cost")) {
            suggestions[c] = "cost";
            continue;
        }

        if (headerLower.includes("margin %") || headerLower.includes("margin%") ||
            headerLower.includes("markup %") || headerLower === "%") {
            suggestions[c] = "margin_pct";
            continue;
        }

        if (headerLower.includes("margin $") || headerLower.includes("margin$") ||
            headerLower.includes("margin dollar")) {
            suggestions[c] = "margin_dollar";
            continue;
        }

        // By data pattern if header is ambiguous
        if (colValues.length > 0) {
            const numericCount = colValues.filter((v) =>
                /^\$?-?[\d,]+\.?\d*$/.test(v.replace(/\s/g, ""))
            ).length;
            const percentCount = colValues.filter((v) =>
                /^\d+\.?\d*\s*%$/.test(v.trim())
            ).length;
            const textCount = colValues.filter((v) =>
                v.length > 5 && !/^\$?[\d,]+/.test(v.replace(/\s/g, ""))
            ).length;

            // Mostly text → probably description
            if (textCount > colValues.length * 0.5 && !suggestions[c]) {
                // Only assign if no description yet
                const hasDesc = Object.values(suggestions).includes("description");
                if (!hasDesc) {
                    suggestions[c] = "description";
                    continue;
                }
            }

            // Mostly percentages → margin %
            if (percentCount > colValues.length * 0.3 && !suggestions[c]) {
                suggestions[c] = "margin_pct";
                continue;
            }

            // Mostly numbers and we already have description → could be price
            if (numericCount > colValues.length * 0.4 && !suggestions[c]) {
                const hasPrice = Object.values(suggestions).includes("selling_price");
                const hasCost = Object.values(suggestions).includes("cost");
                if (!hasPrice) {
                    suggestions[c] = "selling_price";
                } else if (!hasCost) {
                    suggestions[c] = "cost";
                }
                continue;
            }
        }
    }

    return suggestions;
}

// ============================================================================
// BUILD PRICING DOCUMENT — Convert mapped grid data to PricingDocument
// ============================================================================

export function buildPricingDocumentFromGrid(
    grid: string[][],
    mapping: ColumnMapping,
    fileName: string
): PricingDocument {
    const { columns, headerRow, sectionMode, sheetName } = mapping;

    // Find column indices for each role
    const descCol = findColByRole(columns, "description");
    const priceCol = findColByRole(columns, "selling_price");
    const costCol = findColByRole(columns, "cost");

    const currency = detectCurrency(sheetName);
    const dataRows = grid.slice(headerRow + 1);

    // Build sections based on section mode
    const sections = splitIntoSections(dataRows, sectionMode, descCol);

    // Build PricingTables from sections
    const tables: PricingTable[] = [];
    let documentTotal = 0;

    for (let i = 0; i < sections.length; i++) {
        const section = sections[i];
        const items: PricingLineItem[] = [];
        const alternates: AlternateItem[] = [];
        let subtotal = 0;

        for (const row of section.rows) {
            const desc = descCol !== null ? (row[descCol] || "").trim() : "";
            const priceRaw = priceCol !== null ? (row[priceCol] || "").trim() : "0";
            const price = parseNumeric(priceRaw);

            if (!desc && price === 0) continue; // Skip empty rows

            // Check if this is an alternate row
            const descLower = desc.toLowerCase();
            if (descLower.includes("alternate") || descLower.includes("option") ||
                descLower.includes("add to cost") || descLower.includes("deduct")) {
                alternates.push({
                    description: desc,
                    priceDifference: price,
                    sourceRow: headerRow + 1 + section.startIndex,
                });
                continue;
            }

            // Check if this is a total/subtotal row (skip — we compute from items)
            if (descLower.includes("sub total") || descLower.includes("subtotal") ||
                descLower === "total" || descLower.includes("grand total") ||
                descLower.includes("total project") || descLower.includes("bid form")) {
                // Use this as the section total if it's reasonable
                if (price > 0 && items.length > 0) {
                    subtotal = price; // Trust the Excel total
                }
                continue;
            }

            // Skip TAX and BOND rows — these are captured separately, not line items
            if (descLower === "tax" || descLower.startsWith("tax ") ||
                descLower === "bond" || descLower === "hst" || descLower === "gst" ||
                descLower.startsWith("hst ") || descLower.startsWith("gst ")) {
                continue;
            }

            // Skip blank-label rows with numbers — these are subtotal/summary rows
            if (!desc && price !== 0) {
                continue;
            }

            items.push({
                description: desc,
                sellingPrice: price,
                isIncluded: price === 0 && desc.toLowerCase().includes("include"),
                sourceRow: headerRow + 1 + section.startIndex,
            });
        }

        if (items.length === 0) continue; // Skip empty sections

        // If no subtotal row was found, sum the items
        if (subtotal === 0) {
            subtotal = items.reduce((sum, item) => sum + item.sellingPrice, 0);
        }

        const table: PricingTable = {
            id: createTableId(section.name, i),
            name: section.name,
            currency,
            items,
            subtotal,
            tax: null,
            bond: 0,
            tariff: 0,
            grandTotal: subtotal,
            alternates,
            sourceStartRow: headerRow + 1 + section.startIndex,
            sourceEndRow: headerRow + 1 + section.startIndex + section.rows.length,
        };

        tables.push(table);
        documentTotal += subtotal;
    }

    // If no sections were created, make one table from all data
    if (tables.length === 0 && dataRows.length > 0) {
        const items: PricingLineItem[] = [];
        for (let r = 0; r < dataRows.length; r++) {
            const row = dataRows[r];
            const desc = descCol !== null ? (row[descCol] || "").trim() : "";
            const priceRaw = priceCol !== null ? (row[priceCol] || "").trim() : "0";
            const price = parseNumeric(priceRaw);
            if (!desc && price === 0) continue;
            items.push({
                description: desc,
                sellingPrice: price,
                isIncluded: false,
                sourceRow: headerRow + 1 + r,
            });
        }
        const subtotal = items.reduce((sum, item) => sum + item.sellingPrice, 0);
        tables.push({
            id: createTableId(sheetName, 0),
            name: sheetName,
            currency,
            items,
            subtotal,
            tax: null,
            bond: 0,
            tariff: 0,
            grandTotal: subtotal,
            alternates: [],
        });
        documentTotal = subtotal;
    }

    return {
        tables,
        mode: "MIRROR",
        sourceSheet: sheetName,
        currency,
        documentTotal,
        metadata: {
            importedAt: new Date().toISOString(),
            fileName,
            tablesCount: tables.length,
            itemsCount: tables.reduce((sum, t) => sum + t.items.length, 0),
            alternatesCount: tables.reduce((sum, t) => sum + t.alternates.length, 0),
            warnings: ["Imported via Column Mapper (non-standard format)"],
        },
    };
}

// ============================================================================
// SECTION SPLITTING
// ============================================================================

interface Section {
    name: string;
    rows: string[][];
    startIndex: number;
}

function splitIntoSections(
    dataRows: string[][],
    mode: "blank_rows" | "bold_text" | "single_table",
    descCol: number | null
): Section[] {
    if (mode === "single_table" || descCol === null) {
        return [{
            name: "All Items",
            rows: dataRows,
            startIndex: 0,
        }];
    }

    if (mode === "blank_rows") {
        return splitByBlankRows(dataRows, descCol);
    }

    // bold_text mode — look for rows where description is filled but price columns are empty
    return splitBySectionHeaders(dataRows, descCol);
}

function splitByBlankRows(dataRows: string[][], descCol: number): Section[] {
    const sections: Section[] = [];
    let currentRows: string[][] = [];
    let currentName = "Section 1";
    let startIndex = 0;
    let sectionCount = 1;

    for (let r = 0; r < dataRows.length; r++) {
        const row = dataRows[r];
        const isEmpty = row.every((cell) => !cell.trim());

        if (isEmpty && currentRows.length > 0) {
            sections.push({ name: currentName, rows: currentRows, startIndex });
            currentRows = [];
            sectionCount++;
            currentName = `Section ${sectionCount}`;
            startIndex = r + 1;
        } else if (!isEmpty) {
            // Use first non-empty row as section name if it looks like a header
            if (currentRows.length === 0) {
                const desc = (row[descCol] || "").trim();
                const hasOnlyDesc = row.filter((c, i) => i !== descCol && c.trim()).length === 0;
                if (desc && hasOnlyDesc) {
                    currentName = desc;
                    startIndex = r + 1;
                    continue; // Don't add header row as data
                }
            }
            currentRows.push(row);
        }
    }

    if (currentRows.length > 0) {
        sections.push({ name: currentName, rows: currentRows, startIndex });
    }

    return sections;
}

function splitBySectionHeaders(dataRows: string[][], descCol: number): Section[] {
    const sections: Section[] = [];
    let currentRows: string[][] = [];
    let currentName = "Section 1";
    let startIndex = 0;

    for (let r = 0; r < dataRows.length; r++) {
        const row = dataRows[r];
        const desc = (row[descCol] || "").trim();

        // A section header: has description text but all numeric columns are empty
        const otherCells = row.filter((c, i) => i !== descCol);
        const allOthersEmpty = otherCells.every((c) => !c.trim());
        const isAllCaps = desc === desc.toUpperCase() && desc.length > 3;
        const isHeader = desc && allOthersEmpty && (isAllCaps || desc.endsWith(":"));

        if (isHeader && currentRows.length > 0) {
            sections.push({ name: currentName, rows: currentRows, startIndex });
            currentRows = [];
            currentName = desc;
            startIndex = r + 1;
        } else if (isHeader && currentRows.length === 0) {
            currentName = desc;
            startIndex = r + 1;
        } else if (desc || row.some((c) => c.trim())) {
            currentRows.push(row);
        }
    }

    if (currentRows.length > 0) {
        sections.push({ name: currentName, rows: currentRows, startIndex });
    }

    return sections;
}

// ============================================================================
// HELPERS
// ============================================================================

function findColByRole(columns: Record<number, ColumnRole>, role: ColumnRole): number | null {
    for (const [idx, r] of Object.entries(columns)) {
        if (r === role) return parseInt(idx);
    }
    return null;
}

function parseNumeric(value: string): number {
    if (!value) return 0;
    // Remove $, commas, spaces, parentheses (for negative)
    let cleaned = value.replace(/[\$,\s]/g, "").trim();
    // Handle accounting negatives: (1234.56)
    if (cleaned.startsWith("(") && cleaned.endsWith(")")) {
        cleaned = "-" + cleaned.slice(1, -1);
    }
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
}
