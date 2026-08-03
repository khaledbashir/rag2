import { NextRequest, NextResponse } from "next/server";
import {
  buildClosedWonReport,
  getClosedWonGroupApproval,
  getClosedWonReviewRecipients,
  getDefaultClosedWonRecipients,
  renderClosedWonReportHtml,
  sendClosedWonReportEmail,
  sendClosedWonReportFailureAlert,
  type ClosedWonDelivery,
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

function deliveryFromRequest(request: NextRequest): ClosedWonDelivery {
  const raw = request.nextUrl.searchParams.get("delivery") || "group";
  if (raw === "review" || raw === "group") return raw;
  throw new Error("Invalid delivery mode");
}

export async function POST(request: NextRequest) {
  let authorized = false;
  let period: ClosedWonReportPeriod = "last7";
  let delivery: ClosedWonDelivery = "group";
  try {
    requireReportSecret(request);
    authorized = true;
    period = periodFromRequest(request);
    delivery = deliveryFromRequest(request);
    if (request.nextUrl.searchParams.get("onlyLastDay") === "1" && !isLastDayOfMonth()) {
      return NextResponse.json({ ok: true, skipped: true, reason: "Not the last day of the month", period });
    }

    const approval = getClosedWonGroupApproval();
    if (delivery === "group" && !approval.approved) {
      return NextResponse.json({
        ok: true,
        skipped: true,
        locked: true,
        reason: "Wider distribution is locked pending Jireh's approval",
        delivery,
        period,
      });
    }
    if (delivery === "review" && approval.approved) {
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: "Private review is complete; wider distribution is approved",
        delivery,
        period,
        approval,
      });
    }

    const report = await buildClosedWonReport(period);
    const recipients = delivery === "review"
      ? getClosedWonReviewRecipients()
      : getDefaultClosedWonRecipients();
    const dryRun = request.nextUrl.searchParams.get("dryRun") === "1";
    if (dryRun) {
      return NextResponse.json({
        ok: true,
        dryRun: true,
        delivery,
        recipients,
        period: report.period,
        fyYear: report.fyYear,
        wonFilterSource: report.wonFilterSource,
        wonFilterDescription: report.wonFilterDescription,
        won2026: report.won2026.totals,
        byBusinessUnit: report.won2026.departmentGroups.map((group) => ({
          department: group.department,
          totals: group.totals,
        })),
      });
    }

    const html = renderClosedWonReportHtml(report, { reviewCopy: delivery === "review" });
    const result = await sendClosedWonReportEmail({ report, html, recipients, delivery });

    return NextResponse.json({
      ok: true,
      messageId: result.id || null,
      provider: result.provider,
      from: result.from,
      recipients,
      delivery,
      period: report.period,
      fyYear: report.fyYear,
      won2026: report.won2026.totals,
      recent: report.recent.totals,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to send report";
    if (authorized && message !== "Invalid delivery mode") {
      let alerted = false;
      try {
        await sendClosedWonReportFailureAlert({ period, delivery, error: message });
        alerted = true;
      } catch (alertError) {
        console.error("[closed-won-report] failure alert could not be sent", alertError);
      }
      return NextResponse.json({ ok: false, stopped: true, alerted, error: message }, { status: 500 });
    }
    const status = message === "Unauthorized" ? 401 : message === "Invalid delivery mode" ? 400 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
