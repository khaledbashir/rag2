/**
 * Payment Terms text handling.
 *
 * A line break is a line break; a comma is punctuation. The PDF renderer used to
 * split this field on commas as well as newlines, which shattered real payment-terms
 * prose into one fragment per clause and broke currency figures apart — "$40,000.00"
 * came out as "$40" / "000.00" on separate lines. Natalia, AAC service contract,
 * 2026-07-28.
 */

/**
 * Split typed payment terms into display lines.
 *
 * Splits on newlines only. Leading and trailing blank lines are dropped; interior
 * blank lines are preserved so the author can space paragraphs apart.
 */
export function splitPaymentTermsLines(raw: string): string[] {
  const lines = (raw ?? "").split(/\r?\n/).map((line) => line.trim());

  while (lines.length > 0 && lines[0] === "") lines.shift();
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();

  return lines;
}
