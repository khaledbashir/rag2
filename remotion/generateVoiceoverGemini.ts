/**
 * Generate AI voiceover using Gemini 2.5 Flash TTS.
 * Tries multiple voices so we can pick the best one.
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent";

const SCRIPT = `Oklahoma City Arena.
A custom LED display integration, prepared for the Oklahoma City Thunder.
This project spans 72 unique display configurations, across 98 total screens.
Covering over 43,000 square feet of LED.
The Main Scoreboard — fifty feet wide, five feet tall, six millimeter pitch.
Ribbon boards on the handrailing — six hundred feet of continuous LED wrapping the venue.
The SE Corner at Gaylord and Reno — a forty-eight foot tall landmark display.
Plus 65 additional screens throughout concourses, clubs, and entry points.
Total project investment: 2.1 million dollars.
ANC. Powering the game.`;

async function generateWithVoice(voice: string): Promise<void> {
  console.log(`\n[Gemini TTS] Generating with voice: ${voice}...`);

  const res = await fetch(`${ENDPOINT}?key=${GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{
        parts: [{
          text: `Speak in a confident, measured, cinematic tone. Not rushed. Like a documentary narrator for a premium sports technology brand: ${SCRIPT}`,
        }],
      }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: voice,
            },
          },
        },
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error(`[Gemini TTS] Failed for ${voice}: ${res.status} ${err.substring(0, 200)}`);
    return;
  }

  const data = await res.json();
  const audioBase64 = data?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!audioBase64) {
    console.error(`[Gemini TTS] No audio data for ${voice}`);
    return;
  }

  const pcmPath = path.join(process.cwd(), "out", `voice-${voice.toLowerCase()}.pcm`);
  const mp3Path = path.join(process.cwd(), "out", `voice-${voice.toLowerCase()}.mp3`);

  fs.mkdirSync(path.dirname(pcmPath), { recursive: true });
  fs.writeFileSync(pcmPath, Buffer.from(audioBase64, "base64"));

  // Convert PCM to MP3 — Gemini outputs raw PCM at 24kHz mono
  try {
    execSync(`ffmpeg -y -f s16le -ar 24000 -ac 1 -i "${pcmPath}" -codec:a libmp3lame -q:a 2 "${mp3Path}" 2>/dev/null`);
    fs.unlinkSync(pcmPath);
    const size = (fs.statSync(mp3Path).size / 1024).toFixed(1);
    console.log(`[Gemini TTS] ✓ ${voice} → ${mp3Path} (${size} KB)`);
  } catch (err) {
    console.error(`[Gemini TTS] ffmpeg conversion failed for ${voice}`);
  }
}

async function main() {
  // Test voices that sound good for corporate/cinematic narration
  const voices = ["Charon", "Fenrir", "Enceladus", "Puck", "Kore"];

  for (const voice of voices) {
    await generateWithVoice(voice);
  }

  console.log("\n[Gemini TTS] Done. Listen to each file in out/ and pick your favorite.");
}

main().catch(console.error);
