export type ServiceEstimatorCurrency = "USD" | "CAD" | "GBP" | "EUR";

export type BundleDiscountMode =
  | "none"
  | "included-in-rates"
  | "apply-to-subtotal";

export interface ServiceEventInput {
  id: string;
  name: string;
  days: number;
  technicians: number;
  clientDayRate: number;
  technicianDayCost: number;
}

export interface ServiceBreakFixInput {
  enabled: boolean;
  label: string;
  days: number;
  technicians: number;
  hoursPerDay: number;
  technicianHourlyCost: number;
  priceMultiplier: number;
}

export interface ServiceCapexInput {
  id: string;
  name: string;
  amount: number;
  usefulLifeYears: number;
}

export interface ServiceEstimatorInput {
  clientName: string;
  venueName: string;
  location: string;
  contractStart: string;
  contractEnd: string;
  paymentTerms: string;
  currency: ServiceEstimatorCurrency;
  termStartYear: number;
  termYears: number;
  revenueEscalationPct: number;
  costEscalationPct: number;
  bundleDiscountMode: BundleDiscountMode;
  bundleDiscountPct: number;
  events: ServiceEventInput[];
  breakFix: ServiceBreakFixInput;
  capex: ServiceCapexInput[];
  marketingOpportunityValue: number;
  marketingSharePct: number;
}

export interface ServiceEventYearResult {
  id: string;
  name: string;
  revenue: number;
  cost: number;
}

export interface ServiceEstimatorYearResult {
  yearIndex: number;
  yearLabel: string;
  eventLines: ServiceEventYearResult[];
  breakFixRevenue: number;
  breakFixCost: number;
  grossServiceIncome: number;
  bundleDiscountAmount: number;
  totalIncome: number;
  operatingExpenses: number;
  ebitda: number;
  depreciation: number;
  netProfit: number;
  returnPct: number;
  marketingRevenueShare: number;
  totalProfit: number;
  cashCapex: number;
  cashExpense: number;
  netCash: number;
  cumulativeCash: number;
}

export interface ServiceEstimatorResult {
  yearLabels: string[];
  years: ServiceEstimatorYearResult[];
  totalCapex: number;
  totalContractIncome: number;
  totalContractOperatingExpenses: number;
  totalContractProfit: number;
}
