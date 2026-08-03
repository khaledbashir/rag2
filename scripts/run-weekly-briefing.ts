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
import {
  runWeeklyBriefing,
  briefingRecipients,
  briefingObservers,
} from "@/services/briefing/weeklyBriefing";

const KNOWN_FLAGS = ["--dry-run", "--out=", "--now=", "--observers="];

async function main() {
  const args = process.argv.slice(2);
  // A typo'd flag must never fall through to a live send. This script delivers
  // real mail to real executives; an unrecognised argument is a hard stop.
  const unknown = args.filter(
    (a) => a.startsWith("--") && !KNOWN_FLAGS.some((f) => a === f || a.startsWith(f)),
  );
  if (unknown.length) {
    throw new Error(`Unknown flag(s): ${unknown.join(", ")}. Known: ${KNOWN_FLAGS.join(" ")}`);
  }
  const dryRun = args.includes("--dry-run");
  const outDir = args.find((a) => a.startsWith("--out="))?.slice("--out=".length);
  // --now lets a catch-up run reproduce the edition a missed Sunday would have
  // sent, instead of the Monday-to-today sliver a plain re-run would produce.
  const nowArg = args.find((a) => a.startsWith("--now="))?.slice("--now=".length);
  const now = nowArg ? new Date(nowArg) : undefined;
  if (nowArg && Number.isNaN(now!.getTime())) throw new Error(`Bad --now: ${nowArg}`);
  const recipients = args.filter((a) => a.includes("@") && !a.startsWith("--"));
  const targets = recipients.length ? recipients : briefingRecipients();
  const observerArg = args.find((a) => a.startsWith("--observers="))?.slice("--observers=".length);
  const observers = observerArg
    ? observerArg.split(",").map((s) => s.trim()).filter(Boolean)
    : briefingObservers();

  console.log(`[briefing] ${dryRun ? "DRY RUN" : "DELIVERING"} → ${targets.join(", ")}${nowArg ? ` (as of ${nowArg})` : ""}`);
  const results = await runWeeklyBriefing({ recipients: targets, observers, dryRun, now });
  for (const r of results) {
    if (outDir && r.html) {
      const path = `${outDir}/briefing-${r.recipient.replace(/[^a-z0-9]/gi, "_")}.html`;
      writeFileSync(path, r.html, "utf8");
      console.log(`[briefing] wrote ${path}`);
    }
    console.log(
      `[briefing] ${r.recipient}: delivered=${r.delivered} bytes=${r.htmlBytes ?? "-"}${
        r.copiedTo?.length ? ` copiedTo=${r.copiedTo.join(",")}` : ""
      }${
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
