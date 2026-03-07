/**
 * Installation SOW Generator — Produces Matt's subcontractor-facing DOCX.
 *
 * Pure template engine: no AI, no LLM calls. All data comes from the proposal.
 * Based on real ANC SOWs (Bilt HQ, Union Station, Reverb Hotel).
 *
 * Output: .docx file matching Matt's exact format.
 */

import {
  Document,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  BorderStyle,
  Packer,
  ShadingType,
  convertInchesToTwip,
  TableLayoutType,
  Header,
  ImageRun,
} from "docx";
import {
  INSTALL_TASKS,
  DEFAULT_EXCLUSIONS,
  UNION_INCLUSIONS,
  NIGHT_WORK_INCLUSIONS,
  BOILERPLATE,
  STRUCTURE_TYPES,
  estimateCabinets,
} from "./installationSOWTemplates";
import fs from "fs";
import path from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface InstallSOWDisplay {
  name: string;
  widthFt: number;
  heightFt: number;
  pixelPitch: number;
  quantity: number;
  resolution?: string;
  manufacturer?: string;
  environment?: "Indoor" | "Outdoor";
  structureType?: string;
  hasDemolition?: boolean;
  installPrice?: number;
}

export interface InstallSOWInput {
  projectName: string;
  clientName: string;
  venue: string;
  address?: string;
  date?: string;
  revision?: number;
  installStartDate?: string;
  installEndDate?: string;
  installWeeks?: number;
  displays: InstallSOWDisplay[];
  isUnionLabor?: boolean;
  hasNightWork?: boolean;
  includeElectrical?: boolean;
  includeStructural?: boolean;
  customExclusions?: string[];
  bidDueDate?: string;
  currency?: string;
  /** Per-section text overrides — key is section id, value is custom text */
  sectionOverrides?: Record<string, string>;
}

/** Structured SOW data for the live preview UI */
export interface InstallSOWPreview {
  title: string;
  subtitle: string;
  projectName: string;
  address: string;
  date: string;
  revision: number;
  sections: SOWPreviewSection[];
  displays: SOWPreviewDisplay[];
  exclusions: string[];
  pricingNote: string;
  bidDueDate: string;
}

export interface SOWPreviewSection {
  id: string;
  title: string;
  content: string;
  editable: boolean;
}

export interface SOWPreviewDisplay {
  name: string;
  quantity: number;
  specs: string;
  cabinetInfo: string;
  inclusions: string[];
  tasks: string[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmt(amount: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function bold(text: string, size = 22): TextRun {
  return new TextRun({ text, bold: true, size, font: "Calibri" });
}

function normal(text: string, size = 22): TextRun {
  return new TextRun({ text, size, font: "Calibri" });
}

function underlineBold(text: string, size = 22): TextRun {
  return new TextRun({ text, bold: true, underline: { type: "single" }, size, font: "Calibri" });
}

function sectionHeading(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 300, after: 100 },
    children: [underlineBold(text, 22)],
  });
}

function bodyParagraph(text: string): Paragraph {
  return new Paragraph({
    spacing: { after: 120 },
    children: [normal(text)],
  });
}

function numberedItem(num: string, text: string, isBold = false): Paragraph {
  return new Paragraph({
    spacing: { after: 60 },
    indent: { left: convertInchesToTwip(0.25) },
    children: [
      isBold ? bold(`${num} `) : normal(`${num} `),
      isBold ? underlineBold(text) : normal(text),
    ],
  });
}

function subItem(num: string, text: string): Paragraph {
  return new Paragraph({
    spacing: { after: 40 },
    indent: { left: convertInchesToTwip(0.5) },
    children: [normal(`${num}${text}`)],
  });
}

function spacer(size = 120): Paragraph {
  return new Paragraph({ spacing: { before: size, after: size }, children: [] });
}

// ─── Build Display Inclusion Block ──────────────────────────────────────────

function buildDisplayInclusion(
  d: InstallSOWDisplay,
  displayNum: number
): Paragraph[] {
  const cab = estimateCabinets(d.widthFt, d.heightFt, d.pixelPitch);
  const structLabel = STRUCTURE_TYPES[d.structureType || "wall"] || STRUCTURE_TYPES.custom;
  const paragraphs: Paragraph[] = [];

  // Display header: "1.1. Main Display including the following elements:"
  paragraphs.push(
    new Paragraph({
      spacing: { before: 80, after: 40 },
      indent: { left: convertInchesToTwip(0.25) },
      children: [normal(`1.${displayNum}. ${d.name} including the following elements:`)],
    })
  );

  // Demolition
  if (d.hasDemolition) {
    paragraphs.push(subItem(`1.${displayNum}.1.`, "Demolition and disposal of existing display."));
  }

  // Structure
  paragraphs.push(
    subItem(
      `1.${displayNum}.${d.hasDemolition ? 2 : 1}.`,
      `Fabrication and installation of secondary structure consisting of ${structLabel}.`
    )
  );

  // Cabinet info
  paragraphs.push(
    subItem(
      `1.${displayNum}.${d.hasDemolition ? 3 : 2}.`,
      `LED cabinets (Approx ${cab.total} cabinets) (${cab.rows} Rows of ${cab.cols} Cabinets) per display (${d.heightFt}'h X ${d.widthFt}'W)`
    )
  );

  // Cables
  paragraphs.push(
    new Paragraph({
      spacing: { before: 40, after: 40 },
      indent: { left: convertInchesToTwip(0.25) },
      children: [normal(`1.${displayNum + 1}. Power and low voltage cables for display.`)],
    })
  );

  return paragraphs;
}

// ─── Build Per-Display Task List ────────────────────────────────────────────

function buildDisplayTasks(
  d: InstallSOWDisplay,
  sectionNum: number,
  input: InstallSOWInput
): Paragraph[] {
  const paragraphs: Paragraph[] = [];

  // Section header: "2. Main Display – QTY 1:"
  paragraphs.push(
    numberedItem(
      `${sectionNum}.`,
      `${d.name} – QTY ${d.quantity}:`,
      true
    )
  );

  let taskNum = 1;
  for (const task of INSTALL_TASKS) {
    if (task.condition === "hasDemolition" && !d.hasDemolition) continue;
    if (task.condition === "hasStructural" && input.includeStructural === false) continue;
    if (task.condition === "hasElectrical" && input.includeElectrical === false) continue;

    const text = task.template
      .replace(/\{displayName\}/g, d.name);

    paragraphs.push(subItem(`${sectionNum}.${taskNum}. `, text));
    taskNum++;
  }

  return paragraphs;
}

// ─── Preview Data Builder (for UI) ──────────────────────────────────────────

export function buildSOWPreview(input: InstallSOWInput): InstallSOWPreview {
  const date = input.date || new Date().toISOString().split("T")[0];
  const revision = input.revision || 1;

  // Build installation line
  let installLine = "";
  if (input.installStartDate && input.installEndDate) {
    installLine = `Installation is to take place between ${input.installStartDate} and ${input.installEndDate}.`;
  } else if (input.installWeeks) {
    installLine = `Estimated installation duration is ${input.installWeeks} weeks from receipt of Notice to Proceed.`;
  }
  installLine += " Installation of the LED video board included in the equipment list below and described within the SOW is to be part of this scope.";

  // Objective
  const displayCount = input.displays.reduce((s, d) => s + d.quantity, 0);
  const hasDemolition = input.displays.some((d) => d.hasDemolition);
  const objectiveParts: string[] = [];
  if (hasDemolition) objectiveParts.push("Demolition");
  objectiveParts.push("Installation");
  const objectiveAction = objectiveParts.join(" and ");
  const objective = input.sectionOverrides?.objective ||
    `${objectiveAction} of the ${input.displays.length > 1 ? "displays" : "Main display"}${input.displays.length > 1 ? "s" : ""} for ${input.venue}.`;

  const sections: SOWPreviewSection[] = [
    { id: "overview", title: "PROJECT OVERVIEW", content: input.sectionOverrides?.overview || BOILERPLATE.PROJECT_OVERVIEW, editable: true },
    { id: "objective", title: "Objective", content: objective, editable: true },
    { id: "installation", title: "Installation", content: input.sectionOverrides?.installation || installLine, editable: true },
    { id: "electrical", title: "Electrical Connection", content: input.sectionOverrides?.electrical || BOILERPLATE.ELECTRICAL_CONNECTION, editable: true },
    { id: "testing", title: "Testing and Adjusting", content: input.sectionOverrides?.testing || BOILERPLATE.TESTING, editable: true },
    { id: "signoff", title: "ANC Signoff", content: input.sectionOverrides?.signoff || BOILERPLATE.ANC_SIGNOFF, editable: true },
  ];

  const displays: SOWPreviewDisplay[] = input.displays.map((d) => {
    const cab = estimateCabinets(d.widthFt, d.heightFt, d.pixelPitch);
    const structLabel = STRUCTURE_TYPES[d.structureType || "wall"] || STRUCTURE_TYPES.custom;
    const inclusions: string[] = [];
    if (d.hasDemolition) inclusions.push("Demolition and disposal of existing display.");
    inclusions.push(`Fabrication and installation of secondary structure consisting of ${structLabel}.`);
    inclusions.push(`LED cabinets (Approx ${cab.total} cabinets) (${cab.rows} Rows of ${cab.cols} Cabinets) per display (${d.heightFt}'h X ${d.widthFt}'W)`);
    inclusions.push("Power and low voltage cables for display.");

    const tasks: string[] = [];
    for (const task of INSTALL_TASKS) {
      if (task.condition === "hasDemolition" && !d.hasDemolition) continue;
      if (task.condition === "hasStructural" && input.includeStructural === false) continue;
      if (task.condition === "hasElectrical" && input.includeElectrical === false) continue;
      tasks.push(task.template.replace(/\{displayName\}/g, d.name));
    }

    return {
      name: d.name,
      quantity: d.quantity,
      specs: `${d.heightFt}'H x ${d.widthFt}'W, ${d.pixelPitch}mm`,
      cabinetInfo: `Approx ${cab.total} cabinets (${cab.rows} rows x ${cab.cols} cols)`,
      inclusions,
      tasks,
    };
  });

  const exclusions = [...DEFAULT_EXCLUSIONS, ...(input.customExclusions || [])];
  if (input.isUnionLabor) exclusions.push(...UNION_INCLUSIONS.map((i) => `[INCLUDED] ${i}`));

  return {
    title: "Scope of Work:",
    subtitle: `${input.venue} – Display ${input.displays.some((d) => d.hasDemolition) ? "Replacement" : "Installation"}`,
    projectName: input.projectName,
    address: input.address || "",
    date,
    revision,
    sections,
    displays,
    exclusions,
    pricingNote: BOILERPLATE.ITEMIZED_PRICING,
    bidDueDate: input.bidDueDate || "Please submit your bid via email to the ANC Contacts ASAP.",
  };
}

// ─── DOCX Generator ─────────────────────────────────────────────────────────

export async function generateInstallationSOW(input: InstallSOWInput): Promise<Buffer> {
  const date = input.date || new Date().toISOString().split("T")[0];
  const revision = input.revision || 1;
  const currency = input.currency || "USD";
  const preview = buildSOWPreview(input);

  const children: Paragraph[] = [];

  // ─── Title Block ──────────────────────────────────────────────────
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 20 },
      children: [bold("Scope of Work:", 28)],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [normal(preview.subtitle, 24)],
    })
  );

  // Project info block
  children.push(
    new Paragraph({
      spacing: { after: 20 },
      children: [
        new TextRun({ text: "PROJECT NAME: ", bold: true, size: 20, font: "Courier New" }),
        new TextRun({ text: input.projectName, size: 20, font: "Courier New" }),
      ],
    }),
    new Paragraph({
      spacing: { after: 20 },
      children: [
        new TextRun({ text: "ADDRESS: ", bold: true, size: 20, font: "Courier New" }),
        new TextRun({ text: input.address || "", size: 20, font: "Courier New" }),
      ],
    }),
    new Paragraph({
      spacing: { after: 100 },
      children: [
        new TextRun({ text: "DATE: ", bold: true, size: 20, font: "Courier New" }),
        new TextRun({ text: date, size: 20, font: "Courier New" }),
        new TextRun({ text: `    Revision #${revision}`, size: 20, font: "Courier New" }),
      ],
    })
  );

  // ─── Boilerplate Sections ─────────────────────────────────────────
  for (const section of preview.sections) {
    if (section.id === "overview") {
      // Special: large heading
      children.push(
        new Paragraph({
          spacing: { before: 200, after: 100 },
          children: [new TextRun({ text: "PROJECT OVERVIEW", size: 22, font: "Courier New" })],
        })
      );
    } else {
      children.push(sectionHeading(section.title));
    }
    // Split on newlines for multi-paragraph sections
    for (const para of section.content.split("\n\n")) {
      children.push(bodyParagraph(para.trim()));
    }
  }

  // ─── SCOPE OF WORK ────────────────────────────────────────────────
  children.push(
    new Paragraph({
      spacing: { before: 300, after: 100 },
      children: [new TextRun({ text: "SCOPE OF WORK", size: 24, font: "Courier New" })],
    })
  );

  // 1. General Inclusions
  children.push(numberedItem("1.", "General Inclusions:", true));
  for (const display of input.displays) {
    children.push(...buildDisplayInclusion(display, input.displays.indexOf(display) + 1));
  }

  // 2. General Exclusions
  children.push(spacer(200));
  children.push(numberedItem("2.", "General Exclusions:", true));
  const exclusions = [...DEFAULT_EXCLUSIONS, ...(input.customExclusions || [])];
  exclusions.forEach((ex, i) => {
    children.push(subItem(`2.${i + 1}. `, ex));
  });

  // Per-display detailed tasks
  let sectionNum = 2;
  for (const display of input.displays) {
    sectionNum++;
    children.push(spacer(200));
    children.push(...buildDisplayTasks(display, sectionNum, input));
  }

  // ─── ITEMIZED PRICING ─────────────────────────────────────────────
  children.push(spacer(300));
  children.push(
    new Paragraph({
      spacing: { before: 200, after: 100 },
      children: [new TextRun({ text: "ITEMIZED PRICING", size: 24, font: "Courier New" })],
    })
  );
  children.push(bodyParagraph(preview.pricingNote));

  // ─── BID DUE DATE ─────────────────────────────────────────────────
  children.push(spacer(200));
  children.push(
    new Paragraph({
      spacing: { after: 100 },
      children: [
        bold("BID DUE DATE: ", 22),
        normal(preview.bidDueDate, 22),
      ],
    })
  );

  // ─── Build Document ───────────────────────────────────────────────

  // Try to load ANC logo for header
  let logoImage: ImageRun | null = null;
  try {
    const logoPath = path.join(process.cwd(), "public", "anc-logo.png");
    if (fs.existsSync(logoPath)) {
      const logoData = fs.readFileSync(logoPath);
      logoImage = new ImageRun({
        data: logoData,
        transformation: { width: 120, height: 50 },
        type: "png",
      });
    }
  } catch {}

  const headerChildren: Paragraph[] = [];
  if (logoImage) {
    headerChildren.push(
      new Paragraph({ alignment: AlignmentType.CENTER, children: [logoImage] })
    );
  } else {
    headerChildren.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [bold("anc", 32)],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: "www.anc.com", size: 16, font: "Calibri", color: "666666" })],
      })
    );
  }

  const doc = new Document({
    styles: {
      default: {
        document: { run: { font: "Calibri", size: 22 } },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: convertInchesToTwip(1.2),
              bottom: convertInchesToTwip(0.8),
              left: convertInchesToTwip(1),
              right: convertInchesToTwip(1),
            },
          },
        },
        headers: {
          default: new Header({ children: headerChildren }),
        },
        children,
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  return Buffer.from(buffer);
}
