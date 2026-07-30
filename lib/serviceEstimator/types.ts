export type ServiceEstimatorCurrency = "USD" | "CAD" | "GBP" | "EUR";

export type BundleDiscountMode =
  | "none"
  | "included-in-rates"
  | "apply-to-subtotal";

/**
 * How a service line is priced (Natalia + Alexis, 2026-07-30 call).
 *
 * Natalia: "every single line item here has to have just like a check mark to
 * say type my number, and then instead of all the calculation, I just want to
 * put like a number."
 *
 * "calculated" is the days x technicians x rate model. "flat" takes the number
 * the author types, per contract year, and performs no arithmetic on it — which
 * is how ANC actually prices LiveSync licences, tech support, parts warranty
 * (copied from the project cost sheet) and white-glove staffing.
 */
export type ServiceLinePricingMode = "calculated" | "flat";

/**
 * A typed year amount. `"included"` means the line is covered by the project
 * for that year — Alexis: "we have stuff like labeled as included in the
 * project … and we need to be able to show that too". It bills the client
 * nothing while ANC's cost for that year still counts against margin.
 */
export type ServiceFlatAmount = number | "included";

export interface ServiceEventInput {
  id: string;
  name: string;
  /** Defaults to "calculated" so existing saved estimates are unchanged. */
  pricingMode: ServiceLinePricingMode;
  // ---- calculated inputs ----
  days: number;
  technicians: number;
  clientDayRate: number;
  technicianDayCost: number;
  // ---- flat inputs: one entry per contract year ----
  flatRevenue: ServiceFlatAmount[];
  /** Expense rows use "Included" too — Fifth Third Park bills no parts-warranty cost in year 1. */
  flatCost: ServiceFlatAmount[];
  /**
   * When a flat line supplies fewer entries than there are contract years, the
   * remaining years escalate from the last typed value instead of repeating it.
   * Off by default: a typed number means that number.
   */
  flatEscalates: boolean;
}

export interface ServiceBreakFixInput {
  enabled: boolean;
  label: string;
  pricingMode: ServiceLinePricingMode;
  days: number;
  technicians: number;
  hoursPerDay: number;
  technicianHourlyCost: number;
  priceMultiplier: number;
  flatRevenue: ServiceFlatAmount[];
  /** Expense rows use "Included" too — Fifth Third Park bills no parts-warranty cost in year 1. */
  flatCost: ServiceFlatAmount[];
  flatEscalates: boolean;
}

export interface ServiceCapexInput {
  id: string;
  name: string;
  amount: number;
  usefulLifeYears: number;
}

/**
 * A priced alternative inside ONE estimate — Alexis: "a lot of the stuff we do
 * needs options … an option for having event support versus an option without",
 * which Natalia settled as "one estimate with the alternatives" rather than two
 * separate estimates. Mirrors the Option 1 / Option 2 tabs in the Fifth Third
 * Park workbook: the cover-page facts are shared, the service lines vary.
 */
export interface ServiceEstimatorOption {
  id: string;
  name: string;
  events: ServiceEventInput[];
  breakFix: ServiceBreakFixInput;
}

/** Editable section headings — "all of these need to be customized. The headings." */
export interface ServiceSectionLabels {
  eventSupport: string;
  breakFix: string;
  capex: string;
  clientSchedule: string;
  internalModel: string;
  operatingExpenses: string;
}

export const DEFAULT_SECTION_LABELS: ServiceSectionLabels = {
  eventSupport: "Event Support Inputs",
  breakFix: "Break/Fix Inputs",
  capex: "Capital Expenditure Inputs",
  clientSchedule: "Client Fee Schedule",
  internalModel: "Internal Financial Model",
  // Krissy, 2026-07-30: "Can you add a heading on line 24, like to say
  // operating expenses or something, just so that everyone knows" — the
  // boundary between the client-facing block and the internal model.
  operatingExpenses: "Operating Expenses",
};

/**
 * Parts warranty schedule — copied from the project cost sheet, never
 * calculated. Alexis: "I have the parts warranty outlined on the last page …
 * this I literally copied and pasted out of the cost sheet from the project."
 */
export interface ServicePartsWarrantyRow {
  id: string;
  label: string;
  values: ServiceFlatAmount[];
}

export interface ServicePartsWarrantySchedule {
  enabled: boolean;
  title: string;
  columns: string[];
  rows: ServicePartsWarrantyRow[];
}

export interface ServiceEstimatorInput {
  clientName: string;
  venueName: string;
  location: string;
  contractStart: string;
  contractEnd: string;
  paymentTerms: string;
  /** Scope of services for the cover page — Natalia: "we just need a place here to put a scope". */
  scopeOfServices: string;
  currency: ServiceEstimatorCurrency;
  termStartYear: number;
  termYears: number;
  revenueEscalationPct: number;
  costEscalationPct: number;
  bundleDiscountMode: BundleDiscountMode;
  bundleDiscountPct: number;
  /** Service lines for the primary option. Kept for back-compatibility. */
  events: ServiceEventInput[];
  breakFix: ServiceBreakFixInput;
  /**
   * Priced alternatives. The first entry is the primary option and mirrors
   * `events`/`breakFix`; an empty array means this estimate has one option.
   */
  options: ServiceEstimatorOption[];
  capex: ServiceCapexInput[];
  partsWarranty: ServicePartsWarrantySchedule;
  sectionLabels: ServiceSectionLabels;
  marketingOpportunityValue: number;
  marketingSharePct: number;
}

export interface ServiceEventYearResult {
  id: string;
  name: string;
  revenue: number;
  cost: number;
  /** True when the client-facing value is "Included" rather than a number. */
  included: boolean;
}

export interface ServiceEstimatorYearResult {
  yearIndex: number;
  yearLabel: string;
  eventLines: ServiceEventYearResult[];
  breakFixRevenue: number;
  breakFixCost: number;
  breakFixIncluded: boolean;
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

/** One priced option's numbers, alongside the option it came from. */
export interface ServiceEstimatorOptionResult {
  id: string;
  name: string;
  result: ServiceEstimatorResult;
}
