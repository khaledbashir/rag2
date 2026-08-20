/**
 * The judge's edges: reading an answer out of whatever the model returns, and
 * never letting a bad one through as a valid choice.
 */
import { describe, expect, it } from "vitest";

import { ClearSpot, stampBlock } from "./brandPlacement";
import { buildPrompt, configuredJudge, describeOption, parseChoice } from "./visionPlacement";

const measure = (text: string, size: number) => text.length * size * 0.5;
const block = stampBlock(1191, 842, 1, "www.anc.com", measure);

const spot = (vx: number, vy: number, position: ClearSpot["position"]): ClearSpot => ({
  vx,
  vy,
  position,
  inset: 0,
  block,
});

describe("parseChoice", () => {
  it("reads a plain JSON answer", () => {
    expect(parseChoice('{"choice":"B","reason":"title block"}', 3)).toEqual({
      index: 1,
      reason: "title block",
    });
  });

  it("reads through a fenced code block", () => {
    const text = '```json\n{"choice":"A","reason":"bottom right margin"}\n```';
    expect(parseChoice(text, 2)?.index).toBe(0);
  });

  it("reads a model that answered with a bare letter", () => {
    expect(parseChoice("B.", 3)).toEqual({ index: 1, reason: "" });
  });

  it("refuses a choice outside the shortlist it was given", () => {
    // Two options were offered; picking a third is not an answer, and taking it
    // would index off the end of the list.
    expect(parseChoice('{"choice":"E","reason":"..."}', 2)).toBeNull();
  });

  it("refuses an empty or unparseable answer", () => {
    expect(parseChoice("", 3)).toBeNull();
    expect(parseChoice("I am not sure where it should go.", 3)).toBeNull();
  });

  it("caps a runaway reason rather than carrying it into a result", () => {
    const long = JSON.stringify({ choice: "A", reason: "x".repeat(900) });
    expect(parseChoice(long, 1)?.reason.length).toBe(200);
  });
});

describe("describeOption", () => {
  it("describes a spot the way a person reads a picture", () => {
    // Visual y runs up from the bottom, pictures are read from the top — a model
    // told "12% up from the bottom" while looking at an image will disagree with
    // the geometry about which box is which.
    const line = describeOption(spot(1000, 40, "bottom-right"), 1191, 842, "A");
    expect(line).toContain("A: bottom right");
    expect(line).toContain("84% across");
    expect(line).toContain("88% down");
  });
});

describe("buildPrompt", () => {
  it("states that every option is already safe, and asks only about taste", () => {
    const prompt = buildPrompt(
      [spot(1000, 40, "bottom-right"), spot(30, 40, "bottom-left")],
      { visualWidth: 1191, visualHeight: 842, title: "Thunder Indoor LED" },
    );

    // The model must not believe it is being asked to avoid the artwork — that is
    // geometry's job and it is already done. Its job is which blank spot reads
    // best, and it can only answer with one of the two it was handed.
    expect(prompt).toContain("already been checked and is empty");
    expect(prompt).toContain("Thunder Indoor LED");
    expect(prompt).toContain('"choice":"<A|B>"');
    expect(prompt).not.toContain("C:");
  });
});

describe("configuredJudge", () => {
  it("stays off when no key is configured, so the endpoint still works", () => {
    expect(configuredJudge({} as NodeJS.ProcessEnv)).toBeNull();
  });

  it("can be switched off even where a key exists", () => {
    expect(
      configuredJudge({ GEMINI_API_KEY: "k", BRAND_PDF_VISION: "off" } as NodeJS.ProcessEnv),
    ).toBeNull();
  });

  it("uses the configured model", () => {
    const judge = configuredJudge({
      BRAND_PDF_VISION_API_KEY: "k",
      BRAND_PDF_VISION_MODEL: "gemini-3.6-flash",
    } as NodeJS.ProcessEnv);
    expect(judge?.name).toBe("gemini:gemini-3.6-flash");
  });

  it("declines a shortlist with nothing to choose between", async () => {
    const judge = configuredJudge({ BRAND_PDF_VISION_API_KEY: "k" } as NodeJS.ProcessEnv);
    const choice = await judge?.pick(new Uint8Array([1]), [spot(1000, 40, "bottom-right")], {
      visualWidth: 1191,
      visualHeight: 842,
      title: null,
    });
    // One option is not a decision — no call is made and geometry stands.
    expect(choice).toBeNull();
  });
});
