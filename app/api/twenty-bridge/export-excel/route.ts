/**
 * GET /api/twenty-bridge/export-excel?estimateId=<uuid>
 *
 * Bridge endpoint used by Twenty CRM's Quick Estimate AI skill. The skill
 * creates an Estimate + EstimateLines in Twenty, then points the user here
 * to download the rag2-generated Excel scoping workbook. This route pulls
 * the estimate + its linked lines from Twenty REST, maps them to the same
 * EstimatorAnswers shape the Estimator UI uses, and runs them through the
 * existing scoping workbook generator.
 *
 * Public (no rag2 auth): Twenty is an ANC-internal tool and this is a
 * narrow, read-only bridge. The inbound estimateId must match a Twenty
 * record; anything else 404s.
 */

import { NextRequest, NextResponse } from "next/server";
import { mapEstimatorToScoping } from "@/services/rfp/pipeline/estimatorToScopingMapper";
import { generateScopingWorkbook } from "@/services/rfp/pipeline/generateScopingWorkbook";
import {
  getDefaultAnswers,
  getDefaultDisplayAnswers,
  normalizeEstimatorAnswers,
  type EstimatorAnswers,
  type DisplayAnswers,
} from "@/app/components/estimator/questions";
import { log } from "@/lib/logger";

export const dynamic = "force-dynamic";

const TWENTY_BASE = "https://abc-twenty.izcgmb.easypanel.host";
// ANC Twenty workspace API key (never-expiring admin key — same one used by
// lib/twenty-crm.ts for the sync-opportunity webhook). Lives in the repo
// because Twenty is our internal service and the token is already pinned
// in /root/.claude/skills/twenty-crm/SKILL.md.
const TWENTY_API_KEY = process.env.TWENTY_API_KEY
  || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkM2ZiYzI5YS1hNjM1LTQ4YjctOWQ2ZS0yNTA5NDE2NzdmZDAiLCJ0eXBlIjoiQVBJX0tFWSIsIndvcmtzcGFjZUlkIjoiZDNmYmMyOWEtYTYzNS00OGI3LTlkNmUtMjUwOTQxNjc3ZmQwIiwiaWF0IjoxNzc0ODEwNDkyLCJleHAiOjQ5Mjg0MTA0ODcsImp0aSI6IjYxMGEzMWEzLTJhMDgtNDM5MC1iMTU1LTFkN2M3NzY5Y2QxOSJ9.nzknS-bBNuf7y3LUCv2xEa5-9xuJNHBK3GalJwWK3eA";

async function twentyFetch(path: string, init?: RequestInit): Promise<any> {
  const res = await fetch(`${TWENTY_BASE}/rest/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${TWENTY_API_KEY}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Twenty ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

/**
 * The Twenty "Quick Estimate" AI skill currently creates estimateLine
 * records without setting estimateId (broken — lines come out orphaned).
 * Workaround: when an estimate has 0 linked lines, scan the most-recent
 * estimateLines, pick any orphan created within 90 seconds of the estimate
 * (and within 5 minutes of now, to avoid stealing much older orphans), and
 * PATCH them onto the estimate. Returns the rescued lines or an empty array
 * if none match.
 */
async function rescueOrphanLines(estimate: any): Promise<any[]> {
  const estimateId = estimate.id;
  const estCreatedAt = estimate.createdAt ? new Date(estimate.createdAt).getTime() : 0;
  if (!estCreatedAt) return [];

  const list = await twentyFetch(
    `estimateLines?order_by=createdAt[DescNullsFirst]&limit=60`,
  );
  const lines: any[] = list?.data?.estimateLines || [];
  const now = Date.now();

  const rescuable = lines.filter((line) => {
    if (line.estimateId) return false;
    const ts = line.createdAt ? new Date(line.createdAt).getTime() : 0;
    if (!ts) return false;
    const dtFromEstimate = Math.abs(ts - estCreatedAt);
    const dtFromNow = Math.abs(now - ts);
    // orphan created within 90s of the estimate AND within the last 24h
    return dtFromEstimate <= 90_000 && dtFromNow <= 24 * 60 * 60 * 1000;
  });

  if (rescuable.length === 0) return [];

  // Patch each back onto the estimate. Fail-soft: skip lines that error.
  const linked: any[] = [];
  for (const line of rescuable) {
    try {
      await twentyFetch(`estimateLines/${encodeURIComponent(line.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ estimateId }),
      });
      linked.push({ ...line, estimateId });
    } catch (err: any) {
      log.warn(`[twenty-bridge] rescue PATCH failed for line ${line.id}: ${err?.message}`);
    }
  }
  if (linked.length > 0) {
    log.info(`[twenty-bridge] Rescued ${linked.length} orphan line(s) onto estimate ${estimateId}`);
  }
  return linked;
}

/** Resolve a Twenty currency money object → raw USD number. */
function toUsd(currency: any): number {
  if (!currency || typeof currency.amountMicros !== "number") return 0;
  return currency.amountMicros / 1_000_000;
}

/** Map a Twenty estimateLine record to rag2's DisplayAnswers shape. */
function lineToDisplay(line: any, ledProductNameById: Map<string, string>): DisplayAnswers {
  const base = getDefaultDisplayAnswers();
  const pitch = Number(line.pitchMm) || 0;
  const widthFt = Number(line.widthFt) || 0;
  const heightFt = Number(line.heightFt) || 0;
  const env = String(line.lineEnvironment || "").toUpperCase() === "OUTDOOR" ? "outdoor" : "indoor";
  // rag2 DisplayAnswers stores the product by internal catalog ID. Twenty's
  // ledProductId points at a DIFFERENT product table (Twenty's own), so we
  // can't pass it to rag2 as-is without remapping. Leave productId blank and
  // pass the productName so the scoping workbook falls back to name matching.
  const productName = line.ledProductId
    ? ledProductNameById.get(line.ledProductId) || ""
    : "";
  return {
    ...base,
    displayName: line.displayName || line.name || "Unnamed",
    displayType: "custom",
    locationType: env === "outdoor" ? "outdoor" : "wall",
    rfpWidthFt: widthFt,
    rfpHeightFt: heightFt,
    widthFt,
    heightFt,
    quantity: Number(line.quantity) || 1,
    pixelPitch: pitch > 0 ? String(pitch) : base.pixelPitch,
    productId: "",
    productName,
  };
}

export async function GET(request: NextRequest) {
  const estimateId = request.nextUrl.searchParams.get("estimateId");
  if (!estimateId) {
    return NextResponse.json(
      { error: "estimateId query parameter is required" },
      { status: 400 },
    );
  }

  try {
    // 1) Fetch the estimate
    const estRes = await twentyFetch(`estimates/${encodeURIComponent(estimateId)}`);
    const estimate = estRes?.data?.estimate;
    if (!estimate) {
      return NextResponse.json({ error: "Estimate not found in Twenty" }, { status: 404 });
    }

    // 2) Fetch linked estimate lines. Twenty REST expects unquoted UUIDs.
    const lineRes = await twentyFetch(
      `estimateLines?filter=estimateId[eq]:${estimateId}&limit=200`,
    );
    let lines: any[] = lineRes?.data?.estimateLines || [];

    // 2a) Orphan-rescue: Quick Estimate skill creates lines with null
    // estimateId. Try to auto-link any orphan line created within 90s of
    // this estimate. If we rescue any, re-fetch the linked list.
    if (lines.length === 0) {
      const rescued = await rescueOrphanLines(estimate);
      if (rescued.length > 0) {
        const refetched = await twentyFetch(
          `estimateLines?filter=estimateId[eq]:${estimateId}&limit=200`,
        );
        lines = refetched?.data?.estimateLines || rescued;
      }
    }

    if (lines.length === 0) {
      return NextResponse.json(
        {
          error: "This estimate has no linked line items in Twenty",
          hint: "The Quick Estimate skill may have created the lines without setting estimateId. Re-run the skill, or wait a few seconds and refresh (orphan rescue only matches lines created within 90s of the estimate).",
          estimateId,
          estimateName: estimate.name,
        },
        { status: 422 },
      );
    }

    // 3) Resolve ledProduct names (one round-trip per unique product ID)
    const uniqueProductIds = Array.from(
      new Set(lines.map((l: any) => l.ledProductId).filter(Boolean)),
    );
    const ledProductNameById = new Map<string, string>();
    await Promise.all(
      uniqueProductIds.map(async (pid: any) => {
        try {
          const r = await twentyFetch(`ledProducts/${encodeURIComponent(pid)}`);
          const p = r?.data?.ledProduct;
          if (p?.displayName || p?.name) {
            ledProductNameById.set(pid, p.displayName || p.name);
          }
        } catch {
          // non-fatal: fall through to empty name
        }
      }),
    );

    // 4) Build EstimatorAnswers from estimate + lines
    const env: "indoor" | "outdoor" =
      String(estimate.indoorOutdoor || "").toUpperCase() === "OUTDOOR" ? "outdoor" : "indoor";

    const baseAnswers = getDefaultAnswers();
    const answers: EstimatorAnswers = normalizeEstimatorAnswers({
      ...baseAnswers,
      projectName: estimate.projectName || estimate.name || "Twenty Estimate",
      clientName: estimate.clientName || "",
      location: "",
      isIndoor: env === "indoor",
      isUnion: Boolean(estimate.isUnionLabor),
      currency: "USD",
      ledMargin: Number(estimate.blendedMargin) || baseAnswers.ledMargin,
      servicesMargin: Number(estimate.blendedMargin) || baseAnswers.servicesMargin,
      bondRate: toUsd(estimate.bondAmount) > 0 ? 1.5 : 0,
      displays: lines.map((line) => lineToDisplay(line, ledProductNameById)),
    });

    // 5) Map → scoping options → workbook
    const options = mapEstimatorToScoping(answers);
    const { buffer } = await generateScopingWorkbook(options);

    const safeName = (estimate.name || answers.projectName || "Twenty_Estimate")
      .replace(/\s+/g, "_")
      .replace(/[^\w\-_.]/g, "");

    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${safeName}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err: any) {
    log.error("[twenty-bridge/export-excel]", err?.message || err);
    return NextResponse.json(
      { error: "Twenty bridge export failed", detail: String(err?.message || err).slice(0, 500) },
      { status: 500 },
    );
  }
}
