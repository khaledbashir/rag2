/**
 * POST /api/estimator/convert
 *
 * Converts an ESTIMATE project to a full INTELLIGENCE mode proposal.
 * Calculates all display costs, builds a pricingDocument with proper
 * tables/line-items/totals, populates ScreenConfig + CostLineItem rows,
 * and sets client info, currency, document mode, payment terms.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { log } from "@/lib/logger";
import { logActivity } from "@/services/proposal/server/activityLogService";

// ── Cost constants (match EstimatorBridge.ts exactly) ──────────────────────

const DEFAULT_COST_PER_SQFT: Record<string, number> = {
  "1.2": 430, "1.5": 380, "1.875": 350, "2.5": 335, "3.9": 250,
  "4": 220, "6": 180, "10": 120, "16": 80,
};

const STEEL_RATES: Record<string, number> = {
  simple: 25, standard: 35, complex: 55, heavy: 75,
};

const LED_INSTALL_RATES: Record<string, number> = {
  simple: 75, standard: 105, complex: 145, heavy: 145,
};

const STRUCTURE_PCT: Record<string, number> = {
  "Front/Rear": 0.20, "Top": 0.10,
};

// ── Types ──────────────────────────────────────────────────────────────────

interface DisplayCalc {
  name: string;
  widthFt: number;
  heightFt: number;
  areaSqFt: number;
  pixelPitch: number;
  hardwareCost: number;
  structureCost: number;
  installCost: number;
  electricalCost: number;
  equipmentCost: number;
  pmCost: number;
  engineeringCost: number;
  shippingCost: number;
  totalCost: number;
  sellPrice: number;
  bondCost: number;
  salesTaxCost: number;
  finalTotal: number;
  marginPct: number;
}

// ── Calculate one display (server-side mirror of EstimatorBridge) ──────────

function calcDisplay(d: Record<string, any>, answers: Record<string, any>): DisplayCalc {
  const w = Number(d.widthFt) || 0;
  const h = Number(d.heightFt) || 0;
  const area = w * h;
  const pitch = parseFloat(d.pixelPitch) || 4;
  const override = Number(answers.costPerSqFtOverride);
  const costPerSqFt = override > 0
    ? override
    : DEFAULT_COST_PER_SQFT[d.pixelPitch] || 120;

  const hardwareBase = area * costPerSqFt;
  const spareParts = d.includeSpareParts ? hardwareBase * 0.05 : 0;
  const hardware = hardwareBase + spareParts;

  const steelScope = d.steelScope || "full";
  const structPct = d.useExistingStructure ? 0.05
    : steelScope === "existing" ? 0.05
    : steelScope === "secondary" ? 0.12
    : (STRUCTURE_PCT[d.serviceType] || 0.20);
  const structureCost = hardware * structPct;

  const estimatedWeightLbs = area * 0.0929 * 45;
  const steelRate = STEEL_RATES[d.installComplexity] || 35;
  const ledInstallRate = LED_INSTALL_RATES[d.installComplexity] || 105;
  const installCost = (estimatedWeightLbs * steelRate) + (area * ledInstallRate);

  const elecBase = area * 125;
  const powerMult = (d.powerDistance || "near") === "near" ? 1.0
    : (d.powerDistance === "medium" ? 1.3 : 1.8);
  const electricalCost = elecBase * powerMult;

  const liftType = d.liftType || "scissor";
  const equipmentCost = liftType === "none" ? 0
    : liftType === "scissor" ? 500
    : liftType === "boom" ? 1500
    : 5000;

  const pmComplexity = answers.pmComplexity || "standard";
  const pmMult = pmComplexity === "standard" ? 1 : pmComplexity === "complex" ? 2 : 3;
  const pmCost = 5882.35 * pmMult;
  const engineeringCost = 4705.88 * pmMult;
  const rawShippingCost = area > 0 ? round2(area * 10) : 0;
  const shippingCost = rawShippingCost > 0 ? Math.max(rawShippingCost, 500) : 0;

  const unionMult = answers.isUnion ? 1.15 : 1.0;
  const adjInstall = installCost * unionMult;
  const adjStructure = structureCost * unionMult;
  const adjElectrical = electricalCost * unionMult;

  const serviceCost = adjStructure + adjInstall + adjElectrical
    + equipmentCost + pmCost + engineeringCost + shippingCost;
  const totalCost = hardware + serviceCost;

  const ledMarginPct = (answers.ledMargin ?? answers.defaultMargin ?? 15) / 100;
  const svcMarginPct = (answers.servicesMargin ?? 20) / 100;
  const hardwareSell = hardware / (1 - ledMarginPct);
  const servicesSell = serviceCost / (1 - svcMarginPct);
  const sellPrice = hardwareSell + servicesSell;
  const marginPct = totalCost > 0 ? 1 - (totalCost / sellPrice) : 0;

  const bondRate = (answers.bondRate ?? 1.5) / 100;
  const bondCost = sellPrice * bondRate;
  const taxRate = (answers.salesTaxRate ?? 9.5) / 100;
  const salesTaxCost = (sellPrice + bondCost) * taxRate;
  const finalTotal = sellPrice + bondCost + salesTaxCost;

  return {
    name: d.displayName || "Unnamed Display",
    widthFt: w, heightFt: h, areaSqFt: area, pixelPitch: pitch,
    hardwareCost: hardware, structureCost: adjStructure,
    installCost: adjInstall, electricalCost: adjElectrical,
    equipmentCost, pmCost, engineeringCost, shippingCost,
    totalCost, sellPrice, bondCost, salesTaxCost, finalTotal, marginPct,
  };
}

// ── Route handler ──────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { projectId } = body;

    if (!projectId) {
      return NextResponse.json({ error: "projectId is required" }, { status: 400 });
    }

    const project = await prisma.proposal.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Allow re-conversion if the project has estimator answers (even if already converted)
    if (project.calculationMode !== "ESTIMATE" && !project.estimatorAnswers) {
      return NextResponse.json(
        { error: "Only ESTIMATE projects can be converted" },
        { status: 400 },
      );
    }

    // ── Extract estimator data ─────────────────────────────────────────

    const answers: Record<string, any> = (project.estimatorAnswers as Record<string, any>) || {};
    const displays: Record<string, any>[] = Array.isArray(answers.displays) ? answers.displays : [];

    if (displays.length === 0) {
      return NextResponse.json(
        { error: "No displays found in estimate. Add at least one display before converting." },
        { status: 400 },
      );
    }

    // ── Calculate each display ─────────────────────────────────────────

    const calcs = displays.map((d) => calcDisplay(d, answers));

    const projectTotal = calcs.reduce((s, c) => s + c.finalTotal, 0);
    const projectSellPrice = calcs.reduce((s, c) => s + c.sellPrice, 0);
    const projectBond = calcs.reduce((s, c) => s + c.bondCost, 0);
    const projectTax = calcs.reduce((s, c) => s + c.salesTaxCost, 0);

    // ── Build pricingDocument ──────────────────────────────────────────

    const currency = answers.currency || "USD";
    const docTypeMap: Record<string, string> = {
      budget: "BUDGET", proposal: "PROPOSAL", loi: "LOI",
    };
    const documentMode = docTypeMap[answers.docType] || "BUDGET";

    // One pricing table per display + a summary table
    const displayTables = calcs.map((c, idx) => ({
      id: `table-display-${idx}`,
      name: c.name,
      currency,
      items: [
        { description: `LED Hardware (${c.pixelPitch}mm)`, sellingPrice: round2(c.hardwareCost / (1 - (answers.ledMargin ?? answers.defaultMargin ?? 15) / 100)), isIncluded: false },
        { description: "Structural Steel", sellingPrice: round2(c.structureCost / (1 - (answers.servicesMargin ?? 20) / 100)), isIncluded: false },
        { description: "LED Installation", sellingPrice: round2(c.installCost / (1 - (answers.servicesMargin ?? 20) / 100)), isIncluded: false },
        { description: "Electrical", sellingPrice: round2(c.electricalCost / (1 - (answers.servicesMargin ?? 20) / 100)), isIncluded: false },
        ...(c.equipmentCost > 0 ? [{ description: "Equipment Rental", sellingPrice: round2(c.equipmentCost / (1 - (answers.servicesMargin ?? 20) / 100)), isIncluded: false }] : []),
        { description: "Project Management", sellingPrice: round2(c.pmCost / (1 - (answers.servicesMargin ?? 20) / 100)), isIncluded: false },
        { description: "Engineering", sellingPrice: round2(c.engineeringCost / (1 - (answers.servicesMargin ?? 20) / 100)), isIncluded: false },
        { description: "Shipping & Logistics", sellingPrice: round2(c.shippingCost / (1 - (answers.servicesMargin ?? 20) / 100)), isIncluded: false },
      ],
      alternates: [],
      subtotal: round2(c.sellPrice),
      tax: {
        label: `Tax ${answers.salesTaxRate ?? 9.5}%`,
        rate: (answers.salesTaxRate ?? 9.5) / 100,
        amount: round2(c.salesTaxCost),
      },
      bond: round2(c.bondCost),
      tariff: 0,
      grandTotal: round2(c.finalTotal),
    }));

    // Master summary table (index 0 = this table)
    const summaryTable = {
      id: "table-0-project-grand-total",
      name: "Project Grand Total",
      currency,
      items: calcs.map((c) => ({
        description: `${c.name}\n${c.widthFt}' × ${c.heightFt}' · ${c.pixelPitch}mm pitch`,
        sellingPrice: round2(c.finalTotal),
        isIncluded: false,
      })),
      alternates: [],
      subtotal: round2(projectSellPrice),
      tax: {
        label: `Tax ${answers.salesTaxRate ?? 9.5}%`,
        rate: (answers.salesTaxRate ?? 9.5) / 100,
        amount: round2(projectTax),
      },
      bond: round2(projectBond),
      tariff: 0,
      grandTotal: round2(projectTotal),
    };

    const pricingDocument = {
      tables: [summaryTable, ...displayTables],
      mode: "CALCULATED",
      sourceSheet: "Estimator",
      currency,
      documentTotal: round2(projectTotal),
      metadata: {
        importedAt: new Date().toISOString(),
        fileName: `Estimator_${answers.projectName || "Estimate"}`,
        tablesCount: displayTables.length + 1,
        itemsCount: displayTables.reduce((s, t) => s + t.items.length, 0) + calcs.length,
        alternatesCount: 0,
      },
    };

    // ── Build internalAudit ────────────────────────────────────────────

    const perScreen = calcs.map((c, idx) => ({
      id: `screen-${idx}`,
      name: c.name,
      areaSqFt: round2(c.areaSqFt),
      breakdown: {
        hardware: round2(c.hardwareCost),
        structure: round2(c.structureCost),
        install: round2(c.installCost),
        labor: round2(c.installCost),
        power: round2(c.electricalCost),
        shipping: round2(c.shippingCost),
        pm: round2(c.pmCost),
        generalConditions: round2(c.engineeringCost),
        cms: 0,
        ancMargin: round2(c.sellPrice - c.totalCost),
        sellPrice: round2(c.sellPrice),
        bondCost: round2(c.bondCost),
        totalCost: round2(c.totalCost),
        finalClientTotal: round2(c.finalTotal),
        sellingPricePerSqFt: c.areaSqFt > 0 ? round2(c.sellPrice / c.areaSqFt) : 0,
      },
    }));

    const totals = {
      hardware: round2(calcs.reduce((s, c) => s + c.hardwareCost, 0)),
      structure: round2(calcs.reduce((s, c) => s + c.structureCost, 0)),
      install: round2(calcs.reduce((s, c) => s + c.installCost, 0)),
      labor: round2(calcs.reduce((s, c) => s + c.installCost, 0)),
      power: round2(calcs.reduce((s, c) => s + c.electricalCost, 0)),
      shipping: round2(calcs.reduce((s, c) => s + c.shippingCost, 0)),
      pm: round2(calcs.reduce((s, c) => s + c.pmCost, 0)),
      generalConditions: round2(calcs.reduce((s, c) => s + c.engineeringCost, 0)),
      cms: 0,
      ancMargin: round2(calcs.reduce((s, c) => s + (c.sellPrice - c.totalCost), 0)),
      sellPrice: round2(projectSellPrice),
      bondCost: round2(projectBond),
      totalCost: round2(calcs.reduce((s, c) => s + c.totalCost, 0)),
      finalClientTotal: round2(projectTotal),
    };

    const internalAudit = JSON.stringify({ perScreen, totals });

    // ── Payment terms ──────────────────────────────────────────────────

    const paymentTerms = "50% upon execution of Agreement\n40% upon Mobilization to Project Site\n10% upon Substantial Completion";

    // ── Update Proposal ────────────────────────────────────────────────

    const updated = await prisma.proposal.update({
      where: { id: projectId },
      data: {
        calculationMode: "INTELLIGENCE",
        estimatorDepth: answers.estimateDepth || "rom",
        clientName: answers.clientName || project.clientName || "Client",
        venue: answers.projectName || project.venue || null,
        documentMode: documentMode as "BUDGET" | "PROPOSAL" | "LOI" | "CONTRACT",
        pricingDocument,
        pricingMode: "STANDARD",
        mirrorMode: false,
        masterTableIndex: 0,
        internalAudit,
        paymentTerms: project.paymentTerms || paymentTerms,
        taxRateOverride: (answers.salesTaxRate ?? 9.5) / 100,
        bondRateOverride: (answers.bondRate ?? 1.5) / 100,
      },
    });

    // ── Create ScreenConfig + CostLineItem entries ─────────────────────

    // Delete any existing screens (in case of re-conversion)
    await prisma.screenConfig.deleteMany({ where: { proposalId: projectId } });

    for (let i = 0; i < displays.length; i++) {
      const d = displays[i];
      const c = calcs[i];
      const svcMarginPct = (answers.servicesMargin ?? 20) / 100;
      const ledMarginPct = (answers.ledMargin ?? answers.defaultMargin ?? 15) / 100;

      const screen = await prisma.screenConfig.create({
        data: {
          proposalId: projectId,
          name: c.name,
          pixelPitch: c.pixelPitch,
          width: c.widthFt,
          height: c.heightFt,
          serviceType: d.serviceType || "Front/Rear",
          quantity: 1,
          manufacturerProductId: d.productId || undefined,
        },
      });

      // Create cost line items for this screen
      const lineItems = [
        { category: "LED Hardware", cost: c.hardwareCost, margin: ledMarginPct, price: c.hardwareCost / (1 - ledMarginPct) },
        { category: "Structural Steel", cost: c.structureCost, margin: svcMarginPct, price: c.structureCost / (1 - svcMarginPct) },
        { category: "LED Installation", cost: c.installCost, margin: svcMarginPct, price: c.installCost / (1 - svcMarginPct) },
        { category: "Electrical", cost: c.electricalCost, margin: svcMarginPct, price: c.electricalCost / (1 - svcMarginPct) },
        { category: "Project Management", cost: c.pmCost, margin: svcMarginPct, price: c.pmCost / (1 - svcMarginPct) },
        { category: "Engineering", cost: c.engineeringCost, margin: svcMarginPct, price: c.engineeringCost / (1 - svcMarginPct) },
        { category: "Shipping", cost: c.shippingCost, margin: svcMarginPct, price: c.shippingCost / (1 - svcMarginPct) },
      ];

      if (c.equipmentCost > 0) {
        lineItems.push({
          category: "Equipment Rental",
          cost: c.equipmentCost,
          margin: svcMarginPct,
          price: c.equipmentCost / (1 - svcMarginPct),
        });
      }

      await prisma.costLineItem.createMany({
        data: lineItems.map((li) => ({
          screenConfigId: screen.id,
          category: li.category,
          cost: round2(li.cost),
          margin: round2(li.margin * 100),
          price: round2(li.price),
        })),
      });
    }

    await logActivity(projectId, "converted", `Converted estimate to proposal with ${displays.length} displays`, null);

    return NextResponse.json({
      success: true,
      projectId: updated.id,
      screensCreated: displays.length,
      documentTotal: round2(projectTotal),
    });
  } catch (error) {
    log.error("POST /api/estimator/convert error:", error);
    return NextResponse.json({ error: "Conversion failed" }, { status: 500 });
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
