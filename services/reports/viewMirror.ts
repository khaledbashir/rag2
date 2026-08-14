/**
 * Mirrors a saved CRM view's columns into an export sheet.
 *
 * Jireh keeps shaping the LG Alliance Detail list — he added the vendor,
 * award date, contract completion date, project type and Digi Link columns the
 * same evening the list shipped — and then asked for the export to carry what
 * he put there. Hard-coding his column set means being back here after every
 * tweak, so the export reads the view's own visible columns and renders them in
 * his order.
 *
 * The two halves that need care are the GraphQL selection (composite fields
 * need sub-fields, and asking for the wrong shape fails the whole query) and
 * the cell formatting (enum values like FY2027 must not be title-cased into
 * "Fy2027"). Both live here as pure functions so they can be tested without a
 * network.
 */
import { businessUnitLabel } from "./lgAlliance";

export type ViewColumn = {
  fieldName: string;
  label: string;
  type: string;
};

/** A column the sheet can actually render, with its layout already decided. */
export type MirrorColumn = ViewColumn & {
  money: boolean;
  width: number;
  wrap: boolean;
};

/**
 * Field types the mirror knows how to ask for and render. Anything else is
 * dropped rather than guessed at — an unknown composite would take the whole
 * export down with it, and the sheet says how many columns it skipped.
 */
const SCALAR_TYPES = new Set([
  "TEXT", "NUMBER", "NUMERIC", "BOOLEAN", "SELECT", "MULTI_SELECT",
  "DATE", "DATE_TIME", "UUID", "RATING", "EMAIL",
]);

const COMPOSITE_SELECTION: Record<string, string> = {
  CURRENCY: "{ amountMicros currencyCode }",
  LINKS: "{ primaryLinkUrl primaryLinkLabel }",
};

/**
 * Relations are only followed one level, to the related record's display name,
 * and only for the relations this report is scoped to. A blanket relation
 * walker would need the target object's label-identifier field, which is more
 * machinery than the sheet needs.
 */
const RELATION_SELECTION: Record<string, string> = {
  company: "{ name }",
};

export function isRenderable(column: ViewColumn): boolean {
  if (SCALAR_TYPES.has(column.type)) return true;
  if (COMPOSITE_SELECTION[column.type]) return true;
  if (column.type === "RELATION") return !!RELATION_SELECTION[column.fieldName];
  return false;
}

const MONEY_TYPES = new Set(["CURRENCY"]);
const WIDE_TEXT = new Set(["TEXT"]);

export function toMirrorColumn(column: ViewColumn): MirrorColumn {
  const money = MONEY_TYPES.has(column.type);
  // Long free text (descriptions, notes) wraps; everything else stays on one
  // line so the sheet keeps a scannable row height.
  const wide = WIDE_TEXT.has(column.type) && column.fieldName !== "name";
  return {
    ...column,
    money,
    wrap: wide || column.type === "MULTI_SELECT",
    width: money ? 17 : wide ? 40 : column.type === "MULTI_SELECT" ? 22 : column.fieldName === "name" ? 38 : 18,
  };
}

/** The GraphQL selection for one column, e.g. `poValue { amountMicros ... }`. */
export function selectionFor(column: ViewColumn): string | null {
  if (!isRenderable(column)) return null;
  if (COMPOSITE_SELECTION[column.type]) {
    return `${column.fieldName} ${COMPOSITE_SELECTION[column.type]}`;
  }
  if (column.type === "RELATION") {
    return `${column.fieldName} ${RELATION_SELECTION[column.fieldName]}`;
  }
  return column.fieldName;
}

/**
 * The selection for a whole column set, de-duplicated — the report already asks
 * for several of these fields by hand, and repeating a field in one selection
 * set is wasted payload.
 */
export function buildSelection(columns: ViewColumn[], alreadySelected: string[] = []): string {
  const seen = new Set(alreadySelected);
  const parts: string[] = [];
  for (const column of columns) {
    if (seen.has(column.fieldName)) continue;
    const selection = selectionFor(column);
    if (!selection) continue;
    seen.add(column.fieldName);
    parts.push(selection);
  }
  return parts.join(" ");
}

/**
 * Enum values that must not be title-cased. `FY2027` reads as a fiscal year;
 * `Fy2027` reads as a typo on a sheet Jireh forwards to LG.
 */
const FISCAL_YEAR = /^FY\d{4}$/;

export function enumLabel(value: string): string {
  if (FISCAL_YEAR.test(value)) return value;
  return businessUnitLabel(value);
}

/** Turns one record's raw GraphQL value into the cell the sheet writes. */
export function cellValue(
  column: ViewColumn,
  node: Record<string, any>,
  formatDate: (value: string | null) => string,
): string | number | null {
  const raw = node?.[column.fieldName];
  if (raw === null || raw === undefined) return column.type === "CURRENCY" ? null : "";

  switch (column.type) {
    case "CURRENCY": {
      const micros = raw?.amountMicros;
      if (micros === null || micros === undefined) return null;
      return Number(micros) / 1_000_000;
    }
    case "LINKS":
      return raw?.primaryLinkUrl || raw?.primaryLinkLabel || "";
    case "RELATION":
      return raw?.name || "";
    case "DATE":
    case "DATE_TIME":
      return formatDate(raw);
    case "MULTI_SELECT":
      return Array.isArray(raw) ? raw.map(enumLabel).join(", ") : enumLabel(String(raw));
    case "SELECT":
      return enumLabel(String(raw));
    case "BOOLEAN":
      return raw ? "Yes" : "No";
    case "NUMBER":
    case "NUMERIC":
    case "RATING":
      return typeof raw === "number" ? raw : Number(raw) || 0;
    default:
      return String(raw);
  }
}
