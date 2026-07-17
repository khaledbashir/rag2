import type {
  ServiceEstimatorInput,
  ServiceEstimatorResult,
  ServiceEstimatorYearResult,
} from "./types";

const roundMoney = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

const growthFactor = (percent: number, yearIndex: number): number =>
  Math.pow(1 + percent / 100, yearIndex);

export function buildContractYearLabel(startYear: number, yearIndex: number): string {
  const first = String((startYear + yearIndex) % 100).padStart(2, "0");
  const second = String((startYear + yearIndex + 1) % 100).padStart(2, "0");
  return `${first}/${second}`;
}

export function calculateServiceEstimate(input: ServiceEstimatorInput): ServiceEstimatorResult {
  const totalCapex = roundMoney(input.capex.reduce((sum, item) => sum + item.amount, 0));
  let cumulativeCash = 0;

  const years: ServiceEstimatorYearResult[] = Array.from(
    { length: input.termYears },
    (_, yearIndex) => {
      const revenueFactor = growthFactor(input.revenueEscalationPct, yearIndex);
      const costFactor = growthFactor(input.costEscalationPct, yearIndex);

      const eventLines = input.events.map((event) => ({
        id: event.id,
        name: event.name,
        revenue: roundMoney(event.days * event.technicians * event.clientDayRate * revenueFactor),
        cost: roundMoney(event.days * event.technicians * event.technicianDayCost * costFactor),
      }));

      const breakFixBaseCost = input.breakFix.enabled
        ? input.breakFix.days *
          input.breakFix.technicians *
          input.breakFix.hoursPerDay *
          input.breakFix.technicianHourlyCost
        : 0;
      const breakFixCost = roundMoney(breakFixBaseCost * costFactor);
      const breakFixRevenue = roundMoney(
        input.breakFix.enabled
          ? breakFixBaseCost * input.breakFix.priceMultiplier * revenueFactor
          : 0,
      );

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

export const PANTHERS_SERVICE_REFERENCE: ServiceEstimatorInput = {
  clientName: "Carolina Panthers",
  venueName: "Bank of America Stadium",
  location: "Charlotte, NC",
  contractStart: "2026",
  contractEnd: "2028",
  paymentTerms: "Six equal monthly installments per Contract Year",
  currency: "USD",
  termStartYear: 2026,
  termYears: 2,
  revenueEscalationPct: 0,
  costEscalationPct: 0,
  bundleDiscountMode: "included-in-rates",
  bundleDiscountPct: 20,
  events: [
    {
      id: "pre-event-support",
      name: "Pre Event Hardware Support",
      days: 26.5,
      technicians: 2,
      clientDayRate: 850,
      technicianDayCost: 280,
    },
    {
      id: "secondary-event-support",
      name: "MLS Event Hardware Support",
      days: 15.5,
      technicians: 2,
      clientDayRate: 850,
      technicianDayCost: 280,
    },
    {
      id: "primary-event-support",
      name: "Panthers Event Hardware Support",
      days: 11,
      technicians: 3,
      clientDayRate: 850,
      technicianDayCost: 280,
    },
  ],
  breakFix: {
    enabled: true,
    label: "Break/Fix Hardware Maintenance",
    days: 104,
    technicians: 2,
    hoursPerDay: 8,
    technicianHourlyCost: 35,
    priceMultiplier: 1.62,
  },
  capex: [],
  marketingOpportunityValue: 0,
  marketingSharePct: 20,
};
