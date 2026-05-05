import { NextRequest, NextResponse } from "next/server";
import {
  buildClosedWonReport,
  getDefaultClosedWonRecipients,
  renderClosedWonReportHtml,
  sendClosedWonReportEmail,
  type ClosedWonReportPeriod,
} from "@/services/crmReports/closedWonReport";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;

function requireReportSecret(request: NextRequest) {
  const expected = process.env.CRM_REPORT_SECRET?.trim();
  if (!expected && process.env.NODE_ENV !== "production") return;
  if (!expected) throw new Error("CRM_REPORT_SECRET is not configured");

  const supplied =
    request.headers.get("x-crm-report-secret") ||
    request.nextUrl.searchParams.get("secret") ||
    "";
  if (supplied !== expected) throw new Error("Unauthorized");
}

function periodFromRequest(request: NextRequest): ClosedWonReportPeriod {
  const raw = request.nextUrl.searchParams.get("period");
  return raw === "monthToDate" ? "monthToDate" : "last7";
}

function todayParts(timeZone = "America/New_York") {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(new Date());

  return {
    year: Number(parts.find((part) => part.type === "year")?.value),
    month: Number(parts.find((part) => part.type === "month")?.value),
    day: Number(parts.find((part) => part.type === "day")?.value),
  };
}

function isLastDayOfMonth() {
  const { year, month, day } = todayParts();
  return day === new Date(Date.UTC(year, month, 0)).getUTCDate();
}

async function recipientsFromRequest(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (Array.isArray(body?.recipients)) {
    return body.recipients.map((entry: unknown) => String(entry).trim()).filter(Boolean);
  }
  return getDefaultClosedWonRecipients();
}

export async function POST(request: NextRequest) {
  try {
    requireReportSecret(request);
    const period = periodFromRequest(request);
    if (request.nextUrl.searchParams.get("onlyLastDay") === "1" && !isLastDayOfMonth()) {
      return NextResponse.json({ ok: true, skipped: true, reason: "Not the last day of the month", period });
    }

    const report = await buildClosedWonReport(period);
    const html = renderClosedWonReportHtml(report);
    const recipients = await recipientsFromRequest(request);
    const result = await sendClosedWonReportEmail({ report, html, recipients });

    return NextResponse.json({
      ok: true,
      messageId: result.id || null,
      provider: result.provider,
      from: result.from,
      recipients,
      totals: report.totals,
      period: report.period,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to send report";
    const status = message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
