/**
 * The Product dropdown in the generated workbook, as a stakeholder reads it.
 *
 * Jireh Billings, 2026-08-24, on the LA Sparks HQ scoping workbook: the 44 OES
 * scoring items were scattered from row 2 to row 164 of a 181-row list, because the
 * list was sorted by names that lead with the model rather than the vendor.
 *
 * This drives the real generator and reads the real _Products sheet — the list Excel
 * shows — rather than testing the naming helper a second time. With a DATABASE_URL
 * that reaches the catalog it covers all 181 rows; without one the generator falls
 * back to the static catalog and the same invariants still hold on what it produces.
 */
import { describe, expect, it } from "vitest";
import { generateScopingWorkbook, type ScopingWorkbookOptions } from "./generateScopingWorkbook";

function specsForASparksLikeVenue(): ScopingWorkbookOptions {
    return {
        project: {
            projectName: "Dropdown Order Probe",
            venueName: "Probe Arena",
            venueAddress: "",
            clientName: "Probe",
        } as any,
        specs: [
            {
                name: "Lobby LED Board",
                location: "Lobby",
                quantity: 2,
                widthFt: 15,
                heightFt: 4,
                pixelPitchMm: 4,
                environment: "indoor",
                brightnessNits: 800,
            },
            {
                name: "Court Scoreboard",
                location: "Court",
                quantity: 4,
                widthFt: 18,
                heightFt: 10,
                pixelPitchMm: 6,
                environment: "indoor",
                brightnessNits: 1200,
            },
            {
                name: "Shot Clock",
                location: "Court",
                quantity: 4,
                widthFt: 4,
                heightFt: 2,
                pixelPitchMm: 0,
                environment: "indoor",
                brightnessNits: 0,
            },
        ] as any,
    };
}

async function dropdownList(): Promise<string[]> {
    const { workbook } = await generateScopingWorkbook(specsForASparksLikeVenue());
    const sheet = workbook.getWorksheet("_Products");
    expect(sheet, "the generated workbook must carry a _Products list").toBeTruthy();

    const names: string[] = [];
    sheet!.eachRow((row) => {
        const value = row.getCell(1).value;
        if (typeof value === "string" && value.trim()) names.push(value);
    });

    // DROPDOWN_PROBE=1 prints the list exactly as Excel will show it, for reading
    // rather than asserting. Point DATABASE_URL at the real catalog to see all of it.
    if (process.env.DROPDOWN_PROBE) {
        console.log(`\n_Products — ${names.length} rows as Excel shows them:`);
        names.forEach((n, i) => console.log(String(i + 1).padStart(4), n));
    }
    return names;
}

describe("Product dropdown", () => {
    it("hands Excel one lookup key per product", async () => {
        const names = await dropdownList();
        expect(names.length).toBeGreaterThan(20);
        // Duplicated keys would make VLOOKUP price two products off one row.
        expect(new Set(names.map((n) => n.toLowerCase())).size).toBe(names.length);
    });

    it("is sorted, so the list reads alphabetically top to bottom", async () => {
        const names = await dropdownList();
        const { compareProductNames } = await import("@/lib/catalog/manufacturerFirstName");
        expect(names).toEqual([...names].sort(compareProductNames));
    });

    it("keeps each manufacturer's products in one unbroken run", async () => {
        const names = await dropdownList();

        // The vendor a reader sees is whatever the name opens with. Every product
        // sharing an opening word must occupy one contiguous stretch of the list.
        const firstWords = names.map((n) => n.split(/\s+/)[0].toLowerCase());
        const seen = new Map<string, number>();
        for (let i = 0; i < firstWords.length; i++) {
            const word = firstWords[i];
            const lastSeenAt = seen.get(word);
            if (lastSeenAt !== undefined && lastSeenAt !== i - 1) {
                throw new Error(
                    `"${word}" reappears at row ${i + 1} after breaking at row ${lastSeenAt + 1} ` +
                        `— ${names[lastSeenAt]} … ${names[i]}`,
                );
            }
            seen.set(word, i);
        }
    });

    it("leads OES scoring equipment with the vendor when the catalog is loaded", async () => {
        const names = await dropdownList();
        const oes = names.filter((n) => /^OES\b/.test(n));
        const strayOes = names.filter(
            (n) => !/^OES\b/.test(n) && /shot clock|play clock|scoreboard|locker room clock/i.test(n),
        );

        if (oes.length === 0) {
            // No DB reachable — the static catalog carries no OES rows, and there is
            // nothing to assert beyond the invariants above.
            expect(strayOes).toEqual([]);
            return;
        }

        expect(oes.length).toBeGreaterThanOrEqual(40);
        expect(strayOes).toEqual([]);
        const first = names.indexOf(oes[0]);
        const last = names.indexOf(oes[oes.length - 1]);
        expect(last - first).toBe(oes.length - 1);
    });
});
