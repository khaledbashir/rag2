/**
 * Short Form Agreement (LOI) opening paragraph — Natalia 2026-07-30:
 * "replace short form agreement intro to default to these".
 *
 * Her wording verbatim, taken from the Los Angeles Dodgers / Dodger Stadium
 * example she sent. Only the purchaser name and address vary; every clause —
 * the "preliminary understanding" framing, the purpose sentence, and the
 * binding-until-superseded sentence — is fixed legal text and must not be
 * reworded.
 *
 * This replaces the old one-sentence intro ("This Short Form Agreement sets
 * forth the terms by which … agree that ANC will provide the display system
 * and related services described below for the <project>").
 *
 * Segments rather than a string because the paragraph renders twice — as JSX in
 * ProposalTemplate5 and as an HTML string for jsreport — and the two used to
 * carry separate hardcoded copies, which is how they drift. Same contract as
 * lib/changeOrderIntro.ts.
 *
 * Scope: LOI mode only. Short Form CONTRACT keeps its own wording.
 */

export interface LoiIntroSegment {
  text: string;
  /** Party names are emphasized, matching the LOI/CO house style. */
  bold?: boolean;
}

export interface LoiIntroInput {
  purchaserLegalName?: string | null;
  purchaserAddress?: string | null;
}

const ANC_LEGAL_NAME = "ANC Sports Enterprises, LLC";
const ANC_ADDRESS = "2 Manhattanville Road, Suite 402, Purchase, NY 10577";

/** Fill-in rules, sized to the value they stand in for. */
const BLANK_PARTY = "____________";
const BLANK_ADDRESS = "____________";

function orBlank(value: string | null | undefined, blank: string): string {
  const v = (value ?? "").toString().trim();
  return v || blank;
}

export function buildLoiIntroSegments(input: LoiIntroInput): LoiIntroSegment[] {
  const purchaser = orBlank(input.purchaserLegalName, BLANK_PARTY);
  const address = orBlank(input.purchaserAddress, BLANK_ADDRESS);

  return [
    { text: `This Letter of Intent (“LOI”) sets forth the preliminary understanding and the terms by which ` },
    { text: purchaser, bold: true },
    { text: ` (“Purchaser”), located at ${address}, and ` },
    { text: ANC_LEGAL_NAME, bold: true },
    {
      text:
        ` (“ANC”), located at ${ANC_ADDRESS} (collectively, the “Parties”), intend to proceed with the proposed ` +
        `transaction described herein. The purpose of this LOI is to outline the principal terms and conditions under ` +
        `which the Parties intend to negotiate and enter into a mutually acceptable definitive agreement. Unless ` +
        `otherwise agreed to in writing by both Parties, this LOI shall be binding upon execution and shall remain in ` +
        `effect until it is superseded by a fully executed definitive agreement.`,
    },
  ];
}

/** Plain text — for DOCX, the editor's "load default", tests. */
export function loiIntroText(input: LoiIntroInput): string {
  return buildLoiIntroSegments(input).map((s) => s.text).join("");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** HTML string — for the jsreport render path. */
export function loiIntroHtml(input: LoiIntroInput): string {
  return buildLoiIntroSegments(input)
    .map((s) => (s.bold ? `<strong style="color:black">${escapeHtml(s.text)}</strong>` : escapeHtml(s.text)))
    .join("");
}
