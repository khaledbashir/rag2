import { describe, expect, it } from "vitest";
import { normalizeProposalTitle, resolveProposalTitle } from "./resolveProposalTitle";

describe("resolveProposalTitle", () => {
    it("ignores placeholder client names and uses the proposal name", () => {
        expect(resolveProposalTitle("Levi's Stadium - New LED Signage", "Client Name")).toBe("Levi's Stadium - New LED Signage");
    });

    it("normalizes whitespace in real titles", () => {
        expect(normalizeProposalTitle("  San   Francisco  49ers  ")).toBe("San Francisco 49ers");
    });

    it("falls back to Untitled Project only when every candidate is a placeholder", () => {
        expect(resolveProposalTitle("Client Name", "Untitled Project", "")).toBe("Untitled Project");
    });
});
