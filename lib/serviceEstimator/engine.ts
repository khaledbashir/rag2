import type {
  ServiceBreakFixInput,
  ServiceEstimatorInput,
  ServiceEstimatorOption,
  ServiceEstimatorOptionResult,
  ServiceEstimatorResult,
  ServiceEstimatorYearResult,
  ServiceEventInput,
  ServiceFlatAmount,
} from "./types";
import { DEFAULT_SECTION_LABELS } from "./types";

const roundMoney = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

const growthFactor = (percent: number, yearIndex: number): number =>
  Math.pow(1 + percent / 100, yearIndex);

export function buildContractYearLabel(startYear: number, yearIndex: number): string {
  const first = String((startYear + yearIndex) % 100).padStart(2, "0");
  const second = String((startYear + yearIndex + 1) % 100).padStart(2, "0");
  return `${first}/${second}`;
}

/**
 * Resolve a typed per-year amount for a flat line.
 *
 * Typed values are taken literally — "type my number" means that number, not
 * that number with escalation quietly applied on top. Years beyond the typed
 * list repeat the last value, or escalate from it when the line opts in.
 * An empty list bills nothing.
 */
export function resolveFlatAmount(
  values: ServiceFlatAmount[],
  yearIndex: number,
  escalates: boolean,
  escalationPct: number,
): ServiceFlatAmount {
  if (values.length === 0) return 0;
  if (yearIndex < values.length) return values[yearIndex];

  const last = values[values.length - 1];
  if (last === "included") return "included";
  if (!escalates) return last;
  return roundMoney(last * growthFactor(escalationPct, yearIndex - (values.length - 1)));
}

/** A resolved amount as money: "Included" bills the client nothing. */
const amountToMoney = (amount: ServiceFlatAmount): number =>
  amount === "included" ? 0 : amount;

interface ResolvedLine {
  revenue: number;
  cost: number;
  included: boolean;
}

function resolveEventLine(
  event: ServiceEventInput,
  yearIndex: number,
  revenueFactor: number,
  costFactor: number,
  input: ServiceEstimatorInput,
): ResolvedLine {
  if (event.pricingMode === "flat") {
    const revenue = resolveFlatAmount(
      event.flatRevenue,
      yearIndex,
      event.flatEscalates,
      input.revenueEscalationPct,
    );
    const cost = resolveFlatAmount(
      event.flatCost,
      yearIndex,
      event.flatEscalates,
      input.costEscalationPct,
    );
    return {
      revenue: roundMoney(amountToMoney(revenue)),
      cost: roundMoney(amountToMoney(cost)),
      included: revenue === "included",
    };
  }

  return {
    revenue: roundMoney(event.days * event.technicians * event.clientDayRate * revenueFactor),
    cost: roundMoney(event.days * event.technicians * event.technicianDayCost * costFactor),
    included: false,
  };
}

function resolveBreakFix(
  breakFix: ServiceBreakFixInput,
  yearIndex: number,
  revenueFactor: number,
  costFactor: number,
  input: ServiceEstimatorInput,
): ResolvedLine {
  if (!breakFix.enabled) return { revenue: 0, cost: 0, included: false };

  if (breakFix.pricingMode === "flat") {
    const revenue = resolveFlatAmount(
      breakFix.flatRevenue,
      yearIndex,
      breakFix.flatEscalates,
      input.revenueEscalationPct,
    );
    const cost = resolveFlatAmount(
      breakFix.flatCost,
      yearIndex,
      breakFix.flatEscalates,
      input.costEscalationPct,
    );
    return {
      revenue: roundMoney(amountToMoney(revenue)),
      cost: roundMoney(amountToMoney(cost)),
      included: revenue === "included",
    };
  }

  const baseCost =
    breakFix.days * breakFix.technicians * breakFix.hoursPerDay * breakFix.technicianHourlyCost;
  return {
    revenue: roundMoney(baseCost * breakFix.priceMultiplier * revenueFactor),
    cost: roundMoney(baseCost * costFactor),
    included: false,
  };
}

/**
 * The priced options on an estimate. An estimate with no explicit options has
 * exactly one, built from the top-level service lines.
 */
export function listOptions(input: ServiceEstimatorInput): ServiceEstimatorOption[] {
  if (input.options && input.options.length > 0) return input.options;
  return [
    {
      id: "option-1",
      name: "Option 1",
      events: input.events,
      breakFix: input.breakFix,
    },
  ];
}

function calculateForLines(
  input: ServiceEstimatorInput,
  events: ServiceEventInput[],
  breakFix: ServiceBreakFixInput,
): ServiceEstimatorResult {
  const totalCapex = roundMoney(input.capex.reduce((sum, item) => sum + item.amount, 0));
  let cumulativeCash = 0;

  const years: ServiceEstimatorYearResult[] = Array.from(
    { length: input.termYears },
    (_, yearIndex) => {
      const revenueFactor = growthFactor(input.revenueEscalationPct, yearIndex);
      const costFactor = growthFactor(input.costEscalationPct, yearIndex);

      const eventLines = events.map((event) => {
        const resolved = resolveEventLine(event, yearIndex, revenueFactor, costFactor, input);
        return {
          id: event.id,
          name: event.name,
          revenue: resolved.revenue,
          cost: resolved.cost,
          included: resolved.included,
        };
      });

      const bf = resolveBreakFix(breakFix, yearIndex, revenueFactor, costFactor, input);
      const breakFixRevenue = bf.revenue;
      const breakFixCost = bf.cost;

      const grossServiceIncome = roundMoney(
        eventLines.reduce((sum, line) => sum + line.revenue, 0) + breakFixRevenue,
      );
      const bundleDiscountAmount = roundMoney(
        input.bundleDiscountMode === "apply-to-subtotal"
          ? grossServiceIncome * (input.bundleDiscountPct / 100)
          : 0,
      );
      const totalIncome = roundMoney(grossServiceIncome - bundleDiscountAmount);
      const operatingExpenses = roundMoney(
        eventLines.reduce((sum, line) => sum + line.cost, 0) + breakFixCost,
      );
      const ebitda = roundMoney(totalIncome - operatingExpenses);
      const depreciation = roundMoney(
        input.capex.reduce(
          (sum, item) =>
            sum + (yearIndex < item.usefulLifeYears ? item.amount / item.usefulLifeYears : 0),
          0,
        ),
      );
      const netProfit = roundMoney(ebitda - depreciation);
      const returnPct = totalIncome === 0 ? 0 : netProfit / totalIncome;
      const marketingRevenueShare = roundMoney(
        input.marketingOpportunityValue * (input.marketingSharePct / 100),
      );
      const totalProfit = roundMoney(netProfit + marketingRevenueShare);
      const cashCapex = yearIndex === 0 ? totalCapex : 0;
      const cashExpense = roundMoney(operatingExpenses + cashCapex);
      const netCash = roundMoney(totalIncome - cashExpense);
      cumulativeCash = roundMoney(cumulativeCash + netCash);

      return {
        yearIndex,
        yearLabel: buildContractYearLabel(input.termStartYear, yearIndex),
        eventLines,
        breakFixRevenue,
        breakFixCost,
        breakFixIncluded: bf.included,
        grossServiceIncome,
        bundleDiscountAmount,
        totalIncome,
        operatingExpenses,
        ebitda,
        depreciation,
        netProfit,
        returnPct,
        marketingRevenueShare,
        totalProfit,
        cashCapex,
        cashExpense,
        netCash,
        cumulativeCash,
      };
    },
  );

  return {
    yearLabels: years.map((year) => year.yearLabel),
    years,
    totalCapex,
    totalContractIncome: roundMoney(years.reduce((sum, year) => sum + year.totalIncome, 0)),
    totalContractOperatingExpenses: roundMoney(
      years.reduce((sum, year) => sum + year.operatingExpenses, 0),
    ),
    totalContractProfit: roundMoney(years.reduce((sum, year) => sum + year.totalProfit, 0)),
  };
}

/** The primary option's numbers — what the cover page and totals report. */
export function calculateServiceEstimate(input: ServiceEstimatorInput): ServiceEstimatorResult {
  const [primary] = listOptions(input);
  return calculateForLines(input, primary.events, primary.breakFix);
}

/** Every priced option, in author order. */
export function calculateServiceEstimateOptions(
  input: ServiceEstimatorInput,
): ServiceEstimatorOptionResult[] {
  return listOptions(input).map((option) => ({
    id: option.id,
    name: option.name,
    result: calculateForLines(input, option.events, option.breakFix),
  }));
}

/** A calculated service line with the flat fields left empty. */
function calculatedLine(
  line: Pick<ServiceEventInput, "id" | "name" | "days" | "technicians" | "clientDayRate" | "technicianDayCost">,
): ServiceEventInput {
  return {
    ...line,
    pricingMode: "calculated",
    flatRevenue: [],
    flatCost: [],
    flatEscalates: false,
  };
}

export const PANTHERS_SERVICE_REFERENCE: ServiceEstimatorInput = {
  clientName: "Carolina Panthers",
  venueName: "Bank of America Stadium",
  location: "Charlotte, NC",
  contractStart: "2026",
  contractEnd: "2028",
  paymentTerms: "Six equal monthly installments per Contract Year",
  scopeOfServices: "",
  currency: "USD",
  termStartYear: 2026,
  termYears: 2,
  revenueEscalationPct: 0,
  costEscalationPct: 0,
  bundleDiscountMode: "included-in-rates",
  bundleDiscountPct: 20,
  events: [
    calculatedLine({
      id: "pre-event-support",
      name: "Pre Event Hardware Support",
      days: 26.5,
      technicians: 2,
      clientDayRate: 850,
      technicianDayCost: 280,
    }),
    calculatedLine({
      id: "secondary-event-support",
      name: "MLS Event Hardware Support",
      days: 15.5,
      technicians: 2,
      clientDayRate: 850,
      technicianDayCost: 280,
    }),
    calculatedLine({
      id: "primary-event-support",
      name: "Panthers Event Hardware Support",
      days: 11,
      technicians: 3,
      clientDayRate: 850,
      technicianDayCost: 280,
    }),
  ],
  breakFix: {
    enabled: true,
    label: "Break/Fix Hardware Maintenance",
    pricingMode: "calculated",
    days: 104,
    technicians: 2,
    hoursPerDay: 8,
    technicianHourlyCost: 35,
    priceMultiplier: 1.62,
    flatRevenue: [],
    flatCost: [],
    flatEscalates: false,
  },
  options: [],
  capex: [],
  partsWarranty: { enabled: false, title: "Parts Warranty", columns: [], rows: [] },
  sectionLabels: { ...DEFAULT_SECTION_LABELS },
  marketingOpportunityValue: 0,
  marketingSharePct: 20,
};
