import { NextRequest, NextResponse } from "next/server";
import { buildForecastExportCsv, type ForecastExportScope } from "@/services/crmReports/forecastExport";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

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

function scopeFromRequest(request: NextRequest): ForecastExportScope {
  return request.nextUrl.searchParams.get("scope") === "forecast" ? "forecast" : "all";
}

export async function GET(request: NextRequest) {
  try {
    requireReportSecret(request);
    const { csv, rowCount, scope } = await buildForecastExportCsv(scopeFromRequest(request));
    const stamp = new Date().toISOString().slice(0, 10);

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="anc-opportunity-forecast-${scope}-${stamp}.csv"`,
        "Cache-Control": "no-store",
        "X-Export-Row-Count": String(rowCount),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to build forecast export";
    const status = message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
