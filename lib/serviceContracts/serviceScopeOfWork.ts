/**
 * Service Proposal scope of services (Natalia 2026-07-30: "service PROPOSAL
 * need sow, notes").
 *
 * On the 2026-07-30 service-estimator call the scope was defined for us:
 *   Natalia — "we always have to have customer, location, term, payment terms,
 *              and attachment scope of services … we just need a place here to
 *              put a scope."
 *   Alexis  — "scope of work is just based on what these line items are."
 *   Krissy  — "scope is a lot simpler on services than it is projects."
 *
 * So the default scope is derived from the fee schedule the proposal already
 * carries — one bullet per client-facing service line, in sheet order — rather
 * than asking the author to retype what they just priced. It stays fully
 * editable per instance; the moment someone edits it, their text wins.
 *
 * No pricing is restated here. The fee table is the single place money appears.
 */

export interface ServiceScopeOfWorkInput {
  /** Venue the services are performed at, when known. */
  venueName?: string | null;
  /** Client-facing service line labels, in sheet order. */
  lineLabels?: string[] | null;
}

export interface ServiceScopeOfWork {
  lead: string;
  items: string[];
}

/**
 * Returns null when there is nothing to describe yet (no priced lines) so the
 * section can stay hidden rather than render an empty promise to a client.
 */
export function buildServiceScopeOfWork(input: ServiceScopeOfWorkInput): ServiceScopeOfWork | null {
  const items = (input.lineLabels ?? [])
    .map((label) => (label ?? "").toString().trim())
    .filter(Boolean)
    // A sheet can repeat a label across option tabs; the scope reads once.
    .filter((label, i, all) => all.indexOf(label) === i);

  if (items.length === 0) return null;

  const venue = (input.venueName ?? "").toString().trim();
  const lead = venue
    ? `ANC will provide the following services at ${venue} for the duration of the Term:`
    : `ANC will provide the following services for the duration of the Term:`;

  return { lead, items };
}

/** Plain text — for the editor's default body and the DOCX path. */
export function serviceScopeOfWorkText(input: ServiceScopeOfWorkInput): string {
  const scope = buildServiceScopeOfWork(input);
  if (!scope) return "";
  return [scope.lead, ...scope.items.map((item) => `• ${item}`)].join("\n");
}
