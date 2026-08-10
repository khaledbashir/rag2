/**
 * CRM user-activity reporting (Jireh 2026-08-10).
 *
 * "Active" means the person performed a recorded action in the CRM — creating
 * or updating a record, note, task, or dashboard. The CRM keeps no login or
 * page-view log, so a read-only session is not counted. That is the honest
 * definition and the report says so on its face.
 *
 * Pure and clock-injectable so the bucket boundaries can be tested.
 */

export interface MemberActivityInput {
  id: string;
  name: string;
  email: string;
  /** ISO timestamp of the member's most recent recorded action, or null. */
  lastActivityAt: string | null;
  /** Timeline event name of that action, e.g. "opportunity.updated". */
  lastActionName: string | null;
}

export type ActivityBucket =
  | "active_today"
  | "active_this_week"
  | "active_this_month"
  | "dormant"
  | "never";

export interface MemberActivityRow extends MemberActivityInput {
  bucket: ActivityBucket;
  /** Whole days since the last action; null when the member never acted. */
  daysSinceLastActivity: number | null;
}

export interface UserActivitySummary {
  daily: number;
  weekly: number;
  monthly: number;
  totalMembers: number;
  neverActive: number;
  /** Members whose last action is older than 30 days. */
  dormant: number;
}

export interface UserActivityReport {
  generatedAt: string;
  summary: UserActivitySummary;
  rows: MemberActivityRow[];
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export const BUCKET_LABELS: Record<ActivityBucket, string> = {
  active_today: "Active in the last 24 hours",
  active_this_week: "Active in the last 7 days",
  active_this_month: "Active in the last 30 days",
  dormant: "No activity in over 30 days",
  never: "No recorded activity",
};

/** Bucket order used for grouping in the workbook and JSON payload. */
export const BUCKET_ORDER: ActivityBucket[] = [
  "active_today",
  "active_this_week",
  "active_this_month",
  "dormant",
  "never",
];

function ageMs(lastActivityAt: string | null, now: number): number | null {
  if (!lastActivityAt) return null;
  const at = new Date(lastActivityAt).getTime();
  if (Number.isNaN(at)) return null;
  // A clock skew that puts an event slightly in the future must still count as
  // current activity rather than falling through to "dormant".
  return Math.max(0, now - at);
}

export function bucketFor(lastActivityAt: string | null, now: number): ActivityBucket {
  const age = ageMs(lastActivityAt, now);
  if (age === null) return "never";
  if (age <= DAY_MS) return "active_today";
  if (age <= 7 * DAY_MS) return "active_this_week";
  if (age <= 30 * DAY_MS) return "active_this_month";
  return "dormant";
}

export function buildUserActivityReport(
  members: MemberActivityInput[],
  now: number = Date.now(),
): UserActivityReport {
  const rows: MemberActivityRow[] = members.map((member) => {
    const age = ageMs(member.lastActivityAt, now);
    return {
      ...member,
      bucket: bucketFor(member.lastActivityAt, now),
      daysSinceLastActivity: age === null ? null : Math.floor(age / DAY_MS),
    };
  });

  // Most recently active first; members who never acted sort last.
  rows.sort((left, right) => {
    if (!left.lastActivityAt && !right.lastActivityAt) return left.name.localeCompare(right.name);
    if (!left.lastActivityAt) return 1;
    if (!right.lastActivityAt) return -1;
    return right.lastActivityAt.localeCompare(left.lastActivityAt);
  });

  // The windows are cumulative: anyone active today is also active this week.
  const daily = rows.filter((r) => r.bucket === "active_today").length;
  const weekly = daily + rows.filter((r) => r.bucket === "active_this_week").length;
  const monthly = weekly + rows.filter((r) => r.bucket === "active_this_month").length;

  return {
    generatedAt: new Date(now).toISOString(),
    summary: {
      daily,
      weekly,
      monthly,
      totalMembers: rows.length,
      neverActive: rows.filter((r) => r.bucket === "never").length,
      dormant: rows.filter((r) => r.bucket === "dormant").length,
    },
    rows,
  };
}

/** "opportunity.updated" → "Opportunity updated" */
export function humanizeActionName(actionName: string | null): string {
  if (!actionName) return "";
  const [object, verb] = actionName.split(".");
  const spaced = object.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
  const label = spaced.charAt(0).toUpperCase() + spaced.slice(1);
  return verb ? `${label} ${verb}` : label;
}
