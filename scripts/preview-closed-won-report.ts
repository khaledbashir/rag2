/**
 * Prints the Closed-Won report's numbers without emailing anyone.
 *
 * The send endpoint has no dry-run mode — POSTing it mails 21 people including
 * ANC leadership. This builds the same report and prints it, so the figures can
 * be checked before a scheduled send goes out.
 *
 *   npx tsx scripts/preview-closed-won-report.ts [monthToDate|last7]
 *
 * "filter source" is the line to read: `dashboard` means the numbers came from
 * the widget on Jireh's dashboard; `fallback` means the dashboard could not be
 * read and the report used its own rule, which is the drift this guards against.
 */
import { buildClosedWonReport, type ClosedWonReportPeriod } from "@/services/crmReports/closedWonReport";

const usd = (n: number) =>
  `$${Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

(async () => {
  const arg = process.argv[2];
  const period: ClosedWonReportPeriod = arg === "last7" ? "last7" : "monthToDate";
  const report = await buildClosedWonReport(period);

  console.log(`period        : ${report.period}`);
  console.log(`filter source : ${report.wonFilterSource}`);
  console.log(`filter rule   : ${report.wonFilterDescription}`);
  console.log(`dashboard     : ${report.dashboardUrl}`);

  console.log(`\n=== 2026 Closed Won by Business Unit ===`);
  for (const group of report.won2026.departmentGroups) {
    const g = group as unknown as {
      department?: string;
      name?: string;
      rows?: unknown[];
      totals?: { revenue?: number; margin?: number };
    };
    const label = g.department ?? g.name ?? "(unlabelled)";
    console.log(
      `  ${label.padEnd(22)} deals=${String(g.rows?.length ?? 0).padStart(4)}` +
        `  rev=${usd(g.totals?.revenue ?? 0)}  margin=${usd(g.totals?.margin ?? 0)}`,
    );
  }
  const t = report.won2026.totals;
  console.log(`  ${"TOTAL".padEnd(22)} deals=${String(t.records).padStart(4)}  rev=${usd(t.revenue)}  margin=${usd(t.margin)}`);

  console.log(`\n=== ${report.recent.title} ===`);
  console.log(`  ${report.recent.rows.length} deals · rev=${usd(report.recent.totals.revenue)} · margin=${usd(report.recent.totals.margin)}`);

  if (report.wonFilterSource !== "dashboard") {
    console.log(`\n!! NOT dashboard-backed — do not send until this reads "dashboard".`);
    process.exit(2);
  }
  process.exit(0);
})().catch((error) => {
  console.error("FAILED", error);
  process.exit(1);
});
