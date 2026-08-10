import { describe, expect, it } from "vitest";
import {
  bucketFor,
  buildUserActivityReport,
  humanizeActionName,
} from "./userActivity";

const NOW = Date.parse("2026-08-10T18:00:00.000Z");
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function at(offsetMs: number): string {
  return new Date(NOW - offsetMs).toISOString();
}

describe("activity buckets", () => {
  it("counts an action from an hour ago as active today", () => {
    expect(bucketFor(at(HOUR), NOW)).toBe("active_today");
  });

  it("treats exactly 24 hours as still active today", () => {
    expect(bucketFor(at(DAY), NOW)).toBe("active_today");
  });

  it("moves just past 24 hours into the weekly bucket", () => {
    expect(bucketFor(at(DAY + 1000), NOW)).toBe("active_this_week");
  });

  it("moves just past 7 days into the monthly bucket", () => {
    expect(bucketFor(at(7 * DAY + 1000), NOW)).toBe("active_this_month");
  });

  it("marks anything older than 30 days dormant", () => {
    expect(bucketFor(at(31 * DAY), NOW)).toBe("dormant");
  });

  it("marks a member with no recorded action as never", () => {
    expect(bucketFor(null, NOW)).toBe("never");
  });

  it("does not let a slightly future timestamp fall through to dormant", () => {
    expect(bucketFor(new Date(NOW + 5 * 60 * 1000).toISOString(), NOW)).toBe("active_today");
  });

  it("treats an unparseable timestamp as never rather than throwing", () => {
    expect(bucketFor("not-a-date", NOW)).toBe("never");
  });
});

describe("report summary", () => {
  const members = [
    { id: "1", name: "Recent User", email: "a@anc.com", lastActivityAt: at(2 * HOUR), lastActionName: "opportunity.updated" },
    { id: "2", name: "Today User", email: "b@anc.com", lastActivityAt: at(20 * HOUR), lastActionName: "company.updated" },
    { id: "3", name: "Week User", email: "c@anc.com", lastActivityAt: at(3 * DAY), lastActionName: "task.updated" },
    { id: "4", name: "Month User", email: "d@anc.com", lastActivityAt: at(20 * DAY), lastActionName: "note.created" },
    { id: "5", name: "Dormant User", email: "e@anc.com", lastActivityAt: at(90 * DAY), lastActionName: "note.created" },
    { id: "6", name: "Never User", email: "f@anc.com", lastActivityAt: null, lastActionName: null },
  ];

  it("reports cumulative daily, weekly and monthly windows", () => {
    const { summary } = buildUserActivityReport(members, NOW);
    // Anyone active today is also active this week and this month.
    expect(summary.daily).toBe(2);
    expect(summary.weekly).toBe(3);
    expect(summary.monthly).toBe(4);
  });

  it("counts the whole roster, including people who never acted", () => {
    const { summary } = buildUserActivityReport(members, NOW);
    expect(summary.totalMembers).toBe(6);
    expect(summary.neverActive).toBe(1);
    expect(summary.dormant).toBe(1);
  });

  it("orders the most recently active first and never-active last", () => {
    const { rows } = buildUserActivityReport(members, NOW);
    expect(rows[0].name).toBe("Recent User");
    expect(rows[rows.length - 1].name).toBe("Never User");
  });

  it("reports whole days since the last action", () => {
    const { rows } = buildUserActivityReport(members, NOW);
    expect(rows.find((r) => r.name === "Week User")?.daysSinceLastActivity).toBe(3);
    expect(rows.find((r) => r.name === "Never User")?.daysSinceLastActivity).toBeNull();
  });

  it("produces zeroed windows for an empty workspace rather than throwing", () => {
    const { summary } = buildUserActivityReport([], NOW);
    expect(summary).toMatchObject({ daily: 0, weekly: 0, monthly: 0, totalMembers: 0 });
  });
});

describe("action names", () => {
  it("renders a timeline event as readable text", () => {
    expect(humanizeActionName("opportunity.updated")).toBe("Opportunity updated");
  });

  it("splits camel case object names", () => {
    expect(humanizeActionName("mediaPlacement.updated")).toBe("Media placement updated");
  });

  it("returns an empty string when there is no action", () => {
    expect(humanizeActionName(null)).toBe("");
  });
});
