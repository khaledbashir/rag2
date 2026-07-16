/**
 * GET /api/twenty-bridge/opportunity/{opportunityId}/estimate
 *
 * Bridge endpoint for the Twenty CRM AI assistant. Given a CRM opportunity,
 * returns the full estimate: per-display specs, LED cost breakdown, margins,
 * line items and product matches — so the assistant can surface the numbers in
 * chat and (optionally) sync them into Estimate/EstimateLine records.
 *
 * Numbers come from computeDisplays() — the SAME engine the Excel estimate
 * export runs — so chat, web and workbook always agree. This route deliberately
 * does NOT copy /api/rfp/pipeline/pricing-preview's math: that route reports
 * LED-Cost-Sheet-only totals at a hardcoded 15% margin. Here totalCost /
 * sellingPrice / margin are the authoritative full-estimate values.
 *
 * Resolution order (reported back as `source`):
 *   1. "rag2_analysis"  — RfpAnalysis.twentyOpportunityId matches. Richest
 *                         data: full extracted specs + product matching.
 *   2. "twenty_estimate"— Twenty Estimate.opportunityId matches. Uses the
 *                         estimate's own margin/union/bond settings.
 *   3. 404 + `candidates` — nothing linked. Rather than a bare miss, we return
 *      same-account analyses so the assistant can offer them for linking.
 *      Candidates are NEVER presented as this opportunity's estimate.
 *
 * UNITS: every *Pct field is a PERCENT (0-100), never a 0-1 fraction. Money is
 * a plain USD number. (The engine works in 0-1 internally; converted at the
 * boundary here so the API has one consistent convention.)
 *
 * Public (no rag2 auth), matching the other twenty-bridge routes: Twenty is an
 * ANC-internal tool and this is a narrow, read-only bridge.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateRateCardExcel } from "@/services/rfp/pipeline/generateRateCardExcel";
import { generateScopingWorkbook } from "@/services/rfp/pipeline/generateScopingWorkbook";
import {
  DEFAULT_MARGINS,
  type ComputedDisplay,
  type FinancialOverrides,
} from "@/services/rfp/pipeline/computeDisplayCosts";
import type {
  ExtractedLEDSpec,
  ExtractedProjectInfo,
} from "@/services/rfp/unified/types";
import { log } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TWENTY_BASE =
  process.env.TWENTY_API_URL || "https://abc-twenty.izcgmb.easypanel.host";
const TWENTY_API_KEY = process.env.TWENTY_API_KEY || "";

const round2 = (n: number) => Math.round(n * 100) / 100;
/** 0-1 fraction → percent (0-100), 2dp. */
const asPct = (fraction: number) => Math.round(fraction * 10000) / 100;

/** Error carrying the CRM's HTTP status so callers can tell 404 from 403/5xx. */
class TwentyError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function twentyFetch(path: string): Promise<any> {
  const res = await fetch(`${TWENTY_BASE}/rest/${path}`, {
    headers: {
      Authorization: `Bearer ${TWENTY_API_KEY}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new TwentyError(res.status, `Twenty ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

/** Twenty money object → plain USD number. */
function toUsd(currency: any): number {
  if (!currency || typeof currency.amountMicros !== "number") return 0;
  return currency.amountMicros / 1_000_000;
}

/**
 * `RfpAnalysis.screens` is polymorphic: the main pipeline writes canonical
 * ExtractedLEDSpec, while rows created by twenty-bridge/analyze-attachment
 * before 2026-07-17 wrote a reduced {name,widthFt,heightFt,pitchMm,quantity,sqFt}
 * shape. Normalize both so the cost engine always gets pixelPitchMm.
 */
function normalizeStoredSpec(
  raw: any,
  project: ExtractedProjectInfo,
): ExtractedLEDSpec {
  return {
    ...raw,
    name: raw.name || raw.location || "Display",
    widthFt: Number(raw.widthFt) || 0,
    heightFt: Number(raw.heightFt) || 0,
    pixelPitchMm: Number(raw.pixelPitchMm ?? raw.pitchMm ?? raw.pitch) || 0,
    quantity: Number(raw.quantity) || 1,
    environment:
      raw.environment || ((project as any)?.isOutdoor ? "outdoor" : "indoor"),
  } as ExtractedLEDSpec;
}

/** Twenty estimateLine → ExtractedLEDSpec. */
function lineToSpec(line: any, fallbackEnv: "indoor" | "outdoor"): ExtractedLEDSpec {
  const env =
    String(line.lineEnvironment || "").toUpperCase() === "OUTDOOR"
      ? "outdoor"
      : String(line.lineEnvironment || "").toUpperCase() === "INDOOR"
        ? "indoor"
        : fallbackEnv;
  return {
    name: line.displayName || line.name || "Unnamed",
    widthFt: Number(line.widthFt) || 0,
    heightFt: Number(line.heightFt) || 0,
    pixelPitchMm: Number(line.pitchMm) || 0,
    quantity: Number(line.quantity) || 1,
    environment: env,
    notes: line.lineNotes || undefined,
  } as ExtractedLEDSpec;
}

/**
 * Run the authoritative estimate engine over a set of specs.
 *
 * This is deliberately NOT a re-implementation: it makes the same two calls,
 * in the same order, with the same arguments, as the real analysis export
 * (app/api/rfp/pipeline/scoping-workbook/route.ts). generateScopingWorkbook
 * owns the product resolver, rate-card preload, dim snapping and margin
 * defaults internally — replicating any of that here is how the numbers
 * drift. The workbook buffer it builds as a side effect is discarded; the
 * few seconds that costs is the price of parity by construction.
 *
 * `overrides` is passed only by the twenty_estimate path (the estimate's own
 * blended margin governs). The rag2_analysis path passes none, exactly like
 * the export route, so engine defaults apply.
 */
async function priceSpecs(
  specs: ExtractedLEDSpec[],
  project: ExtractedProjectInfo,
  overrides?: FinancialOverrides,
): Promise<ComputedDisplay[]> {
  let pricedDisplays;
  try {
    const rateCardResult = await generateRateCardExcel({
      project,
      specs,
      quotes: [],
      zoneClass: "standard",
      installComplexity: "standard",
      includeBond: false,
    });
    pricedDisplays = rateCardResult.pricedDisplays;
  } catch {
    pricedDisplays = undefined;
  }

  const { displays } = await generateScopingWorkbook({
    project,
    specs,
    pricedDisplays,
    zoneClass: "standard",
    installComplexity: "standard",
    includeBond: false,
    ...(overrides ? { overrides } : {}),
  });
  return displays;
}

/** ComputedDisplay → the wire shape the CRM assistant reads. */
function serializeDisplay(cd: ComputedDisplay) {
  const m = cd.match;
  return {
    name: cd.spec.name,
    location: cd.spec.location ?? null,
    environment: cd.spec.environment ?? null,
    pixelPitchMm: cd.spec.pixelPitchMm ?? null,
    quantity: cd.spec.quantity ?? 1,
    widthFt: cd.widthFt,
    heightFt: cd.heightFt,
    areaSqFt: cd.areaSqFt,
    isTV: cd.isTV,
    costs: {
      ledHardware: cd.ledHardwareCost,
      spareParts: cd.sparePartsCost,
      structuralMaterials: cd.structuralMaterialsCost,
      structuralLabor: cd.structuralLaborCost,
      electrical: cd.electricalCost,
      projectManagement: cd.pmCost,
      engineering: cd.engCost,
      travel: cd.travelCost,
      sendingCard: cd.sendingCardCost,
      signalCable: cd.signalCableCost,
      ups: cd.upsCost,
      backupProcessor: cd.backupProcessorCost,
      weatherproofing: cd.weatherproofCost,
      shipping: cd.shippingCost,
      total: cd.totalCost,
    },
    sellingPrice: cd.sellingPrice,
    marginDollars: cd.marginDollars,
    marginPct: asPct(cd.marginPct),
    processor: { totalPixels: cd.totalPixels, portsNeeded: cd.portsNeeded },
    costSource: cd.priced?.costSource ?? "rate_card",
    leadTimeWeeks: cd.priced?.leadTimeWeeks ?? null,
    matchedProduct: m
      ? {
          manufacturer: m.module.manufacturer,
          model: m.module.name,
          modelNumber: m.module.modelNumber,
          pitchMm: m.module.pitch,
          nits: m.module.nits,
          cabinets: m.totalModules,
          cols: m.cols,
          rows: m.rows,
          activeWidthFt: m.activeWidthFt,
          activeHeightFt: m.activeHeightFt,
          resolutionX: m.resolutionX,
          resolutionY: m.resolutionY,
          fitScore: m.fitScore,
          confidence: m.confidence,
          totalWeightLbs: round2(m.module.weightKg * m.totalModules * 2.205),
          totalMaxPowerW: m.module.maxPowerWatts * m.totalModules,
        }
      : null,
  };
}

/**
 * CRM-ready EstimateLine payloads. Jireh's "optionally sync it into
 * Estimate/EstimateLine records" — we hand back the exact field names the
 * Twenty estimateLines REST object expects so the sync is a straight POST.
 * This route never writes; the caller decides.
 */
function toEstimateLines(computed: ComputedDisplay[]) {
  return computed.map((cd) => ({
    displayName: cd.spec.name,
    widthFt: cd.widthFt,
    heightFt: cd.heightFt,
    pitchMm: cd.spec.pixelPitchMm ?? 0,
    quantity: cd.spec.quantity ?? 1,
    totalSqFt: cd.areaSqFt,
    marginPct: asPct(cd.marginPct),
    lineEnvironment:
      String(cd.spec.environment || "").toLowerCase() === "outdoor"
        ? "OUTDOOR"
        : "INDOOR",
    lineNotes: cd.match
      ? `${cd.match.module.manufacturer} ${cd.match.module.name} — ${cd.match.totalModules} cabinets (fit ${cd.match.fitScore}%)`
      : "No catalog product match — rate-card pricing",
  }));
}

function summarize(computed: ComputedDisplay[]) {
  const totalCost = round2(computed.reduce((s, d) => s + d.totalCost, 0));
  const totalSellingPrice = round2(
    computed.reduce((s, d) => s + d.sellingPrice, 0),
  );
  const totalMarginDollars = round2(totalSellingPrice - totalCost);
  return {
    displayCount: computed.length,
    totalSqFt: round2(computed.reduce((s, d) => s + d.areaSqFt, 0)),
    totalCost,
    totalSellingPrice,
    totalMarginDollars,
    blendedMarginPct:
      totalSellingPrice > 0
        ? asPct(totalMarginDollars / totalSellingPrice)
        : 0,
    matchedCount: computed.filter((d) => d.match).length,
    unmatchedCount: computed.filter((d) => !d.match).length,
  };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ opportunityId: string }> },
) {
  const { opportunityId } = await params;

  if (!/^[0-9a-f-]{36}$/i.test(opportunityId || "")) {
    return NextResponse.json(
      { error: "opportunityId must be a Twenty opportunity UUID" },
      { status: 400 },
    );
  }

  if (!TWENTY_API_KEY) {
    log.error("[twenty-bridge/estimate] TWENTY_API_KEY is not configured");
    return NextResponse.json(
      {
        error: "CRM bridge is not configured",
        detail: "TWENTY_API_KEY is missing from the environment.",
      },
      { status: 503 },
    );
  }

  try {
    // ── Opportunity header (also validates the ID exists) ──────────────────
    // A CRM auth failure or outage must NOT be reported as "not found" — that
    // sends the caller hunting for a missing record instead of a broken token.
    let opportunity: any = null;
    try {
      const oppRes = await twentyFetch(
        `opportunities/${encodeURIComponent(opportunityId)}`,
      );
      opportunity = oppRes?.data?.opportunity ?? null;
    } catch (err: any) {
      const status = err instanceof TwentyError ? err.status : 0;
      if (status !== 404) {
        log.error(`[twenty-bridge/estimate] CRM unreachable: ${err?.message}`);
        return NextResponse.json(
          {
            error: "Could not reach the CRM to load this opportunity",
            detail: String(err?.message || err).slice(0, 300),
          },
          { status: 502 },
        );
      }
      log.warn(`[twenty-bridge/estimate] opportunity ${opportunityId} not found`);
    }
    if (!opportunity) {
      return NextResponse.json(
        { error: "Opportunity not found in the CRM", opportunityId },
        { status: 404 },
      );
    }

    let companyName: string | null = null;
    if (opportunity.companyId) {
      try {
        const c = await twentyFetch(
          `companies/${encodeURIComponent(opportunity.companyId)}`,
        );
        companyName = c?.data?.company?.name ?? null;
      } catch {
        /* non-fatal */
      }
    }

    const opportunityBlock = {
      id: opportunity.id,
      name: opportunity.name ?? null,
      stage: opportunity.stage ?? null,
      amount: toUsd(opportunity.amount) || null,
      closeDate: opportunity.closeDate ?? null,
      companyId: opportunity.companyId ?? null,
      companyName,
    };

    const warnings: string[] = [];

    // ── Source 1: linked rag2 RFP analysis ────────────────────────────────
    const analyses = await prisma.rfpAnalysis.findMany({
      where: { twentyOpportunityId: opportunityId, status: "complete" },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        projectName: true,
        clientName: true,
        venue: true,
        location: true,
        filename: true,
        screens: true,
        project: true,
        createdAt: true,
      },
    });

    const usable = analyses.filter(
      (a) => Array.isArray(a.screens) && (a.screens as any[]).length > 0,
    );

    if (usable.length > 0) {
      const analysis = usable[0];
      // One opportunity can carry several analyses (re-runs, v2 drafts). Newest
      // wins; the rest are advertised so the assistant can offer the others.
      if (usable.length > 1) {
        warnings.push(
          `${usable.length} analyses are linked to this opportunity; returning the most recent (${analysis.createdAt.toISOString().slice(0, 10)}). See \`alternates\`.`,
        );
      }

      const project = ((analysis.project as any) ||
        {}) as ExtractedProjectInfo;
      const specs = (analysis.screens as any[]).map((s) =>
        normalizeStoredSpec(s, project),
      );

      const noPitch = specs.filter((s) => !s.pixelPitchMm).length;
      if (noPitch > 0) {
        warnings.push(
          `${noPitch} display(s) have no pixel pitch on record — priced at the rate-card default for their size/environment.`,
        );
      }

      // No overrides — identical to the analysis Excel export route, so the
      // engine's flat default margin applies (Natalia, March 2026). Anything
      // passed here that the export doesn't pass is a parity break.
      const computed = await priceSpecs(specs, project);

      return NextResponse.json({
        opportunity: opportunityBlock,
        source: "rag2_analysis",
        sourceRecord: {
          analysisId: analysis.id,
          filename: analysis.filename,
          projectName: analysis.projectName,
          clientName: analysis.clientName,
          venue: analysis.venue,
          location: analysis.location,
          createdAt: analysis.createdAt,
          url: `https://proposals.anc.com/tools/rfp-analyzer?id=${analysis.id}`,
        },
        assumptions: {
          ledMarginPct: asPct(DEFAULT_MARGINS.ledHardware),
          servicesMarginPct: asPct(DEFAULT_MARGINS.ledHardware),
          isUnionLabor: false,
          bondRatePct: 0,
          installComplexity: "standard",
          note: "Estimate-export defaults — matches the scoping workbook download for this analysis. Override in the Estimator for a bid-ready number.",
        },
        displays: computed.map(serializeDisplay),
        summary: summarize(computed),
        estimateLines: toEstimateLines(computed),
        alternates: usable.slice(1).map((a) => ({
          analysisId: a.id,
          projectName: a.projectName,
          screenCount: (a.screens as any[]).length,
          createdAt: a.createdAt,
        })),
        warnings,
      });
    }

    // ── Source 2: a Twenty Estimate linked to this opportunity ────────────
    const estRes = await twentyFetch(
      `estimates?filter=opportunityId[eq]:${opportunityId}&order_by=createdAt[DescNullsFirst]&limit=5`,
    );
    const estimates: any[] = estRes?.data?.estimates || [];

    if (estimates.length > 0) {
      const estimate = estimates[0];
      const lineRes = await twentyFetch(
        `estimateLines?filter=estimateId[eq]:${estimate.id}&limit=200`,
      );
      const lines: any[] = lineRes?.data?.estimateLines || [];

      if (lines.length === 0) {
        return NextResponse.json(
          {
            opportunity: opportunityBlock,
            error: "The linked estimate has no line items",
            hint: "Add line items to the estimate in the CRM, or attach an RFP to the opportunity so the Proposal Engine can extract the displays.",
            estimateId: estimate.id,
            estimateName: estimate.name,
          },
          { status: 422 },
        );
      }

      const env: "indoor" | "outdoor" =
        String(estimate.indoorOutdoor || "").toUpperCase() === "OUTDOOR"
          ? "outdoor"
          : "indoor";
      const project = {
        projectName: estimate.projectName || estimate.name || "",
        clientName: estimate.clientName || companyName || "",
        venue: estimate.venueName || "",
        location: "",
        isOutdoor: env === "outdoor",
        isUnionLabor: Boolean(estimate.isUnionLabor),
      } as ExtractedProjectInfo;

      if (estimates.length > 1) {
        warnings.push(
          `${estimates.length} estimates are linked to this opportunity; returning the most recent.`,
        );
      }

      const sourceRecord = {
        estimateId: estimate.id,
        estimateName: estimate.name,
        estimateStatus: estimate.estimateStatus,
        estimateType: estimate.estimateType,
        projectName: estimate.projectName,
        clientName: estimate.clientName,
        venue: estimate.venueName,
        createdAt: estimate.createdAt,
      };

      // The CRM's own stored totals. Whatever the LED engine thinks, these are
      // the numbers the estimate record shows in the CRM today — the assistant
      // needs both to answer honestly.
      const crmTotals = {
        totalCost: toUsd(estimate.totalCost) || null,
        totalSell: toUsd(estimate.totalSell) || null,
        totalProfit: toUsd(estimate.totalProfit) || null,
        hardwareCost: toUsd(estimate.hardwareCost) || null,
        hardwareSell: toUsd(estimate.hardwareSell) || null,
        bondAmount: toUsd(estimate.bondAmount) || null,
        blendedMarginPct:
          estimate.blendedMargin != null ? Number(estimate.blendedMargin) : null,
      };

      // Only lines with real display dimensions can go through the LED cost
      // engine. Estimates also model service contracts and allocations (e.g.
      // "8-Year Service Fee") — running those through per-sqft LED pricing
      // produces minimum-fee garbage that would get quoted in chat.
      const displayLines = lines.filter(
        (l) => Number(l.widthFt) > 0 && Number(l.heightFt) > 0,
      );
      const nonDisplayLines = lines.filter(
        (l) => !(Number(l.widthFt) > 0 && Number(l.heightFt) > 0),
      );

      const lineItems = lines.map((l) => ({
        displayName: l.displayName || l.name || "Line item",
        widthFt: Number(l.widthFt) || null,
        heightFt: Number(l.heightFt) || null,
        pitchMm: Number(l.pitchMm) || null,
        quantity: Number(l.quantity) || 1,
        totalSqFt: Number(l.totalSqFt) || null,
        marginPct: Number(l.marginPct) || null,
        notes: l.lineNotes || null,
      }));

      if (displayLines.length === 0) {
        // Services/allocation estimate — report the CRM's stored numbers, don't
        // fabricate LED costs.
        warnings.push(
          "The estimate's line items carry no display dimensions (services/allocation estimate). Totals are the CRM's stored values; no LED cost breakdown applies.",
        );
        return NextResponse.json({
          opportunity: opportunityBlock,
          source: "twenty_estimate",
          sourceRecord,
          assumptions: null,
          displays: [],
          lineItems,
          crmTotals,
          summary: {
            displayCount: 0,
            totalSqFt: 0,
            totalCost: crmTotals.totalCost ?? 0,
            totalSellingPrice: crmTotals.totalSell ?? 0,
            totalMarginDollars:
              crmTotals.totalProfit ??
              round2((crmTotals.totalSell ?? 0) - (crmTotals.totalCost ?? 0)),
            blendedMarginPct: crmTotals.blendedMarginPct ?? 0,
            matchedCount: 0,
            unmatchedCount: 0,
          },
          estimateLines: [],
          alternates: [],
          warnings,
        });
      }

      const specs = displayLines.map((l) => lineToSpec(l, env));

      // The estimate's own margin governs — it's what the CRM already shows.
      const blended =
        Number(estimate.blendedMargin) > 0
          ? Number(estimate.blendedMargin) / 100
          : DEFAULT_MARGINS.ledHardware;
      const overrides: FinancialOverrides = {
        ledMarginPct: blended,
        servicesMarginPct: blended,
        isUnionLabor: Boolean(estimate.isUnionLabor),
        bondRate: toUsd(estimate.bondAmount) > 0 ? 0.015 : 0,
      };

      const computed = await priceSpecs(specs, project, overrides);

      if (nonDisplayLines.length > 0) {
        warnings.push(
          `${nonDisplayLines.length} line item(s) without display dimensions were excluded from the LED cost breakdown (see lineItems for the full list).`,
        );
      }
      warnings.push(
        "Priced from CRM estimate line items. Attach the RFP to the opportunity for full extracted specs and product matching.",
      );
      const engineSummary = summarize(computed);
      if (
        crmTotals.totalSell &&
        engineSummary.totalSellingPrice > 0 &&
        Math.abs(engineSummary.totalSellingPrice - crmTotals.totalSell) /
          crmTotals.totalSell >
          0.1
      ) {
        warnings.push(
          "Engine-computed totals differ from the estimate's stored CRM totals by more than 10% — compare summary vs crmTotals before quoting.",
        );
      }

      return NextResponse.json({
        opportunity: opportunityBlock,
        source: "twenty_estimate",
        sourceRecord,
        assumptions: {
          ledMarginPct: asPct(overrides.ledMarginPct!),
          servicesMarginPct: asPct(overrides.servicesMarginPct!),
          isUnionLabor: overrides.isUnionLabor,
          bondRatePct: asPct(overrides.bondRate ?? 0),
          installComplexity: "standard",
          note: "Margin taken from the estimate's blended margin.",
        },
        displays: computed.map(serializeDisplay),
        lineItems,
        crmTotals,
        summary: engineSummary,
        estimateLines: toEstimateLines(computed),
        alternates: [],
        warnings,
      });
    }

    // ── Nothing linked: offer same-account candidates rather than a bare miss ──
    const needle = (companyName || opportunity.name || "").trim();
    let candidates: any[] = [];
    if (needle.length >= 3) {
      const found = await prisma.rfpAnalysis.findMany({
        where: {
          status: "complete",
          twentyOpportunityId: null,
          OR: [
            { clientName: { contains: needle, mode: "insensitive" } },
            { venue: { contains: needle, mode: "insensitive" } },
            { projectName: { contains: needle, mode: "insensitive" } },
          ],
        },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          projectName: true,
          clientName: true,
          venue: true,
          screens: true,
          createdAt: true,
        },
      });
      candidates = found.map((a) => ({
        analysisId: a.id,
        projectName: a.projectName,
        clientName: a.clientName,
        venue: a.venue,
        screenCount: Array.isArray(a.screens) ? (a.screens as any[]).length : 0,
        createdAt: a.createdAt,
        url: `https://proposals.anc.com/tools/rfp-analyzer?id=${a.id}`,
      }));
    }

    return NextResponse.json(
      {
        opportunity: opportunityBlock,
        error: "No estimate is linked to this opportunity",
        hint: candidates.length
          ? "No estimate is linked yet. `candidates` lists unlinked analyses matching this account — these are SUGGESTIONS, not this opportunity's estimate. Confirm one before using its numbers."
          : "Attach the RFP to the opportunity (the Proposal Engine extracts displays and links automatically), or build an estimate in the CRM.",
        candidates,
      },
      { status: 404 },
    );
  } catch (err: any) {
    log.error("[twenty-bridge/opportunity-estimate]", err?.message || err);
    return NextResponse.json(
      {
        error: "Failed to build the estimate for this opportunity",
        detail: String(err?.message || err).slice(0, 500),
      },
      { status: 500 },
    );
  }
}
