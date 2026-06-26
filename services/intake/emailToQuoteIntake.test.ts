import { describe, expect, it } from "vitest";

import { parseEmailToQuoteIntake } from "./emailToQuoteIntake";

const KEVIN_EMAIL = `Hey Jireh,

Please see below for the areas we'd love some rough estimates for. Ideally, we get a breakdown of the total costs for each individual project (hardware, installation, etc.). Let me know if you need anything else.

Project 1: Gate F LEDs (2 vb's)
Quote #1 = Same size boards as the other two plaza boards
Quote #2= Specs below


Project 2: Exterior Suite Tower (2 vd's)
Left Board = 60' x 60'
Right Board = 60' x 60'



Project 3: Ring of Honor LEDs
Upper LED Ribbon = 8' x 550'
Lower ribbon = 3'6" x 55'


Kevin Hilton

EVP, Corporate Partnerships

M: 925.785.0776

4655 Great America Pkwy, Suite 201

Santa Clara, CA 95054`;

describe("parseEmailToQuoteIntake", () => {
    it("turns the 49ers rough-estimate email into project/display intake", () => {
        const intake = parseEmailToQuoteIntake({
            subject: "49ers New LED Signage - Rough Estimate",
            body: KEVIN_EMAIL,
        });

        expect(intake.title).toBe("49ers New LED Signage - Rough Estimate");
        expect(intake.clientName).toBe("San Francisco 49ers");
        expect(intake.venueName).toBe("Levi's Stadium");
        expect(intake.requesterName).toBe("Kevin Hilton");
        expect(intake.projects).toHaveLength(3);

        expect(intake.projects[0].name).toBe("Gate F LEDs");
        expect(intake.projects[0].quoteOptions).toHaveLength(2);
        expect(intake.projects[0].quoteOptions[0].missingAssumptions).toContain("source project/board dimensions to match");

        const suiteTower = intake.projects[1];
        expect(suiteTower.displays).toHaveLength(2);
        expect(suiteTower.displays[0]).toMatchObject({ name: "Left Board", widthFt: 60, heightFt: 60 });
        expect(suiteTower.displays[1]).toMatchObject({ name: "Right Board", widthFt: 60, heightFt: 60 });

        const ring = intake.projects[2];
        expect(ring.displays[0]).toMatchObject({ name: "Upper LED Ribbon", widthFt: 550, heightFt: 8 });
        expect(ring.displays[1]).toMatchObject({ name: "Lower Ribbon", widthFt: 55, heightFt: 3.5 });

        expect(intake.missingAssumptions).toContain("pixel pitch");
        expect(intake.missingAssumptions).toContain("install access/lift assumptions");
        expect(intake.estimatorAnswers.displays).toHaveLength(5);
        expect(intake.estimatorAnswers.displays[0].pixelPitch).toBe("");
    });
});
