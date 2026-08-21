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
  /**
   * For a RELATION, the `nameSingular` of the object it points at. Optional
   * because the LG report predates it and names its one relation directly; when
   * present it is preferred, so a view that adds Venue or Point of Contact
   * mirrors without anyone editing an allow-list here.
   */
  relationTarget?: string;
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
 * Relations are only followed one level, to the related record's display name.
 * A blanket relation walker would have to resolve each target's
 * label-identifier field at runtime, which is more machinery than the sheet
 * needs — these five targets cover every relation column the opportunity views
 * actually show, and an unrecognised one is dropped with a note rather than
 * guessed at.
 */
const RELATION_SELECTION: Record<string, string> = {
  company: "{ name }",
};

/** By the object the relation points at — preferred over the field-name map. */
const RELATION_TARGET_SELECTION: Record<string, string> = {
  company: "{ name }",
  venue: "{ name }",
  // Both of these carry a FULL_NAME identifier, so the name is a composite.
  workspaceMember: "{ name { firstName lastName } }",
  person: "{ name { firstName lastName } }",
};

function relationSelection(column: ViewColumn): string | null {
  if (column.relationTarget && RELATION_TARGET_SELECTION[column.relationTarget]) {
    return RELATION_TARGET_SELECTION[column.relationTarget];
  }
  return RELATION_SELECTION[column.fieldName] || null;
}

export function isRenderable(column: ViewColumn): boolean {
  if (SCALAR_TYPES.has(column.type)) return true;
  if (COMPOSITE_SELECTION[column.type]) return true;
  if (column.type === "RELATION") return !!relationSelection(column);
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
    return `${column.fieldName} ${relationSelection(column)}`;
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

/**
 * The rollup tab's column layout (Jireh, 2026-08-17: "can the roll up tab look
 * more like the actual CRM page?").
 *
 * The rollup used to carry an invented column set — "Account", "ANC LG PO",
 * "Cost" — none of which are what he reads on the LG Alliance Detail list. It
 * now takes the view's own columns, labels and order, the same as the detail
 * tab, and only weaves in the figures the report calculates rather than stores.
 *
 * Two deliberate departures from a straight mirror:
 *  - the PO column is always present, even if the view stops showing it, and is
 *    followed by a PO Source column, because tracking the PO is the point of
 *    the sheet;
 *  - the calculated alliance fee follows that PO block (Jireh, 2026-08-18: "the
 *    alliance 8% column can be after the tech vendor PO column") so the
 *    arithmetic reads left to right — PO, where it came from, 8% of it — and
 *    the project revenue/margin columns stay where the CRM puts them, to the
 *    right and out of the way.
 *
 * LG Margin was dropped from the sheet in the same pass, at his request. The
 * report still calculates it for the JSON payload; it is simply not a column.
 */
export type RollupColumn = {
  /** Field name for a mirrored column, or the calculated column's own key. */
  key: string;
  spec: { header: string; width: number; money?: boolean; wrap?: boolean; align?: "left" | "right" | "center" };
  /** Present only for columns that come from the view. */
  column?: MirrorColumn;
};

/**
 * Columns the CRM page shows that the rollup never repeats: every row of an LG
 * report names LG as the vendor.
 */
export const ROLLUP_OMITTED_FIELDS = new Set(["technologyVendorPartner"]);

export const PO_FIELD = "poValue";
export const PO_SOURCE_KEY = "poSource";
export const ALLIANCE_FEE_KEY = "allianceFee";

/** `sponsorship2027` and its siblings — the per-year sponsorship money fields. */
const SPONSORSHIP_YEAR = /^sponsorship(20\d{2})$/;

export function isSponsorshipYearField(fieldName: string): boolean {
  return SPONSORSHIP_YEAR.test(fieldName);
}

export function rollupLayout(
  columns: MirrorColumn[],
  rateLabel: string,
  drop: Set<string> = new Set(),
): RollupColumn[] {
  const kept = columns.filter(
    (c) => !ROLLUP_OMITTED_FIELDS.has(c.fieldName) && !drop.has(c.fieldName),
  );

  const poBlock = (mirrored?: MirrorColumn): RollupColumn[] => [
    mirrored
      ? {
          key: PO_FIELD,
          column: mirrored,
          spec: { header: mirrored.label, width: 19, money: true },
        }
      : {
          key: PO_FIELD,
          spec: { header: "Technology Vendor PO Value", width: 19, money: true },
        },
    // Centred so it reads as a tag on the PO rather than crowding the figure.
    { key: PO_SOURCE_KEY, spec: { header: "PO Source", width: 13, align: "center" } },
    // The fee is 8% of the PO to its left, so it sits with it.
    { key: ALLIANCE_FEE_KEY, spec: { header: `Alliance ${rateLabel}`, width: 14, money: true } },
  ];

  const hasPo = kept.some((c) => c.fieldName === PO_FIELD);

  const out: RollupColumn[] = [];
  for (const c of kept) {
    if (c.fieldName === PO_FIELD) out.push(...poBlock(c));
    else out.push({ key: c.fieldName, column: c, spec: { header: c.label, width: c.width, money: c.money, wrap: c.wrap } });
  }
  // A view edit that hides the PO must not cost the sheet its subject: the
  // whole block goes back in at the front.
  if (!hasPo) out.unshift(...poBlock());
  return out;
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
    case "RELATION": {
      const name = raw?.name;
      // A person or workspace member's identifier is a FULL_NAME composite, so
      // `name` is an object here, not a string. Reading it as a string put a
      // blank in the Owner column rather than failing loudly.
      if (name && typeof name === "object") {
        return [name.firstName, name.lastName].filter(Boolean).join(" ").trim();
      }
      return name || "";
    }
    case "DATE":
    case "DATE_TIME":
      return formatDate(raw);
    case "MULTI_SELECT": {
      if (!Array.isArray(raw)) return enumLabel(String(raw));
      // A run of fiscal years is sorted; the CRM stores them in click order, so
      // a deal phased across four years reads "FY2030, FY2027, FY2028, FY2029".
      const values = raw.every((v) => FISCAL_YEAR.test(String(v)))
        ? [...raw].sort()
        : raw;
      return values.map(enumLabel).join(", ");
    }
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
