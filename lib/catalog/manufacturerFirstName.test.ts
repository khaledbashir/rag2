import { describe, expect, it } from "vitest";
import {
    compareProductNames,
    labelProducts,
    manufacturerFirstName,
} from "./manufacturerFirstName";

describe("manufacturerFirstName", () => {
    it("leads OES scoring equipment with the vendor — the case Jireh reported", () => {
        expect(manufacturerFirstName('42" Shot Clock System (Outdoor)', "OES")).toBe(
            'OES 42" Shot Clock System (Outdoor)',
        );
        expect(manufacturerFirstName("ISC-EDGE PRO (w/o radio)", "OES")).toBe(
            "OES ISC-EDGE PRO (w/o radio)",
        );
    });

    it("lifts the vendor out of a trailing parenthetical instead of repeating it", () => {
        expect(manufacturerFirstName("C4 Corona FM (Yaham)", "Yaham")).toBe("Yaham C4 Corona FM");
        expect(manufacturerFirstName("A10 Aura FM (LG USA)", "LG USA")).toBe("LG USA A10 Aura FM");
    });

    it("keeps the rest of a parenthetical that merely starts with the vendor", () => {
        // MIP is the packaging technology, not a second mention of the brand.
        expect(manufacturerFirstName("2.5mm Indoor (Nationstar MIP)", "Nationstar")).toBe(
            "Nationstar 2.5mm Indoor (MIP)",
        );
        expect(manufacturerFirstName("4mm Indoor (Nitxeon)", "Nitxeon")).toBe("Nitxeon 4mm Indoor");
    });

    it("leaves a name that already leads with the brand untouched", () => {
        expect(manufacturerFirstName("Yaham S3 3.9mm Fine Pitch", "Yaham")).toBe(
            "Yaham S3 3.9mm Fine Pitch",
        );
        // Stored against manufacturer "LG TV" — must not become "LG TV LG 55UH5J-H…".
        expect(manufacturerFirstName('LG 55UH5J-H 55" TV', "LG TV")).toBe('LG 55UH5J-H 55" TV');
        expect(manufacturerFirstName("LG LSCA015 1.5mm Indoor Fine Pitch", "LG")).toBe(
            "LG LSCA015 1.5mm Indoor Fine Pitch",
        );
    });

    it("recognises a brand written with a slash", () => {
        expect(manufacturerFirstName("ANC Courtside Table 10ft (2.9mm)", "ANC/UBERdisplays")).toBe(
            "ANC Courtside Table 10ft (2.9mm)",
        );
        expect(manufacturerFirstName("Mesh P10 FM1921 3.9mm Indoor", "LG/Yaham")).toBe(
            "LG/Yaham Mesh P10 FM1921 3.9mm Indoor",
        );
    });

    it("does not stutter when the vendor and the name share words at the seam", () => {
        expect(manufacturerFirstName("Courtside Table 2.9mm 10'", "ANC Courtside Table")).toBe(
            "ANC Courtside Table 2.9mm 10'",
        );
    });

    it("passes a name through unchanged when no manufacturer is known", () => {
        expect(manufacturerFirstName("Some Display", null)).toBe("Some Display");
        expect(manufacturerFirstName("Some Display", "  ")).toBe("Some Display");
    });

    it("returns an empty string for an empty name rather than a bare vendor", () => {
        expect(manufacturerFirstName("", "OES")).toBe("");
        expect(manufacturerFirstName(null, "OES")).toBe("");
    });
});

describe("compareProductNames", () => {
    it('sorts sizes as numbers — 2" before 19" before 42"', () => {
        const sorted = ['22" Play Clock', '2" Clock Display', '19" Game Clock', '4" Locker Room Clock']
            .sort(compareProductNames);
        expect(sorted).toEqual([
            '2" Clock Display',
            '4" Locker Room Clock',
            '19" Game Clock',
            '22" Play Clock',
        ]);
    });

    it("groups every vendor's products into one contiguous run", () => {
        const catalog = [
            { name: '42" Shot Clock System (Outdoor)', manufacturer: "OES" },
            { name: "C4 Corona FM (Yaham)", manufacturer: "Yaham" },
            { name: '19" Game Clock (White)', manufacturer: "OES" },
            { name: "C4 Corona FM (LG USA)", manufacturer: "LG USA" },
            { name: "R8 Radiance RS (Yaham)", manufacturer: "Yaham" },
            { name: "Carry Case - ISC9000 Pro", manufacturer: "OES" },
        ];
        const sorted = labelProducts(catalog).sort(compareProductNames);
        expect(sorted).toEqual([
            "LG USA C4 Corona FM",
            'OES 19" Game Clock (White)',
            'OES 42" Shot Clock System (Outdoor)',
            "OES Carry Case - ISC9000 Pro",
            "Yaham C4 Corona FM",
            "Yaham R8 Radiance RS",
        ]);
    });
});

describe("labelProducts", () => {
    it("keeps the two LED vendors apart once the suffix is lifted to the front", () => {
        const labels = labelProducts([
            { name: "A10 Aura FM (LG USA)", manufacturer: "LG USA" },
            { name: "A10 Aura FM (Yaham)", manufacturer: "Yaham" },
        ]);
        expect(labels).toEqual(["LG USA A10 Aura FM", "Yaham A10 Aura FM"]);
        expect(new Set(labels).size).toBe(2);
    });

    it("falls back to the raw name rather than hand two products one lookup key", () => {
        // The label is a VLOOKUP key: merging these would price the second at the
        // first one's rate.
        const labels = labelProducts([
            { name: "OES Horn Control Module", manufacturer: "OES" },
            { name: "Horn Control Module", manufacturer: "OES" },
        ]);
        expect(labels).toEqual(["OES Horn Control Module", "Horn Control Module"]);
        expect(new Set(labels).size).toBe(2);
    });

    it("labels the live catalog with no collisions and no OES item out of the block", () => {
        // The 181 rows of the _Products sheet in Jireh's LA Sparks HQ workbook,
        // reduced to the shapes that matter: every naming convention in the catalog.
        const catalog = [
            { name: "10mm Mesh P10 (Nitxeon)", manufacturer: "Nitxeon" },
            { name: '17" Real Time Clock / Pace of Game', manufacturer: "OES" },
            { name: '2" Clock Display (Red)', manufacturer: "OES" },
            { name: '36" PRO Play Clock (Outdoor, Rear Power)', manufacturer: "OES" },
            { name: "2.5mm Indoor (Nationstar MIP)", manufacturer: "Nationstar" },
            { name: "A10 Aura RS (LG USA)", manufacturer: "LG USA" },
            { name: "ANC Stanchion Double (2.9mm)", manufacturer: "ANC/UBERdisplays" },
            { name: "C1.2-MIP 1.2mm Indoor (Alt)", manufacturer: "LG/Yaham" },
            { name: "Courtside Table 3.9mm 8'", manufacturer: "ANC Courtside Table" },
            { name: "D1.874 Corona MIP (Yaham)", manufacturer: "Yaham" },
            { name: 'Hockey Scoreboard (18\' × 3\'10")', manufacturer: "OES" },
            { name: 'LG 98UM5K-B 98" TV', manufacturer: "LG TV" },
            { name: "LG LSGA039 3.9mm Indoor Wall", manufacturer: "LG" },
            { name: "Yaham Radiance R10 Outdoor", manufacturer: "Yaham" },
        ];

        const labels = labelProducts(catalog);
        expect(new Set(labels.map((l) => l.toLowerCase())).size).toBe(labels.length);

        const sorted = [...labels].sort(compareProductNames);
        const oesPositions = sorted
            .map((label, i) => (label.startsWith("OES ") ? i : -1))
            .filter((i) => i >= 0);
        const oesCount = labels.filter((l) => l.startsWith("OES ")).length;
        expect(oesCount).toBe(4);
        // Contiguous: last index - first index is exactly one less than the count.
        expect(oesPositions[oesPositions.length - 1] - oesPositions[0]).toBe(oesCount - 1);
    });
});
