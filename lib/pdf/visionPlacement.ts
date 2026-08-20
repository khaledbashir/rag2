/**
 * Let a vision model choose where the mark goes — from a shortlist geometry has
 * already proved is blank.
 *
 * Ahmad, 2026-08-20: *"it should decide where to put the branding … because each
 * file is different. so we have to tell the AI. and give it vision tools."* He is
 * right, and the tempting version of that is wrong: handing a page to an image
 * model and asking it to *produce* the branded page. Measured on the real OKC
 * Thunder LED drawing, nano-banana put the logo exactly where Jireh asked — and
 * repainted the sheet doing it. Resolution 13920x2008px came back 12000+2000px,
 * total weight 9976 Kg came back 5076 Kg, 638 panels came back 636. Every number
 * on a drawing that goes to a client.
 *
 * So the model does the half it is good at and none of the half it is not. It
 * sees the page and picks a corner; the mark is then stamped as real vector
 * artwork by pdf-lib. Nothing is regenerated, no dimension moves, and the
 * placement is still the model's judgement rather than a hardcoded corner.
 *
 * Provider-agnostic on purpose — this is a `PlacementJudge`, and Gemini is one
 * implementation of it.
 */
import { ClearSpot } from "./brandPlacement";

export interface PlacementChoice {
  /** Index into the shortlist that was offered. */
  index: number;
  /** One line, in the model's words, for the audit trail. */
  reason: string;
  /** Which judge answered. */
  judge: string;
}

export interface PlacementJudge {
  name: string;
  /**
   * Returns the chosen index, or null to defer to geometry. Never throws — a
   * judge that cannot answer must not cost the document its branding.
   */
  pick(
    pageImagePng: Uint8Array,
    options: ClearSpot[],
    context: { visualWidth: number; visualHeight: number; title: string | null },
  ): Promise<PlacementChoice | null>;
}

/** A → the first option, B → the second, and so on. */
const LABELS = ["A", "B", "C", "D", "E", "F"];

/**
 * How a corner reads as a fraction of the sheet, which is what a model looking at
 * a picture can actually verify against what it sees.
 */
export function describeOption(
  spot: ClearSpot,
  visualWidth: number,
  visualHeight: number,
  label: string,
): string {
  const pct = (value: number, of: number) => Math.round((value / of) * 100);
  // Reported from the top-left, because that is how a person reads a picture.
  const fromLeft = pct(spot.vx, visualWidth);
  const fromTop = pct(visualHeight - (spot.vy + spot.block.height), visualHeight);
  return `${label}: ${spot.position.replace("-", " ")} — a clear box ${Math.round(
    spot.block.width,
  )}x${Math.round(spot.block.height)}pt with its top-left corner ${fromLeft}% across and ${fromTop}% down the sheet`;
}

export function buildPrompt(
  options: ClearSpot[],
  context: { visualWidth: number; visualHeight: number; title: string | null },
): string {
  const lines = options.map((spot, index) =>
    describeOption(spot, context.visualWidth, context.visualHeight, LABELS[index]),
  );

  return [
    "You are looking at one sheet of a document that is about to be branded with the ANC logo.",
    context.title ? `The document is titled "${context.title}".` : "",
    "",
    "Every box below has already been checked and is empty — none of them cover any artwork, text or dimensions.",
    "Choose the one where a professional would place a company logo on THIS sheet.",
    "On a technical drawing that is normally the title block, low on the right-hand side.",
    "Prefer the option that looks deliberate and balanced against what is actually printed on the page.",
    "",
    ...lines,
    "",
    `Answer with JSON only: {"choice":"<${LABELS.slice(0, options.length).join("|")}>","reason":"<one short sentence>"}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Pull the choice out of whatever shape the model wrapped it in. */
export function parseChoice(text: string, optionCount: number): { index: number; reason: string } | null {
  const cleaned = text.replace(/```(?:json)?/gi, " ");
  const match = cleaned.match(/\{[\s\S]*?\}/);
  if (match) {
    try {
      const parsed = JSON.parse(match[0]) as { choice?: unknown; reason?: unknown };
      const label = String(parsed.choice ?? "").trim().toUpperCase();
      const index = LABELS.indexOf(label);
      if (index >= 0 && index < optionCount) {
        return { index, reason: String(parsed.reason ?? "").slice(0, 200) };
      }
    } catch {
      // Falls through to the bare-letter read below.
    }
  }

  // A model that answers "B." rather than JSON is still answering.
  const bare = cleaned.trim().match(/\b([A-F])\b/);
  if (bare) {
    const index = LABELS.indexOf(bare[1].toUpperCase());
    if (index >= 0 && index < optionCount) return { index, reason: "" };
  }
  return null;
}

/**
 * Retired model ids come back as a 404 that reads like a network failure, and the
 * judge would then be silently absent — `gemini-2.5-flash` was already gone when
 * this shipped. `BRAND_PDF_VISION_MODEL` overrides without a deploy, and
 * `decidedBy` on the result says whether a judge actually answered.
 */
const DEFAULT_MODEL = "gemini-3.6-flash";

/**
 * Gemini reading the rendered page.
 *
 * A text-and-vision model, not the image model: we want an answer about the page,
 * not a new picture of it.
 */
export function geminiJudge(apiKey: string, model = DEFAULT_MODEL): PlacementJudge {
  return {
    name: `gemini:${model}`,
    async pick(pageImagePng, options, context) {
      if (options.length < 2) return null;

      const body = {
        contents: [
          {
            parts: [
              { text: buildPrompt(options, context) },
              {
                inlineData: {
                  mimeType: "image/png",
                  data: Buffer.from(pageImagePng).toString("base64"),
                },
              },
            ],
          },
        ],
        generationConfig: { temperature: 0, maxOutputTokens: 2048 },
      };

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30_000);
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
            model,
          )}:generateContent`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
            body: JSON.stringify(body),
            signal: controller.signal,
          },
        );
        if (!response.ok) return null;

        const payload = (await response.json()) as {
          candidates?: { content?: { parts?: { text?: string }[] } }[];
        };
        const text = (payload.candidates?.[0]?.content?.parts ?? [])
          .map((part) => part.text ?? "")
          .join(" ");
        const choice = parseChoice(text, options.length);
        return choice ? { ...choice, judge: `gemini:${model}` } : null;
      } catch {
        // Timeout, network, quota — geometry already has a good answer.
        return null;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

/**
 * The judge this deployment is configured for, or null to run on geometry alone.
 *
 * Off unless a key is set, so the endpoint keeps working — and keeps being fast
 * and free — everywhere the key is absent.
 */
export function configuredJudge(env: NodeJS.ProcessEnv = process.env): PlacementJudge | null {
  if ((env.BRAND_PDF_VISION || "").toLowerCase() === "off") return null;

  const provider = (env.BRAND_PDF_VISION_PROVIDER || "gemini").toLowerCase();
  if (provider === "gemini") {
    const key = env.BRAND_PDF_VISION_API_KEY || env.GEMINI_API_KEY || env.GOOGLE_API_KEY;
    if (!key) return null;
    return geminiJudge(key, env.BRAND_PDF_VISION_MODEL || DEFAULT_MODEL);
  }
  return null;
}
