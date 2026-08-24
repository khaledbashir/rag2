/**
 * A probe, not a test — it renders a real view export against the live CRM and
 * writes the workbook out to be opened and looked at. The layout defects this
 * file exists to catch (a missing roll-up, a section that lost its subtotal, a
 * frozen pane in the wrong place) are ones you have to see.
 *
 *   VIEW_EXPORT_PROBE=1 VIEW_EXPORT_PROBE_OUT=/tmp/forecast.xlsx \
 *     VIEW_EXPORT_PROBE_VIEW=<viewId> npx vitest run services/reports/viewExportProbe.test.ts
 *
 * Skipped unless VIEW_EXPORT_PROBE=1, so it never runs in a normal suite.
 */
import { describe, expect, it } from "vitest";
import { writeFileSync } from "node:fs";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/render/opportunities-xlsx/route";

const OUT = process.env.VIEW_EXPORT_PROBE_OUT || "/tmp/view-export-probe.xlsx";
/** Alexis's 2026 Service Forecast — the view that lost its sections. */
const VIEW = process.env.VIEW_EXPORT_PROBE_VIEW || "262074a2-73ea-4d08-aaea-72de0001dc0b";

describe.runIf(process.env.VIEW_EXPORT_PROBE === "1")("view export probe", () => {
  it("renders the view to a workbook on disk", async () => {
    const res = await GET(
      new NextRequest(`https://proposals.anc.com/api/render/opportunities-xlsx?viewId=${VIEW}`),
    );
    expect(res.status).toBe(200);
    writeFileSync(OUT, Buffer.from(await res.arrayBuffer()));
    // eslint-disable-next-line no-console
    console.log(`wrote ${OUT}`);
  }, 180_000);
});
