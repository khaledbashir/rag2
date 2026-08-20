import { PDFDocument, degrees } from "pdf-lib";
import { describe, expect, it } from "vitest";

import {
  BrandPdfPosition,
  brandPdf,
  brandedFileName,
  stampGeometry,
  visualSize,
  visualToUser,
  winAnsiSafe,
} from "./brandPdf";

const POSITIONS: BrandPdfPosition[] = ["top-left", "top-right", "bottom-left", "bottom-right"];
const ROTATIONS = [0, 90, 180, 270] as const;

async function makePdf(
  pages: Array<{ width: number; height: number; rotate?: number }>,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (const spec of pages) {
    const page = doc.addPage([spec.width, spec.height]);
    if (spec.rotate) page.setRotation(degrees(spec.rotate));
    page.drawText("existing content", { x: 40, y: 40, size: 10 });
  }
  return doc.save();
}

/**
 * The user-space box a rectangle occupies once pdf-lib rotates it about its
 * anchor — the thing that has to stay inside the MediaBox.
 */
function occupied(
  anchor: { x: number; y: number; rotate: number },
  width: number,
  height: number,
) {
  switch (anchor.rotate) {
    case 90:
      return { x0: anchor.x - height, x1: anchor.x, y0: anchor.y, y1: anchor.y + width };
    case 180:
      return { x0: anchor.x - width, x1: anchor.x, y0: anchor.y - height, y1: anchor.y };
    case 270:
      return { x0: anchor.x, x1: anchor.x + height, y0: anchor.y - width, y1: anchor.y };
    default:
      return { x0: anchor.x, x1: anchor.x + width, y0: anchor.y, y1: anchor.y + height };
  }
}

describe("visualToUser", () => {
  it("puts the visual origin back at the user origin on an unrotated page", () => {
    expect(visualToUser(0, 612, 792, 10, 20)).toEqual({ x: 10, y: 20, rotate: 0 });
  });

  it("maps every corner of a rotated page back inside the page box", () => {
    const w = 612;
    const h = 792;

    for (const rotation of ROTATIONS) {
      const visual = visualSize(rotation, w, h);
      const corners = [
        [0, 0],
        [visual.width, 0],
        [0, visual.height],
        [visual.width, visual.height],
      ];

      for (const [vx, vy] of corners) {
        const { x, y } = visualToUser(rotation, w, h, vx, vy);
        expect(x).toBeGreaterThanOrEqual(-0.001);
        expect(x).toBeLessThanOrEqual(w + 0.001);
        expect(y).toBeGreaterThanOrEqual(-0.001);
        expect(y).toBeLessThanOrEqual(h + 0.001);
      }
    }
  });

  it("keeps distinct visual corners distinct in user space", () => {
    // A mapping that collapsed corners would silently stack every stamp in one spot.
    for (const rotation of ROTATIONS) {
      const visual = visualSize(rotation, 612, 792);
      const seen = new Set(
        [
          [0, 0],
          [visual.width, 0],
          [0, visual.height],
        ].map(([vx, vy]) => {
          const p = visualToUser(rotation, 612, 792, vx, vy);
          return `${p.x.toFixed(2)},${p.y.toFixed(2)}`;
        }),
      );
      expect(seen.size).toBe(3);
    }
  });
});

describe("visualSize", () => {
  it("swaps the axes for quarter turns and leaves them alone otherwise", () => {
    expect(visualSize(0, 612, 792)).toEqual({ width: 612, height: 792 });
    expect(visualSize(180, 612, 792)).toEqual({ width: 612, height: 792 });
    expect(visualSize(90, 612, 792)).toEqual({ width: 792, height: 612 });
    expect(visualSize(270, 612, 792)).toEqual({ width: 792, height: 612 });
  });
});

describe("stampGeometry", () => {
  it("keeps the 1060:271 wordmark ratio at every scale", () => {
    for (const scale of [0.5, 1, 1.7]) {
      const { logo } = stampGeometry(1224, 792, "top-left", scale);
      expect(logo.width / logo.height).toBeCloseTo(1060 / 271, 4);
    }
  });

  it("keeps the stamp inside the page in every corner, portrait and landscape", () => {
    for (const [w, h] of [
      [612, 792],
      [2384, 3370],
      [1224, 792],
    ]) {
      for (const position of POSITIONS) {
        const { pill } = stampGeometry(w, h, position, 1);
        expect(pill.vx).toBeGreaterThanOrEqual(0);
        expect(pill.vy).toBeGreaterThanOrEqual(0);
        expect(pill.vx + pill.width).toBeLessThanOrEqual(w);
        expect(pill.vy + pill.height).toBeLessThanOrEqual(h);
      }
    }
  });

  it("sits the mark inside its backing pill", () => {
    const { pill, logo } = stampGeometry(1224, 792, "bottom-right", 1);
    expect(logo.vx).toBeGreaterThan(pill.vx);
    expect(logo.vy).toBeGreaterThan(pill.vy);
    expect(logo.vx + logo.width).toBeLessThan(pill.vx + pill.width);
    expect(logo.vy + logo.height).toBeLessThan(pill.vy + pill.height);
  });
});

describe("winAnsiSafe", () => {
  it("survives the characters that throw on a standard font", () => {
    // A screen named "Level 400 – Grand Concourse" killed an RFP bid-form fill
    // on 2026-08-10 for exactly this reason.
    expect(winAnsiSafe("Level 400 – Grand Concourse")).toBe("Level 400 - Grand Concourse");
    expect(winAnsiSafe("Thunder — OKC")).toBe("Thunder - OKC");
    expect(winAnsiSafe("“quoted” ‘thing’")).toBe('"quoted" \'thing\'');
    expect(winAnsiSafe("M&T… done")).toBe("M&T... done");
  });

  it("strips characters no standard font can encode", () => {
    expect(winAnsiSafe("drawing 図面 rev")).toBe("drawing rev");
    expect(winAnsiSafe("ANC ✅ ready")).toBe("ANC ready");
  });

  it("keeps the ampersand that M&T Bank Stadium depends on", () => {
    expect(winAnsiSafe("M&T Bank Stadium")).toBe("M&T Bank Stadium");
  });
});

describe("brandedFileName", () => {
  it("builds a name a person would recognise", () => {
    expect(brandedFileName("OKC Thunder LED Display Drawing", null)).toBe(
      "ANC_OKC_Thunder_LED_Display_Drawing.pdf",
    );
  });

  it("falls back to the uploaded name and does not double the prefix", () => {
    expect(brandedFileName(null, "thunder drawing.pdf")).toBe("ANC_thunder_drawing.pdf");
    expect(brandedFileName("ANC Ravens Recap", null)).toBe("ANC_Ravens_Recap.pdf");
  });

  it("never returns a bare .pdf when given nothing usable", () => {
    expect(brandedFileName(null, null)).toBe("ANC_Document.pdf");
    expect(brandedFileName("!!!", null)).toBe("ANC_Document.pdf");
  });
});

describe("brandPdf", () => {
  it("overlay brands every page without changing the page count or size", async () => {
    const input = await makePdf([
      { width: 612, height: 792 },
      { width: 612, height: 792 },
    ]);
    const result = await brandPdf(input, { placement: "overlay", title: "Thunder Drawing" });

    expect(result.pageCount).toBe(2);
    expect(result.stampedPages).toBe(2);

    const out = await PDFDocument.load(result.bytes);
    expect(out.getPageCount()).toBe(2);
    expect(out.getPage(0).getWidth()).toBeCloseTo(612, 1);
    expect(out.getPage(0).getHeight()).toBeCloseTo(792, 1);
    expect(result.bytes.length).toBeGreaterThan(input.length);
  });

  it("defaults to reading the sheet and marking it in the bottom right", async () => {
    const input = await makePdf([{ width: 1224, height: 792 }]);
    const result = await brandPdf(input, { title: "Signage Drawings" });

    expect(result.placement).toBe("auto");
    expect(result.position).toBe("bottom-right");
    // Blank paper was there, so the mark went onto the sheet and the sheet is
    // exactly the size it arrived at — nothing added, nothing scaled.
    expect(result.placedOnSheet).toBe(1);
    expect(result.placedOnBand).toBe(0);
    expect(result.positionsUsed).toEqual(["bottom-right"]);

    const page = (await PDFDocument.load(result.bytes)).getPage(0);
    expect(page.getWidth()).toBeCloseTo(1224, 1);
    expect(page.getHeight()).toBeCloseTo(792, 1);
  }, 30_000);

  it("adds a band when asked, which cannot cover anything already on the page", async () => {
    const input = await makePdf([{ width: 1224, height: 792 }]);
    const result = await brandPdf(input, { placement: "band", title: "Signage Drawings" });

    expect(result.placement).toBe("band");
    expect(result.edge).toBe("top");

    const page = (await PDFDocument.load(result.bytes)).getPage(0);
    // The sheet gained paper on one edge; the drawing's own width is untouched,
    // so nothing has been scaled and nothing has been drawn over.
    expect(page.getWidth()).toBeCloseTo(1224, 1);
    expect(page.getHeight()).toBeGreaterThan(792);
    expect(page.getHeight()).toBeLessThan(792 + 60);
  });

  it("grows the top of the sheet for a top band and the bottom for a bottom band", async () => {
    const input = await makePdf([{ width: 612, height: 792 }]);

    const top = await PDFDocument.load((await brandPdf(input, { placement: "band", edge: "top" })).bytes);
    const bottom = await PDFDocument.load((await brandPdf(input, { placement: "band", edge: "bottom" })).bytes);

    // Same amount of new paper either way, on opposite edges — a top band keeps
    // the original origin, a bottom band pushes it down.
    expect(top.getPage(0).getMediaBox().y).toBeCloseTo(0, 1);
    expect(bottom.getPage(0).getMediaBox().y).toBeLessThan(0);
    expect(top.getPage(0).getHeight()).toBeCloseTo(bottom.getPage(0).getHeight(), 1);
  });

  it("grows the reader's edge, not the MediaBox edge, on a rotated page", async () => {
    // On /Rotate 90 the reader's top is a MediaBox *side*. Growing the MediaBox
    // top here would put the band down the left-hand edge of the drawing.
    const input = await makePdf([{ width: 612, height: 1224, rotate: 90 }]);
    const page = (await PDFDocument.load((await brandPdf(input, { placement: "band" })).bytes)).getPage(0);

    expect(page.getWidth()).toBeGreaterThan(612);
    expect(page.getHeight()).toBeCloseTo(1224, 1);
    expect(page.getMediaBox().x).toBeLessThan(0);
  });

  it("sets CropBox alongside MediaBox so viewers actually show the band", async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([612, 792]);
    page.setCropBox(0, 0, 612, 792);
    const result = await brandPdf(await doc.save(), { placement: "band" });

    const out = (await PDFDocument.load(result.bytes)).getPage(0);
    // A viewer honours CropBox; leaving it behind would clip the strip straight off.
    expect(out.getCropBox().height).toBeCloseTo(out.getMediaBox().height, 1);
    expect(out.getCropBox().height).toBeGreaterThan(792);
  });

  it("never shrinks an existing MediaBox when CropBox is inset", async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([700, 900]);
    page.setCropBox(50, 50, 600, 830);

    const result = await brandPdf(await doc.save(), { placement: "band" });
    const out = (await PDFDocument.load(result.bytes)).getPage(0);
    const media = out.getMediaBox();
    const crop = out.getCropBox();

    expect(media.width).toBeGreaterThanOrEqual(700);
    expect(media.height).toBeGreaterThan(900);
    expect(crop.x).toBeCloseTo(50, 1);
    expect(crop.width).toBeCloseTo(600, 1);
    expect(crop.height).toBeGreaterThan(830);
  });

  it("stamps only the first page when asked", async () => {
    const input = await makePdf([
      { width: 612, height: 792 },
      { width: 612, height: 792 },
      { width: 612, height: 792 },
    ]);
    const result = await brandPdf(input, { placement: "band", pages: "first" });

    expect(result.pageCount).toBe(3);
    expect(result.stampedPages).toBe(1);
  });

  it("brands a landscape drawing carrying /Rotate 90 and keeps it landscape", async () => {
    // The shape almost every CAD export arrives in: a portrait MediaBox plus a
    // quarter turn. Placing on the raw MediaBox puts the mark off the page.
    const input = await makePdf([{ width: 612, height: 1224, rotate: 90 }]);
    const result = await brandPdf(input, { placement: "overlay", title: "Rotated Drawing" });

    const out = await PDFDocument.load(result.bytes);
    const page = out.getPage(0);
    expect(page.getRotation().angle).toBe(90);
    expect(page.getWidth()).toBeCloseTo(612, 1);
    expect(page.getHeight()).toBeCloseTo(1224, 1);
  });

  it("places auto inside the visible sheet on a rotated drawing", async () => {
    // The shape almost every CAD export arrives in. pdf.js renders the sheet
    // already turned, so a coordinate found on the raster is in the reader's
    // space — it still has to be mapped back through /Rotate before it is drawn,
    // and getting that wrong puts the mark off the page, sideways.
    const input = await makePdf([{ width: 612, height: 1224, rotate: 90 }]);
    const result = await brandPdf(input, { title: "Rotated Drawing" });

    expect(result.placedOnSheet).toBe(1);
    expect(result.placedOnBand).toBe(0);

    const page = (await PDFDocument.load(result.bytes)).getPage(0);
    expect(page.getRotation().angle).toBe(90);
    expect(page.getWidth()).toBeCloseTo(612, 1);
    expect(page.getHeight()).toBeCloseTo(1224, 1);
  }, 30_000);

  it("keeps the stamp inside the page box at every rotation and corner", async () => {
    for (const rotation of ROTATIONS) {
      const w = 612;
      const h = 1224;
      const visual = visualSize(rotation, w, h);

      for (const position of POSITIONS) {
        const geometry = stampGeometry(visual.width, visual.height, position, 1);
        const anchor = visualToUser(rotation, w, h, geometry.pill.vx, geometry.pill.vy);
        const box = occupied(anchor, geometry.pill.width, geometry.pill.height);

        expect(box.x0, `${rotation}/${position} left edge`).toBeGreaterThanOrEqual(-0.5);
        expect(box.y0, `${rotation}/${position} bottom edge`).toBeGreaterThanOrEqual(-0.5);
        expect(box.x1, `${rotation}/${position} right edge`).toBeLessThanOrEqual(w + 0.5);
        expect(box.y1, `${rotation}/${position} top edge`).toBeLessThanOrEqual(h + 0.5);
      }
    }
  });

  it("does not throw on a title carrying an en dash", async () => {
    const input = await makePdf([{ width: 612, height: 792 }]);
    const result = await brandPdf(input, { placement: "band", title: "Level 400 – Grand Concourse" });

    expect(result.footer).toContain("Level 400 - Grand Concourse");
    expect(result.footer).not.toContain("–");
  });

  it("leaves the footer off when asked", async () => {
    const input = await makePdf([{ width: 612, height: 792 }]);
    const result = await brandPdf(input, { placement: "band", footer: false });
    expect(result.footer).toBeNull();
  });

  it("puts the date and anc.com in the default footer", async () => {
    const input = await makePdf([{ width: 612, height: 792 }]);
    const result = await brandPdf(input, { placement: "band", title: "Thunder" });

    expect(result.footer).toMatch(/^ANC \| Thunder \| \d{1,2} \w+ \d{4} \| www\.anc\.com$/);
  });

  it("honours a caller-supplied footer verbatim", async () => {
    const input = await makePdf([{ width: 612, height: 792 }]);
    const result = await brandPdf(input, { placement: "band", footerText: "ANC Sports Enterprises" });
    expect(result.footer).toBe("ANC Sports Enterprises");
  });

  it("refuses bytes that are not a PDF rather than returning a broken file", async () => {
    await expect(brandPdf(Buffer.from("this is not a pdf"))).rejects.toThrow(/could not be opened/i);
  });

  /**
   * Brand a real document and write the result out to be looked at, the same way
   * `PDF_PROBE=1` renders the General Terms exhibit at real page geometry.
   *
   *   BRAND_PDF_PROBE=/path/to/drawing.pdf npx vitest run lib/pdf/brandPdf.test.ts
   *
   * Writes next to the source as `<name>.anc-branded.pdf`. A synthetic page proves
   * the maths; only a real drawing proves the mark lands somewhere a person would
   * have put it.
   */
  it.runIf(process.env.BRAND_PDF_PROBE)("brands a real document (probe)", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");

    const source = process.env.BRAND_PDF_PROBE as string;
    const input = await fs.readFile(source);
    const result = await brandPdf(input, {
      title: path.basename(source, ".pdf").slice(0, 60),
    });

    const out = source.replace(/\.pdf$/i, "") + ".anc-branded.pdf";
    await fs.writeFile(out, Buffer.from(result.bytes));

    // eslint-disable-next-line no-console
    console.log(
      `[brand-pdf probe] ${result.stampedPages}/${result.pageCount} pages · ${
        result.placedOnSheet
      } on the sheet (${result.positionsUsed.join(", ") || "none"}), ${
        result.placedOnBand
      } on a band · decided by ${result.decidedBy}${
        result.decisionNote ? ` ("${result.decisionNote}")` : ""
      } · ${
        result.warnings.length ? result.warnings.join(" ") : "no warnings"
      }\n  -> ${out}`,
    );
    expect(result.stampedPages).toBe(result.pageCount);
  }, 120_000);

  it("brands a page whose MediaBox does not start at the origin", async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([612, 792]);
    page.setMediaBox(20, 30, 612, 792);
    const input = await doc.save();

    const result = await brandPdf(input, { placement: "band", title: "Offset box" });
    const out = await PDFDocument.load(result.bytes);
    const box = out.getPage(0).getMediaBox();
    expect(box.x).toBeCloseTo(20, 1);
    expect(box.y).toBeCloseTo(30, 1);
  });
});
