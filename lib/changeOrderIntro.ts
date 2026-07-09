/**
 * Change Order opening paragraph (Natalia 2026-07-09, "new intro for CO").
 *
 * Verbatim wording from her, with the blanks she left (`Change Order No. ___`,
 * `Agreement dated ________`) filled from project data when we have it and
 * rendered as fill-in-by-hand rules when we don't.
 *
 * Returned as segments rather than a string because the paragraph renders twice
 * — once as JSX in ProposalTemplate5 and once as an HTML string for jsreport.
 * They previously carried separate hardcoded copies of the old intro, which is
 * how the two drift apart. Both now build from this.
 */

export interface ChangeOrderIntroSegment {
  text: string;
  /** Party and project names are emphasized, matching the LOI intro's house style. */
  bold?: boolean;
}

export interface ChangeOrderIntroInput {
  changeOrderNumber?: string | null;
  /** Date of the ORIGINAL agreement being amended — not the change order's own date. */
  originalAgreementDate?: string | null;
  purchaserLegalName?: string | null;
  purchaserAddress?: string | null;
  projectName?: string | null;
}

const ANC_LEGAL_NAME = "ANC Sports Enterprises, LLC";
const ANC_ADDRESS = "2 Manhattanville Road, Suite 402, Purchase, NY 10577";

/** Fill-in rules, sized to the value they stand in for. */
const BLANK_NUMBER = "___";
const BLANK_DATE = "________";
const BLANK_ADDRESS = "____________";
const BLANK_PARTY = "____________";
const BLANK_PROJECT = "____";

function orBlank(value: string | null | undefined, blank: string): string {
  const v = (value ?? "").toString().trim();
  return v || blank;
}

export function buildChangeOrderIntroSegments(input: ChangeOrderIntroInput): ChangeOrderIntroSegment[] {
  const coNumber = orBlank(input.changeOrderNumber, BLANK_NUMBER);
  const agreementDate = orBlank(input.originalAgreementDate, BLANK_DATE);
  const purchaser = orBlank(input.purchaserLegalName, BLANK_PARTY);
  const address = orBlank(input.purchaserAddress, BLANK_ADDRESS);
  const project = orBlank(input.projectName, BLANK_PROJECT);

  return [
    { text: `This Change Order No. ${coNumber} modifies Agreement dated ${agreementDate} (the “Original Agreement”) by and between ` },
    { text: purchaser, bold: true },
    { text: ` (“Purchaser”) located at ${address}, and ` },
    { text: ANC_LEGAL_NAME, bold: true },
    { text: ` (“ANC”) located at ${ANC_ADDRESS} (collectively, the “Parties”). The Parties hereby agree to amend the scope of Work for the ` },
    { text: project, bold: true },
    { text: ` project as described below. This Change Order shall be incorporated into and become part of the Original Agreement. Except as expressly modified herein, all terms and conditions of the Original Agreement remain in full force and effect.` },
  ];
}

/** Plain text — for DOCX, tests, and anywhere markup would leak. */
export function changeOrderIntroText(input: ChangeOrderIntroInput): string {
  return buildChangeOrderIntroSegments(input).map((s) => s.text).join("");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** HTML string — for the jsreport render path. */
export function changeOrderIntroHtml(input: ChangeOrderIntroInput): string {
  return buildChangeOrderIntroSegments(input)
    .map((s) => (s.bold ? `<strong style="color:black">${escapeHtml(s.text)}</strong>` : escapeHtml(s.text)))
    .join("");
}
