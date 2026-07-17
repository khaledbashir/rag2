/**
 * Service Proposal intro builder.
 *
 * Produces the three-paragraph intro Natalia specified (2026-07-14), modeled
 * verbatim on the Ravens / M&T Bank Stadium service proposal:
 *
 *   ANC Sports Enterprises, LLC ("ANC"), located at 2 Manhattanville Road,
 *   Purchase, NY 10577, is pleased to submit this service proposal to
 *   <Purchaser> ("Purchaser"), located at <address>, for the <Stadium> LED
 *   display network. …
 *
 * Values we can recognize from the workbook or setup panel (client, stadium,
 * city, league, term years) are filled in. Unknown values render as neutral
 * blanks so client-facing output never exposes template tokens.
 */

export interface ServiceProposalIntroValues {
  purchaserName?: string | null;
  purchaserAddress?: string | null;
  venueName?: string | null;
  /** "Charlotte, North Carolina" — derived from the venue address when known. */
  venueCity?: string | null;
  /** Team that plays at the venue (often the same as purchaserName). */
  teamName?: string | null;
  /** League label, e.g. "NFL" — drives "home to the … NFL franchise" prose. */
  league?: string | null;
  termYears?: number | null;
  /** Term start/end, as precise as known ("August 1, 2026" or "2026"). */
  termStart?: string | null;
  termEnd?: string | null;
}

const NUMBER_WORDS = [
  "zero", "one", "two", "three", "four", "five",
  "six", "seven", "eight", "nine", "ten",
];

const STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri",
  MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio",
  OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont",
  VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
  DC: "Washington, D.C.", ON: "Ontario",
};

export function numberWord(n: number): string {
  return NUMBER_WORDS[n] ?? String(n);
}

/** "800 S Mint St, Charlotte, NC 28202" → "Charlotte, North Carolina". */
export function cityStateFromAddress(address: string | null | undefined): string | null {
  if (!address) return null;
  const parts = address.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const city = parts[parts.length - 2];
  const stateZip = parts[parts.length - 1];
  const stateCode = (stateZip.match(/^([A-Z]{2})\b/) || [])[1];
  if (!city) return null;
  const stateName = stateCode ? STATE_NAMES[stateCode] : null;
  return stateName ? `${city}, ${stateName}` : city;
}

const INLINE_BLANK = "________";

const val = (v: string | null | undefined): string =>
  v && v.trim() ? v.trim() : INLINE_BLANK;

export function extractYear(value: string | null | undefined): number | null {
  const match = (value || "").match(/\b(19|20)\d{2}\b/);
  return match ? Number(match[0]) : null;
}

export function deriveTermYears(values: Pick<ServiceProposalIntroValues, "termYears" | "termStart" | "termEnd">): number | null {
  if (values.termYears && values.termYears > 0) return values.termYears;
  const startYear = extractYear(values.termStart);
  const endYear = extractYear(values.termEnd);
  if (!startYear || !endYear || endYear < startYear) return null;
  return Math.max(1, endYear - startYear);
}

/**
 * Build the default Service Proposal intro paragraphs. Unknown values render
 * as neutral blanks the user fills in the setup panel or intro editor.
 */
export function buildServiceProposalIntro(values: ServiceProposalIntroValues): string[] {
  const purchaser = val(values.purchaserName);
  const venue = val(values.venueName);
  const team = (values.teamName && values.teamName.trim()) || purchaser;

  const purchaserLocated = values.purchaserAddress && values.purchaserAddress.trim()
    ? `, located at ${values.purchaserAddress.trim()},`
    : ",";

  const p1 =
    `ANC Sports Enterprises, LLC (“ANC”), located at 2 Manhattanville Road, Purchase, NY 10577, ` +
    `is pleased to submit this service proposal to ${purchaser} (“Purchaser”)${purchaserLocated} ` +
    `for the ${venue} LED display network.`;

  const cityClause = values.venueCity && values.venueCity.trim()
    ? ` located in ${values.venueCity.trim()},`
    : "";
  const franchiseClause = values.league && values.league.trim()
    ? `which is home to the ${team} ${values.league.trim()} franchise and hosts various ${values.league.trim()} games and other events.`
    : `which is home to the ${team} and hosts various professional games and other events.`;

  const p2 =
    `This proposal covers service work to be performed at ${venue} (the “Stadium”), ` +
    `the sports and entertainment facility${cityClause} ${franchiseClause}`;

  const years = deriveTermYears(values);
  const yearsText = years ? `${numberWord(years)} (${years}) year` : `${INLINE_BLANK} year`;
  const termStart = val(values.termStart);
  const termEnd = val(values.termEnd);

  const p3 =
    `This proposal covers a ${yearsText} initial term commencing ${termStart} ` +
    `through ${termEnd} (the “Term”).`;

  return [p1, p2, p3];
}
