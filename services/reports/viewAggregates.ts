/**
 * Mirrors a saved CRM view's FOOTER TOTALS into an export sheet.
 *
 * Jireh, 2026-08-21: every report now carries totals at the bottom and a
 * default alphabetical sort. He then asked for the same totals to reach the
 * branded Excel exports, "so a report and its export always agree to the
 * dollar". They did not: the export summed the two columns it happened to know
 * about, while the CRM footer sums, averages or counts whatever each column is
 * configured for. A report showing an average margin and an export showing a
 * summed one is worse than no export at all — the reader has no way to tell
 * which is wrong.
 *
 * So the sheet takes its totals from the view's own `viewField.aggregateOperation`,
 * the same field the CRM footer reads. One source of truth, both surfaces.
 *
 * Two things are deliberate:
 *
 *  - Every total is written as a live Excel FORMULA over the rows above it, not
 *    a baked number. Filter the sheet in Excel and the totals move, exactly as
 *    they do in the CRM when you change a filter. The computed value is stored
 *    alongside so the figure is right the moment the file opens, before Excel
 *    recalculates.
 *  - The labels copy the CRM's wording ("Count all", "Sum of Revenue",
 *    "Not empty of Address"), so somebody holding the report and the workbook
 *    side by side is reading the same words for the same number.
 */

/** The twelve operations `viewField_aggregateoperation_enum` allows. */
export type AggregateOperation =
  | "SUM"
  | "AVG"
  | "MIN"
  | "MAX"
  | "COUNT"
  | "COUNT_UNIQUE_VALUES"
  | "COUNT_EMPTY"
  | "COUNT_NOT_EMPTY"
  | "COUNT_TRUE"
  | "COUNT_FALSE"
  | "PERCENTAGE_EMPTY"
  | "PERCENTAGE_NOT_EMPTY";

const OPERATIONS = new Set<string>([
  "SUM", "AVG", "MIN", "MAX", "COUNT", "COUNT_UNIQUE_VALUES",
  "COUNT_EMPTY", "COUNT_NOT_EMPTY", "COUNT_TRUE", "COUNT_FALSE",
  "PERCENTAGE_EMPTY", "PERCENTAGE_NOT_EMPTY",
]);

/**
 * A viewField as the metadata API hands it back.
 *
 * The API already spreads `overrides` over the column values, so reading
 * `aggregateOperation` off the response is correct. `overrides` is accepted
 * here anyway because a caller reading `core."viewField"` STRAIGHT FROM THE
 * DATABASE gets the opposite: seeded viewFields carry the operation in the
 * jsonb and leave the column null, so a plain column read reports "no total"
 * on a column that visibly totals in the CRM.
 */
export type ViewFieldAggregate = {
  fieldMetadataId: string;
  aggregateOperation?: string | null;
  overrides?: { aggregateOperation?: string | null } | null;
};

export function effectiveAggregate(
  field: ViewFieldAggregate | null | undefined,
): AggregateOperation | null {
  const raw = field?.overrides?.aggregateOperation ?? field?.aggregateOperation;
  if (!raw) return null;
  const op = String(raw).toUpperCase();
  return OPERATIONS.has(op) ? (op as AggregateOperation) : null;
}

/**
 * The CRM's own footer wording. `COUNT` is the odd one out: Twenty labels it
 * "Count all" with no field name, because it counts records rather than values
 * in that column.
 */
const LABEL_PREFIX: Record<AggregateOperation, string> = {
  SUM: "Sum of",
  AVG: "Average of",
  MIN: "Min of",
  MAX: "Max of",
  COUNT: "Count all",
  COUNT_UNIQUE_VALUES: "Unique of",
  COUNT_EMPTY: "Empty of",
  COUNT_NOT_EMPTY: "Not empty of",
  COUNT_TRUE: "True of",
  COUNT_FALSE: "False of",
  PERCENTAGE_EMPTY: "% Empty of",
  PERCENTAGE_NOT_EMPTY: "% Not empty of",
};

export function aggregateLabel(op: AggregateOperation, fieldLabel: string): string {
  if (op === "COUNT") return "Count all";
  return `${LABEL_PREFIX[op]} ${fieldLabel}`.trim();
}

/** True when the operation produces money rather than a plain count. */
export function isMoneyResult(op: AggregateOperation, money: boolean): boolean {
  if (!money) return false;
  return op === "SUM" || op === "AVG" || op === "MIN" || op === "MAX";
}

const isBlank = (v: unknown): boolean =>
  v === null || v === undefined || (typeof v === "string" && v.trim() === "");

const numeric = (values: unknown[]): number[] =>
  values
    .filter((v) => !isBlank(v))
    .map((v) => (typeof v === "number" ? v : Number(v)))
    .filter((n) => Number.isFinite(n));

/**
 * The value the cell shows on open.
 *
 * Returns null when the operation has nothing to say — an average or a minimum
 * over a group with no numbers is not zero, and writing 0 there would be a
 * fabricated figure the reader cannot distinguish from a real one. The CRM
 * renders those as "-"; so does the sheet.
 */
export function computeAggregate(
  op: AggregateOperation,
  values: unknown[],
): number | null {
  const total = values.length;
  switch (op) {
    case "SUM": {
      const n = numeric(values);
      // A sum of nothing IS zero, and every money column wants to show it.
      return n.reduce((a, b) => a + b, 0);
    }
    case "AVG": {
      const n = numeric(values);
      return n.length ? n.reduce((a, b) => a + b, 0) / n.length : null;
    }
    case "MIN": {
      const n = numeric(values);
      return n.length ? Math.min(...n) : null;
    }
    case "MAX": {
      const n = numeric(values);
      return n.length ? Math.max(...n) : null;
    }
    case "COUNT":
      return total;
    case "COUNT_UNIQUE_VALUES":
      return new Set(values.filter((v) => !isBlank(v)).map((v) => String(v))).size;
    case "COUNT_EMPTY":
      return values.filter(isBlank).length;
    case "COUNT_NOT_EMPTY":
      return values.filter((v) => !isBlank(v)).length;
    case "COUNT_TRUE":
      return values.filter((v) => v === true || v === "Yes").length;
    case "COUNT_FALSE":
      return values.filter((v) => v === false || v === "No").length;
    case "PERCENTAGE_EMPTY":
      return total ? values.filter(isBlank).length / total : null;
    case "PERCENTAGE_NOT_EMPTY":
      return total ? values.filter((v) => !isBlank(v)).length / total : null;
    default:
      return null;
  }
}

/**
 * The live Excel formula for the same operation over `col{first}:col{last}`.
 *
 * Returns null for a group with no rows — `SUM(H9:H8)` runs BACKWARDS in Excel
 * and quietly swallows the total row itself (the same trap that made an empty
 * LG tier band read as its own subtotal, 2026-08-19). An empty band gets the
 * computed value written as a plain number instead.
 */
export function aggregateFormula(
  op: AggregateOperation,
  columnLetter: string,
  first: number,
  last: number,
): string | null {
  if (last < first) return null;
  const range = `${columnLetter}${first}:${columnLetter}${last}`;
  const rows = last - first + 1;
  switch (op) {
    case "SUM": return `SUM(${range})`;
    // AVERAGE/MIN/MAX over a range with no numbers raise #DIV/0! and #NUM!;
    // the CRM shows a dash, so the sheet shows an empty cell.
    case "AVG": return `IFERROR(AVERAGE(${range}),"")`;
    case "MIN": return `IFERROR(MIN(${range}),"")`;
    case "MAX": return `IFERROR(MAX(${range}),"")`;
    // "Count all" counts RECORDS, not filled cells, so it counts the block
    // rather than the values in it — COUNTA would under-report a column that
    // happens to hold a blank.
    case "COUNT": return `ROWS(${range})`;
    case "COUNT_UNIQUE_VALUES":
      // The textbook unique-count. The `&""` coerces numbers so COUNTIF matches
      // them, and the `<>""` guard keeps blanks from dividing by zero.
      return `SUMPRODUCT((${range}<>"")/COUNTIF(${range},${range}&""))`;
    case "COUNT_EMPTY": return `COUNTBLANK(${range})`;
    case "COUNT_NOT_EMPTY": return `COUNTA(${range})`;
    // Booleans reach the sheet as the words the CRM shows, not TRUE/FALSE.
    case "COUNT_TRUE": return `COUNTIF(${range},"Yes")`;
    case "COUNT_FALSE": return `COUNTIF(${range},"No")`;
    case "PERCENTAGE_EMPTY": return `COUNTBLANK(${range})/${rows}`;
    case "PERCENTAGE_NOT_EMPTY": return `COUNTA(${range})/${rows}`;
    default: return null;
  }
}

/**
 * The grand-total formula for a sheet whose rows are broken up by section
 * headers and footers — it adds the SECTION TOTALS, not the data rows, because
 * a range over the data would pull the footers in with it.
 *
 * Only operations that compose out of per-section results get a formula: a sum
 * of sums is the sum, a sum of counts is the count, the smallest of the section
 * minimums is the minimum. An average of averages is not the average and a
 * count of uniques counts duplicates twice, so those return null and the caller
 * writes the figure the report computed over every row instead.
 */
export function composedTotalFormula(
  op: AggregateOperation,
  columnLetter: string,
  sectionRows: number[],
): string | null {
  if (!sectionRows.length) return null;
  const refs = sectionRows.map((n) => `${columnLetter}${n}`);
  switch (op) {
    case "SUM":
    case "COUNT":
    case "COUNT_EMPTY":
    case "COUNT_NOT_EMPTY":
    case "COUNT_TRUE":
    case "COUNT_FALSE":
      return refs.join("+");
    case "MIN": return `MIN(${refs.join(",")})`;
    case "MAX": return `MAX(${refs.join(",")})`;
    default: return null;
  }
}

/** Number format for the result cell. */
export function aggregateNumFmt(
  op: AggregateOperation,
  money: boolean,
  moneyFmt: string,
): string {
  if (op === "PERCENTAGE_EMPTY" || op === "PERCENTAGE_NOT_EMPTY") return "0%";
  if (isMoneyResult(op, money)) return moneyFmt;
  return "#,##0";
}
