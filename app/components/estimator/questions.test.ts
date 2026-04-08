import { describe, expect, it } from "vitest";

import { getDefaultAnswers, getDefaultDisplayAnswers, normalizeEstimatorAnswers } from "./questions";

describe("normalizeEstimatorAnswers", () => {
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
