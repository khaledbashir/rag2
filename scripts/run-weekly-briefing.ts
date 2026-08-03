/**
 * One-off runner for the weekly "Your Week in Focus" briefing.
 *
 * The scheduled send on 2026-08-02 produced nothing (the API route had been
 * swallowed by a .gitignore pattern and never deployed). This runs the same
 * engine out-of-band so the recipients get the edition they were promised,
 * without waiting on a deploy.
 *
 *   npx tsx scripts/run-weekly-briefing.ts --dry-run
 *   npx tsx scripts/run-weekly-briefing.ts jbillings@anc.com joeo@anc.com
 */
import { writeFileSync } from "node:fs";
import { runWeeklyBriefing, briefingRecipients } from "@/services/briefing/weeklyBriefing";

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const outDir = args.find((a) => a.startsWith("--out="))?.slice("--out=".length);
  const recipients = args.filter((a) => a.includes("@") && !a.startsWith("--"));
  const targets = recipients.length ? recipients : briefingRecipients();

  console.log(`[briefing] ${dryRun ? "DRY RUN" : "DELIVERING"} → ${targets.join(", ")}`);
  const results = await runWeeklyBriefing({ recipients: targets, dryRun });
  for (const r of results) {
    if (outDir && r.html) {
      const path = `${outDir}/briefing-${r.recipient.replace(/[^a-z0-9]/gi, "_")}.html`;
      writeFileSync(path, r.html, "utf8");
      console.log(`[briefing] wrote ${path}`);
    }
    console.log(
      `[briefing] ${r.recipient}: delivered=${r.delivered} bytes=${r.htmlBytes ?? "-"}${
        r.error ? ` error=${r.error}` : ""
      }`,
    );
  }
  const failed = results.filter((r) => r.error);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error("[briefing] fatal:", e);
  process.exit(1);
});
