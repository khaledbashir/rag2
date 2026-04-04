/**
 * Generate AI voiceover for proposal videos using OpenAI TTS.
 *
 * Takes project data, builds a natural script, calls OpenAI tts-1-hd,
 * saves the audio file for Remotion to consume.
 */

import fs from "fs";
import path from "path";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";

export interface VoiceoverInput {
  venueName: string;
  clientName: string;
  displayCount: number;
  totalScreens: number;
  totalSqFt: number;
  totalSelling: string;
  displays: { name: string; dims: string; pitch: string }[];
}

/** Build a natural-sounding narration script from project data */
export function buildScript(input: VoiceoverInput): string {
  const topDisplays = input.displays.slice(0, 4);
  const displayList = topDisplays
    .map((d) => `The ${d.name}, ${d.dims}, at ${d.pitch} pixel pitch.`)
    .join(" ");
  const moreText =
    input.displays.length > 4
      ? ` Plus ${input.displays.length - 4} additional displays throughout the venue.`
      : "";

  return [
    `${input.venueName}.`,
    `A custom LED display integration prepared for ${input.clientName}.`,
    `This project includes ${input.displayCount} unique display configurations across ${input.totalScreens} total screens.`,
    `Covering ${input.totalSqFt.toLocaleString()} square feet of LED.`,
    displayList,
    moreText,
    `Total project investment: ${input.totalSelling}.`,
    `ANC. Powering the game.`,
  ]
    .filter(Boolean)
    .join(" ");
}

/** Call OpenAI TTS and save the audio file */
export async function generateVoiceover(
  input: VoiceoverInput,
  outputPath?: string
): Promise<string> {
  const script = buildScript(input);
  console.log("[Voiceover] Script:", script);
  console.log("[Voiceover] Calling OpenAI TTS...");

  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "tts-1-hd",
      voice: "onyx", // deep, confident, male — perfect for corporate
      input: script,
      response_format: "mp3",
      speed: 0.95, // slightly slower for gravitas
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI TTS failed: ${res.status} ${err}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  const outPath = outputPath || path.join(process.cwd(), "public", "audio", "voiceover.mp3");

  // Ensure directory exists
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, buffer);

  console.log(`[Voiceover] Saved to ${outPath} (${(buffer.length / 1024).toFixed(1)} KB)`);
  return outPath;
}

// CLI runner
if (require.main === module) {
  const input: VoiceoverInput = {
    venueName: "Oklahoma City Arena",
    clientName: "Oklahoma City Thunder",
    displayCount: 72,
    totalScreens: 98,
    totalSqFt: 43026,
    totalSelling: "two point one million dollars",
    displays: [
      { name: "Main Scoreboard", dims: "fifty feet wide by five feet tall", pitch: "six millimeter" },
      { name: "Ribbon on Handrailing", dims: "six hundred feet wide by three feet tall", pitch: "five point nine five millimeter" },
      { name: "SE Corner Gaylord and Reno", dims: "fourteen feet wide by forty-eight feet tall", pitch: "ten millimeter" },
      { name: "Exterior at Thunder Alley", dims: "nine and a half feet wide by twenty feet tall", pitch: "three point nine one millimeter" },
      { name: "Mezz Level Family VIP Entry", dims: "five and a half feet wide by thirty-two feet tall", pitch: "two point five millimeter" },
      { name: "Main Team Store Entry", dims: "nine and a half feet wide by twenty feet tall", pitch: "two point five millimeter" },
      { name: "Founders Lounge Behind Bar", dims: "seven feet wide by seven feet tall", pitch: "one point two millimeter" },
      { name: "Main Concourse West Entry", dims: "ten feet wide by twelve feet tall", pitch: "two point five millimeter" },
    ],
  };

  generateVoiceover(input).catch(console.error);
}
