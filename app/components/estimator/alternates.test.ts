import { describe, expect, it } from "vitest";

import { buildPreviewSheets } from "./EstimatorBridge";
import {
    alternateSharesFootprint,
    getDefaultAnswers,
    getDefaultDisplayAnswers,
    normalizeEstimatorAnswers,
    resolveAlternates,
    type DisplayAnswers,
    type EstimatorAnswers,
} from "./questions";

/**
 * Alternates with their own dimensions (Jack McCrossin, 2026-07-29).
 *
 * The load-bearing guarantee is the first block: an alternate that keeps the
 * primary's footprint must price exactly as it did before this feature, because
 * live bids were built on those numbers.
 */

function primary(overrides: Partial<DisplayAnswers> = {}): DisplayAnswers {
    return {
        ...getDefaultDisplayAnswers(),
        displayType: "main-scoreboard",
        displayName: "Main Scoreboard",
        widthFt: 40,
        heightFt: 20,
        quantity: 1,
        pixelPitch: "6",
        ...overrides,
    };
}

function answersWith(display: DisplayAnswers): EstimatorAnswers {
    return { ...getDefaultAnswers(), clientName: "Test Venue", displays: [display] };
}

/** Pull the LED Cost Sheet rows so we compare what the estimator actually shows. */
function altRows(answers: EstimatorAnswers) {
    const sheets = buildPreviewSheets(answers);
    const sheet = sheets.sheets.find((s) => /LED Cost|Display Details/i.test(s.name));
    return sheet?.rows ?? [];
}

describe("resolveAlternates", () => {
    it("treats a legacy altPitches entry as a same-footprint alternate", () => {
        const d = primary({ altPitches: ["4"] });
        const resolved = resolveAlternates(d);

        expect(resolved).toHaveLength(1);
        expect(resolved[0].pixelPitch).toBe("4");
        expect(resolved[0].widthFt).toBeUndefined();
        expect(alternateSharesFootprint(d, resolved[0])).toBe(true);
    });

    it("merges legacy and new alternates without duplicating a pitch", () => {
        const d = primary({ altPitches: ["4"], alternates: [{ pixelPitch: "4" }] });
        expect(resolveAlternates(d)).toHaveLength(1);
    });

    it("keeps a resized alternate that reuses a legacy pitch", () => {
        // Same pitch, different size, is a genuinely different offer — not a dupe.
        const d = primary({ altPitches: ["4"], alternates: [{ pixelPitch: "4", widthFt: 60 }] });
        expect(resolveAlternates(d)).toHaveLength(2);
    });

    it("detects a footprint change from any of width, height or quantity", () => {
        const d = primary();
        expect(alternateSharesFootprint(d, { pixelPitch: "4", widthFt: 60 })).toBe(false);
        expect(alternateSharesFootprint(d, { pixelPitch: "4", heightFt: 30 })).toBe(false);
        expect(alternateSharesFootprint(d, { pixelPitch: "4", quantity: 2 })).toBe(false);
        expect(alternateSharesFootprint(d, { pixelPitch: "4", widthFt: 40, heightFt: 20 })).toBe(true);
    });
});

describe("same-footprint alternates keep their historical pricing", () => {
    it("prices a legacy altPitches alternate identically to the new equivalent", () => {
        const legacy = altRows(answersWith(primary({ altPitches: ["4"] })));
        const modern = altRows(answersWith(primary({ alternates: [{ pixelPitch: "4" }] })));

        expect(legacy.length).toBeGreaterThan(0);
        expect(JSON.stringify(modern)).toBe(JSON.stringify(legacy));
    });

    it("inherits the primary's build cost when only the pitch changes", () => {
        const answers = answersWith(primary({ alternates: [{ pixelPitch: "4" }] }));
        const sheets = buildPreviewSheets(answers);
        const install = sheets.sheets.filter((s) => /Install/i.test(s.name));

        // Install sheets are generated per PRIMARY screen only — an alternate
        // sharing the footprint must not add another install workup.
        expect(install).toHaveLength(1);
    });

    it("labels a same-footprint alternate exactly as before", () => {
        const rows = altRows(answersWith(primary({ altPitches: ["4"] })));
        const flat = JSON.stringify(rows);
        expect(flat).toContain("↳ ALT 4mm");
        // No dimensions appended when the footprint is unchanged.
        expect(flat).not.toContain("40x20ft");
    });
});

describe("resized alternates are priced as their own screen", () => {
    it("does not reuse the primary's totals for a bigger alternate", () => {
        const sameSize = buildPreviewSheets(answersWith(primary({ alternates: [{ pixelPitch: "6" }] })));
        const bigger = buildPreviewSheets(
            answersWith(primary({ alternates: [{ pixelPitch: "6", widthFt: 80, heightFt: 40 }] })),
        );

        // Identical pitch, quadruple the area — the alternate must move.
        expect(JSON.stringify(bigger)).not.toBe(JSON.stringify(sameSize));
    });

    it("spells the alternate's real dimensions into its label", () => {
        const rows = altRows(
            answersWith(primary({ alternates: [{ pixelPitch: "4", widthFt: 60, heightFt: 30 }] })),
        );
        expect(JSON.stringify(rows)).toContain("60x30ft");
    });

    it("honours a custom alternate label when one is given", () => {
        const rows = altRows(
            answersWith(primary({ alternates: [{ pixelPitch: "4", widthFt: 60, label: "Deduct Option B" }] })),
        );
        expect(JSON.stringify(rows)).toContain("Deduct Option B");
    });

    it("carries a quantity-only alternate through as its own screen", () => {
        const one = buildPreviewSheets(answersWith(primary({ alternates: [{ pixelPitch: "6" }] })));
        const two = buildPreviewSheets(answersWith(primary({ alternates: [{ pixelPitch: "6", quantity: 3 }] })));
        expect(JSON.stringify(two)).not.toBe(JSON.stringify(one));
    });
});

describe("saved estimates load without losing alternates", () => {
    it("normalizes alternates and keeps legacy pitches intact", () => {
        const normalized = normalizeEstimatorAnswers({
            displays: [
                {
                    ...primary(),
                    altPitches: ["4"],
                    alternates: [{ pixelPitch: 8 as unknown as string, widthFt: 60 }],
                },
            ],
        } as any);

        const d = normalized.displays[0];
        expect(d.altPitches).toEqual(["4"]);
        expect(d.alternates?.[0].pixelPitch).toBe("8");
        expect(resolveAlternates(d)).toHaveLength(2);
    });

    it("drops malformed alternates rather than crashing the estimate", () => {
        const normalized = normalizeEstimatorAnswers({
            displays: [{ ...primary(), alternates: [{ widthFt: 60 }, null, { pixelPitch: "4" }] }],
        } as any);

        expect(normalized.displays[0].alternates).toHaveLength(1);
        expect(normalized.displays[0].alternates?.[0].pixelPitch).toBe("4");
    });
});
