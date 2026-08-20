/**
 * Is this sheet already wearing ANC branding?
 *
 * Branding a PDF is not idempotent — every call adds another mark. That is fine
 * and invisible right up until someone brands a document twice, at which point a
 * client-facing drawing goes out carrying two ANC marks.
 *
 * On 2026-08-21 exactly that happened, and the second mark was not the problem.
 * An earlier assistant session had hand-drawn its own ANC wordmark onto an OKC
 * Thunder LED drawing in the sandbox — typeset letters with a red rule under
 * them, the invented mark the `anc-brand` skill exists to forbid. That file was
 * then handed back with "apply the brand here". The renderer did its job, put
 * the real wordmark in the title block, and returned a sheet carrying the real
 * mark AND the fake one. Nobody looked at the page, so it was reported as a
 * clean success.
 *
 * The renderer cannot un-draw someone else's mark, and it must not refuse the
 * job — a second stamp is sometimes exactly what is wanted. What it can do is
 * stop the caller from being surprised: read the text already on the sheet, and
 * if ANC branding is on it, say so as a warning the caller has to pass on.
 *
 * Text only, deliberately. Detecting drawn artwork is guesswork, and a guess
 * that cries wolf on every ANC drawing template is worse than no check. Every
 * marker below is literal text that ANC branding puts on a page.
 */
import { extractText, getDocumentProxy } from "unpdf";

/** Markers that mean "an ANC mark is already on this page". */
const MARKERS: { label: string; pattern: RegExp }[] = [
  // Our own footer, and the tail of most ANC-authored templates.
  { label: "www.anc.com", pattern: /www\.anc\.com/i },
  // What hand-rolled sandbox branding writes. The 2026-08-21 drawing had this.
  { label: "Prepared by ANC", pattern: /\bprepared\s+by\s+anc\b/i },
  // The house document template's sign-off.
  { label: "ANC Sports Enterprises", pattern: /\banc\s+sports\s+enterprises\b/i },
];

/** Reading more than this to answer a yes/no question is not worth the seconds. */
const MAX_PAGES_READ = 4;

export interface ExistingBranding {
  found: boolean;
  /** Marker labels actually seen, in the order listed above. */
  markers: string[];
  /** 1-based pages the markers were found on. */
  pages: number[];
  /** Set when the text could not be read at all — then `found` is false. */
  unreadable: string | null;
}

const NONE: ExistingBranding = { found: false, markers: [], pages: [], unreadable: null };

/**
 * Read the first few pages and report any ANC branding already on them.
 *
 * Never throws: a document whose text cannot be extracted reports `unreadable`
 * and `found: false`, because a failed read is not evidence of a clean sheet and
 * must not become a warning that says it is.
 */
export async function detectExistingBranding(
  input: Uint8Array | Buffer,
): Promise<ExistingBranding> {
  let pageTexts: string[];
  try {
    // A copy: pdf.js detaches the buffer it is handed, and these same bytes are
    // still needed by the ink pass and by pdf-lib afterwards.
    const pdf = await getDocumentProxy(new Uint8Array(input));
    const extracted = await extractText(pdf, { mergePages: false });
    pageTexts = (Array.isArray(extracted.text) ? extracted.text : [extracted.text]).map(
      (page) => page ?? "",
    );
  } catch (error) {
    return {
      ...NONE,
      unreadable: error instanceof Error ? error.message : String(error),
    };
  }

  const markers: string[] = [];
  const pages: number[] = [];

  pageTexts.slice(0, MAX_PAGES_READ).forEach((text, index) => {
    if (!text) return;
    let hitThisPage = false;
    for (const marker of MARKERS) {
      if (!marker.pattern.test(text)) continue;
      if (!markers.includes(marker.label)) markers.push(marker.label);
      hitThisPage = true;
    }
    if (hitThisPage) pages.push(index + 1);
  });

  return { found: markers.length > 0, markers, pages, unreadable: null };
}

/**
 * The sentence the caller should repeat. Deliberately says what was found and
 * what to do about it, rather than "already branded" — the caller has to be able
 * to tell an ANC drawing template's own footer from a mark someone stamped on.
 */
export function existingBrandingWarning(detected: ExistingBranding): string | null {
  if (!detected.found) return null;

  const where =
    detected.pages.length === 1 ? `page ${detected.pages[0]}` : `pages ${detected.pages.join(", ")}`;

  return `This document already carries ANC branding — found ${detected.markers
    .map((marker) => `"${marker}"`)
    .join(" and ")} on ${where}. It now has that mark and the one just added. Open the result before sending it, and if the existing mark was not put there by ANC's renderer, brand the unbranded original instead.`;
}
