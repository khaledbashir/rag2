/**
 * Installation SOW Templates — Fixed text blocks for Matt's subcontractor SOW format.
 *
 * Based on real ANC SOWs: Bilt HQ and Union Station Display Replacement.
 * Every section is deterministic — no AI. Data-driven from proposal screens + pricing.
 */

// ─── Per-Display Install Tasks ──────────────────────────────────────────────

export interface InstallTask {
  id: string;
  label: string;
  /** Template string. Placeholders: {displayName}, {cabinetCount}, {structureType}, {sqft} */
  template: string;
  /** When to include this task */
  condition: "always" | "hasDemolition" | "hasStructural" | "hasElectrical";
}

export const INSTALL_TASKS: InstallTask[] = [
  {
    id: "unload",
    label: "Unload / Receive / Stage",
    template: "Unload, receive, and stage all LED display components for {displayName}",
    condition: "always",
  },
  {
    id: "demolition",
    label: "Demolition & Disposal",
    template: "Demolish and dispose of existing display system at {displayName} location",
    condition: "hasDemolition",
  },
  {
    id: "structural",
    label: "Structural Installation",
    template: "Install structural support system ({structureType}) for {displayName}",
    condition: "hasStructural",
  },
  {
    id: "led-install",
    label: "LED Cabinet Installation",
    template:
      "Install LED cabinets for {displayName}, connect power and data cabling to all modules",
    condition: "always",
  },
  {
    id: "cabling",
    label: "Signal & Power Cabling",
    template: "Route and terminate all signal and power cabling for {displayName}",
    condition: "always",
  },
  {
    id: "electrical",
    label: "Electrical Connections",
    template:
      "Electrical jumps from owner-provided power source to {displayName} display location",
    condition: "hasElectrical",
  },
  {
    id: "crate-disposal",
    label: "Crate Disposal",
    template: "Dispose of all shipping crates and packaging material for {displayName}",
    condition: "always",
  },
];

// ─── General Inclusions & Exclusions ────────────────────────────────────────

export const DEFAULT_INCLUSIONS = [
  "Travel and accommodations for ANC installation crew",
  "Project management and on-site supervision",
  "Engineering and shop drawings",
  "Logistics coordination and freight to job site",
  "Testing, calibration, and commissioning of all displays",
  "Training for venue operations staff",
  "As-built documentation package",
];

export const DEFAULT_EXCLUSIONS = [
  "Electrical permits and inspections (by owner)",
  "Primary electrical service to display locations (by owner)",
  "Structural engineering certification (if required by jurisdiction)",
  "Content creation and media management software",
  "After-hours security or escort (if required by venue)",
  "Fire alarm / suppression modifications",
  "Patching, painting, or finishing of surrounding surfaces",
];

export const UNION_INCLUSIONS = [
  "All installation labor performed by IBEW-certified union electricians",
  "Certified payroll documentation per applicable collective bargaining agreements",
];

export const NIGHT_WORK_INCLUSIONS = [
  "Night shift differential for off-hours installation work",
  "After-hours coordination with venue operations",
];

// ─── Boilerplate Sections ───────────────────────────────────────────────────

export const BOILERPLATE = {
  PROJECT_OVERVIEW: `ANC is the nation's leading in-venue technology company, providing end-to-end solutions including LED displays, digital signage, and content management systems for sports and entertainment venues. ANC designs, engineers, manufactures, installs, and maintains large-format LED display systems for professional and collegiate sports venues across North America.`,

  ELECTRICAL_CONNECTION: `All LED display systems require dedicated electrical circuits provided to within 10 feet of each display location. ANC will make final electrical connections ("jumps") from the owner-provided power source to the display. Primary electrical service, panel installation, and branch circuit wiring to the display location are the responsibility of the owner's electrical contractor unless otherwise specified.`,

  TESTING: `Upon completion of installation, ANC will perform comprehensive system testing including full power-on verification, pixel-level calibration for uniform brightness and color accuracy, content playback testing across all display zones, and integration verification with the venue's content management system. A minimum 72-hour burn-in period will be conducted prior to final acceptance.`,

  ANC_SIGNOFF: `ANC will conduct a formal walkthrough with the owner's representative upon completion of all installation and testing activities. A punch list will be generated and addressed prior to final acceptance. ANC will provide a signed Certificate of Completion upon satisfactory resolution of all punch list items.`,
};

// ─── Structure Type Labels ──────────────────────────────────────────────────

export const STRUCTURE_TYPES: Record<string, string> = {
  wall: "wall-mounted steel structure",
  flown: "flown/rigged steel structure from existing building steel",
  ground: "ground-supported steel structure",
  ceiling: "ceiling-mounted steel structure",
  freestanding: "freestanding steel structure with base plate",
  custom: "custom structural support system",
};
