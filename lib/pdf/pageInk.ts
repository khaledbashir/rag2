/**
 * Look at a page of a PDF the way a person does.
 *
 * The brander used to be *told* where the mark goes — a corner, a band edge — and
 * every file is different, so being told is being wrong on most of them. Top-left
 * put the mark through the word SIGNAGE on a cover sheet; a top band on a CAD
 * drawing reads as a strip taped above the sheet rather than branding on it.
 *
 * So: rasterize the page, work out where the ink actually is, and let the placer
 * find real blank paper. Everything here is measurement — no drawing, no policy.
 *
 * The raster is in *visual* space (pdf.js applies /Rotate when it builds the
 * viewport), which is the same space `visualToUser` in brandPdf.ts maps out of, so
 * a coordinate found here can be handed straight to the stamp.
 */

/** A summed-area table over the page's ink, plus what the paper itself looks like. */
export interface PageInk {
  /** Raster size. */
  cols: number;
  rows: number;
  /** Raster pixels per point. */
  scale: number;
  /** The sheet as the reader sees it, in points. */
  visualWidth: number;
  visualHeight: number;
  /**
   * (cols+1) x (rows+1) summed-area table, row-major, rows running *down* from
   * the visual top. Makes "how much ink is in this rectangle" O(1), which is what
   * lets the placer try a couple of thousand candidate positions per page.
   */
  integral: Int32Array;
  /** Luma the paper sits at, 0–255. */
  paper: number;
  /** Fraction of the sheet carrying ink. */
  coverage: number;
  /**
   * Dark paper. A blue-on-white wordmark does not belong on it, and "blank" means
   * something different there — the placer declines and adds a strip instead.
   */
  darkPaper: boolean;
  /**
   * The rendered sheet as PNG, kept only for the pages a vision judge will look
   * at. Holding one of these per page of a 67-sheet set would be tens of
   * megabytes for nothing.
   */
  image?: Uint8Array;
}

/** Rectangle in raster pixels, rows measured down from the visual top. */
export interface PixelRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/**
 * Ink map from raw RGBA, composited over white.
 *
 * pdf.js paints onto a transparent canvas — untouched paper comes back with
 * alpha 0, not white — so anything reading these pixels has to do the compositing
 * itself or every blank page looks like solid black ink.
 *
 * "Ink" is relative to the paper rather than absolute, because a scanned drawing's
 * background sits around 235 and an absolute white test would call the entire
 * sheet covered.
 */
export function inkMapFromRgba(
  rgba: Uint8Array | Uint8ClampedArray,
  cols: number,
  rows: number,
  visualWidth: number,
  visualHeight: number,
): PageInk {
  const count = cols * rows;
  const luma = new Uint8Array(count);
  const histogram = new Int32Array(256);

  for (let i = 0; i < count; i += 1) {
    const o = i * 4;
    const alpha = rgba[o + 3] / 255;
    const lit =
      0.299 * rgba[o] + 0.587 * rgba[o + 1] + 0.114 * rgba[o + 2];
    // Over white: transparent pixels are paper, not black.
    const value = Math.round(lit * alpha + 255 * (1 - alpha));
    luma[i] = value;
    histogram[value] += 1;
  }

  // The paper is the lightest tone that covers a meaningful part of the sheet —
  // walk down from white until 1.5% of the page is accounted for.
  //
  // Not a mid-range percentile: a dense drawing can be 95% line work and still be
  // printed on white, and reading its *median* as the paper declares the whole
  // sheet dark, refuses to place anything, and sends a perfectly brandable
  // drawing to the fallback strip. The margins are what the mark goes on, so the
  // margins are what defines the paper.
  let seen = 0;
  let paper = 0;
  const target = Math.max(1, count * 0.015);
  for (let value = 255; value >= 0; value -= 1) {
    seen += histogram[value];
    if (seen >= target) {
      paper = value;
      break;
    }
  }

  // 14 levels below the paper is past JPEG mottle and scanner noise but well
  // above the faintest real line work.
  const threshold = Math.max(24, paper - 14);

  const stride = cols + 1;
  const integral = new Int32Array(stride * (rows + 1));
  let inkPixels = 0;

  for (let y = 0; y < rows; y += 1) {
    let rowSum = 0;
    const rowBase = y * cols;
    const outBase = (y + 1) * stride;
    const prevBase = y * stride;
    for (let x = 0; x < cols; x += 1) {
      if (luma[rowBase + x] < threshold) {
        rowSum += 1;
        inkPixels += 1;
      }
      integral[outBase + x + 1] = integral[prevBase + x + 1] + rowSum;
    }
  }

  return {
    cols,
    rows,
    scale: cols / visualWidth,
    visualWidth,
    visualHeight,
    integral,
    paper,
    coverage: count === 0 ? 0 : inkPixels / count,
    darkPaper: paper < 140,
  };
}

/** Ink pixels inside a raster rectangle, clipped to the sheet. O(1). */
export function inkPixelsIn(map: PageInk, rect: PixelRect): number {
  const x0 = clamp(Math.floor(rect.left), 0, map.cols);
  const y0 = clamp(Math.floor(rect.top), 0, map.rows);
  const x1 = clamp(Math.ceil(rect.left + rect.width), 0, map.cols);
  const y1 = clamp(Math.ceil(rect.top + rect.height), 0, map.rows);
  if (x1 <= x0 || y1 <= y0) return 0;

  const stride = map.cols + 1;
  return (
    map.integral[y1 * stride + x1] -
    map.integral[y0 * stride + x1] -
    map.integral[y1 * stride + x0] +
    map.integral[y0 * stride + x0]
  );
}

/**
 * A rectangle given in visual points (origin bottom-left, y up) as raster pixels
 * (origin top-left, y down) — the one place that flip is allowed to happen.
 */
export function visualRectToPixels(
  map: PageInk,
  vx: number,
  vy: number,
  width: number,
  height: number,
): PixelRect {
  return {
    left: vx * map.scale,
    top: (map.visualHeight - (vy + height)) * map.scale,
    width: width * map.scale,
    height: height * map.scale,
  };
}

/**
 * Is this piece of the sheet blank enough to put a logo on?
 *
 * Tolerance is proportional with an absolute floor: a few stray pixels are
 * antialiasing off a nearby line, while anything real — a border, a dimension, a
 * word — crosses the whole rectangle and lands orders of magnitude above it.
 */
export function isClear(map: PageInk, vx: number, vy: number, width: number, height: number): boolean {
  const rect = visualRectToPixels(map, vx, vy, width, height);
  const area = Math.max(1, Math.round(rect.width) * Math.round(rect.height));
  const allowed = Math.max(2, Math.floor(area * 0.0006));
  return inkPixelsIn(map, rect) <= allowed;
}

/** Renders a page and measures it. Everything above is pure; this is the part that draws. */
export async function renderPageInk(
  pdfBytes: Uint8Array,
  pageNumber: number,
  longSide: number,
  withImage = false,
): Promise<PageInk> {
  const { createIsomorphicCanvasFactory, getDocumentProxy, resolvePDFJSImport } = await import(
    "unpdf"
  );
  await resolvePDFJSImport();
  const CanvasFactory = (await createIsomorphicCanvasFactory(
    () => import("@napi-rs/canvas") as never,
  )) as unknown as CanvasFactoryCtor;
  const pdf = await getDocumentProxy(pdfBytes, { CanvasFactory } as never);

  try {
    return await inkForPage(pdf, CanvasFactory, pageNumber, longSide, withImage);
  } finally {
    await pdf.destroy?.();
  }
}

/**
 * Every page of one already-open document.
 *
 * Opening the file once matters: a 67-page drawing set re-parsed per page is the
 * difference between a request that finishes and one that times out.
 */
export async function renderPagesInk(
  pdfBytes: Uint8Array,
  pageNumbers: number[],
  longSide: number,
  budgetMs: number,
  imagePages: Set<number> = new Set(),
): Promise<Map<number, PageInk>> {
  const results = new Map<number, PageInk>();
  if (pageNumbers.length === 0) return results;

  const { createIsomorphicCanvasFactory, getDocumentProxy, resolvePDFJSImport } = await import(
    "unpdf"
  );
  await resolvePDFJSImport();
  const CanvasFactory = (await createIsomorphicCanvasFactory(
    () => import("@napi-rs/canvas") as never,
  )) as unknown as CanvasFactoryCtor;
  const pdf = await getDocumentProxy(pdfBytes, { CanvasFactory } as never);

  const started = Date.now();
  try {
    for (const pageNumber of pageNumbers) {
      // Out of time: the caller falls back to a strip for what is left, which
      // covers nothing, and says so. Better than a request that never returns.
      if (Date.now() - started > budgetMs) break;
      try {
        results.set(
          pageNumber,
          await inkForPage(pdf, CanvasFactory, pageNumber, longSide, imagePages.has(pageNumber)),
        );
      } catch {
        // One unreadable page must not cost the other sixty-six their branding.
      }
    }
  } finally {
    await pdf.destroy?.();
  }
  return results;
}

/**
 * The canvas seam is untyped on both sides — unpdf hands back a union of its
 * browser and node factories, and pnpm can resolve two copies of the native
 * canvas package whose types are nominally different. Narrow it here, once, to
 * the two calls actually used.
 */
type CanvasFactoryCtor = new () => {
  create(width: number, height: number): CanvasHandle;
  destroy?: (handle: unknown) => void;
};

interface CanvasHandle {
  canvas: { width: number; height: number; toBuffer?: (mime: string) => Buffer };
  context: {
    fillStyle: string;
    fillRect(x: number, y: number, w: number, h: number): void;
    getImageData(x: number, y: number, w: number, h: number): { data: Uint8ClampedArray };
  };
}

async function inkForPage(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pdf: any,
  CanvasFactory: CanvasFactoryCtor,
  pageNumber: number,
  longSide: number,
  withImage: boolean,
): Promise<PageInk> {
  const page = await pdf.getPage(pageNumber);
  // scale 1 gives the viewport with /Rotate already applied — the sheet as read.
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(1, longSide / Math.max(base.width, base.height));
  const viewport = page.getViewport({ scale });

  const cols = Math.max(1, Math.floor(viewport.width));
  const rows = Math.max(1, Math.floor(viewport.height));

  const factory = new CanvasFactory();
  const handle = factory.create(cols, rows);
  try {
    // pdf.js paints onto a transparent canvas, so the sheet has to be given its
    // paper first. Without this the PNG handed to a vision model is a drawing
    // floating on nothing, which decodes as a black page about as often as not.
    handle.context.fillStyle = "#ffffff";
    handle.context.fillRect(0, 0, cols, rows);
    await page.render({ canvas: handle.canvas, canvasContext: handle.context, viewport }).promise;
    const pixels = handle.context.getImageData(0, 0, cols, rows);
    const map = inkMapFromRgba(pixels.data, cols, rows, base.width, base.height);
    if (withImage && handle.canvas.toBuffer) {
      map.image = new Uint8Array(handle.canvas.toBuffer("image/png"));
    }
    return map;
  } finally {
    factory.destroy?.(handle);
    page.cleanup?.();
  }
}
