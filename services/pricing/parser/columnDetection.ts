/**
 * Column Detection — finds Cost/Selling Price/Margin columns from header rows
 *
 * Tiered approach:
 *   Tier 1 — exact synonym match (fast, high confidence)
 *   Tier 2 — contains-based fuzzy match (catches unknown naming variations)
 *
 * Designed to handle any ANC Excel template without per-file fixes.
 */

export interface ColumnMap {
  label: number;
  cost: number;
  sell: number;
  margin: number;
  marginPct: number;
}

// ---------------------------------------------------------------------------
// Tier 1: Exact synonyms (normalized to lowercase, collapsed whitespace)
// ---------------------------------------------------------------------------

const COST_EXACT = new Set([
  "cost",
  "budgeted cost",
  "total cost",
  "project cost",
  "estimated cost",
  "base cost",
  "net cost",
  "cost total",
  "extended cost",
]);

const SELL_EXACT = new Set([
  "selling price",
  "sell price",
  "sale price",
  "sales price",
  "revenue",
  "sell",
  "price",
  "total price",
  "total selling price",
  "contract price",
  "contract value",
  "extended price",
  "amount",
  "net price",
]);

const MARGIN_EXACT = new Set([
  "margin $",
  "margin amount",
  "margin",
  "gross margin",
  "profit",
  "gross profit",
]);

const MARGIN_PCT_EXACT = new Set([
  "margin %",
  "margin percent",
  "margin pct",
  "gm%",
  "gm %",
]);

// ---------------------------------------------------------------------------
// Tier 2: Contains-based keywords (order matters — first match wins)
// ---------------------------------------------------------------------------

const COST_CONTAINS = ["cost", "expense"];
const SELL_CONTAINS = ["sell", "price", "revenue", "contract"];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const norm = (s: any) => String(s ?? "").toLowerCase().replace(/\s+/g, " ").trim();

function findByExactSet(cells: string[], set: Set<string>): number {
  return cells.findIndex((c) => set.has(c));
}

function findByContains(cells: string[], keywords: string[], exclude: number): number {
  for (const kw of keywords) {
    const idx = cells.findIndex((c, i) => i !== exclude && c.includes(kw) && c.length < 40);
    if (idx !== -1) return idx;
  }
  return -1;
}

function findLabelColumn(cells: string[], costIdx: number): number {
  // Walk left from cost looking for a text-heavy column
  for (let j = costIdx - 1; j >= 0; j--) {
    if (cells[j] && cells[j].length > 0 && !/^\d/.test(cells[j])) return j;
  }
  return Math.max(0, costIdx - 1);
}

function findMarginColumns(cells: string[], sellIdx: number): { margin: number; marginPct: number } {
  const marginIdx = findByExactSet(cells, MARGIN_EXACT);
  const marginPctIdx = findByExactSet(cells, MARGIN_PCT_EXACT);
  return {
    margin: marginIdx !== -1 ? marginIdx : sellIdx + 1,
    marginPct: marginPctIdx !== -1 ? marginPctIdx : sellIdx + 2,
  };
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Column validation: detect header-vs-data shift
// ---------------------------------------------------------------------------

const isTextLabel = (v: any) => {
  const s = String(v ?? "").trim();
  return s.length > 0 && /[a-z]/i.test(s);
};

const isNumericCell = (v: any) => {
  if (typeof v === "number" && isFinite(v)) return true;
  const s = String(v ?? "").replace(/[$£€C,\s]/g, "").trim();
  return s.length > 0 && isFinite(parseFloat(s));
};

/**
 * After finding a column map from headers, validate that the label column
 * actually contains text in data rows. If it contains mostly numbers, the
 * header row is shifted relative to data — apply a corrective shift.
 */
function validateColumnMap(data: any[][], headerRowIdx: number, map: ColumnMap): ColumnMap {
  const start = headerRowIdx + 1;
  const end = Math.min(data.length, start + 20);
  let labelText = 0;
  let labelNumeric = 0;

  for (let i = start; i < end; i++) {
    const row = data[i] || [];
    const v = row[map.label];
    if (v === "" || v === null || v === undefined) continue;
    if (isTextLabel(v)) labelText++;
    else if (isNumericCell(v)) labelNumeric++;
  }

  // If label column has MORE numbers than text, header is likely shifted right
  if (labelNumeric > labelText && labelNumeric >= 3) {
    // Try shifting the entire map left by 1
    const shifted: ColumnMap = {
      label: map.label - 1,
      cost: map.cost - 1,
      sell: map.sell - 1,
      margin: map.margin - 1,
      marginPct: map.marginPct - 1,
    };
    // Verify shift is valid (no negative indices) and label col now has text
    if (shifted.label >= 0 && shifted.cost >= 0 && shifted.sell >= 0) {
      let shiftedText = 0;
      let shiftedNumeric = 0;
      for (let i = start; i < end; i++) {
        const row = data[i] || [];
        const v = row[shifted.label];
        if (v === "" || v === null || v === undefined) continue;
        if (isTextLabel(v)) shiftedText++;
        else if (isNumericCell(v)) shiftedNumeric++;
      }
      if (shiftedText > shiftedNumeric) {
        console.log(`[COL DETECT] Header-data shift detected: label col ${map.label} has ${labelNumeric} numbers vs ${labelText} text. Shifting all columns left by 1.`);
        return shifted;
      }
    }
  }

  return map;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Find column headers dynamically.
 * Searches first 40 rows. Returns null only if no viable cost+sell pair found.
 *
 * Tiered:
 *   Tier 1 — exact cost+sell synonym match
 *   Tier 2 — fuzzy contains match
 *   Tier 3 — sell-only (no cost column — common in audit/summary sheets)
 */
export function findColumnHeaders(data: any[][]): ColumnMap | null {
  const limit = Math.min(data.length, 40);

  // Find the header row index for validation (first row with cost or sell keywords)
  const findHeaderRow = (map: ColumnMap): number => {
    for (let i = 0; i < limit; i++) {
      const row = data[i] || [];
      const cells = row.map(norm);
      if (COST_EXACT.has(cells[map.cost]) || SELL_EXACT.has(cells[map.sell])) return i;
    }
    return 0;
  };

  // Pass 1: Tier 1 exact match (cost + sell)
  for (let i = 0; i < limit; i++) {
    const row = data[i] || [];
    const cells = row.map(norm);
    const costIdx = findByExactSet(cells, COST_EXACT);
    const sellIdx = findByExactSet(cells, SELL_EXACT);
    if (costIdx !== -1 && sellIdx !== -1 && costIdx !== sellIdx) {
      const { margin, marginPct } = findMarginColumns(cells, sellIdx);
      const rawMap = { label: findLabelColumn(cells, costIdx), cost: costIdx, sell: sellIdx, margin, marginPct };
      const validated = validateColumnMap(data, i, rawMap);
      console.log(`[COL DETECT] Tier 1 match at row ${i}: cost@${validated.cost}="${cells[costIdx]}", sell@${validated.sell}="${cells[sellIdx]}"${validated !== rawMap ? " (shift-corrected)" : ""}`);
      return validated;
    }
  }

  // Pass 2: Tier 2 fuzzy contains match (cost + sell)
  for (let i = 0; i < limit; i++) {
    const row = data[i] || [];
    const cells = row.map(norm);
    const costIdx = findByContains(cells, COST_CONTAINS, -1);
    if (costIdx === -1) continue;
    const sellIdx = findByContains(cells, SELL_CONTAINS, costIdx);
    if (sellIdx === -1) continue;
    const { margin, marginPct } = findMarginColumns(cells, sellIdx);
    const rawMap = { label: findLabelColumn(cells, costIdx), cost: costIdx, sell: sellIdx, margin, marginPct };
    const validated = validateColumnMap(data, i, rawMap);
    console.log(`[COL DETECT] Tier 2 fuzzy match at row ${i}: cost@${validated.cost}="${cells[costIdx]}", sell@${validated.sell}="${cells[sellIdx]}"${validated !== rawMap ? " (shift-corrected)" : ""}`);
    return validated;
  }

  // Pass 3: Tier 3 — sell-only (no cost column found, common in audit sheets)
  for (let i = 0; i < limit; i++) {
    const row = data[i] || [];
    const cells = row.map(norm);
    const sellIdx = findByExactSet(cells, SELL_EXACT);
    if (sellIdx !== -1) {
      // Verify this row's sell column has numeric data below it (not just a stray label)
      let numericCount = 0;
      for (let j = i + 1; j < Math.min(data.length, i + 15); j++) {
        const dr = data[j] || [];
        if (isNumericCell(dr[sellIdx])) numericCount++;
      }
      if (numericCount >= 2) {
        const labelIdx = findLabelColumn(cells, sellIdx);
        // In sell-only mode, cost maps to same column as sell (best-effort)
        const rawMap = { label: labelIdx, cost: sellIdx, sell: sellIdx, margin: sellIdx + 1, marginPct: sellIdx + 2 };
        const validated = validateColumnMap(data, i, rawMap);
        console.log(`[COL DETECT] Tier 3 sell-only match at row ${i}: sell@${validated.sell}="${cells[sellIdx]}" (no cost column)`);
        return validated;
      }
    }
  }

  // Diagnostic: log first 10 rows so failures are debuggable
  console.warn("[COL DETECT] FAILED — no pricing columns found. First 10 rows:");
  for (let i = 0; i < Math.min(data.length, 10); i++) {
    const row = (data[i] || []).map(norm).filter((c) => c.length > 0);
    if (row.length > 0) console.warn(`  R${i}: ${row.join(" | ")}`);
  }

  return null;
}
