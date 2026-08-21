/**
 * Translates a saved view's filters into a CRM data-API filter, so an export
 * returns exactly the rows the report shows.
 *
 * Lifted out of the opportunities export route on 2026-08-21 so the translation
 * has tests. It had a live defect: a MULTI_SELECT filter was translated with
 * `ilike`, which the API rejects outright —
 *
 *   Operator "ilike" is not valid for field "serviceType" of type MULTI_SELECT
 *
 * — so any view filtering on a multi-select (Jireh's LiveSync License
 * Deployments filters on Service Type) 500'd the whole export rather than
 * returning a wrong number. Silent enough that nobody had exported that view.
 *
 * The recurring lesson in here is that Twenty's filter shape depends on the
 * FIELD TYPE, not just the operand: CURRENCY is composite and compares on
 * `amountMicros`, MULTI_SELECT takes `containsAny`, and comparison values
 * arrive JSON-array-wrapped.
 */
export type Field = { name: string; type: string };

export type ViewFilter = {
  fieldMetadataId: string;
  operand: string;
  value: string;
  viewFilterGroupId?: string | null;
};

export type ViewFilterGroup = {
  id: string;
  logicalOperator?: string | null;
  parentViewFilterGroupId?: string | null;
};

const SELECT_LIKE = new Set(["SELECT", "RATING"]);

/** Translate one view filter into a filter clause, or null if it cannot be. */
export function vfClause(f: Field, operand: string, raw: string): any | null {
  const { name, type } = f;
  // Relations and actors need the related record's id, which the view filter
  // does not carry in a form this translation can trust.
  if (type === "RELATION" || type === "UUID" || type === "ACTOR") return null;

  let val: any = raw;
  try { val = JSON.parse(raw); } catch { /* keep raw */ }
  const arr = Array.isArray(val) ? val : null;
  const first = arr ? arr[0] : val;
  const list = arr || [first];
  const isSelect = SELECT_LIKE.has(type);
  const isMulti = type === "MULTI_SELECT";

  switch (operand) {
    case "IS":
      if (type === "BOOLEAN") return { [name]: { eq: !!first } };
      // A multi-select column holds an array; `in` is not an operator it takes.
      if (isMulti) return { [name]: { containsAny: list } };
      return isSelect ? { [name]: { in: list } } : { [name]: { eq: first } };
    case "IS_NOT":
      if (type === "BOOLEAN") return { not: { [name]: { eq: !!first } } };
      if (isMulti) return { not: { [name]: { containsAny: list } } };
      return isSelect ? { not: { [name]: { in: list } } } : { not: { [name]: { eq: first } } };
    // Comparison operands must use the PARSED scalar (`first`), not `raw`.
    // Twenty stores these values JSON-array-wrapped (e.g. date filters as
    // ["2026-08-02T18:13:38Z"]); passing the array-string straight into gt/lt
    // 500s the query.
    case "IS_AFTER": return { [name]: { gt: first } };
    case "IS_BEFORE": return { [name]: { lt: first } };
    // CURRENCY is a composite type — comparisons must target the amountMicros
    // sub-field, and view-filter values are stored in dollars.
    case "GREATER_THAN_OR_EQUAL":
      return type === "CURRENCY"
        ? { [name]: { amountMicros: { gte: Math.round(Number(first) * 1_000_000) } } }
        : { [name]: { gte: first } };
    case "LESS_THAN_OR_EQUAL":
      return type === "CURRENCY"
        ? { [name]: { amountMicros: { lte: Math.round(Number(first) * 1_000_000) } } }
        : { [name]: { lte: first } };
    case "CONTAINS":
      // On a multi-select "contains" means membership, not a substring match.
      if (isMulti) return { [name]: { containsAny: list } };
      return { [name]: { ilike: `%${first}%` } };
    case "DOES_NOT_CONTAIN":
      if (isMulti) return { not: { [name]: { containsAny: list } } };
      return { not: { [name]: { ilike: `%${first}%` } } };
    case "IS_EMPTY":
      return isMulti ? { [name]: { isEmptyArray: true } } : { [name]: { is: "NULL" } };
    case "IS_NOT_EMPTY":
      return isMulti ? { not: { [name]: { isEmptyArray: true } } } : { [name]: { is: "NOT_NULL" } };
    case "IS_RELATIVE": {
      try {
        const o = JSON.parse(raw);
        const ms: Record<string, number> = { DAY: 864e5, WEEK: 6048e5, MONTH: 2592e6, YEAR: 31536e6 };
        const span = (ms[o.unit] || 864e5) * (o.amount || 0);
        const past = o.direction === "PAST";
        const d = new Date(Date.now() - (past ? 1 : -1) * span).toISOString().replace(/\.\d{3}Z$/, "Z");
        return past ? { [name]: { gte: d } } : { [name]: { lte: d } };
      } catch { return null; }
    }
    default: return null;
  }
}

/** Reconstruct a view's full AND/OR filter-group tree into one filter. */
export function buildViewFilter(
  viewFilters: ViewFilter[],
  groups: ViewFilterGroup[],
  fm: Record<string, Field>,
): any | undefined {
  const byGroup: Record<string, any[]> = {};
  const ungrouped: any[] = [];
  for (const vf of viewFilters) {
    const f = fm[vf.fieldMetadataId];
    if (!f) continue;
    const c = vfClause(f, vf.operand, vf.value);
    if (!c) continue;
    if (vf.viewFilterGroupId) (byGroup[vf.viewFilterGroupId] ||= []).push(c);
    else ungrouped.push(c);
  }
  if (!groups || !groups.length) {
    const all = [...ungrouped, ...Object.values(byGroup).flat()];
    return all.length ? { and: all } : undefined;
  }
  const build = (g: ViewFilterGroup): any | null => {
    const own = byGroup[g.id] || [];
    const kids = groups.filter((x) => x.parentViewFilterGroupId === g.id).map(build).filter(Boolean);
    const parts = [...own, ...kids];
    if (!parts.length) return null;
    if (parts.length === 1) return parts[0];
    return g.logicalOperator === "OR" ? { or: parts } : { and: parts };
  };
  const roots = groups.filter((g) => !g.parentViewFilterGroupId).map(build).filter(Boolean);
  const all = [...ungrouped, ...roots];
  if (!all.length) return undefined;
  return all.length === 1 ? all[0] : { and: all };
}
