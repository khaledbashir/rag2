/**
 * NX Yaham rate card parser.
 *
 * Natalia sends this workbook every few months — 02.16.26, 04.15.26, 04.28.26,
 * now 08.01.26 — in two flavours: "ANC" (what Yaham charges ANC direct) and
 * "LGEUS" (the same panels bought through LG USA, who add a distribution
 * markup). Each one has previously been retyped by hand into a `prisma/seed-*.ts`
 * file. That is why the catalog drifted: the estimator's own `led_cost.*` rates
 * still carried February numbers in August, and every SKU had to be transcribed
 * twice, once per flavour.
 *
 * This reads the workbook as it actually ships, so a new card is an upload
 * rather than a transcription.
 *
 * ── Layout ────────────────────────────────────────────────────────────────
 * The sheet is transposed: one COLUMN per orderable panel, one ROW per spec.
 * Two sheets, "NX Outdoor Sport" and "NX Indoor Sport". A stack of merged
 * header rows names each column, and a block near the bottom prices it.
 *
 *            D          E          F          G
 *   r4    R2.5-MIP     R4 ─────────────────────┐   ← model (merged across variants)
 *   r5    Radiance     Radiance ───────────────┘   ← product line
 *   r6    FIXED INSTALLATION ...                   ← application (outdoor only)
 *   r7    2.5mm        3.90625mm ...               ← pixel pitch
 *   r8    NationStar   NationStar NationStar Sinyopto  ← LED supplier
 *   …
 *   r56   526.52       207.27     309.27     213.49    ← MSP/SQFT exwork
 *
 * Nothing here is addressed by a fixed row number. The LGEUS card carries an
 * extra "Mark Up" row that shifts every row beneath it, and the indoor and
 * outdoor sheets already disagree by one. Rows are found by their label text in
 * columns A–C; header rows are located relative to the "Update on …" row, which
 * is the one row that reliably doubles as the LED-supplier row.
 *
 * ── What varies between cards ─────────────────────────────────────────────
 * The variant axis is not stable, so SKUs are derived from whatever the current
 * card actually distinguishes rather than from a fixed list. On the 04.28.26
 * card an outdoor model came in two brightnesses (10000 / 7500 nits, both
 * NationStar). On 08.01.26 the dim option is gone and the pair is instead two
 * LED suppliers at one brightness. Indoors, a 1G/5G transmission axis appeared
 * and a `MIP` package option was added alongside `SMD Black`.
 *
 * So: group the columns by model label, work out which of {supplier, pixel
 * configuration, brightness} actually differ inside that group, and suffix only
 * those. A model offered one way gets a bare SKU. This keeps the existing
 * `-HB` / `-MIP` names landing on the rows they already describe.
 *
 * ── One thing in the sheet that is wrong ──────────────────────────────────
 * The "Cabinet Width - FT" / "Cabinet Height - FT" rows convert metres with a
 * 0.294 divisor instead of 0.3048, so a 1000mm cabinet reads 3.40ft (should be
 * 3.28ft) and a 480mm one reads 1.63ft (should be 1.57ft). Those rows are
 * display-only — every price is derived from `Cabinet Surface Area(㎡)`, which
 * is correct — so cabinet size is taken from module dimension × module count
 * instead, and the discrepancy is reported as a warning.
 */
import * as XLSX from "xlsx";

// ── Types ────────────────────────────────────────────────────────────────────

export type NxVariant = "ANC" | "LGEUS";
export type NxEnvironment = "indoor" | "outdoor";

export interface NxRateCardProduct {
  /** Card-derived identity, no manufacturer prefix — e.g. `R6-SY`, `C4-MIP-HB`. */
  sku: string;
  modelLabel: string;
  productLine: string | null;
  application: string | null;
  environment: NxEnvironment;

  pixelPitchMm: number;
  ledManufacturer: string | null;
  pixelConfiguration: string | null;
  ledPackage: string | null;

  moduleWidthMm: number | null;
  moduleHeightMm: number | null;
  modulesPerCabinetW: number | null;
  modulesPerCabinetH: number | null;
  cabinetWidthMm: number | null;
  cabinetHeightMm: number | null;
  cabinetAreaSqm: number | null;

  weightKgPerCabinet: number | null;
  maxNits: number | null;
  maxPowerWattsPerCab: number | null;
  typicalPowerWattsPerCab: number | null;
  refreshRate: number | null;
  ipRatingFront: string | null;
  ipRatingRear: string | null;
  serviceAccess: string | null;

  /** Yaham ex-works, before any distribution markup. Always present. */
  exworkPerSqft: number;
  /**
   * What this card says the panel costs the buyer: the markup row on an LGEUS
   * card, the ex-works row on an ANC card. This is the number that becomes
   * `costPerSqFt`.
   */
  pricePerSqft: number;
  pricePerPanel: number | null;
  pricePerSqm: number | null;
  /** Non-standard cabinet size — the card runs a flat +10% on `pricePerSqft`. */
  customPerSqft: number | null;
  vesselShippingPerSqft: number | null;

  sourceSheet: string;
  sourceColumn: string;
}

export interface NxRateCard {
  variant: NxVariant;
  /** Distribution markup read off the label text, e.g. 0.38. Null on ANC cards. */
  markupPct: number | null;
  /** "Update on 2026/07/22" → `2026/07/22`. */
  updatedOn: string | null;
  sourceFile: string;
  products: NxRateCardProduct[];
  warnings: string[];
}

// ── Cell helpers ─────────────────────────────────────────────────────────────

interface Grid {
  sheet: XLSX.WorkSheet;
  maxRow: number;
  maxCol: number;
  merges: XLSX.Range[];
}

function toGrid(sheet: XLSX.WorkSheet): Grid {
  const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1");
  return {
    sheet,
    maxRow: range.e.r,
    maxCol: range.e.c,
    merges: (sheet["!merges"] ?? []) as XLSX.Range[],
  };
}

/** Raw cell value — does NOT follow merges. Used for row labels. */
function raw(g: Grid, r: number, c: number): unknown {
  const cell = g.sheet[XLSX.utils.encode_cell({ r, c })];
  return cell ? cell.v : undefined;
}

/** Cell value following merges, so a column inherits its merged header. */
function merged(g: Grid, r: number, c: number): unknown {
  for (const m of g.merges) {
    if (r >= m.s.r && r <= m.e.r && c >= m.s.c && c <= m.e.c) {
      return raw(g, m.s.r, m.s.c);
    }
  }
  return raw(g, r, c);
}

function text(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/\s+/g, " ").trim();
  return s.length > 0 ? s : null;
}

function num(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    // "10,000 nits" / "≥5000" / "3000cd/m²" all appear in these sheets.
    const m = v.replace(/,/g, "").match(/-?\d+(\.\d+)?/);
    if (m) {
      const n = parseFloat(m[0]);
      return Number.isFinite(n) ? n : null;
    }
  }
  return null;
}

/**
 * A row's label, taken from the last non-empty of columns A–C. Column B often
 * holds a section heading merged down many rows ("Physical Parameters"), and
 * column C the parameter itself ("Pixel Configuration") — the parameter wins.
 * Read raw so the merged section heading does not leak onto every row.
 */
function rowLabel(g: Grid, r: number): string | null {
  let label: string | null = null;
  for (let c = 0; c <= Math.min(2, g.maxCol); c++) {
    const t = text(raw(g, r, c));
    if (t) label = t;
  }
  return label;
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/** First row whose label satisfies `pred`. */
function findRow(g: Grid, pred: (label: string) => boolean): number | null {
  for (let r = 0; r <= g.maxRow; r++) {
    const l = rowLabel(g, r);
    if (l && pred(norm(l))) return r;
  }
  return null;
}

const startsWith = (prefix: string) => (l: string) => l.startsWith(prefix);
const contains = (needle: string) => (l: string) => l.includes(needle);

// ── Header block ─────────────────────────────────────────────────────────────

interface HeaderRows {
  model: number;
  line: number | null;
  application: number | null;
  pitch: number;
  ledManufacturer: number;
}

/**
 * How the card writes an application: "FIXED INSTALLATION", "STADIUM PERIMETER",
 * "STADIUM FASCIA/ RIBBON". Anchored at the start on purpose — a looser test for
 * "fascia" also matches the product line "Halo - Fascia" one row above, which
 * shifts the whole header stack up by one and makes every indoor column read its
 * model as "Smart module".
 */
const APPLICATION_RE = /^(fixed installation|stadium)/i;

/**
 * Locate the header stack.
 *
 * The "Update on …" cell sits in column B of the LED-supplier row, which is the
 * last header row before the spec block. Everything else is counted upward from
 * there: pitch, then (outdoor only) application, then product line, then model.
 * The application row is present on the outdoor sheet and absent on the indoor
 * one, so it is detected by its contents rather than assumed.
 */
function findHeaderRows(g: Grid, firstDataCol: number): HeaderRows | null {
  const updateRow = findRow(g, contains("update on"));
  if (updateRow === null || updateRow < 3) return null;

  const looksLikeApplication = (r: number): boolean => {
    if (r < 0) return false;
    let hits = 0;
    for (let c = firstDataCol; c <= g.maxCol; c++) {
      const t = text(merged(g, r, c));
      if (t && APPLICATION_RE.test(t)) hits++;
    }
    // One stray match is not a row; the outdoor sheet labels every column.
    return hits >= 2;
  };

  const pitch = updateRow - 1;
  const application = looksLikeApplication(pitch - 1) ? pitch - 1 : null;
  const line = application !== null ? application - 1 : pitch - 1;
  const model = line - 1;
  if (model < 0) return null;

  return { model, line, application, pitch, ledManufacturer: updateRow };
}

// ── Spec + price rows ────────────────────────────────────────────────────────

interface SheetRows {
  header: HeaderRows;
  pixelPitch: number | null;
  pixelConfiguration: number | null;
  ledPackage: number | null;
  moduleDimension: number | null;
  modulesPerCabinet: number | null;
  cabinetArea: number | null;
  weight: number | null;
  brightness: number | null;
  powerMax: number | null;
  powerAvg: number | null;
  refresh: number | null;
  ipFront: number | null;
  ipRear: number | null;
  serviceAccess: number | null;

  pricePerPanel: number | null;
  pricePerSqm: number | null;
  exworkPerSqft: number;
  markupPerSqft: number | null;
  markupPct: number | null;
  customPerSqft: number | null;
  vesselShipping: number | null;
}

/** "LGEUS Mark Up - 38% - MSP/SQFT (USD)" → 0.38 */
function parseMarkupPct(label: string): number | null {
  const m = label.match(/(\d+(?:\.\d+)?)\s*%/);
  if (!m) return null;
  const pct = parseFloat(m[1]);
  return Number.isFinite(pct) ? pct / 100 : null;
}

function findSheetRows(g: Grid, firstDataCol: number): SheetRows | null {
  const header = findHeaderRows(g, firstDataCol);
  if (!header) return null;

  // The ex-works price row is the one whose label STARTS with "msp/sqft".
  // "Custom Cost - MSP/SQFT", "…Mark Up - 38% - MSP/SQFT" and "Vessel Shipping -
  // MSP/SQFT" all contain that token too, so a `contains` match would collide.
  const exworkPerSqft = findRow(g, startsWith("msp/sqft"));
  if (exworkPerSqft === null) return null;

  const markupPerSqft = findRow(g, contains("mark up"));
  const markupLabel = markupPerSqft !== null ? rowLabel(g, markupPerSqft) : null;

  return {
    header,
    // The header's pitch row is decorative and patchy — it is blank for HO6T on
    // both the 04.28 and 08.01 cards, and for R10 on 04.28. This spec row is
    // filled for every column, so it is the authority and the header is a
    // fallback.
    pixelPitch: findRow(g, startsWith("pixel pitch")),
    pixelConfiguration: findRow(g, contains("pixel configuration")),
    ledPackage: findRow(g, (l) => l === "led pkg"),
    moduleDimension: findRow(g, contains("module dimension")),
    modulesPerCabinet: findRow(g, contains("no. of modules per cabinet")),
    cabinetArea: findRow(g, contains("cabinet surface area")),
    weight: findRow(g, contains("weight per cabinet")),
    brightness: findRow(g, contains("max. brightness")),
    powerMax: findRow(g, contains("power consumption (w/panel, max")),
    powerAvg: findRow(g, contains("power consumption (w/panel, avg")),
    refresh: findRow(g, contains("refresh rate")),
    ipFront: findRow(g, contains("ip rating front")),
    ipRear: findRow(g, contains("ip rating rear")),
    // Exact match: the sheet also carries "Service access（IM）" just above.
    serviceAccess: findRow(g, (l) => l === "service access"),

    pricePerPanel: findRow(g, startsWith("msp/panel")),
    pricePerSqm: findRow(g, startsWith("msp/sqm")),
    exworkPerSqft,
    markupPerSqft,
    markupPct: markupLabel ? parseMarkupPct(markupLabel) : null,
    customPerSqft: findRow(g, contains("custom cost")),
    vesselShipping: findRow(g, contains("vessel shipping")),
  };
}

// ── Parsing a column ─────────────────────────────────────────────────────────

/** "240X270" → [240, 270]; "500X333.33" → [500, 333.33]. */
function parsePair(v: unknown): [number, number] | null {
  const t = text(v);
  if (!t) return null;
  const m = t.match(/^(\d+(?:\.\d+)?)\s*[xX×]\s*(\d+(?:\.\d+)?)$/);
  if (!m) return null;
  return [parseFloat(m[1]), parseFloat(m[2])];
}

interface RawColumn {
  col: number;
  modelLabel: string;
  productLine: string | null;
  application: string | null;
  pixelPitchMm: number;
  ledManufacturer: string | null;
  pixelConfiguration: string | null;
  ledPackage: string | null;
  maxNits: number | null;
  rest: Omit<
    NxRateCardProduct,
    | "sku" | "modelLabel" | "productLine" | "application" | "environment"
    | "pixelPitchMm" | "ledManufacturer" | "pixelConfiguration" | "ledPackage"
    | "maxNits" | "sourceSheet" | "sourceColumn"
  >;
}

function readColumn(
  g: Grid,
  rows: SheetRows,
  c: number,
  variant: NxVariant,
  warnings: string[],
  sheetName: string
): RawColumn | null {
  const at = (r: number | null): unknown => (r === null ? undefined : merged(g, r, c));

  const modelLabel = text(at(rows.header.model));
  const exwork = num(at(rows.exworkPerSqft));
  // A column is a product only if the card both names it and prices it. Trailing
  // spacer columns satisfy neither.
  if (!modelLabel || exwork === null || exwork <= 0) return null;

  const pitch = num(at(rows.pixelPitch)) ?? num(at(rows.header.pitch));
  if (pitch === null || pitch <= 0) {
    warnings.push(
      `${sheetName}!${XLSX.utils.encode_col(c)}: "${modelLabel}" has no pixel pitch — skipped.`
    );
    return null;
  }

  const markup = rows.markupPerSqft !== null ? num(at(rows.markupPerSqft)) : null;
  if (variant === "LGEUS" && markup === null) {
    warnings.push(
      `${sheetName}!${XLSX.utils.encode_col(c)}: "${modelLabel}" has no markup price — skipped.`
    );
    return null;
  }
  const price = variant === "LGEUS" ? (markup as number) : exwork;

  const modDim = parsePair(at(rows.moduleDimension));
  const modCount = parsePair(at(rows.modulesPerCabinet));
  const cabinetWidthMm = modDim && modCount ? modDim[0] * modCount[0] : null;
  const cabinetHeightMm = modDim && modCount ? modDim[1] * modCount[1] : null;

  return {
    col: c,
    modelLabel,
    productLine: text(at(rows.header.line)),
    application: text(at(rows.header.application)),
    pixelPitchMm: pitch,
    ledManufacturer: text(at(rows.header.ledManufacturer)),
    pixelConfiguration: text(at(rows.pixelConfiguration)),
    ledPackage: text(at(rows.ledPackage)),
    maxNits: num(at(rows.brightness)),
    rest: {
      moduleWidthMm: modDim ? modDim[0] : null,
      moduleHeightMm: modDim ? modDim[1] : null,
      modulesPerCabinetW: modCount ? modCount[0] : null,
      modulesPerCabinetH: modCount ? modCount[1] : null,
      cabinetWidthMm,
      cabinetHeightMm,
      cabinetAreaSqm: num(at(rows.cabinetArea)),
      weightKgPerCabinet: num(at(rows.weight)),
      maxPowerWattsPerCab: num(at(rows.powerMax)),
      typicalPowerWattsPerCab: num(at(rows.powerAvg)),
      refreshRate: num(at(rows.refresh)),
      ipRatingFront: text(at(rows.ipFront)),
      ipRatingRear: text(at(rows.ipRear)),
      serviceAccess: text(at(rows.serviceAccess)),
      exworkPerSqft: exwork,
      pricePerSqft: price,
      pricePerPanel: num(at(rows.pricePerPanel)),
      pricePerSqm: num(at(rows.pricePerSqm)),
      customPerSqft: num(at(rows.customPerSqft)),
      vesselShippingPerSqft: num(at(rows.vesselShipping)),
    },
  };
}

// ── SKU derivation ───────────────────────────────────────────────────────────

/** `R2.5-MIP` → `R2.5-MIP`; `C1.875-MIP (5G， DAC传输))` → `C1.875-MIP-5G`. */
function slugModel(label: string): string {
  let s = label.trim();
  // The transmission tier is the only thing inside the parentheses worth keeping;
  // the rest is a Chinese note on the DAC link ("5G， DAC传输").
  const tier = s.match(/\((1G|5G)\b/i);
  s = s.replace(/\([^)]*\)?/g, "");
  s = s
    .replace(/[^A-Za-z0-9.\-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toUpperCase();
  return tier ? `${s}-${tier[1].toUpperCase()}` : s;
}

function configToken(pixelConfiguration: string | null): string | null {
  if (!pixelConfiguration) return null;
  const p = pixelConfiguration.toLowerCase();
  if (p.includes("mip")) return "MIP";
  if (p.includes("black")) return "BLK";
  if (p.includes("white")) return "WHT";
  return null;
}

/** Stable tiebreak when two packages are offered equally often in a group. */
const CONFIG_PRIORITY = ["WHT", "BLK", "MIP"];

/**
 * The package a model is *normally* sold in goes unmarked; the alternatives get
 * a suffix. Which one is normal differs by sheet — outdoor leads with SMD White,
 * indoor with SMD Black — so it is taken from whichever the group offers most,
 * rather than hardcoded per environment.
 */
function baselineConfig(members: RawColumn[]): string | null {
  const counts = new Map<string, number>();
  for (const m of members) {
    const t = configToken(m.pixelConfiguration);
    if (t) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  if (counts.size === 0) return null;
  return [...counts.entries()].sort(
    (a, b) =>
      b[1] - a[1] || CONFIG_PRIORITY.indexOf(a[0]) - CONFIG_PRIORITY.indexOf(b[0])
  )[0][0];
}

function supplierSuffix(ledManufacturer: string | null): string | null {
  if (!ledManufacturer) return null;
  const m = ledManufacturer.toLowerCase();
  if (m.startsWith("sinyopto")) return "SY";
  return null; // NationStar (and the indoor "SY"-only AIO line) stay unsuffixed
}

type Axis = "config" | "supplier" | "brightness";

/**
 * Axis subsets to try, smallest first. A model offered one way keeps a bare SKU;
 * only what is needed to tell two columns apart is appended.
 *
 * Order matters — it is what keeps the names the catalog already uses. An indoor
 * model now offered in both SMD Black and MIP would, if every varying axis were
 * appended, rename `C4`/`C4-HB` to `C4-BLK`/`C4-BLK-HB` and retire two live
 * SKUs to say nothing new. Preferring {config, brightness} yields `C4`, `C4-HB`
 * and `C4-MIP-HB`: the existing pair untouched, the new option named for what
 * makes it new.
 */
const AXIS_SUBSETS: Axis[][] = [
  [],
  ["config"],
  ["supplier"],
  ["brightness"],
  ["config", "supplier"],
  ["config", "brightness"],
  ["supplier", "brightness"],
  ["config", "supplier", "brightness"],
];

function assignSkus(columns: RawColumn[]): Map<number, string> {
  const groups = new Map<string, RawColumn[]>();
  for (const col of columns) {
    const key = slugModel(col.modelLabel);
    const g = groups.get(key);
    if (g) g.push(col);
    else groups.set(key, [col]);
  }

  const skus = new Map<number, string>();
  for (const [base, members] of groups) {
    const baseline = baselineConfig(members);
    const maxNits = Math.max(...members.map((m) => m.maxNits ?? 0));

    const name = (m: RawColumn, axes: Axis[]): string => {
      const parts = [base];
      if (axes.includes("config")) {
        const t = configToken(m.pixelConfiguration);
        if (t && t !== baseline && !base.endsWith(t)) parts.push(t);
      }
      if (axes.includes("supplier")) {
        const s = supplierSuffix(m.ledManufacturer);
        if (s) parts.push(s);
      }
      if (axes.includes("brightness") && (m.maxNits ?? 0) === maxNits) parts.push("HB");
      return parts.join("-");
    };

    const chosen =
      AXIS_SUBSETS.find((axes) => {
        const names = members.map((m) => name(m, axes));
        return new Set(names).size === members.length;
      }) ?? AXIS_SUBSETS[AXIS_SUBSETS.length - 1];

    // Columns that no axis here tells apart would otherwise silently overwrite
    // each other on import.
    const used = new Map<string, number>();
    for (const m of members) {
      let sku = name(m, chosen);
      const seen = used.get(sku);
      if (seen !== undefined) {
        used.set(sku, seen + 1);
        sku = `${sku}-V${seen + 1}`;
      } else {
        used.set(sku, 1);
      }
      skus.set(m.col, sku);
    }
  }
  return skus;
}

// ── Entry point ──────────────────────────────────────────────────────────────

const FIRST_DATA_COL = 3; // column D — A–C carry the row labels

function sheetEnvironment(name: string): NxEnvironment | null {
  const n = name.toLowerCase();
  if (n.includes("outdoor")) return "outdoor";
  if (n.includes("indoor")) return "indoor";
  return null;
}

/** "Update on 2026/07/22" → "2026/07/22" */
function parseUpdatedOn(g: Grid): string | null {
  const r = findRow(g, contains("update on"));
  if (r === null) return null;
  const label = rowLabel(g, r);
  const m = label?.match(/update on\s*(.+)$/i);
  return m ? m[1].trim() : null;
}

/**
 * Detect which card this is. The LGEUS workbook prices through LG USA and says
 * so on its markup row; the ANC one has no such row. The filename is a hint
 * only — it has been spelled "LGEUS", "LEGUS" and "LGEUS Markup".
 */
function detectVariant(hasMarkupRow: boolean): NxVariant {
  return hasMarkupRow ? "LGEUS" : "ANC";
}

export function parseNxRateCard(buffer: Buffer, filename: string): NxRateCard {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const warnings: string[] = [];
  const products: NxRateCardProduct[] = [];

  let variant: NxVariant | null = null;
  let markupPct: number | null = null;
  let updatedOn: string | null = null;

  const sheetNames = wb.SheetNames.filter((n) => sheetEnvironment(n) !== null);
  if (sheetNames.length === 0) {
    throw new Error(
      `No "NX Outdoor Sport" / "NX Indoor Sport" sheet in ${filename} — found: ${wb.SheetNames.join(", ") || "(none)"}.`
    );
  }

  for (const sheetName of sheetNames) {
    const environment = sheetEnvironment(sheetName)!;
    const g = toGrid(wb.Sheets[sheetName]);
    const rows = findSheetRows(g, FIRST_DATA_COL);
    if (!rows) {
      warnings.push(`Sheet "${sheetName}" does not match the NX rate card layout — skipped.`);
      continue;
    }

    const sheetVariant = detectVariant(rows.markupPerSqft !== null);
    if (variant === null) variant = sheetVariant;
    else if (variant !== sheetVariant) {
      warnings.push(
        `Sheet "${sheetName}" reads as a ${sheetVariant} card but the workbook opened as ${variant}; the ${variant} basis was kept.`
      );
    }
    if (rows.markupPct !== null) {
      if (markupPct !== null && markupPct !== rows.markupPct) {
        warnings.push(
          `Markup differs between sheets (${(markupPct * 100).toFixed(0)}% vs ${(rows.markupPct * 100).toFixed(0)}%) — each sheet's own markup row was used.`
        );
      }
      markupPct = markupPct ?? rows.markupPct;
    }
    updatedOn = updatedOn ?? parseUpdatedOn(g);

    const columns: RawColumn[] = [];
    for (let c = FIRST_DATA_COL; c <= g.maxCol; c++) {
      const parsed = readColumn(g, rows, c, variant ?? sheetVariant, warnings, sheetName);
      if (parsed) columns.push(parsed);
    }
    if (columns.length === 0) {
      warnings.push(`Sheet "${sheetName}" produced no priced columns.`);
      continue;
    }

    const skus = assignSkus(columns);
    for (const col of columns) {
      products.push({
        sku: skus.get(col.col)!,
        modelLabel: col.modelLabel,
        productLine: col.productLine,
        application: col.application,
        environment,
        pixelPitchMm: col.pixelPitchMm,
        ledManufacturer: col.ledManufacturer,
        pixelConfiguration: col.pixelConfiguration,
        ledPackage: col.ledPackage,
        maxNits: col.maxNits,
        sourceSheet: sheetName,
        sourceColumn: XLSX.utils.encode_col(col.col),
        ...col.rest,
      });
    }
  }

  if (products.length === 0) {
    throw new Error(`No priced products found in ${filename}.`);
  }

  // A SKU has to be unique across the workbook, not just within a sheet.
  const byKey = new Map<string, NxRateCardProduct>();
  for (const p of products) {
    const key = `${p.environment}:${p.sku}`;
    const clash = byKey.get(key);
    if (clash) {
      warnings.push(
        `${p.sourceSheet}!${p.sourceColumn} and ${clash.sourceSheet}!${clash.sourceColumn} both resolve to "${p.sku}" — check the card for a duplicated column.`
      );
    } else {
      byKey.set(key, p);
    }
  }

  return {
    variant: variant ?? "ANC",
    markupPct,
    updatedOn,
    sourceFile: filename,
    products,
    warnings,
  };
}
