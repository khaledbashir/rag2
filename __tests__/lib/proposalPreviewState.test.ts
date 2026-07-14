import { describe, expect, it } from "vitest";
import { getProposalPreviewState } from "@/lib/proposalPreviewState";

describe("getProposalPreviewState", () => {
    it("renders form-driven Build from Scratch projects without an Excel upload", () => {
        expect(
            getProposalPreviewState(
                { mirrorMode: false, calculationMode: "INTELLIGENCE" },
                false,
                false,
            ),
        ).toBe("template");
    });

    it("keeps Mirror Mode gated on a completed Excel import", () => {
        const details = { mirrorMode: true, calculationMode: "MIRROR" };

        expect(getProposalPreviewState(details, false, false)).toBe("excel-required");
        expect(getProposalPreviewState(details, false, true)).toBe("excel-loading");
        expect(getProposalPreviewState(details, true, false)).toBe("template");
    });

    it("does not show a misleading Excel prompt before a mode is selected", () => {
        expect(getProposalPreviewState({}, false, false)).toBe("mode-unselected");
    });

    it("renders service-sheet imports from the persisted document, incl. after reload", () => {
        const details = {
            mirrorMode: true,
            calculationMode: "MIRROR",
            servicePricingDocument: { sourceSheet: "26-28 w Break fix", yearLabels: ["26/27"], rows: [] },
        };
        // No in-memory workbook (fresh page load) — still previewable.
        expect(getProposalPreviewState(details, false, false)).toBe("template");
    });
});
