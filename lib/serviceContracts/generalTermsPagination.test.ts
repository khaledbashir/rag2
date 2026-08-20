/**
 * Does the General Terms exhibit still close on one page?
 *
 * Natalia Kovaleva, 2026-08-20: "one bullet keeps slipping to next page —
 * possible to do some tightening (minor) to fit in?" On her Lincoln Financial
 * Field contract, Miscellaneous (a)–(e) closed page 9 and (f) sat alone on
 * page 10.
 *
 * ProposalTemplate5 emits a PageBreak immediately before this exhibit, so its
 * page count does not depend on anything above it and can be measured on its
 * own. This renders it through the same HTML shell, the same Tailwind build
 * and the same Puppeteer page geometry the real export uses, and asserts the
 * whole exhibit fits inside one page's usable height.
 *
 * It drives a real browser, so it is opt-in:
 *
 *   PDF_PROBE=1 npx vitest run lib/serviceContracts/generalTermsPagination.test.ts
 */
import { describe, expect, it } from "vitest";

import { TAILWIND_CDN } from "../variables";

/** 11in at 96dpi, less the 36px top and 40px bottom margins page.pdf applies. */
const USABLE_PAGE_HEIGHT = 11 * 96 - 36 - 40;

/** Byte-for-byte the shell generateProposalPdfServiceV2 builds around a template. */
const shell = (body: string) =>
  `<!doctype html><html><head><meta charset="utf-8"/><title>probe</title><style>body,.font-sans{font-family:Arial,Helvetica,sans-serif!important;line-height:1.3!important;font-size:11px!important}h1,h2,h3,h4,h5,h6{font-family:Arial,Helvetica,sans-serif!important;line-height:1.3!important}p,div,span,td,th{line-height:1.3!important}.leading-relaxed{line-height:1.35!important}.leading-snug{line-height:1.25!important}</style></head><body>${body}</body></html>`;

/**
 * The purchaser's name is repeated through eight of the ten clauses, so its
 * length is the one input that moves this page. The second name here is longer
 * than any real ANC purchaser, and is the headroom test.
 */
const PURCHASERS = [
  "Lincoln Financial Field LED Displays",
  "Philadelphia Eagles (Lincoln Financial Field) Stadium Operations LLC",
];

describe.skipIf(!process.env.PDF_PROBE)("General Terms exhibit pagination", () => {
  it.each(PURCHASERS)("fits on one page for %s", async (purchaserName) => {
    const React = await import("react");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const PdfTermsAndConditions = (
      await import("../../app/components/templates/proposal-pdf/sections/PdfTermsAndConditions")
    ).default;

    const colors = {
      primary: "#0A52EF",
      primaryDark: "#0A3FBF",
      text: "#1f2937",
      textMuted: "#6b7280",
    } as any;

    const markup = renderToStaticMarkup(
      React.createElement(
        "div",
        null,
        // The continuation header that shares the exhibit's page.
        React.createElement(
          "div",
          { className: "px-6" },
          React.createElement(
            "div",
            { className: "pb-2 mb-4 border-b-2", style: { borderColor: colors.primary } },
            React.createElement(
              "div",
              { className: "text-[14px] font-semibold", style: { color: colors.textMuted } },
              purchaserName,
            ),
          ),
        ),
        React.createElement(PdfTermsAndConditions, {
          colors,
          config: {
            purchaserName,
            warrantyYears: 5,
            includeLaborWarranty: true,
            includeMaterialsWarranty: true,
            includeCms: false,
            includeGraphics: false,
            exhibitLetter: "C",
          },
        } as any),
        // ProposalTemplate5's HybridFooter closes the document on this same
        // page. Leaving it out is what made the exhibit look like it fitted
        // when the real export was two pixels over.
        React.createElement(
          "div",
          { className: "px-6" },
          React.createElement(
            "div",
            {
              className: "mt-8 pt-3 border-t flex items-center justify-between",
              style: { borderColor: "#e5e7eb" },
            },
            React.createElement(
              "span",
              { className: "text-[14px] font-semibold", style: { color: colors.primary } },
              "www.anc.com",
            ),
            React.createElement(
              "span",
              { className: "text-[14px]", style: { color: colors.textMuted } },
              "ANC Sports Enterprises, LLC",
            ),
          ),
        ),
      ),
    );

    const puppeteer = (await import("puppeteer")).default;
    const browser = await puppeteer.launch({
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
      headless: true,
      // Puppeteer's own download is not always present on this box; the system
      // Chrome renders the same engine.
      executablePath: process.env.PDF_PROBE_CHROME || "/usr/bin/google-chrome",
    });

    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 794, height: 1122, deviceScaleFactor: 1 });
      await page.emulateMediaType("screen");
      await page.setContent(shell(markup), {
        waitUntil: ["domcontentloaded", "load"],
        timeout: 60000,
      });
      await page.addStyleTag({ content: `@media print { @page { size: 8.5in 11in; } }` });
      await page.addStyleTag({ url: TAILWIND_CDN });

      const measured = await page.evaluate(() => {
        const clauses = Array.from(document.querySelectorAll(".break-inside-avoid"));
        return {
          height: document.body.scrollHeight,
          clauses: clauses.map((el) => ({
            title: (el.querySelector("span")?.textContent || "").trim(),
            bottom: Math.round(el.getBoundingClientRect().bottom),
          })),
        };
      });

      // Reported on every run — the headroom is the thing worth watching, not
      // just the pass/fail.
      // eslint-disable-next-line no-console
      console.log(
        `General Terms: ${measured.height}px of ${USABLE_PAGE_HEIGHT}px usable ` +
          `(${USABLE_PAGE_HEIGHT - measured.height}px headroom)\n` +
          measured.clauses.map((c) => `  ${String(c.bottom).padStart(5)}px  ${c.title}`).join("\n"),
      );

      expect(measured.clauses.length).toBeGreaterThanOrEqual(7);
      // The last clause — Miscellaneous, ending on bullet (f) — is the one that
      // was falling through.
      const last = measured.clauses[measured.clauses.length - 1];
      // Rendered in caps by CSS; textContent keeps the authored casing.
      expect(last.title.toUpperCase()).toContain("MISCELLANEOUS");
      expect(last.bottom).toBeLessThanOrEqual(USABLE_PAGE_HEIGHT);
      expect(measured.height).toBeLessThanOrEqual(USABLE_PAGE_HEIGHT);
    } finally {
      await browser.close();
    }
  }, 120_000);
});
