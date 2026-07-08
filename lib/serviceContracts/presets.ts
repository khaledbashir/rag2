/**
 * Service Contract project-type presets.
 *
 * A preset pre-toggles term exhibits to a known configuration. Seeded with the
 * four project types Natalia named: general-only, general+live-sync,
 * general+parts, general+parts&labor. When the 7–8 example contracts arrive
 * (pass 2), presets + exhibits are refined from real contract analysis — no
 * schema change required, only new seed files.
 */
import type { ProjectTypePreset } from "./types";

export const SERVICE_CONTRACT_PRESETS: ProjectTypePreset[] = [
  {
    id: "general-only",
    label: "General Terms Only",
    defaultExhibits: { "general-terms": true },
  },
  {
    id: "general+live-sync",
    label: "General Terms + Live Sync",
    defaultExhibits: { "general-terms": true, "live-sync": true },
  },
  {
    id: "general+parts",
    label: "General Terms + Parts",
    defaultExhibits: { "general-terms": true, parts: true },
  },
  {
    id: "general+parts&labor",
    label: "General Terms + Parts & Labor",
    defaultExhibits: { "general-terms": true, parts: true, labor: true },
  },
];

export function getPreset(id: string): ProjectTypePreset | undefined {
  return SERVICE_CONTRACT_PRESETS.find((p) => p.id === id);
}