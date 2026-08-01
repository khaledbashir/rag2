import type { Pool } from "pg";

// The Closed-Won report and the CRM dashboard drifted because each carried its
// own idea of what "Closed Won" means. The report's copy said "not LOST, not
// NO_BID, not pipeline…", which quietly swept in ON_HOLD ($162.8M) the moment
// deals landed in a status nobody had thought to exclude.
//
// A second copy of a rule always drifts. So the report no longer keeps one: it
// reads the filter off the dashboard widget Jireh actually looks at and turns
// that into SQL. Change the widget's filter in the CRM and the Friday email
// follows it the same week — they cannot disagree, because there is only one
// definition.
//
// Dashboard: "2026 Won & Forecast by Business Unit"
// https://crm.ancsports.net/object/dashboard/e6459a59-3e4e-4810-a34a-5ef15142e69d
export const PARITY_DASHBOARD_ID =
  process.env.CRM_REPORT_PARITY_DASHBOARD_ID?.trim() || "e6459a59-3e4e-4810-a34a-5ef15142e69d";
export const PARITY_WIDGET_TITLE =
  process.env.CRM_REPORT_PARITY_WIDGET_TITLE?.trim() || "Closed Won Revenue 2026 by Business Unit";

export type RecordFilter = {
  id: string;
  type: string;
  operand: string;
  value: string;
  fieldMetadataId: string;
  recordFilterGroupId?: string | null;
};

export type RecordFilterGroup = {
  id: string;
  logicalOperator: "AND" | "OR";
  parentRecordFilterGroupId?: string | null;
};

export type WidgetFilter = {
  recordFilters: RecordFilter[];
  recordFilterGroups: RecordFilterGroup[];
};

export type FieldMeta = { id: string; name: string; type: string };

export type CompiledFilter = {
  sql: string;
  params: unknown[];
  source: "dashboard" | "fallback";
  description: string;
};

// Currency fields are stored in micros; the widget states its thresholds in
// whole currency units.
const MICROS = 1_000_000;

function columnFor(field: FieldMeta) {
  return field.type === "CURRENCY" ? `"${field.name}AmountMicros"` : `"${field.name}"`;
}

function parseSelectValue(raw: string): string[] {
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error("SELECT filter value is not an array");
  return parsed.map((entry) => String(entry));
}

function compileLeaf(filter: RecordFilter, field: FieldMeta, params: unknown[], alias: string): string {
  const column = `${alias}.${columnFor(field)}`;

  switch (filter.operand) {
    case "IS":
    case "IS_NOT": {
      const values = parseSelectValue(filter.value);
      if (!values.length) throw new Error(`${filter.operand} filter has no values`);
      const placeholders = values.map((value) => {
        params.push(value);
        return `$${params.length}`;
      });
      const test = `${column} in (${placeholders.join(",")})`;
      // IS_NOT must also keep rows where the field is null — the CRM treats an
      // unset status as "not one of these", and dropping those silently loses
      // records from the total.
      return filter.operand === "IS" ? test : `(${column} is null or not ${test})`;
    }
    case "GREATER_THAN_OR_EQUAL":
    case "LESS_THAN_OR_EQUAL": {
      const amount = Number(filter.value);
      if (!Number.isFinite(amount)) throw new Error(`Non-numeric ${filter.operand} value: ${filter.value}`);
      const scaled = field.type === "CURRENCY" ? Math.round(amount * MICROS) : amount;
      params.push(scaled);
      const operator = filter.operand === "GREATER_THAN_OR_EQUAL" ? ">=" : "<=";
      return `${column} ${operator} $${params.length}`;
    }
    default:
      throw new Error(`Unsupported filter operand: ${filter.operand}`);
  }
}

// The widget stores a flat filter list plus a tree of AND/OR groups. Rebuild the
// tree so nesting (e.g. "status IS WON" AND "revenue OR margin is non-zero")
// survives the translation to SQL.
export function compileWidgetFilter(
  filter: WidgetFilter,
  fields: Map<string, FieldMeta>,
  alias = "o",
): { sql: string; params: unknown[] } {
  const params: unknown[] = [];
  const groups = new Map(filter.recordFilterGroups.map((group) => [group.id, group]));

  const roots = filter.recordFilterGroups.filter((group) => !group.parentRecordFilterGroupId);
  if (roots.length !== 1) {
    throw new Error(`Expected exactly one root filter group, found ${roots.length}`);
  }

  const compileGroup = (groupId: string, seen: Set<string>): string => {
    if (seen.has(groupId)) throw new Error("Cycle in widget filter groups");
    seen.add(groupId);

    const group = groups.get(groupId);
    if (!group) throw new Error(`Unknown filter group ${groupId}`);

    const parts: string[] = [];

    for (const leaf of filter.recordFilters) {
      if ((leaf.recordFilterGroupId || null) !== groupId) continue;
      const field = fields.get(leaf.fieldMetadataId);
      if (!field) throw new Error(`Unknown field ${leaf.fieldMetadataId} in widget filter`);
      parts.push(compileLeaf(leaf, field, params, alias));
    }

    for (const child of filter.recordFilterGroups) {
      if (child.parentRecordFilterGroupId !== groupId) continue;
      parts.push(compileGroup(child.id, new Set(seen)));
    }

    if (!parts.length) throw new Error(`Filter group ${groupId} is empty`);
    return `(${parts.join(` ${group.logicalOperator} `)})`;
  };

  return { sql: compileGroup(roots[0].id, new Set()), params };
}

// Used when the dashboard widget cannot be read. Deliberately an allowlist:
// a blocklist is what caused the drift this module exists to prevent.
export function fallbackWonFilter(alias = "o"): CompiledFilter {
  return {
    sql: `(${alias}."bidStatus" = $1
      and (${alias}."revenue2026AmountMicros" is not null and ${alias}."revenue2026AmountMicros" <> 0
        or ${alias}."margin2026AmountMicros" is not null and ${alias}."margin2026AmountMicros" <> 0))`,
    params: ["WON"],
    source: "fallback",
    description: 'fallback allowlist (bidStatus = WON, 2026 revenue or margin non-zero)',
  };
}

export async function loadDashboardWonFilter(pool: Pool, alias = "o"): Promise<CompiledFilter> {
  const widget = await pool.query<{ configuration: { filter?: WidgetFilter } | null }>(
    `
      select w.configuration
      from core."pageLayoutWidget" w
      join core."pageLayoutTab" t on t.id = w."pageLayoutTabId"
      join core."pageLayout" pl on pl.id = t."pageLayoutId"
      where w.title = $1
        and w."deletedAt" is null
        and pl.id = (
          select "pageLayoutId" from core."dashboard" where id = $2
          union all
          select "pageLayoutId" from core."pageLayout" where id = $2
          limit 1
        )
      limit 1
    `,
    [PARITY_WIDGET_TITLE, PARITY_DASHBOARD_ID],
  );

  const filter = widget.rows[0]?.configuration?.filter;
  if (!filter?.recordFilters?.length || !filter?.recordFilterGroups?.length) {
    throw new Error(`Dashboard widget "${PARITY_WIDGET_TITLE}" has no usable filter`);
  }

  const fieldIds = Array.from(new Set(filter.recordFilters.map((entry) => entry.fieldMetadataId)));
  const fieldRows = await pool.query<FieldMeta>(
    `select id, name, type from core."fieldMetadata" where id = any($1::uuid[])`,
    [fieldIds],
  );
  const fields = new Map(fieldRows.rows.map((row) => [row.id, row]));

  const compiled = compileWidgetFilter(filter, fields, alias);
  return {
    ...compiled,
    source: "dashboard",
    description: `dashboard widget "${PARITY_WIDGET_TITLE}"`,
  };
}

// Never lets a read failure stop the Friday email: falls back to the allowlist
// and reports which definition was used so the send can say so out loud.
export async function resolveWonFilter(pool: Pool, alias = "o"): Promise<CompiledFilter> {
  try {
    return await loadDashboardWonFilter(pool, alias);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error("[closed-won-report] dashboard filter unavailable, using fallback:", reason);
    return fallbackWonFilter(alias);
  }
}
