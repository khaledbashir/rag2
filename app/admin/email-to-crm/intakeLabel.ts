/**
 * What to call an intake row in the review queue.
 *
 * A pasted email has no subject line, so every manual entry read "(no subject)"
 * and the queue gave no way to tell one row from another. Fall back to what the
 * extraction understood the email to be about, then to the opening line of the
 * body itself.
 */
export interface IntakeLabelSource {
  subject?: string | null;
  rawBody: string;
  extraction?: { projectName?: string | null; clientOrVenue?: string | null } | null;
}

const MAX_SNIPPET = 90;

export function intakeLabel(row: IntakeLabelSource): string {
  const subject = row.subject?.trim();
  if (subject) return subject;

  const project = row.extraction?.projectName?.trim();
  const venue = row.extraction?.clientOrVenue?.trim();
  if (project && venue) return `${venue} — ${project}`;
  if (project || venue) return (project || venue) as string;

  const firstLine = (row.rawBody || "")
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  if (firstLine) {
    return firstLine.length > MAX_SNIPPET ? `${firstLine.slice(0, MAX_SNIPPET)}…` : firstLine;
  }

  return "(no subject)";
}
