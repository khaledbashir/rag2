import { describe, expect, it } from "vitest";

import {
    computeTableReconciliation,
    computeTableTotals,
    findHiddenRowGaps,
    formatTaxLabel,
} from "./pricingMath";
import type { PricingDocument, PricingTable } from "@/types/pricing";

describe("computeTableTotals", () => {
    it("renders included and excluded rows as text-only rows outside subtotal", () => {
        const table: PricingTable = {
            id: "table-1",
            name: "Pricing",
            currency: "USD",
            items: [
                { description: "Display", sellingPrice: 1000, isIncluded: false },
                { description: "Included Service", sellingPrice: 250, isIncluded: true, textValue: "INCLUDED" },
                { description: "Excluded Option", sellingPrice: 500, isIncluded: false, isExcluded: true, textValue: "EXCLUDED" },
            ],
            subtotal: 1000,
            tax: null,
            bond: 0,
            tariff: 0,
            grandTotal: 1000,
            alternates: [],
        };

        const totals = computeTableTotals(table);

        expect(totals.subtotal).toBe(1000);
        expect(totals.items).toMatchObject([
            { description: "Display", price: 1000, isIncluded: false },
            { description: "Included Service", price: 250, isIncluded: true, textValue: "INCLUDED" },
            { description: "Excluded Option", price: 500, isExcluded: true, textValue: "EXCLUDED" },
        ]);
    });
});

describe("formatTaxLabel (Natalia 2026-07-09 — surface the sheet's tax rate)", () => {
    it("appends the rate when the sheet keeps it in a separate cell", () => {
        expect(formatTaxLabel("TAX", 0.1025)).toBe("TAX (10.25%)");
    });

    it("preserves the Excel label's own casing (Mirror Mode mirrors the sheet)", () => {
        expect(formatTaxLabel("Sales Tax", 0.08875)).toBe("Sales Tax (8.875%)");
    });

    it("drops trailing zeros on whole-number rates", () => {
        expect(formatTaxLabel("TAX", 0.13)).toBe("TAX (13%)");
    });

    it("leaves the label alone when the sheet already spelled the rate into it", () => {
        expect(formatTaxLabel("HST 13%", 0.13)).toBe("HST 13%");
    });

    it("falls back to a bare label when no rate was parsed", () => {
        expect(formatTaxLabel("TAX", 0)).toBe("TAX");
        expect(formatTaxLabel("TAX", null)).toBe("TAX");
        expect(formatTaxLabel("TAX", undefined)).toBe("TAX");
    });

    it("ignores a misparsed dollar amount masquerading as a rate", () => {
        expect(formatTaxLabel("TAX", 2737)).toBe("TAX");
    });

    it("defaults an empty label to Tax", () => {
        expect(formatTaxLabel("", 0.1025)).toBe("Tax (10.25%)");
    });
});

describe("computeTableTotals — tax label carries the rate", () => {
    // Natalia's San Jose - CPA sheet: TAX row holds 10.25% in the cost column and
    // $2,737 in the selling-price column. The PDF used to render a bare "TAX".
    const sanJoseCpa: PricingTable = {
        id: "table-sj",
        name: "San Jose - CPA",
        currency: "USD",
        items: [
            { description: "Generator Rental (One Month)", sellingPrice: 9900, isIncluded: false },
            { description: "Genator Delivery Charge", sellingPrice: 1375, isIncluded: false },
            { description: "Damage Waiver", sellingPrice: 825, isIncluded: false },
            { description: "Generator Connect and Disconnect", sellingPrice: 12606, isIncluded: false },
            { description: "Project Management", sellingPrice: 2000, isIncluded: false },
        ],
        subtotal: 26706,
        tax: { rate: 0.1025, label: "TAX", amount: 2737 },
        bond: 0,
        tariff: 0,
        grandTotal: 29443,
        alternates: [],
    };

    it("renders the rate in the tax label", () => {
        const totals = computeTableTotals(sanJoseCpa);
        expect(totals.taxLabel).toBe("TAX (10.25%)");
    });

    it("still mirrors Excel's tax amount and grand total exactly", () => {
        const totals = computeTableTotals(sanJoseCpa);
        expect(totals.tax).toBe(2737);
        expect(totals.subtotal).toBe(26706);
        expect(totals.grandTotal).toBe(29443);
    });

    it("leaves the label bare when the sheet carries an amount but no rate", () => {
        const noRate = { ...sanJoseCpa, tax: { rate: 0, label: "TAX", amount: 2737 } };
        expect(computeTableTotals(noRate).taxLabel).toBe("TAX");
    });
});

describe("reconciliation safeguard (hidden-row gap detection)", () => {
    // Mirrors the Eagles / Structural Materials regression: a real priced row is
    // hidden inside an otherwise-visible section, so its value stays in the
    // subtotal but no line renders for it.
    const eaglesLikeTable: PricingTable = {
        id: "table-0",
        name: "Marquee Replacement",
        currency: "USD",
        items: [
            { description: "LED Display", sellingPrice: 298301, isIncluded: false },
            { description: "LED Processors", sellingPrice: 28643, isIncluded: false },
            { description: "Structural Materials:", sellingPrice: 46053, isIncluded: false, isHidden: true },
            { description: "Structural Labor", sellingPrice: 114120, isIncluded: false },
        ],
        // Trusted Excel subtotal includes the hidden row.
        subtotal: 487117,
        tax: { rate: 0.08, label: "Tax", amount: 100 },
        bond: 0,
        tariff: 0,
        grandTotal: 487217,
        alternates: [],
    };

    it("flags a hidden priced row that breaks the visible totals", () => {
        const recon = computeTableReconciliation(eaglesLikeTable);
        expect(recon.reconciles).toBe(false);
        expect(recon.gap).toBe(46053);
        expect(recon.visibleCount).toBe(3);
        expect(recon.hiddenPricedItems).toMatchObject([
            { description: "Structural Materials:", price: 46053 },
        ]);

        const doc = { tables: [eaglesLikeTable], documentTotal: 487217 } as unknown as PricingDocument;
        const gaps = findHiddenRowGaps(doc);
        expect(gaps).toHaveLength(1);
        expect(gaps[0]!.tableName).toBe("Marquee Replacement");
        expect(gaps[0]!.gap).toBe(46053);
    });

    it("does not flag a clean section where every priced line is visible", () => {
        const clean: PricingTable = {
            ...eaglesLikeTable,
            items: eaglesLikeTable.items.map((i) => ({ ...i, isHidden: false })),
            subtotal: 487117,
        };
        const recon = computeTableReconciliation(clean);
        expect(recon.reconciles).toBe(true);
        expect(recon.hiddenPricedItems).toHaveLength(0);
        expect(findHiddenRowGaps({ tables: [clean] } as unknown as PricingDocument)).toHaveLength(0);
    });

    it("does not flag a fully-hidden (collapsed alternate) section", () => {
        const collapsed: PricingTable = {
            id: "table-alt",
            name: "Alternate (collapsed)",
            currency: "USD",
            items: [
                { description: "Alt Display", sellingPrice: 200000, isIncluded: false, isHidden: true },
                { description: "Alt Labor", sellingPrice: 50000, isIncluded: false, isHidden: true },
            ],
            subtotal: 250000,
            tax: null,
            bond: 0,
            tariff: 0,
            grandTotal: 250000,
            alternates: [],
        };
        const recon = computeTableReconciliation(collapsed);
        expect(recon.visibleCount).toBe(0); // nothing renders → not a contract gap
        expect(findHiddenRowGaps({ tables: [collapsed] } as unknown as PricingDocument)).toHaveLength(0);
    });
});
