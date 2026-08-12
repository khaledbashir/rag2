/**
 * Spell out screen specs on the LED hardware line of a client-facing document.
 *
 * Natalia Kovaleva, 2026-08-12, attaching the Huntington Bank Field proposal
 * next to the Cleveland workbook it came from: "for client facing docs, sales
 * guys prefer that i spell out screen specs, not just say display hardware how
 * LED has it".
 *
 * A Margin Analysis tab labels the first line of every display block
 * "LED Hardware". That is the right label for an internal cost sheet and the
 * wrong one for a document a client reads — it says nothing about the screen
 * being bought. Natalia has been retyping each of those rows by hand (24 of
 * them on Cleveland alone) into the shape below, taken verbatim off her PDF:
 *
 *     Team Tunnel LED - 9.97' x 29.53' - 1.25mm - QTY 1
 *
 * The specs already arrive with the import: the same workbook carries an LED
 * Cost Sheet, and the Intelligence parser turns it into `screens` with the
 * name, height, width, pitch and quantity of every display. So the line can be
 * written for her.
 *
 * Her own document mixes "QTY n" with "Total n" on the two rows whose names
 * enumerate several displays ("Displays 3,6,8"). That is a judgement call per
 * row, not a rule, so this writes the dominant form — "QTY n" — on every line
 * and leaves the wording editable.
 *
 * The mirrored label is never thrown away: it moves to `sourceDescription`, so
 * Mirror Mode can still show exactly what the workbook said.
 */
import type { PricingDocument, PricingLineItem, PricingTable } from "@/types/pricing";

/** A screen as the Intelligence parser (`parseANCExcel`) emits it. */
export interface DisplaySpecSource {
  name?: string;
  heightFt?: number | string;
  widthFt?: number | string;
  pitchMm?: number | string;
  quantity?: number | string;
}

/**
 * The LED hardware row as a Margin Analysis tab labels it. Indentation is
 * already stripped by the row parser; the optional suffix covers the estimator's
 * "LED Hardware (1.25mm)" wording.
 */
const LED_HARDWARE_LABEL = /^led\s*hardware\b/i;

/** Feet to two decimals, the precision Natalia's document uses. */
function feet(value: number | string | undefined): string | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return `${n.toFixed(2)}'`;
}

/**
 * Pitch in mm, two decimals with trailing zeros dropped: 1.25 stays "1.25",
 * 10 stays "10", and the 10.4167 an outdoor product reports becomes "10.42".
 */
function pitch(value: number | string | undefined): string | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  const fixed = n.toFixed(2).replace(/\.?0+$/, "");
  return `${fixed}mm`;
}

/**
 * Build the spelled-out line for one display. Returns null when the screen
 * carries no name — without one there is nothing to spell out and the mirrored
 * label is the better answer.
 */
export function formatDisplaySpecDescription(screen: DisplaySpecSource): string | null {
  const name = String(screen.name ?? "").trim();
  if (!name) return null;

  const parts: string[] = [name];

  const h = feet(screen.heightFt);
  const w = feet(screen.widthFt);
  if (h && w) parts.push(`${h} x ${w}`);

  const p = pitch(screen.pitchMm);
  if (p) parts.push(p);

  const qty = Number(screen.quantity);
  parts.push(`QTY ${Number.isFinite(qty) && qty > 0 ? Math.round(qty) : 1}`);

  return parts.join(" - ");
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "").trim();

/**
 * Find the screen a pricing table describes.
 *
 * Exact name match first. The loose containment match that the import route
 * uses to backfill groups is kept as a fallback, but only when it lands on a
 * single screen — on a workbook full of "Bowl Entrance Ribbon (Display 1..7)"
 * an ambiguous match would spell out the wrong screen's dimensions, which is
 * worse than leaving the mirrored label alone.
 */
function matchScreen(table: PricingTable, screens: DisplaySpecSource[]): DisplaySpecSource | null {
  const tName = norm(table.name || "");
  if (!tName) return null;

  const exact = screens.filter((s) => norm(String(s.name ?? "")) === tName);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return null;

  const loose = screens.filter((s) => {
    const sName = norm(String(s.name ?? ""));
    return sName.length > 0 && (sName.includes(tName) || tName.includes(sName));
  });
  return loose.length === 1 ? loose[0] : null;
}

export interface DisplaySpecRewrite {
  table: string;
  from: string;
  to: string;
}

/**
 * Rewrite the LED hardware line of every display table in place, and report
 * what changed so the import can log it.
 *
 * Only the first LED hardware row of a table is touched: a table has one, and
 * stopping there keeps a workbook that lists hardware twice from being rewritten
 * into two identical lines.
 */
export function applyDisplaySpecDescriptions(
  pricingDocument: Pick<PricingDocument, "tables"> | null | undefined,
  screens: DisplaySpecSource[] | null | undefined,
): DisplaySpecRewrite[] {
  const rewrites: DisplaySpecRewrite[] = [];
  if (!pricingDocument?.tables?.length || !screens?.length) return rewrites;

  for (const table of pricingDocument.tables) {
    const screen = matchScreen(table, screens);
    if (!screen) continue;

    const spelled = formatDisplaySpecDescription(screen);
    if (!spelled) continue;

    const item = (table.items || []).find(
      (i: PricingLineItem) => LED_HARDWARE_LABEL.test(String(i.description ?? "").trim()),
    );
    if (!item) continue;

    const original = String(item.description ?? "").trim();
    if (original === spelled) continue;

    item.sourceDescription = item.sourceDescription ?? original;
    item.description = spelled;
    rewrites.push({ table: table.name, from: original, to: spelled });
  }

  return rewrites;
}
