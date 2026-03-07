/**
 * Installation SOW Templates — Fixed text blocks for Matt's subcontractor SOW format.
 *
 * Based on real ANC SOWs: Bilt HQ, Union Station, Reverb Hotel.
 * Every section is deterministic — no AI. Data-driven from proposal screens + pricing.
 */

// ─── Per-Display Install Tasks ──────────────────────────────────────────────

export interface InstallTask {
  id: string;
  label: string;
  /** Template string. Placeholders: {displayName}, {cabinetCount}, {cabinetLayout}, {structureType}, {sqft}, {sectionDims} */
  template: string;
  /** When to include this task */
  condition: "always" | "hasDemolition" | "hasStructural" | "hasElectrical";
}

export const INSTALL_TASKS: InstallTask[] = [
  {
    id: "demolition",
    label: "Demolition & Disposal",
    template:
      "Removal and disposal of existing displays, and secondary steel (as needed)",
    condition: "hasDemolition",
  },
  {
    id: "unload-structural",
    label: "Unload / Receive / Stage Structural",
    template:
      "Unload, receive, inspect and stage all structural components in pre-arranged staging locations (locations will be coordinated by ANC and Owner)",
    condition: "hasStructural",
  },
  {
    id: "structural",
    label: "Structural Installation",
    template:
      "Provide manpower and equipment for structural installation of displays and any necessary sub structure",
    condition: "hasStructural",
  },
  {
    id: "floor-protection",
    label: "Floor Protection",
    template:
      "Provide floor protection as required by the project / general contractor / engineers",
    condition: "always",
  },
  {
    id: "unload-led",
    label: "Unload / Receive / Stage LED",
    template:
      "Unload, receive, inspect, and stage LED video panels",
    condition: "always",
  },
  {
    id: "led-install",
    label: "LED Cabinet Installation",
    template:
      "Uncrate and install LED video panel sections for {displayName}",
    condition: "always",
  },
  {
    id: "trim-flashing",
    label: "Trim & Flashing",
    template:
      "Provide manpower and equipment for structural installation of trim and flashing",
    condition: "hasStructural",
  },
  {
    id: "crate-disposal",
    label: "Crate Disposal",
    template:
      "Breakdown and dispose of crates as they are unloaded. Disposal is part of this scope of work",
    condition: "always",
  },
  {
    id: "electrical",
    label: "Electrical Connections",
    template:
      "Complete all electrical power and low voltage data jumps between assembled LED",
    condition: "always",
  },
];

// ─── Cabinet Estimation ─────────────────────────────────────────────────────

/** Estimate cabinet count from display dimensions and pixel pitch */
export function estimateCabinets(
  widthFt: number,
  heightFt: number,
  pitchMm: number
): { rows: number; cols: number; total: number; cabinetSizeMm: string } {
  // Common cabinet sizes by pitch range
  let cabWidthMm: number;
  let cabHeightMm: number;

  if (pitchMm <= 2.0) {
    cabWidthMm = 600; cabHeightMm = 337.5; // Fine pitch: 600x337.5mm
  } else if (pitchMm <= 4.0) {
    cabWidthMm = 500; cabHeightMm = 500; // Mid pitch: 500x500mm
  } else if (pitchMm <= 8.0) {
    cabWidthMm = 500; cabHeightMm = 1000; // Large pitch: 500x1000mm
  } else {
    cabWidthMm = 960; cabHeightMm = 960; // Outdoor: 960x960mm
  }

  const cabWidthFt = cabWidthMm / 304.8;
  const cabHeightFt = cabHeightMm / 304.8;

  const cols = Math.ceil(widthFt / cabWidthFt);
  const rows = Math.ceil(heightFt / cabHeightFt);
  const total = rows * cols;

  return {
    rows,
    cols,
    total,
    cabinetSizeMm: `${cabWidthMm}x${cabHeightMm}mm`,
  };
}

// ─── General Exclusions (from Reverb Hotel — standard list) ─────────────────

export const DEFAULT_EXCLUSIONS = [
  "Temporary power",
  "Site security",
  "Structural and Electrical engineering",
  "Building permits",
  "Sidewalk / Lane Closures",
  "LED Disposal",
];

export const UNION_INCLUSIONS = [
  "All installation labor performed by IBEW-certified union electricians",
  "Certified payroll documentation per applicable collective bargaining agreements",
];

export const NIGHT_WORK_INCLUSIONS = [
  "Night shift differential for off-hours installation work",
  "After-hours coordination with venue operations",
];

// ─── Boilerplate Sections (from Reverb Hotel — Matt's exact wording) ────────

export const BOILERPLATE = {
  PROJECT_OVERVIEW: `The following Scope of Work is intended to be general in nature. The intention is to have the successful Subcontractor perform all related work shown on the Contract Documents other than those items specifically indicated below to be excluded.\n\nThis Scope of Work takes precedence over the Drawings and Specifications in the event of a conflict in trade assignment or responsibility. By accepting this Scope of Work, the Subcontractor is verifying that the Drawings and Specifications clearly identify the Subcontractor's work.`,

  ELECTRICAL_CONNECTION: `Electrical connections between LED panels (jumps) will be included as part of this scope of work. "Jumps" refers to both high voltage power and low voltage data connections between ALL LED panels.`,

  TESTING: `Sub-contractor will adjust the displays to ensure the best quality installation possible and will work with ANC to complete and make any necessary changes.`,

  ANC_SIGNOFF: `Each display will be reviewed to confirm that equipment has been installed per the SOW and to the satisfaction of the ANC project manager and the customer.`,

  ITEMIZED_PRICING: `The itemized pricing for the above Scope of Work should be provided in the format below as requested in the RFP documents. If you have any questions, please do not hesitate to send over.`,
};

// ─── Structure Type Labels ──────────────────────────────────────────────────

export const STRUCTURE_TYPES: Record<string, string> = {
  wall: "aluminum channel for LED mounting",
  flown: "flown/rigged steel structure from existing building steel",
  ground: "ground-supported steel structure",
  ceiling: "ceiling-mounted steel structure",
  freestanding: "freestanding steel structure with base plate",
  custom: "custom structural support system",
};
