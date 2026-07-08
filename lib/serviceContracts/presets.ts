/**
 * Service Contract project-type presets.
 *
 * Refined 2026-07-08 (pass 2) from the 7-contract analysis
 * (docs/service-agreements/contract-analysis-2026-07-08.md) — these match the
 * real combinations observed across ANC's service contracts:
 *   general-only (Ad Hoc Services), general+labor (Arizona),
 *   general+graphics (Ad Hoc Graphics, Toronto), general+software (Hub City),
 *   general+parts (Ravens), general+labor+software+parts (SMU),
 *   general+labor+software+graphics (Iona).
 *
 * "software" covers LiveSync (the EULA bundles the LiveSync license).
 * "labor" is kept as a flag though labor is a body/scope element (no separate
 * legal exhibit) — toggling it on is a signal for the proposal author to include
 * on-site labor scope; the exhibit body is editable per-instance.
 */
import type { ProjectTypePreset } from "./types";

export const SERVICE_CONTRACT_PRESETS: ProjectTypePreset[] = [
  {
    id: "general-only",
    label: "General Terms Only",
    defaultExhibits: { "general-terms": true },
  },
  {
    id: "general+labor",
    label: "General Terms + Labor",
    defaultExhibits: { "general-terms": true, labor: true },
  },
  {
    id: "general+graphics",
    label: "General Terms + Graphics",
    defaultExhibits: { "general-terms": true, graphics: true },
  },
  {
    id: "general+software",
    label: "General Terms + Software (incl. LiveSync)",
    defaultExhibits: { "general-terms": true, software: true },
  },
  {
    id: "general+parts",
    label: "General Terms + Parts",
    defaultExhibits: { "general-terms": true, parts: true },
  },
  {
    id: "general+labor+software+parts",
    label: "General + Labor + Software + Parts",
    defaultExhibits: { "general-terms": true, labor: true, software: true, parts: true },
  },
  {
    id: "general+labor+software+graphics",
    label: "General + Labor + Software + Graphics",
    defaultExhibits: { "general-terms": true, labor: true, software: true, graphics: true },
  },
];

export function getPreset(id: string): ProjectTypePreset | undefined {
  return SERVICE_CONTRACT_PRESETS.find((p) => p.id === id);
}