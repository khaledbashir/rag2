/**
 * Turns a saved CRM view into the shape of its export sheet — which columns, in
 * which order, grouped how, sorted how.
 *
 * This exists because of Jireh's 2026-08-21 ask: a report and its export must
 * "agree to the dollar". They could not, because the export carried a
 * hard-coded column set. His LiveSync list shows revenue and margin for every
 * fiscal year from 2025 to 2036; the export showed 2026 and 2027, so two of his
 * twenty-eight totals matched and the rest were simply missing. Reconciling the
 * two by hand is exactly the work the export is supposed to remove.
 *
 * So the sheet reads the view: its visible columns in its own order, its
 * grouping field, its sorts, and its per-column totals. Change the view, and
 * the export follows without a deploy.
 *
 * The functions here are pure so the ordering and grouping rules can be tested
 * without a CRM.
 */
import {
  cellValue,
  enumLabel,
  isRenderable,
  toMirrorColumn,
  type MirrorColumn,
  type ViewColumn,
} from "./viewMirror";
import { effectiveAggregate, type AggregateOperation } from "./viewAggregates";

export type FieldMeta = {
  name: string;
  type: string;
  label: string;
  /** `nameSingular` of a RELATION's target object, when known. */
  relationTarget?: string;
};

export type ViewFieldRow = {
  fieldMetadataId: string;
  isVisible?: boolean | null;
  position?: number | null;
  aggregateOperation?: string | null;
  overrides?: { aggregateOperation?: string | null; isVisible?: boolean | null; position?: number | null } | null;
};

export type LaidOutColumn = MirrorColumn & {
  fieldMetadataId: string;
  aggregate: AggregateOperation | null;
};

/**
 * `overrides` wins over the column — the same spread the CRM's own DTO does.
 * Reading only the column reports a seeded field as hidden-and-untotalled when
 * it is neither.
 */
const visibleOf = (f: ViewFieldRow): boolean =>
  (f.overrides?.isVisible ?? f.isVisible) !== false;
const positionOf = (f: ViewFieldRow): number =>
  Number(f.overrides?.position ?? f.position ?? 0);

export type Layout = {
  columns: LaidOutColumn[];
  /** Labels of columns the view shows that the sheet cannot render. */
  skipped: string[];
};

export function layoutFromView(
  viewFields: ViewFieldRow[],
  fields: Record<string, FieldMeta>,
): Layout {
  const columns: LaidOutColumn[] = [];
  const skipped: string[] = [];
  const ordered = [...viewFields]
    .filter(visibleOf)
    .sort((a, b) => positionOf(a) - positionOf(b));

  for (const f of ordered) {
    const meta = fields[f.fieldMetadataId];
    // A column whose field is missing from the live metadata map is a stale
    // viewField. Silently dropping it is right; counting it as skipped would
    // put a name on the sheet that means nothing to the reader.
    if (!meta) continue;
    const column: ViewColumn = {
      fieldName: meta.name,
      label: meta.label || meta.name,
      type: meta.type,
      relationTarget: meta.relationTarget,
    };
    if (!isRenderable(column)) {
      skipped.push(column.label);
      continue;
    }
    columns.push({
      ...toMirrorColumn(column),
      fieldMetadataId: f.fieldMetadataId,
      aggregate: effectiveAggregate(f),
    });
  }
  return { columns, skipped };
}

/** The value a sort compares on, by field type. */
export function sortValue(meta: FieldMeta, node: Record<string, any>): string | number | null {
  const raw = node?.[meta.name];
  if (raw === null || raw === undefined) return null;
  switch (meta.type) {
    case "CURRENCY": {
      const micros = raw?.amountMicros;
      return micros === null || micros === undefined ? null : Number(micros);
    }
    case "NUMBER":
    case "NUMERIC":
    case "RATING":
      return Number(raw);
    case "RELATION": {
      const name = raw?.name;
      if (name && typeof name === "object") {
        return [name.firstName, name.lastName].filter(Boolean).join(" ").toLowerCase();
      }
      return String(name || "").toLowerCase();
    }
    // ISO strings sort correctly as text, and comparing them as text avoids
    // inventing a timezone for a date-only value.
    case "DATE":
    case "DATE_TIME":
      return String(raw);
    default:
      return String(raw).toLowerCase();
  }
}

export type ViewSort = { fieldMetadataId: string; direction?: string | null };

/**
 * Applies the view's sorts, in order, with a stable tie-break.
 *
 * Empty values sort last in both directions, matching the CRM's
 * `AscNullsLast`. Without that, an alphabetical report opens on a block of
 * blanks and reads as broken.
 */
export function sortByViewSorts<T extends Record<string, any>>(
  records: T[],
  sorts: ViewSort[],
  fields: Record<string, FieldMeta>,
): T[] {
  const active = sorts
    .map((s) => ({ meta: fields[s.fieldMetadataId], desc: String(s.direction || "ASC").toUpperCase() === "DESC" }))
    .filter((s): s is { meta: FieldMeta; desc: boolean } => !!s.meta);
  if (!active.length) return [...records];

  return [...records].sort((a, b) => {
    for (const { meta, desc } of active) {
      const va = sortValue(meta, a);
      const vb = sortValue(meta, b);
      const ea = va === null || va === "";
      const eb = vb === null || vb === "";
      if (ea && eb) continue;
      if (ea) return 1;
      if (eb) return -1;
      let cmp: number;
      if (typeof va === "number" && typeof vb === "number") cmp = va - vb;
      else cmp = String(va).localeCompare(String(vb), "en", { numeric: true, sensitivity: "base" });
      if (cmp !== 0) return desc ? -cmp : cmp;
    }
    return 0;
  });
}

export type Group<T> = { key: string; label: string; records: T[] };

/**
 * Splits records the way the view's section headers do.
 *
 * A view with no grouping returns one unlabelled group, so the caller has a
 * single code path rather than two layouts to keep in step.
 */
export function groupByViewField<T extends Record<string, any>>(
  records: T[],
  groupMeta: FieldMeta | null,
  formatDate: (value: string | null) => string,
): Group<T>[] {
  if (!groupMeta) return [{ key: "", label: "", records: [...records] }];
  const groups = new Map<string, Group<T>>();
  for (const record of records) {
    const rendered = cellValue(
      { fieldName: groupMeta.name, label: groupMeta.label, type: groupMeta.type, relationTarget: groupMeta.relationTarget },
      record,
      formatDate,
    );
    const label = rendered === null || rendered === "" ? "No Value" : String(rendered);
    if (!groups.has(label)) groups.set(label, { key: label, label, records: [] });
    groups.get(label)!.records.push(record);
  }
  return [...groups.values()];
}

/**
 * The field the sheet cuts its sections on.
 *
 * A view that groups in the CRM sections on its own field. A view that does
 * NOT group still gets sections, on `fallbackFieldName` — before the mirrored
 * layout shipped (2026-08-21) every export of this object was cut into
 * pipeline sections with a subtotal under each, and an ungrouped view lost
 * them silently. Alexis opened a 410-row Service Forecast on 2026-08-24 and
 * found one alphabetical block where seven status sections used to be.
 *
 * Returns null only when the fallback field is absent from the metadata map,
 * which leaves the caller with one unlabelled group — the old flat sheet,
 * rather than a crash.
 */
export function resolveSectionField(
  mainGroupByFieldMetadataId: string | null | undefined,
  fields: Record<string, FieldMeta>,
  fallbackFieldName: string,
): FieldMeta | null {
  if (mainGroupByFieldMetadataId && fields[mainGroupByFieldMetadataId]) {
    return fields[mainGroupByFieldMetadataId];
  }
  return Object.values(fields).find((f) => f.name === fallbackFieldName) || null;
}

/**
 * Orders the groups the way a reader expects.
 *
 * `preferred` carries the pipeline order the status sections have always used
 * (Won first, Lost near the end) so an export grouped by status does not
 * suddenly open alphabetically at "Bid Submitted". Anything the preferred list
 * does not name falls in alphabetically after it, and "No Value" goes last —
 * absence of a value is not a section anyone reads first.
 */
/** One entry of `getView.viewGroups` — the section order saved on the view itself. */
export type ViewGroup = {
  fieldValue: string;
  position: number;
  isVisible?: boolean | null;
};

/**
 * The section order a grouped view is actually arranged in.
 *
 * `orderGroups` ranks against a list of LABELS, and the only list it was ever
 * given is the opportunity-status pipeline. That is right for a view grouped by
 * status and wrong for every other one: when a view groups on LG Tier, none of
 * its labels appear in the status list, every section ties at the bottom rank,
 * and the tie-break sorts them ALPHABETICALLY. Jireh's LG Alliance export
 * therefore opened on "Additional Technology Opportunities from Sponsorship"
 * with Tier 1 fourth, while the view he arranged it from reads 1, 2, 3 first
 * (2026-08-25: "first request would be Tier 1,2,3 at the top").
 *
 * The CRM already stores the answer — `viewGroup.position` is the order he
 * dragged the sections into — so the export takes it from there and stops
 * guessing. `fieldValue` holds the raw enum value while the sheet groups on the
 * rendered label, so the values are put through the same `enumLabel` the cells
 * use. A view with no groups saved falls back to `fallback`, which keeps the
 * pipeline order for status sections exactly as it was.
 */
export function sectionOrderFromView(
  viewGroups: ViewGroup[] | null | undefined,
  groupMeta: FieldMeta | null,
  fallback: string[],
): string[] {
  if (!groupMeta || !viewGroups?.length) return fallback;
  const labels = [...viewGroups]
    .sort((a, b) => a.position - b.position)
    // The CRM's own no-value group. The sheet places "No Value" last itself,
    // and it must not consume a rank here or it would sort before real sections.
    .filter((g) => g.fieldValue !== "" && g.fieldValue !== null && g.fieldValue !== undefined)
    .map((g) =>
      groupMeta.type === "SELECT" || groupMeta.type === "MULTI_SELECT"
        ? enumLabel(String(g.fieldValue))
        : String(g.fieldValue),
    );
  return labels.length ? labels : fallback;
}

export function orderGroups<T>(groups: Group<T>[], preferred: string[]): Group<T>[] {
  const rank = new Map(preferred.map((label, i) => [label, i]));
  return [...groups].sort((a, b) => {
    if (a.label === "No Value") return 1;
    if (b.label === "No Value") return -1;
    const ra = rank.has(a.label) ? rank.get(a.label)! : Number.MAX_SAFE_INTEGER;
    const rb = rank.has(b.label) ? rank.get(b.label)! : Number.MAX_SAFE_INTEGER;
    if (ra !== rb) return ra - rb;
    return a.label.localeCompare(b.label, "en", { numeric: true, sensitivity: "base" });
  });
}
