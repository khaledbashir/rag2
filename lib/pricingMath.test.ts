import { describe, expect, it } from "vitest";

import {
    computeTableReconciliation,
    computeTableTotals,
    findHiddenRowGaps,
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
