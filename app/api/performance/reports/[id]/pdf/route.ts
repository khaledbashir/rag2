export const runtime = "nodejs";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { JSREPORT_URL, JSREPORT_USER, JSREPORT_PASSWORD } from "@/lib/variables";
import { log } from "@/lib/logger";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ScreenBreakdown {
  screenName: string;
  location: string | null;
  plays: number;
  airtimeSec: number;
  uptimePct: number;
}

interface SampleLog {
  playedAt: string;
  screenName: string;
  contentName: string;
  durationSec: number;
  verified: boolean;
}

interface ReportData {
  venue: { name: string; client: string; city: string; state: string };
  sponsor: { name: string; contact: string | null; email: string | null };
  period: { from: string; to: string; label: string };
  summary: {
    totalPlays: number;
    totalAirtimeSec: number;
    screenCount: number;
    gameDays: number;
    avgUptimePct: number;
    compliancePct: number;
    estimatedImpressions: number;
  };
  screenBreakdown: ScreenBreakdown[];
  sampleLogs: SampleLog[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}

function fmtCompact(n: number): string {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

function formatDuration(totalSec: number): string {
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  if (hrs > 0) return `${hrs}h ${mins}m ${secs}s`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", second: "2-digit",
  });
}

// ── HTML Builder ──────────────────────────────────────────────────────────────

function buildPerformanceReportHtml(report: any, data: ReportData): string {
  const reportId = `POP-${new Date(report.generatedAt).getFullYear()}-${data.venue.name.split(" ").map((w: string) => w[0]).join("").toUpperCase()}-${data.sponsor.name.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4)}-${String(report.id).slice(-4).toUpperCase()}`;

  const screenRows = data.screenBreakdown.map((scr, i) => {
    const bg = i % 2 === 0 ? "#ffffff" : "#f8fafc";
    const statusColor = scr.uptimePct >= 99 ? "#059669" : scr.uptimePct >= 95 ? "#d97706" : "#dc2626";
    const statusBg = scr.uptimePct >= 99 ? "#d1fae5" : scr.uptimePct >= 95 ? "#fef3c7" : "#fee2e2";
    const statusLabel = scr.uptimePct >= 99 ? "On Track" : scr.uptimePct >= 95 ? "Warning" : "Below Target";
    return `<tr style="background:${bg}">
      <td style="padding:8px 12px;font-weight:600;color:#0f172a;font-size:11px">${scr.screenName}</td>
      <td style="padding:8px 12px;color:#64748b;font-size:10px">${scr.location || "—"}</td>
      <td style="padding:8px 12px;text-align:right;font-weight:700;color:#0f172a;font-size:11px">${fmt(scr.plays)}</td>
      <td style="padding:8px 12px;text-align:right;color:#475569;font-size:11px">${formatDuration(scr.airtimeSec)}</td>
      <td style="padding:8px 12px;text-align:right;font-weight:700;color:${statusColor};font-size:11px">${scr.uptimePct}%</td>
      <td style="padding:8px 12px;text-align:center"><span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:9px;font-weight:700;background:${statusBg};color:${statusColor}">${statusLabel}</span></td>
    </tr>`;
  }).join("\n");

  const logRows = data.sampleLogs.slice(0, 25).map((log, i) => {
    const bg = i % 2 === 0 ? "#ffffff" : "#f8fafc";
    return `<tr style="background:${bg};font-family:'Courier New',monospace">
      <td style="padding:4px 8px;color:#64748b;font-size:9px">${formatDateTime(log.playedAt)}</td>
      <td style="padding:4px 8px;color:#334155;font-size:9px;font-family:'Work Sans',sans-serif;font-weight:500">${log.screenName}</td>
      <td style="padding:4px 8px;color:#475569;font-size:9px">${log.contentName}</td>
      <td style="padding:4px 8px;text-align:right;color:#64748b;font-size:9px">${log.durationSec}s</td>
      <td style="padding:4px 8px;text-align:center;color:${log.verified ? "#059669" : "#d97706"};font-size:9px;font-weight:700">${log.verified ? "✓" : "—"}</td>
    </tr>`;
  }).join("\n");

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<link href="https://fonts.googleapis.com/css2?family=Work+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet"/>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Work Sans', system-ui, sans-serif; font-size: 10px; color: #0f172a; line-height: 1.4; }
  @page { size: 8.5in 11in; margin: 0; }
  .page-break { page-break-before: always; }
</style>
</head>
<body>

<!-- PAGE 1: HEADER + SUMMARY + SCREEN BREAKDOWN -->
<div style="min-height:100vh;display:flex;flex-direction:column">

  <!-- HEADER BAND -->
  <div style="background:#0A1628;color:white;padding:40px 48px 32px;position:relative;overflow:hidden">
    <div style="position:absolute;top:0;right:0;width:300px;height:100%;background:#0A52EF;opacity:0.08;transform:skewX(-15deg) translateX(100px)"></div>
    <div style="position:absolute;top:0;right:80px;width:3px;height:100%;background:#0A52EF;opacity:0.35;transform:skewX(-15deg)"></div>
    <div style="position:relative;z-index:1;display:flex;justify-content:space-between;align-items:flex-start">
      <div>
        <div style="font-size:9px;font-weight:700;letter-spacing:3px;color:#0A52EF;margin-bottom:4px">ANC SPORTS ENTERPRISES</div>
        <div style="font-size:22px;font-weight:700;letter-spacing:-0.5px">Proof of Performance</div>
        <div style="font-size:14px;font-weight:300;color:rgba(255,255,255,0.6);margin-top:2px">Certificate of Advertising Compliance</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:8px;font-weight:700;letter-spacing:2px;color:rgba(255,255,255,0.35);margin-bottom:4px">REPORT ID</div>
        <div style="font-size:10px;font-family:'Courier New',monospace;color:#0A52EF">${reportId}</div>
        <div style="font-size:9px;color:rgba(255,255,255,0.35);margin-top:4px">Generated ${formatDate(report.generatedAt)}</div>
      </div>
    </div>
    <div style="margin-top:20px;height:2px;background:linear-gradient(to right,#0A52EF,rgba(10,82,239,0.3),transparent)"></div>
  </div>

  <!-- SPONSOR & VENUE BAR -->
  <div style="padding:24px 48px;background:#f8fafc;border-bottom:1px solid #e2e8f0;display:flex;gap:40px">
    <div style="flex:1">
      <div style="font-size:8px;font-weight:700;letter-spacing:2px;color:#94a3b8;margin-bottom:4px">SPONSOR</div>
      <div style="font-size:16px;font-weight:700;color:#0f172a">${data.sponsor.name}</div>
      ${data.sponsor.contact ? `<div style="font-size:10px;color:#64748b;margin-top:2px">${data.sponsor.contact}</div>` : ""}
    </div>
    <div style="flex:1">
      <div style="font-size:8px;font-weight:700;letter-spacing:2px;color:#94a3b8;margin-bottom:4px">VENUE</div>
      <div style="font-size:16px;font-weight:700;color:#0f172a">${data.venue.name}</div>
      <div style="font-size:10px;color:#64748b;margin-top:2px">${data.venue.client} — ${data.venue.city}, ${data.venue.state}</div>
    </div>
    <div style="flex:1">
      <div style="font-size:8px;font-weight:700;letter-spacing:2px;color:#94a3b8;margin-bottom:4px">REPORTING PERIOD</div>
      <div style="font-size:16px;font-weight:700;color:#0f172a">${data.period.label}</div>
    </div>
  </div>

  <!-- HERO METRICS -->
  <div style="padding:32px 48px">
    <div style="display:flex;gap:16px">
      <div style="flex:1;background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;padding:20px;text-align:center">
        <div style="font-size:28px;font-weight:800;color:#1e3a8a">${fmt(data.summary.totalPlays)}</div>
        <div style="font-size:9px;font-weight:600;letter-spacing:1.5px;color:#64748b;margin-top:4px">TOTAL PLAYS</div>
      </div>
      <div style="flex:1;background:#eef2ff;border:1px solid #c7d2fe;border-radius:12px;padding:20px;text-align:center">
        <div style="font-size:28px;font-weight:800;color:#312e81">${formatDuration(data.summary.totalAirtimeSec)}</div>
        <div style="font-size:9px;font-weight:600;letter-spacing:1.5px;color:#64748b;margin-top:4px">TOTAL AIRTIME</div>
      </div>
      <div style="flex:1;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:12px;padding:20px;text-align:center${data.summary.avgUptimePct >= 99 ? ";box-shadow:0 0 0 2px #34d399" : ""}">
        <div style="font-size:28px;font-weight:800;color:#065f46">${data.summary.avgUptimePct}%</div>
        <div style="font-size:9px;font-weight:600;letter-spacing:1.5px;color:#64748b;margin-top:4px">SCREEN UPTIME</div>
      </div>
      <div style="flex:1;background:#fffbeb;border:1px solid #fde68a;border-radius:12px;padding:20px;text-align:center">
        <div style="font-size:28px;font-weight:800;color:#92400e">${fmtCompact(data.summary.estimatedImpressions)}</div>
        <div style="font-size:9px;font-weight:600;letter-spacing:1.5px;color:#64748b;margin-top:4px">EST. IMPRESSIONS</div>
      </div>
    </div>

    <!-- COMPLIANCE BADGE -->
    <div style="margin-top:24px;text-align:center">
      <span style="display:inline-block;padding:8px 24px;border-radius:20px;font-size:12px;font-weight:700;background:${data.summary.compliancePct >= 100 ? "#ecfdf5" : "#fffbeb"};color:${data.summary.compliancePct >= 100 ? "#065f46" : "#92400e"};border:1px solid ${data.summary.compliancePct >= 100 ? "#a7f3d0" : "#fde68a"}">
        ✓ Contract Compliance: ${data.summary.compliancePct}%
      </span>
    </div>
  </div>

  <!-- SCREEN-BY-SCREEN BREAKDOWN -->
  <div style="padding:0 48px 32px">
    <div style="font-size:11px;font-weight:700;letter-spacing:1.5px;color:#64748b;margin-bottom:12px">SCREEN-BY-SCREEN BREAKDOWN</div>
    <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">
      <thead>
        <tr style="background:#f1f5f9">
          <th style="padding:8px 12px;text-align:left;font-size:9px;font-weight:700;letter-spacing:1px;color:#94a3b8">SCREEN</th>
          <th style="padding:8px 12px;text-align:left;font-size:9px;font-weight:700;letter-spacing:1px;color:#94a3b8">LOCATION</th>
          <th style="padding:8px 12px;text-align:right;font-size:9px;font-weight:700;letter-spacing:1px;color:#94a3b8">PLAYS</th>
          <th style="padding:8px 12px;text-align:right;font-size:9px;font-weight:700;letter-spacing:1px;color:#94a3b8">AIRTIME</th>
          <th style="padding:8px 12px;text-align:right;font-size:9px;font-weight:700;letter-spacing:1px;color:#94a3b8">UPTIME</th>
          <th style="padding:8px 12px;text-align:center;font-size:9px;font-weight:700;letter-spacing:1px;color:#94a3b8">STATUS</th>
        </tr>
      </thead>
      <tbody>
        ${screenRows}
      </tbody>
    </table>
  </div>
</div>

<!-- PAGE 2: PLAY LOG + CERTIFICATION -->
<div class="page-break" style="min-height:100vh;display:flex;flex-direction:column">

  <!-- PLAY LOG SAMPLE -->
  <div style="padding:40px 48px;flex:1">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <div style="font-size:11px;font-weight:700;letter-spacing:1.5px;color:#64748b">RECENT PLAY LOG</div>
      <div style="font-size:9px;color:#94a3b8">Showing ${Math.min(data.sampleLogs.length, 25)} of ${fmt(data.summary.totalPlays)} total entries</div>
    </div>
    <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">
      <thead>
        <tr style="background:#f1f5f9">
          <th style="padding:6px 8px;text-align:left;font-size:8px;font-weight:700;letter-spacing:1px;color:#94a3b8">TIMESTAMP</th>
          <th style="padding:6px 8px;text-align:left;font-size:8px;font-weight:700;letter-spacing:1px;color:#94a3b8">SCREEN</th>
          <th style="padding:6px 8px;text-align:left;font-size:8px;font-weight:700;letter-spacing:1px;color:#94a3b8">CONTENT</th>
          <th style="padding:6px 8px;text-align:right;font-size:8px;font-weight:700;letter-spacing:1px;color:#94a3b8">DURATION</th>
          <th style="padding:6px 8px;text-align:center;font-size:8px;font-weight:700;letter-spacing:1px;color:#94a3b8">VERIFIED</th>
        </tr>
      </thead>
      <tbody>
        ${logRows}
      </tbody>
    </table>
  </div>

  <!-- CERTIFICATION FOOTER -->
  <div style="background:#0A1628;color:white;padding:32px 48px;margin-top:auto">
    <div style="display:flex;justify-content:space-between;align-items:flex-start">
      <div>
        <div style="font-size:8px;font-weight:700;letter-spacing:3px;color:#0A52EF;margin-bottom:8px">CERTIFICATION</div>
        <p style="font-size:10px;color:rgba(255,255,255,0.5);max-width:420px;line-height:1.5">
          This report has been generated from verified play log data captured by the ANC content
          management system. All timestamps are sourced from live system telemetry. Play counts
          and uptime metrics reflect actual operational performance during the reporting period.
        </p>
        <div style="margin-top:16px;display:flex;gap:24px;align-items:center">
          <div>
            <div style="font-size:8px;color:rgba(255,255,255,0.25);letter-spacing:1px">CERTIFIED BY</div>
            <div style="font-size:10px;color:rgba(255,255,255,0.7);font-weight:500;margin-top:2px">ANC Sports Enterprises, LLC</div>
          </div>
          <div style="width:1px;height:28px;background:rgba(255,255,255,0.08)"></div>
          <div>
            <div style="font-size:8px;color:rgba(255,255,255,0.25);letter-spacing:1px">DATA SOURCE</div>
            <div style="font-size:10px;color:rgba(255,255,255,0.7);font-weight:500;margin-top:2px">vSOFT Content Management System</div>
          </div>
        </div>
      </div>
      <div style="text-align:right">
        <div style="font-size:8px;color:rgba(255,255,255,0.25);letter-spacing:1px;margin-bottom:4px">REPORT ID</div>
        <div style="font-size:10px;font-family:'Courier New',monospace;color:#0A52EF">${reportId}</div>
        <div style="font-size:8px;color:rgba(255,255,255,0.25);letter-spacing:1px;margin-top:8px">GENERATED</div>
        <div style="font-size:10px;color:rgba(255,255,255,0.5);margin-top:2px">${formatDate(report.generatedAt)}</div>
      </div>
    </div>
    <div style="margin-top:20px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.06);display:flex;justify-content:space-between">
      <div style="font-size:8px;color:rgba(255,255,255,0.15);letter-spacing:3px;font-weight:700">PROPRIETARY & CONFIDENTIAL</div>
      <div style="font-size:8px;color:rgba(255,255,255,0.15)">© ${new Date().getFullYear()} ANC Sports Enterprises, LLC. All rights reserved.</div>
    </div>
  </div>
</div>

</body>
</html>`;
}

// ── Route Handler ─────────────────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const report = await prisma.performanceReport.findUnique({
      where: { id },
      include: { venue: true, sponsor: true },
    });

    if (!report || !report.reportData) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }

    const data = report.reportData as unknown as ReportData;
    const fullHtml = buildPerformanceReportHtml(report, data);

    // Send to jsreport
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (JSREPORT_USER && JSREPORT_PASSWORD) {
      headers["Authorization"] = `Basic ${Buffer.from(`${JSREPORT_USER}:${JSREPORT_PASSWORD}`).toString("base64")}`;
    }

    const jsreportPayload = {
      template: {
        engine: "none",
        recipe: "chrome-pdf",
        content: fullHtml,
        chrome: {
          printBackground: true,
          displayHeaderFooter: false,
          mediaType: "screen",
          waitForNetworkIdle: true,
          marginTop: "0px",
          marginBottom: "0px",
          marginLeft: "0px",
          marginRight: "0px",
          width: "8.5in",
          height: "11in",
          landscape: false,
        },
      },
    };

    log.info(`[performance/pdf] Rendering report ${id} via jsreport...`);

    const response = await fetch(`${JSREPORT_URL}/api/report`, {
      method: "POST",
      headers,
      body: JSON.stringify(jsreportPayload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      log.error("[performance/pdf] jsreport error:", response.status, errorText);
      return NextResponse.json(
        { error: "PDF generation failed", details: errorText },
        { status: 502 },
      );
    }

    const pdfBuffer = await response.arrayBuffer();
    if (pdfBuffer.byteLength === 0) {
      return NextResponse.json({ error: "jsreport returned empty PDF" }, { status: 502 });
    }

    log.info(`[performance/pdf] PDF generated: ${pdfBuffer.byteLength} bytes`);

    const safeName = data.sponsor.name.replace(/[^a-zA-Z0-9]/g, "_");
    const safeVenue = data.venue.name.split(" ").map((w: string) => w[0]).join("").toUpperCase();
    const dateStr = new Date(report.generatedAt).toISOString().slice(0, 10);
    const fileName = `ANC_Proof_of_Performance_${safeName}_${safeVenue}_${dateStr}.pdf`;

    return new NextResponse(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-cache",
      },
      status: 200,
    });
  } catch (error: any) {
    log.error("[performance/pdf] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
