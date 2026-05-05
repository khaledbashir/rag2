import { NextRequest, NextResponse } from "next/server";
import {
  buildClosedWonReport,
  renderClosedWonReportHtml,
  type ClosedWonReportPeriod,
} from "@/services/crmReports/closedWonReport";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;

function periodFromRequest(request: NextRequest): ClosedWonReportPeriod {
  const raw = request.nextUrl.searchParams.get("period");
  return raw === "monthToDate" ? "monthToDate" : "last7";
}

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

export async function GET(request: NextRequest) {
  try {
    requireReportSecret(request);
    const report = await buildClosedWonReport(periodFromRequest(request));
    const format = request.nextUrl.searchParams.get("format") || "html";

    if (format === "json") {
      return NextResponse.json(report);
    }

    return new NextResponse(renderClosedWonReportHtml(report), {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to build report";
    const status = message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
