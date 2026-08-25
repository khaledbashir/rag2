/**
 * LiveSync CMS auto-BOM engine.
 *
 * Turns a list of screens (pixel dimensions + venue context) into a fully
 * priced Control System BOM using the selection rules Jackson Hart laid out
 * on the 2026-07-02 call (captured in
 * docs/claude-memory/spec-livesync-processing-cms.md).
 *
 * Design constraints:
 *  - Pure function: catalog prices are passed in, never fetched here.
 *  - Flag, don't guess: anything Jackson marked as judgment-dependent or
 *    unconfirmed produces an explicit flag instead of a silent default.
 *  - Additive: does not touch the existing CmsBomStudio picker or any
 *    RFP-analyzer code. Callers persist nothing; this returns a proposal.
 */

// ─────────────────────────── Inputs ───────────────────────────

export type LivesyncScreenInput = {
  name: string;
  pixelWidth: number;
  pixelHeight: number;
  /** Center-hung / end-zone / RFP-specified live video feed */
  liveVideo?: boolean;
  outdoor?: boolean;
  /** Physical width in feet — drives closet/IDF and outdoor-rack counts */
  physicalWidthFt?: number | null;
  /**
   * Ribbon board → map to the render canvas by stripping (see
   * `stripRibbonToCanvas`). Leave undefined to let the shape decide; set
   * `false` to force the standard grid mapping on a long thin screen.
   */
  ribbon?: boolean;
};

export type LivesyncJobInput = {
  screens: LivesyncScreenInput[];
  /** Sports venue → RS-232 scoring intake always included (Jackson) */
  sportsVenue?: boolean;
  /** Licensing usually NOT quoted on RFP jobs — off by default, flagged */
  includeLicense?: boolean;
};

/**
 * How a catalog cost becomes a sell price.
 *
 * The CMS catalog carries unit COST for all 80 SKUs and a sell price for none
 * of them, so every line used to be quoted at cost — a zero-margin BOM handed
 * out as a price. The house model is the divisor form used everywhere else in
 * the estimator (lib/estimator.ts: P = C / (1 - M)), and the LiveSync rate is
 * already on the rate card as `margin.livesync`. Callers resolve it there and
 * pass it in; the engine stays pure and never reaches for a database.
 */
export type LivesyncPricingContext = {
  /** Fractional margin, e.g. 0.35 for 35%. Must be < 1. */
  margin: number;
  /** Where the rate came from, surfaced verbatim to the estimator. */
  marginSource: string;
};

export type CatalogEntry = {
  sku: string;
  displayName: string;
  category: string;
  unitCost: number;
  unitPrice: number | null;
  isActive: boolean;
};

// ─────────────────────────── Outputs ───────────────────────────

export type BomLine = {
  sku: string;
  displayName: string;
  category: string;
  quantity: number;
  /** What ANC pays, straight off the catalog. */
  unitCost: number;
  lineCost: number;
  /** What the client is quoted: catalog sell price if set, else cost ÷ (1 − margin). */
  unitPrice: number;
  lineTotal: number;
  /** "catalog-sell" when the SKU carries its own price, "cost-plus-margin" otherwise. */
  priceBasis: "catalog-sell" | "cost-plus-margin";
  rationale: string;
  flags: string[];
};

/**
 * How a ribbon board lands on a render output's 3840 × 2160 canvas.
 *
 * Jackson Hart, 2026-08-25: "It uses a term called stripping — it's when you
 * take the total screen width and divide it by 3840 (the size of one render
 * output) and you stack the stripes on top of each other until you fill 75%
 * of the canvas height, then you go to use a second output. That ensures the
 * total canvas can be used effectively for ribbons and there is no wasted
 * space."
 */
export type RibbonStripPlan = {
  /** Total stripes the ribbon is cut into: ⌈width / 3840⌉ */
  stripes: number;
  /** Stripes that run the full 3840 px */
  fullWidthStripes: number;
  /** Width of the final short stripe; 0 when the ribbon divides evenly */
  remainderStripeWidth: number;
  /** How many stripes stack inside 75% of the canvas height */
  stripesPerOutput: number;
  /** Render outputs the ribbon actually consumes */
  outputs: number;
  /** 75% of the output canvas height — the stacking budget */
  usableCanvasHeight: number;
  /** Stacked pixel height on a full output */
  stackedHeight: number;
  /** Stacked height as a share of the FULL canvas, not the 75% budget */
  canvasFillPct: number;
  /** Stripes riding on the final (possibly part-filled) output */
  stripesOnLastOutput: number;
};

export type ScreenPlan = {
  name: string;
  pixelWidth: number;
  pixelHeight: number;
  outputs: number;
  renderPrimaries: number;
  renderServersTotal: number;
  serverSku: string | null;
  storageTier: string;
  dualVideoCard: boolean;
  liveVideo: boolean;
  sharedServer: boolean;
  /** Mapped to the canvas by stripping rather than by the standard grid */
  ribbon: boolean;
  /** Where the ribbon call came from — the estimator, or the screen's shape */
  ribbonSource: "explicit" | "shape" | null;
  /** The canvas mapping, when this screen was stripped */
  strip: RibbonStripPlan | null;
  flags: string[];
};

export type ReasoningStep = {
  phase: string;
  text: string;
};

export type ProcessorAdvisory = {
  name: string;
  totalPixels: number;
  portsNeeded: number;
  recommendedClass: string;
  closets: number;
  fiberConverterPairs: number;
  outdoorRacks: number;
  flags: string[];
};

/**
 * Whether the processing side produced money or only layout math.
 *
 * Jackson's processor rules (ports, class, fiber pairs, closets, outdoor racks)
 * are implemented, but no processor or fiber-converter SKU exists in any
 * catalog or on the rate card, so there is nothing to price against. That is a
 * missing input, not a silent zero — the tool says so on its face and flips to
 * priced the moment those SKUs land.
 */
export type ProcessingPricingStatus = {
  priced: boolean;
  /** Plain-language statement of exactly where the processing number stands. */
  summary: string;
  /** What has to arrive before processing can carry a price. */
  missingInputs: string[];
};

export type AutoBomResult = {
  lines: BomLine[];
  screenPlans: ScreenPlan[];
  processorAdvisories: ProcessorAdvisory[];
  /** Cost→sell basis actually applied to this BOM. */
  pricing: {
    margin: number;
    marginSource: string;
    linesFromCatalogSell: number;
    linesFromCostPlusMargin: number;
  };
  /** Processing is quoted separately from the control system — this is its state. */
  processing: ProcessingPricingStatus;
  totals: {
    /** Total ANC cost, before margin. */
    cost: number;
    hardware: number;
    softCost: number;
    license: number;
    grand: number;
  };
  counts: {
    uiServers: number;
    renderServers: number;
    totalServers: number;
    workstations: number;
    racks: number;
    matrixSize: number | null;
    matrixInputsNeeded: number;
  };
  reviewFlags: string[];
  assumptions: string[];
  /** Ordered decision trail — every rule applied, with the actual numbers */
  reasoning: ReasoningStep[];
};

// ─────────────────────────── Rule constants (from Jackson) ───────────────────────────

/** Each server output physically drives up to 3840 × 2160 */
export const OUTPUT_MAX_W = 3840;
export const OUTPUT_MAX_H = 2160;
/** Never exceed 2 outputs per (single-GPU) server when avoidable */
export const OUTPUTS_PER_SERVER = 2;
/** Dual-video-card server capacity (2 outputs per card) */
export const OUTPUTS_PER_DUAL_SERVER = 4;
/** A single screen larger than 7680 × 2160 must stay on one box → dual card */
export const DUAL_CARD_W = 7680;
export const DUAL_CARD_H = 2160;
/**
 * Ribbon stripping: stack stripes down the canvas until 75% of its height is
 * filled, then move to the next output (Jackson, 2026-08-25). The remaining
 * 25% is deliberate headroom, not spare capacity to fill.
 */
export const RIBBON_CANVAS_FILL = 0.75;
/** 75% of 2160 = the stacking budget on one output */
export const RIBBON_USABLE_H = Math.floor(OUTPUT_MAX_H * RIBBON_CANVAS_FILL);
/**
 * Above this stripe height, stripping saves nothing — a second stripe no
 * longer stacks inside the budget — so a screen that tall is mapped by the
 * standard grid unless the estimator explicitly calls it a ribbon.
 */
export const RIBBON_MAX_AUTO_STRIPE_H = Math.floor(RIBBON_USABLE_H / 2);
/** ~1 rack per 12 servers */
export const SERVERS_PER_RACK = 12;
/** +1 workstation per 5 screens, minimum 1 */
export const SCREENS_PER_WORKSTATION = 5;
/** Matrix sizes available in the catalog (square N×N) */
export const MATRIX_SIZES = [4, 8, 16, 24, 32, 48];
/** Processor: each output card port handles up to 650,000 pixels */
export const PIXELS_PER_PORT = 650_000;
/**
 * Catalog categories that would hold processing gear. None exist today — the
 * Control System catalog stops at the servers — so this is what the engine
 * watches for to flip processing from advisory to priced.
 */
export const PROCESSING_CATEGORIES = new Set(["PROCESSOR", "FIBER_CONVERTER", "OUTDOOR_RACK"]);
/** Fiber: one pair of converters per 6 data lines */
export const DATA_LINES_PER_FIBER_PAIR = 6;
/** Closet/IDF + outdoor rack planning distance */
export const CLOSET_PLANNING_FT = 150;

// SKU roles — resolved against the live catalog at call time
const SKU = {
  RENDER_4TB: "ANC-1U-4TB-4ADA-V1",
  RENDER_6TB: "ANC-1U-6TB-4ADA-V1",
  RENDER_8TB: "ANC-1U-8TB-4ADA-V1",
  UI_8TB: "ANC-1U-8TB-4ADA-V1",
  DUAL_4TB: "ANC-1U-4TB-2x4ADA-V1",
  DUAL_6TB: "ANC-1U-6TB-2x4ADA-V1",
  DUAL_8TB: "ANC-1U-8TB-2x4ADA-V1",
  LIVE_CC_4TB: "ANC-1U-4TB-4ADA-CC",
  LIVE_CC_6TB: "ANC-1U-6TB-4ADA-CC",
  LIVE_CC_8TB: "ANC-1U-8TB-4ADA-CC",
  AUDIO: "CMS-ADDON-DANTE",
  RS232: "CMS-ADDON-RS232IP",
  WORKSTATION: "CMS-WS-PWR",
  SWITCH: "CMS-NET-SWITCH",
  GPI: "CMS-GPI-TRIGGER",
  KVM_TX: "ADDER-TX",
  KVM_RX: "ADDER-RX",
  KVM_MGT: "ADDER-MGT",
  RACK_WS: "CMS-RACK-WS",
  RACK_ACC: "CMS-RACK-ACC",
  RACK_UPS: "CMS-RACK-UPS",
  RACK_CABINET: "CMS-RACK-CABINET",
  RACK_OUTDOOR: "CMS-RACK-ACOUT",
  INTEGRATION_WEEK: "CMS-INTEG-WEEK",
  LICENSE: "LIVESYNC-LICENSE",
  MATRIX: (n: number) => `ANC-MTRX-${n}x${n}-5YR`,
  ROUTER_CABLE: "CMS-ROUTER-CABLE",
} as const;

const SOFT_COST = new Set(["TRAINING", "INTEGRATION", "SHIPPING"]);
const LICENSE_CAT = new Set(["LICENSE", "SUPPORT_TIER"]);

// ─────────────────────────── Helpers ───────────────────────────

export function outputsForScreen(pixelWidth: number, pixelHeight: number): number {
  const w = Math.max(1, Math.ceil(pixelWidth / OUTPUT_MAX_W));
  const h = Math.max(1, Math.ceil(pixelHeight / OUTPUT_MAX_H));
  return w * h;
}

/**
 * Map a ribbon board onto render outputs by stripping.
 *
 * Cut the ribbon into 3840-wide stripes, stack them down the canvas until the
 * next one would pass 75% of the canvas height, then start the next output.
 * A ribbon is one long band, so the standard grid mapping charges a whole
 * output for every 3840 px of width and throws away the ~95% of canvas height
 * a 3-ft board leaves empty — which is exactly the wasted space Jackson is
 * describing.
 *
 * Returns null when the ribbon is taller than the stacking budget: there is
 * nothing to stack, so it belongs on the standard grid.
 */
export function stripRibbonToCanvas(
  pixelWidth: number,
  pixelHeight: number
): RibbonStripPlan | null {
  if (!(pixelWidth > 0) || !(pixelHeight > 0)) return null;
  if (pixelHeight > RIBBON_USABLE_H) return null;

  const stripes = Math.max(1, Math.ceil(pixelWidth / OUTPUT_MAX_W));
  const fullWidthStripes = Math.floor(pixelWidth / OUTPUT_MAX_W);
  const remainderStripeWidth = pixelWidth - fullWidthStripes * OUTPUT_MAX_W;
  const stripesPerOutput = Math.max(1, Math.floor(RIBBON_USABLE_H / pixelHeight));
  const outputs = Math.ceil(stripes / stripesPerOutput);
  const stripesOnLastOutput = stripes - (outputs - 1) * stripesPerOutput;
  // A single-output ribbon never fills more than its own stripe count.
  const stackedHeight = Math.min(stripes, stripesPerOutput) * pixelHeight;

  return {
    stripes,
    fullWidthStripes,
    remainderStripeWidth,
    stripesPerOutput,
    outputs,
    usableCanvasHeight: RIBBON_USABLE_H,
    stackedHeight,
    canvasFillPct: Number(((stackedHeight / OUTPUT_MAX_H) * 100).toFixed(1)),
    stripesOnLastOutput,
  };
}

/**
 * Does this screen's shape read as a ribbon?
 *
 * Two conditions, both mechanical rather than stylistic: it has to be wider
 * than one output (otherwise there is nothing to strip), and short enough that
 * at least two stripes stack inside the 75% budget (otherwise stripping saves
 * nothing). Everything that clears both is at least 4.7 : 1 — a band, not a
 * video board. The estimator can always override in either direction.
 */
export function isRibbonShape(pixelWidth: number, pixelHeight: number): boolean {
  return pixelWidth > OUTPUT_MAX_W && pixelHeight > 0 && pixelHeight <= RIBBON_MAX_AUTO_STRIPE_H;
}

/**
 * Storage tier by screen pixel area. Jackson: "the larger the screen, the
 * more storage — it never hurts to stay on the larger side."
 * Exact thresholds are an OPEN CONFIRMATION with Jackson, so tier bumps
 * carry a flag.
 */
function storageTier(pixelArea: number): "4TB" | "6TB" | "8TB" {
  const onePane = OUTPUT_MAX_W * OUTPUT_MAX_H; // ~8.29M px
  if (pixelArea <= onePane) return "4TB";
  if (pixelArea <= onePane * 2) return "6TB";
  return "8TB";
}

function pickMatrixSize(inputsNeeded: number): number | null {
  // Jackson: never select exactly what you need — always the next size up.
  for (const size of MATRIX_SIZES) {
    if (size > inputsNeeded) return size;
  }
  return null; // beyond largest catalog matrix — flag
}

// ─────────────────────────── Engine ───────────────────────────

export function buildLivesyncAutoBom(
  job: LivesyncJobInput,
  catalog: CatalogEntry[],
  pricing: LivesyncPricingContext
): AutoBomResult {
  if (!Number.isFinite(pricing.margin) || pricing.margin < 0 || pricing.margin >= 1) {
    throw new Error(
      `Invalid LiveSync margin: ${pricing.margin}. Must be a fraction between 0 and 1 (divisor model P = C / (1 - M)).`
    );
  }
  const bySku = new Map(catalog.map((c) => [c.sku, c]));
  const lines: BomLine[] = [];
  const reviewFlags: string[] = [];
  const assumptions: string[] = [];
  const reasoning: ReasoningStep[] = [];
  const think = (phase: string, text: string) => reasoning.push({ phase, text });
  const sportsVenue = job.sportsVenue !== false;

  think(
    "Read the job",
    `${job.screens.length} screen(s) on this job. Sports venue: ${sportsVenue ? "yes" : "no"}. License requested: ${job.includeLicense ? "yes" : "no"}.`
  );

  // A SKU that carries its own sell price is quoted at that price. Everything
  // else is marked up from cost with the house divisor model, P = C / (1 - M),
  // using the rate the caller read off the rate card. Nothing is ever quoted at
  // bare cost — that was the bug that made every Control System number read low.
  const sellFrom = (entry: CatalogEntry): { unitPrice: number; basis: BomLine["priceBasis"] } => {
    if (entry.unitPrice != null && entry.unitPrice > 0) {
      return { unitPrice: entry.unitPrice, basis: "catalog-sell" };
    }
    return {
      unitPrice: Number((entry.unitCost / (1 - pricing.margin)).toFixed(2)),
      basis: "cost-plus-margin",
    };
  };
  let linesFromCatalogSell = 0;
  let linesFromCostPlusMargin = 0;

  const addLine = (
    sku: string,
    quantity: number,
    rationale: string,
    flags: string[] = []
  ): boolean => {
    if (quantity <= 0) return false;
    const entry = bySku.get(sku);
    if (!entry) {
      reviewFlags.push(
        `Catalog is missing SKU ${sku} (${rationale}) — line skipped, needs human review.`
      );
      return false;
    }
    const allFlags = [...flags];
    if (!entry.isActive) {
      allFlags.push("SKU is marked inactive in the catalog — verify before quoting.");
    }
    const { unitPrice, basis } = sellFrom(entry);
    if (basis === "catalog-sell") linesFromCatalogSell += 1;
    else linesFromCostPlusMargin += 1;
    lines.push({
      sku: entry.sku,
      displayName: entry.displayName,
      category: entry.category,
      quantity,
      unitCost: entry.unitCost,
      lineCost: Number((entry.unitCost * quantity).toFixed(2)),
      unitPrice,
      lineTotal: Number((unitPrice * quantity).toFixed(2)),
      priceBasis: basis,
      rationale,
      flags: allFlags,
    });
    return true;
  };

  // ── 1. Per-screen render server planning ──
  const screenPlans: ScreenPlan[] = [];
  // 1-output, non-live screens can share a server (2 outputs per box)
  const shareableScreens: { name: string; tier: "4TB" | "6TB" | "8TB" }[] = [];
  // Dual-GPU boxes carry 4 physical outputs — they feed the matrix at 4, not 2
  let dualCardServers = 0;
  // Screens bumped above 4TB — aggregated into ONE review flag instead of
  // repeating the same pending-Jackson sentence on every server line
  const tierBumps: { name: string; tier: string }[] = [];

  // Ribbons auto-detected from their shape are named in one job-level flag, so
  // the estimator can see the call was made and switch it off per screen.
  const autoStripped: string[] = [];

  for (const screen of job.screens) {
    const flags: string[] = [];
    const area = screen.pixelWidth * screen.pixelHeight;
    const tier = storageTier(area);
    const liveVideo = !!screen.liveVideo;

    // ── Ribbon stripping vs. the standard grid ──
    // Live video never strips: a video feed is one contiguous rectangle on the
    // canvas, not a band that can be cut and stacked.
    const shapeIsRibbon = !liveVideo && isRibbonShape(screen.pixelWidth, screen.pixelHeight);
    const wantsStripping = screen.ribbon === true || (screen.ribbon !== false && shapeIsRibbon);
    const strip = wantsStripping
      ? stripRibbonToCanvas(screen.pixelWidth, screen.pixelHeight)
      : null;
    const ribbonSource: ScreenPlan["ribbonSource"] = strip
      ? screen.ribbon === true
        ? "explicit"
        : "shape"
      : null;

    const gridOutputs = outputsForScreen(screen.pixelWidth, screen.pixelHeight);
    const outputs = strip ? strip.outputs : gridOutputs;

    if (screen.ribbon === true && !strip) {
      flags.push(
        `Marked as a ribbon, but it is ${screen.pixelHeight}px tall — past the ${RIBBON_USABLE_H}px stacking budget (75% of the ${OUTPUT_MAX_H}px canvas), so nothing stacks. Mapped on the standard grid instead.`
      );
    }
    if (ribbonSource === "shape") autoStripped.push(screen.name);
    if (strip && strip.stripesOnLastOutput < strip.stripesPerOutput && strip.outputs > 1) {
      flags.push(
        `Last output carries ${strip.stripesOnLastOutput} of ${strip.stripesPerOutput} stripes — the ribbon does not divide evenly across outputs.`
      );
    }

    // A stripped ribbon is judged on the outputs it actually consumes, not its
    // raw width: the whole point of stripping is that a 30,000px band lands on
    // one output, and a dual-GPU box for it would be hardware nobody needs.
    const needsDualCard = strip
      ? outputs > OUTPUTS_PER_SERVER
      : screen.pixelWidth > DUAL_CARD_W ||
        (screen.pixelWidth > DUAL_CARD_W && screen.pixelHeight > DUAL_CARD_H) ||
        outputs > OUTPUTS_PER_SERVER;

    if (strip) {
      const stripeMath =
        strip.remainderStripeWidth > 0
          ? `${strip.fullWidthStripes} full stripe(s) at ${OUTPUT_MAX_W}px plus a ${strip.remainderStripeWidth}px tail = ${strip.stripes} stripe(s)`
          : `${strip.stripes} stripe(s) at ${OUTPUT_MAX_W}px, dividing evenly`;
      think(
        "Size each screen",
        `${screen.name} is ${screen.pixelWidth}×${screen.pixelHeight} — a ribbon${ribbonSource === "shape" ? " by its shape" : ""}, so it is stripped onto the canvas rather than tiled. ` +
          `Total width ÷ ${OUTPUT_MAX_W} → ${stripeMath}. Stacking them down the canvas fills 75% of ${OUTPUT_MAX_H}px = ${strip.usableCanvasHeight}px, ` +
          `and at ${screen.pixelHeight}px per stripe that is ${strip.stripesPerOutput} stripe(s) per output (${strip.stackedHeight}px stacked, ${strip.canvasFillPct}% of the canvas) before moving to the next output → ${outputs} output(s). ` +
          `Tiled the standard way this same ribbon would have taken ${gridOutputs} output(s). ` +
          `Pixel area ${area.toLocaleString()} → ${tier} storage tier.`
      );
    } else {
      think(
        "Size each screen",
        `${screen.name} is ${screen.pixelWidth}×${screen.pixelHeight}. Each server output carries up to ${OUTPUT_MAX_W}×${OUTPUT_MAX_H}, so ` +
          `⌈${screen.pixelWidth}/${OUTPUT_MAX_W}⌉ × ⌈${screen.pixelHeight}/${OUTPUT_MAX_H}⌉ = ${outputs} output(s). ` +
          `Pixel area ${area.toLocaleString()} → ${tier} storage tier (bigger screen, more storage).` +
          (liveVideo ? " Live video is specified → capture-card server class." : "") +
          (needsDualCard && !liveVideo ? ` Wider than ${DUAL_CARD_W}px on one piece of hardware → dual-video-card server.` : "")
      );
    }

    if (tier !== "4TB") {
      tierBumps.push({ name: screen.name, tier });
    }

    if (outputs === 1 && !liveVideo && !needsDualCard) {
      // Defer — may share a server with another small screen
      shareableScreens.push({ name: screen.name, tier });
      screenPlans.push({
        name: screen.name,
        pixelWidth: screen.pixelWidth,
        pixelHeight: screen.pixelHeight,
        outputs,
        renderPrimaries: 0, // filled after packing
        renderServersTotal: 0,
        serverSku: null,
        storageTier: tier,
        dualVideoCard: false,
        liveVideo: false,
        sharedServer: true,
        ribbon: !!strip,
        ribbonSource,
        strip,
        flags,
      });
      continue;
    }

    let sku: string;
    let primaries: number;
    if (needsDualCard && !liveVideo) {
      sku = { "4TB": SKU.DUAL_4TB, "6TB": SKU.DUAL_6TB, "8TB": SKU.DUAL_8TB }[tier];
      primaries = Math.ceil(outputs / OUTPUTS_PER_DUAL_SERVER);
      flags.push(
        `Screen exceeds ${DUAL_CARD_W}×${DUAL_CARD_H} on one piece of hardware → dual-video-card server (Jackson's rule). Costs rise quickly — confirm.`
      );
      if (outputs > OUTPUTS_PER_DUAL_SERVER) {
        flags.push(
          `Needs ${outputs} outputs — more than one dual-card server can carry. Split across ${primaries} primaries; Jackson should confirm the layout.`
        );
      }
    } else if (liveVideo) {
      sku = { "4TB": SKU.LIVE_CC_4TB, "6TB": SKU.LIVE_CC_6TB, "8TB": SKU.LIVE_CC_8TB }[tier];
      primaries = Math.ceil(outputs / OUTPUTS_PER_SERVER);
      flags.push(
        "Live video → CC capture variant selected. 12G-SDI variant also exists — confirm capture format with Jackson."
      );
      if (needsDualCard) {
        flags.push(
          "Screen needs both live video AND dual video cards — no combined SKU in the catalog. Selected CC variant; needs Jackson's review."
        );
      }
    } else {
      sku = { "4TB": SKU.RENDER_4TB, "6TB": SKU.RENDER_6TB, "8TB": SKU.RENDER_8TB }[tier];
      primaries = Math.ceil(outputs / OUTPUTS_PER_SERVER);
    }

    const total = primaries * 2; // 1:1 dedicated backup, always (Jackson)
    if (needsDualCard && !liveVideo) dualCardServers += total;
    think(
      "Select render servers",
      `${screen.name}: ${outputs} output(s), and we never exceed ${OUTPUTS_PER_SERVER} outputs per server when we can help it → ${primaries} render primary(ies). ` +
        `Every primary always gets a dedicated one-for-one backup — no exceptions → ${total} render server(s) total. ` +
        (liveVideo
          ? `Live video (center-hung / end zone class) → CC capture variant at the ${tier} tier.`
          : needsDualCard
            ? `Kept on one box with a second video card (${tier} dual-GPU) — costs climb quickly here, so it's flagged.`
            : `Standard single-GPU render at the ${tier} tier.`)
    );
    addLine(
      sku,
      total,
      `${screen.name}: ${screen.pixelWidth}×${screen.pixelHeight} = ${outputs} output(s) → ${primaries} render primary(ies) + ${primaries} backup(s).`,
      flags
    );

    screenPlans.push({
      name: screen.name,
      pixelWidth: screen.pixelWidth,
      pixelHeight: screen.pixelHeight,
      outputs,
      renderPrimaries: primaries,
      renderServersTotal: total,
      serverSku: sku,
      storageTier: tier,
      dualVideoCard: needsDualCard && !liveVideo,
      liveVideo,
      sharedServer: false,
      ribbon: !!strip,
      ribbonSource,
      strip,
      flags,
    });
  }

  // Pack 1-output screens two per server (Jackson: small screens share boxes,
  // never exceeding 2 outputs per server).
  if (shareableScreens.length > 0) {
    const primaries = Math.ceil(shareableScreens.length / OUTPUTS_PER_SERVER);
    // Storage follows the largest packed screen — "never hurts to go larger".
    const tierRank = { "4TB": 0, "6TB": 1, "8TB": 2 } as const;
    const tier = shareableScreens.reduce<"4TB" | "6TB" | "8TB">(
      (acc, s) => (tierRank[s.tier] > tierRank[acc] ? s.tier : acc),
      "4TB"
    );
    const sku = { "4TB": SKU.RENDER_4TB, "6TB": SKU.RENDER_6TB, "8TB": SKU.RENDER_8TB }[tier];
    const names = shareableScreens.map((s) => s.name).join(", ");
    think(
      "Select render servers",
      `${names}: each of these lands on a single 4K output, so they share render hardware — up to ${OUTPUTS_PER_SERVER} outputs per box → ` +
        `${primaries} shared primary(ies), each with its dedicated backup → ${primaries * 2} server(s) at the ${tier} tier (storage follows the largest screen in the group; it never hurts to stay on the larger side).`
    );
    const packFlags =
      shareableScreens.length > 1
        ? [
            "Multiple sub-4K screens packed 2-per-server (Jackson: don't exceed 2 outputs per server). Confirm grouping is acceptable for this layout.",
          ]
        : [];
    addLine(
      sku,
      primaries * 2,
      `${names}: ${shareableScreens.length} sub-4K screen(s) → ${primaries} shared render primary(ies) + ${primaries} backup(s).`,
      packFlags
    );
    for (const plan of screenPlans) {
      if (plan.sharedServer) {
        plan.serverSku = sku;
        plan.renderPrimaries = primaries;
        plan.renderServersTotal = primaries * 2;
      }
    }
  }

  const renderServers = lines
    .filter((l) => l.category === "SERVER_EQUIPMENT")
    .reduce((sum, l) => sum + l.quantity, 0);

  // ── 2. UI servers — always ≥ 2 (primary + backup), 8 TB typical ──
  const uiServers = 2;
  const uiFlags: string[] = [];
  if (job.screens.length > 5 || renderServers > 8) {
    uiFlags.push(
      "Large system — Jackson sometimes steps UI servers up to higher storage on jobs with many screens. Confirm whether 8 TB is enough."
    );
  }
  think(
    "Add UI servers",
    `Every deployment gets user-interface servers — always at least two, one primary and one backup, on the 8 TB tier because UI boxes carry the content library. ` +
      (uiFlags.length ? "This is a larger system, so the UI storage tier is flagged for review." : "")
  );
  addLine(
    SKU.UI_8TB,
    uiServers,
    "User-interface servers: always a minimum of 2 (1 primary + 1 backup), 8 TB storage tier.",
    uiFlags
  );

  const totalServers = renderServers + uiServers;

  // ── 3. Per-server accessories ──
  think(
    "Attach per-server pieces",
    `${renderServers} render + ${uiServers} UI = ${totalServers} servers on the job. Audio goes hand in hand with servers — one per server, every time → ${totalServers} audio elements.` +
      (sportsVenue
        ? " Sports venue → scoring data is always coming in, so RS-232-over-IP intake goes on the job."
        : "")
  );
  addLine(
    SKU.AUDIO,
    totalServers,
    `Audio: 1 per server, always (${totalServers} servers → ${totalServers} audio elements).`
  );

  if (sportsVenue) {
    addLine(
      SKU.RS232,
      2,
      "Sports venue → RS-232 over IP for scoring-controller data, always included.",
      [
        'Jackson said "a few" per job — defaulted to 2, confirm the exact quantity.',
      ]
    );
  } else {
    assumptions.push("Not a sports venue → no RS-232 scoring intake added.");
  }

  // ── 4. Workstations ──
  const workstations = Math.max(
    1,
    Math.ceil(job.screens.length / SCREENS_PER_WORKSTATION)
  );
  think(
    "Place workstations & KVM",
    `Workstations run one minimum, and roughly one more per ${SCREENS_PER_WORKSTATION} screens as control breaks out on site → ${workstations} workstation(s) with power conditioning. ` +
      `KVM follows the control chain: one transmitter per UI server (${uiServers}), one receiver per workstation (${workstations}), one management appliance.`
  );
  addLine(
    SKU.WORKSTATION,
    workstations,
    `User workstations with power conditioning: minimum 1, +1 per ${SCREENS_PER_WORKSTATION} screens (${job.screens.length} screen(s) → ${workstations}).`,
    [
      "Workstation count also depends on control positions outside the playing surface (concourse etc.) — confirm placement with Jackson.",
    ]
  );

  // ── 5. KVM — TX per UI server, RX per workstation ──
  addLine(SKU.KVM_TX, uiServers, `KVM transmitters: 1 per UI server (${uiServers} UI servers).`);
  addLine(SKU.KVM_RX, workstations, `KVM receivers: 1 per workstation (${workstations} workstation(s)).`);
  addLine(SKU.KVM_MGT, 1, "KVM management appliance: 1 per deployment.");

  // ── 6. Matrix / router — never exactly what you need, next size up ──
  // Jackson's stated rule is 2 outputs per server; dual-GPU boxes physically
  // carry 4, so they feed the matrix at 4 and the job is flagged for his
  // confirmation rather than silently undersizing the router.
  const standardServers = totalServers - dualCardServers;
  const matrixInputsNeeded =
    standardServers * OUTPUTS_PER_SERVER + dualCardServers * OUTPUTS_PER_DUAL_SERVER;
  const matrixSize = pickMatrixSize(matrixInputsNeeded);
  const matrixMath =
    dualCardServers > 0
      ? `${standardServers} standard servers × 2 + ${dualCardServers} dual-GPU servers × ${OUTPUTS_PER_DUAL_SERVER} = ${matrixInputsNeeded}`
      : `${totalServers} servers × 2 = ${matrixInputsNeeded}`;
  const matrixFlags =
    dualCardServers > 0
      ? [
          `Dual-GPU servers counted at ${OUTPUTS_PER_DUAL_SERVER} outputs into the matrix (Jackson's stated rule only covered standard 2-output boxes) — confirm router feed count with Jackson.`,
        ]
      : [];
  think(
    "Size the matrix",
    `Every server puts its outputs toward the router: ${matrixMath} sources into the matrix. ` +
      (matrixSize
        ? `You never select exactly what you need — always the next size up, so ${matrixInputsNeeded} inputs lands on a ${matrixSize}×${matrixSize}.`
        : `That's beyond the largest matrix on the rate card (48×48) — this one goes to design review instead of a guess.`)
  );
  if (matrixSize) {
    addLine(
      SKU.MATRIX(matrixSize),
      1,
      `Matrix: ${matrixMath} inputs → next size up = ${matrixSize}×${matrixSize} (never select exactly what you need).`,
      matrixFlags
    );
    addLine(
      SKU.ROUTER_CABLE,
      matrixInputsNeeded,
      `Router cables: 1 per connected port (${matrixInputsNeeded} inputs in use).`,
      ["Cable count assumed = connected inputs. Confirm whether outputs also need cables."]
    );
  } else {
    reviewFlags.push(
      `System needs ${matrixInputsNeeded} matrix inputs — beyond the largest catalog matrix (48×48). Needs Jackson's design.`,
      ...matrixFlags
    );
  }

  // ── 7. Racks — ~1 per 12 servers; cabinet + accessories + UPS + rack WS each ──
  const racks = Math.max(1, Math.ceil(totalServers / SERVERS_PER_RACK));
  think(
    "Build the racks",
    `Roughly one rack per ${SERVERS_PER_RACK} servers → ${racks} rack(s). Each rack carries its cabinet, accessories, UPS power conditioning, and a rack-mount workstation.`
  );
  const rackRationale = `${totalServers} servers → ${racks} rack(s) at ~${SERVERS_PER_RACK} servers per rack.`;
  addLine(SKU.RACK_CABINET, racks, `Rack cabinetry: 1 per rack. ${rackRationale}`);
  addLine(SKU.RACK_WS, racks, `Rack-mount workstation: 1 per rack. ${rackRationale}`);
  addLine(SKU.RACK_ACC, racks, `Rack accessories: 1 set per rack. ${rackRationale}`);
  addLine(SKU.RACK_UPS, racks, `Power conditioning (UPS): 1 per rack. ${rackRationale}`);

  // Outdoor racks — every 150 ft of outdoor screen width
  let outdoorRacks = 0;
  for (const screen of job.screens) {
    if (!screen.outdoor) continue;
    if (screen.physicalWidthFt && screen.physicalWidthFt > 0) {
      outdoorRacks += Math.max(1, Math.ceil(screen.physicalWidthFt / CLOSET_PLANNING_FT));
    } else {
      outdoorRacks += 1;
      reviewFlags.push(
        `${screen.name} is outdoor but has no physical width — assumed 1 outdoor rack. Add width in feet for the every-${CLOSET_PLANNING_FT}-ft rule.`
      );
    }
  }
  if (outdoorRacks > 0) {
    think(
      "Build the racks",
      `Outdoor screens get climate-controlled racks on the ${CLOSET_PLANNING_FT}-ft rule — one waterproof A/C rack per ${CLOSET_PLANNING_FT} ft of screen width → ${outdoorRacks} outdoor rack(s).`
    );
    addLine(
      SKU.RACK_OUTDOOR,
      outdoorRacks,
      `Outdoor A/C racks: 1 per ${CLOSET_PLANNING_FT} ft of outdoor screen width.`
    );
  }

  // ── 8. Network switches — 1 per rack, always 3-4 in a deployment ──
  const switches = Math.max(3, racks + outdoorRacks);
  think(
    "Network & triggers",
    `Switches are a floating number: one per rack, never fewer than three in a deployment → ${switches}. ` +
      `Plus a GPI trigger — every job takes fire-alarm control in, minimum one.`
  );
  addLine(
    SKU.SWITCH,
    switches,
    `Network switches: 1 per rack, never fewer than 3 in a deployment (${racks + outdoorRacks} rack(s) → ${switches}).`,
    ['Jackson calls this "a floating number" that grows with hardware — review on unusual layouts.']
  );

  // ── 9. GPI trigger — minimum 1 on every job (fire-alarm intake) ──
  addLine(SKU.GPI, 1, "GPI trigger: minimum 1 per job for fire-alarm system intake.");

  // ── 10. Install labor — 1 week per rack ──
  think(
    "Price the labor",
    `Install labor compounds off the racks: about a week of work per rack → ${racks + outdoorRacks} week(s) of integration.`
  );
  addLine(
    SKU.INTEGRATION_WEEK,
    racks + outdoorRacks,
    `Install/integration labor: ~1 week of work per rack (${racks + outdoorRacks} rack(s)).`
  );

  // ── 11. Licensing — flagged, not defaulted ──
  think(
    "Licensing & review",
    `Most RFP jobs are quoted non-license and trued up after the fact, so the license is ${job.includeLicense ? "included because it was requested" : "left off by default"} and flagged either way. ` +
      `Scalers are skipped — not purchased since the platform's hardware advancements. Anything the rules can't decide with confidence is flagged for a human, never guessed.`
  );
  if (job.includeLicense) {
    addLine(SKU.LICENSE, 1, "LiveSync license explicitly included by the estimator.");
  }
  reviewFlags.push(
    "Licensing: most RFP jobs are quoted non-license and charged after the fact. License is " +
      (job.includeLicense ? "INCLUDED" : "EXCLUDED") +
      " on this BOM — confirm per job until Jackson clarifies the policy."
  );

  // ── 12. Processor advisory (informational — processor SKUs live on the LED side) ──
  think(
    "Check the processing side",
    `Separately from the control system, each screen's total pixel count divided by ${PIXELS_PER_PORT.toLocaleString()} pixels per output card gives the data lines. ` +
      `Under 6 ports fits a 660 Pro, up to 16 a 4K, beyond that the 8-series — and one processor carrying all the ports always beats splitting across two. ` +
      `Fiber conversion rides along: a pair per ${DATA_LINES_PER_FIBER_PAIR} data lines, with closets/IDFs and outdoor racks breaking on the ${CLOSET_PLANNING_FT}-ft rule.`
  );
  const processorAdvisories: ProcessorAdvisory[] = job.screens.map((screen) => {
    const flags: string[] = [];
    const totalPixels = screen.pixelWidth * screen.pixelHeight;
    const ports = Math.max(1, Math.ceil(totalPixels / PIXELS_PER_PORT));
    let recommendedClass: string;
    if (ports <= 6) recommendedClass = "660 Pro class (up to 6 ports)";
    else if (ports <= 16) recommendedClass = "4K class (up to 16 ports)";
    else recommendedClass = "8-series class (multi-card, >16 ports)";
    if (ports > 6 && ports <= 12) {
      flags.push(
        "Could technically split across two 660 Pros — Jackson prefers ONE processor that carries all ports."
      );
    }

    let closets = 1;
    if (screen.physicalWidthFt && screen.physicalWidthFt > 0) {
      closets = Math.max(1, Math.ceil(screen.physicalWidthFt / CLOSET_PLANNING_FT));
    } else {
      flags.push(
        "No physical width provided — closet/IDF count assumed 1. Data lines may return to multiple closets on wide screens."
      );
    }
    const portsPerCloset = Math.ceil(ports / closets);
    const fiberPairs = closets * Math.max(1, Math.ceil(portsPerCloset / DATA_LINES_PER_FIBER_PAIR));

    const outdoorRacksForScreen =
      screen.outdoor && screen.physicalWidthFt
        ? Math.max(1, Math.ceil(screen.physicalWidthFt / CLOSET_PLANNING_FT))
        : screen.outdoor
          ? 1
          : 0;

    return {
      name: screen.name,
      totalPixels,
      portsNeeded: ports,
      recommendedClass,
      closets,
      fiberConverterPairs: fiberPairs,
      outdoorRacks: outdoorRacksForScreen,
      flags,
    };
  });

  // ── 12b. Can the processing side actually carry a price? ──
  // Jackson's layout rules above are complete; what is missing is a priced
  // product to attach them to. Say which, in as many words, instead of handing
  // over a table of counts that reads as a broken total.
  const pricedProcessorSkus = catalog.filter(
    (c) => c.isActive && PROCESSING_CATEGORIES.has(c.category)
  );
  const totalPortsNeeded = processorAdvisories.reduce((s, a) => s + a.portsNeeded, 0);
  const totalFiberPairs = processorAdvisories.reduce((s, a) => s + a.fiberConverterPairs, 0);
  const processingStatus: ProcessingPricingStatus = pricedProcessorSkus.length
    ? {
        priced: true,
        summary: `Processing priced from ${pricedProcessorSkus.length} catalog SKU(s) across ${totalPortsNeeded} port(s) and ${totalFiberPairs} fiber pair(s).`,
        missingInputs: [],
      }
    : {
        priced: false,
        summary:
          `Processing is NOT priced on this sheet. The layout is solved — ${totalPortsNeeded} data port(s), ` +
          `${totalFiberPairs} fiber-converter pair(s) and the processor class per screen are below — but no processor or ` +
          `fiber-converter SKU carries a price in any ANC catalog, so there is nothing to multiply them by. ` +
          `Quote processing from Jackson's rate card by hand until those SKUs are loaded.`,
        missingInputs: [
          "Processor SKUs and unit costs (660 Pro / 4K / 8-series classes) from Jackson's processor rate card.",
          "Fiber-converter pair SKU and unit cost.",
          "Waterproof/outdoor rack SKU and unit cost for outdoor screens.",
        ],
      };
  if (!processingStatus.priced) {
    reviewFlags.push(
      "Processing carries NO price on this sheet — control system only. Add it from Jackson's processor rate card before the number goes to a client."
    );
  }

  // ── Job-level review flags ──
  if (autoStripped.length > 0) {
    reviewFlags.push(
      `Mapped as ribbon board(s) from their shape — stripped onto the canvas instead of tiled: ${autoStripped.join(", ")}. ` +
        `Set the mapping to Standard on any of these that is a single video image rather than a band.`
    );
  }
  if (tierBumps.length > 0) {
    reviewFlags.push(
      `Storage bumped above 4TB on: ${tierBumps.map((t) => `${t.name} (${t.tier})`).join(", ")} — exact 4/6/8 TB thresholds are pending Jackson's confirmation.`
    );
  }
  if (linesFromCostPlusMargin > 0) {
    reviewFlags.push(
      `${linesFromCostPlusMargin} of ${lines.length} BOM lines carry no sell price in the catalog, so they are quoted at cost ÷ (1 − ${(pricing.margin * 100).toFixed(1)}%) — the LiveSync margin from ${pricing.marginSource}. Set explicit sell prices in the CMS catalog to override per SKU.`
    );
  }
  reviewFlags.push(
    "Server hardware prices fluctuate roughly every 15 days (Jackson) — verify catalog prices are current before quoting."
  );
  assumptions.push(
    "Scaler section skipped — Jackson: no longer purchased after LiveSync hardware advancements.",
    "Every server is quoted primary + dedicated 1:1 backup, per Jackson (no exceptions).",
    "Training weeks not auto-added — add manually if the job includes operator training."
  );

  // ── Totals ──
  let hardware = 0;
  let softCost = 0;
  let license = 0;
  let cost = 0;
  for (const line of lines) {
    cost += line.lineCost;
    if (SOFT_COST.has(line.category)) softCost += line.lineTotal;
    else if (LICENSE_CAT.has(line.category)) license += line.lineTotal;
    else hardware += line.lineTotal;
  }
  const round = (n: number) => Number(n.toFixed(2));

  return {
    lines,
    screenPlans,
    processorAdvisories,
    pricing: {
      margin: pricing.margin,
      marginSource: pricing.marginSource,
      linesFromCatalogSell,
      linesFromCostPlusMargin,
    },
    processing: processingStatus,
    totals: {
      cost: round(cost),
      hardware: round(hardware),
      softCost: round(softCost),
      license: round(license),
      grand: round(hardware + softCost + license),
    },
    counts: {
      uiServers,
      renderServers,
      totalServers,
      workstations,
      racks: racks + outdoorRacks,
      matrixSize,
      matrixInputsNeeded,
    },
    reviewFlags,
    assumptions,
    reasoning,
  };
}
