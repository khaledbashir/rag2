import { describe, expect, it } from "vitest";

import { computeTableTotals } from "./pricingMath";
import type { PricingTable } from "@/types/pricing";

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
