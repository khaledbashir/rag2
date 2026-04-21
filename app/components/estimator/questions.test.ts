import { describe, expect, it } from "vitest";

import { createNewDisplayAnswers, getDefaultAnswers, getDefaultDisplayAnswers, getEstimatorDisplayLabel, normalizeEstimatorAnswers } from "./questions";

describe("normalizeEstimatorAnswers", () => {
    it("hydrates missing estimator defaults for empty saved payloads", () => {
        const normalized = normalizeEstimatorAnswers({} as any);

        expect(normalized).toMatchObject({
            clientName: "",
            projectName: "",
            currency: "USD",
            displays: [],
            includeCms: false,
            includeScoring: false,
        });
    });

    it("fills missing RFP dimensions from working dimensions", () => {
        const answers = getDefaultAnswers();
        answers.displays = [
            {
                ...getDefaultDisplayAnswers(),
                displayType: "custom",
                displayName: "Display 1",
                widthFt: 33,
                heightFt: 3,
            },
        ];

        const normalized = normalizeEstimatorAnswers(answers);

        expect(normalized.displays[0].rfpWidthFt).toBe(33);
        expect(normalized.displays[0].rfpHeightFt).toBe(3);
        expect(normalized.displays[0].widthFt).toBe(33);
        expect(normalized.displays[0].heightFt).toBe(3);
    });

    it("realigns stale working dimensions when RFP and working aspect ratios diverge", () => {
        const answers = getDefaultAnswers();
        answers.displays = [
            {
                ...getDefaultDisplayAnswers(),
                displayType: "custom",
                displayName: "Ribbon",
                rfpWidthFt: 33,
                rfpHeightFt: 3,
                widthFt: 3.94,
                heightFt: 3.94,
            },
        ];

        const normalized = normalizeEstimatorAnswers(answers);

        expect(normalized.displays[0].rfpWidthFt).toBe(33);
        expect(normalized.displays[0].rfpHeightFt).toBe(3);
        expect(normalized.displays[0].widthFt).toBe(33);
        expect(normalized.displays[0].heightFt).toBe(3);
    });

    it("realigns stale working dimensions when a board shrinks below the requested RFP size", () => {
        const answers = getDefaultAnswers();
        answers.displays = [
            {
                ...getDefaultDisplayAnswers(),
                displayType: "main-scoreboard",
                displayName: "Main Scoreboard",
                rfpWidthFt: 40.157,
                rfpHeightFt: 30.709,
                widthFt: 3.937,
                heightFt: 3.937,
            },
        ];

        const normalized = normalizeEstimatorAnswers(answers);

        expect(normalized.displays[0].rfpWidthFt).toBe(40.157);
        expect(normalized.displays[0].rfpHeightFt).toBe(30.709);
        expect(normalized.displays[0].widthFt).toBe(40.157);
        expect(normalized.displays[0].heightFt).toBe(30.709);
    });
});

describe("estimator display labels", () => {
    it("creates unique default names for newly added displays", () => {
        expect(createNewDisplayAnswers(0).displayName).toBe("New Display 1");
        expect(createNewDisplayAnswers(1).displayName).toBe("New Display 2");
    });

    it("creates independent bundle state for each new display", () => {
        const first = createNewDisplayAnswers(0);
        const second = createNewDisplayAnswers(1);

        first.excludedBundleItems.push("processor");

        expect(second.excludedBundleItems).toEqual([]);
    });

    it("matches workbook labels for unnamed typed displays", () => {
        const display = {
            ...getDefaultDisplayAnswers(),
            displayType: "main-scoreboard",
            displayName: "",
        };

        expect(getEstimatorDisplayLabel(display, 0)).toBe("Main Scoreboard");
    });
});
