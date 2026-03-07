/**
 * Installation SOW Generator — Produces Matt's subcontractor-facing DOCX.
 *
 * Pure template engine: no AI, no LLM calls. All data comes from the proposal.
 * Based on real ANC SOWs (Bilt HQ, Union Station Display Replacement).
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
  HeadingLevel,
  BorderStyle,
  Packer,
  ShadingType,
  convertInchesToTwip,
  TableLayoutType,
} from "docx";
import {
  INSTALL_TASKS,
  DEFAULT_INCLUSIONS,
  DEFAULT_EXCLUSIONS,
  UNION_INCLUSIONS,
  NIGHT_WORK_INCLUSIONS,
  BOILERPLATE,
  STRUCTURE_TYPES,
  type InstallTask,
} from "./installationSOWTemplates";

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
  installWeeks?: number;
  displays: InstallSOWDisplay[];
  isUnionLabor?: boolean;
  hasNightWork?: boolean;
  includeElectrical?: boolean;
  includeStructural?: boolean;
  customInclusions?: string[];
  customExclusions?: string[];
  currency?: string;
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

function heading(text: string, level: (typeof HeadingLevel)[keyof typeof HeadingLevel] = HeadingLevel.HEADING_1): Paragraph {
  return new Paragraph({
    heading: level,
    spacing: { before: 240, after: 120 },
    children: [new TextRun({ text, bold: true, size: level === HeadingLevel.HEADING_1 ? 28 : 24, font: "Calibri" })],
  });
}

function bullet(text: string): Paragraph {
  return new Paragraph({
    bullet: { level: 0 },
    spacing: { after: 40 },
    children: [normal(text)],
  });
}

function spacer(): Paragraph {
  return new Paragraph({ spacing: { before: 120, after: 120 }, children: [] });
}

function bodyParagraph(text: string): Paragraph {
  return new Paragraph({
    spacing: { after: 120 },
    children: [normal(text)],
  });
}

// ─── Table Builders ─────────────────────────────────────────────────────────

const BORDER_THIN = {
  top: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
  bottom: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
  left: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
  right: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
} as const;

function headerCell(text: string, width?: number): TableCell {
  return new TableCell({
    children: [new Paragraph({ children: [bold(text, 20)], alignment: AlignmentType.CENTER })],
    shading: { type: ShadingType.SOLID, color: "1F2937" },
    borders: BORDER_THIN,
    width: width ? { size: width, type: WidthType.DXA } : undefined,
    verticalAlign: "center" as any,
  });
}

function dataCell(text: string, align: (typeof AlignmentType)[keyof typeof AlignmentType] = AlignmentType.LEFT): TableCell {
  return new TableCell({
    children: [new Paragraph({ children: [normal(text, 20)], alignment: align })],
    borders: BORDER_THIN,
    verticalAlign: "center" as any,
  });
}

function buildEquipmentTable(displays: InstallSOWDisplay[]): Table {
  const headerRow = new TableRow({
    tableHeader: true,
    children: [
      headerCell("Display", 3500),
      headerCell("Size", 2000),
      headerCell("Pitch", 1200),
      headerCell("Qty", 800),
      headerCell("Environment", 1500),
    ],
  });

  const rows = displays.map(
    (d) =>
      new TableRow({
        children: [
          dataCell(d.name),
          dataCell(`${d.heightFt}' H x ${d.widthFt}' W`),
          dataCell(`${d.pixelPitch}mm`),
          dataCell(String(d.quantity), AlignmentType.CENTER),
          dataCell(d.environment || "Indoor"),
        ],
      })
  );

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    rows: [headerRow, ...rows],
  });
}

function buildPricingTable(displays: InstallSOWDisplay[], currency: string): Table {
  const headerRow = new TableRow({
    tableHeader: true,
    children: [
      headerCell("Display", 5000),
      headerCell("Qty", 1000),
      headerCell("Install Price", 3000),
    ],
  });

  let grandTotal = 0;
  const rows = displays.map((d) => {
    const lineTotal = (d.installPrice || 0) * d.quantity;
    grandTotal += lineTotal;
    return new TableRow({
      children: [
        dataCell(d.name),
        dataCell(String(d.quantity), AlignmentType.CENTER),
        dataCell(d.installPrice ? fmt(lineTotal, currency) : "TBD", AlignmentType.RIGHT),
      ],
    });
  });

  const totalRow = new TableRow({
    children: [
      new TableCell({
        children: [new Paragraph({ children: [bold("TOTAL", 20)], alignment: AlignmentType.RIGHT })],
        borders: BORDER_THIN,
        columnSpan: 2,
      }),
      new TableCell({
        children: [
          new Paragraph({
            children: [bold(grandTotal > 0 ? fmt(grandTotal, currency) : "TBD", 20)],
            alignment: AlignmentType.RIGHT,
          }),
        ],
        borders: BORDER_THIN,
        shading: { type: ShadingType.SOLID, color: "E8F5E9" },
      }),
    ],
  });

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    rows: [headerRow, ...rows, totalRow],
  });
}

// ─── Per-Display Scope Builder ──────────────────────────────────────────────

function buildDisplayScope(display: InstallSOWDisplay, input: InstallSOWInput): Paragraph[] {
  const structureLabel =
    STRUCTURE_TYPES[display.structureType || "wall"] || STRUCTURE_TYPES.custom;

  const paragraphs: Paragraph[] = [
    new Paragraph({
      heading: HeadingLevel.HEADING_3,
      spacing: { before: 200, after: 80 },
      children: [
        bold(`${display.name}`, 22),
        normal(
          `  —  ${display.heightFt}' H x ${display.widthFt}' W, ${display.pixelPitch}mm, Qty ${display.quantity}`,
          20
        ),
      ],
    }),
  ];

  for (const task of INSTALL_TASKS) {
    if (task.condition === "hasDemolition" && !display.hasDemolition) continue;
    if (task.condition === "hasStructural" && input.includeStructural === false) continue;
    if (task.condition === "hasElectrical" && input.includeElectrical === false) continue;

    const text = task.template
      .replace(/\{displayName\}/g, display.name)
      .replace(/\{structureType\}/g, structureLabel)
      .replace(/\{sqft\}/g, String(Math.round(display.widthFt * display.heightFt)));

    paragraphs.push(bullet(text));
  }

  return paragraphs;
}

// ─── Main Generator ─────────────────────────────────────────────────────────

export async function generateInstallationSOW(input: InstallSOWInput): Promise<Buffer> {
  const date = input.date || new Date().toISOString().split("T")[0];
  const installWeeks = input.installWeeks || 4;
  const currency = input.currency || "USD";

  // Build inclusions
  const inclusions = [...DEFAULT_INCLUSIONS, ...(input.customInclusions || [])];
  if (input.isUnionLabor) inclusions.push(...UNION_INCLUSIONS);
  if (input.hasNightWork) inclusions.push(...NIGHT_WORK_INCLUSIONS);

  // Build exclusions
  const exclusions = [...DEFAULT_EXCLUSIONS, ...(input.customExclusions || [])];

  // ─── Document Assembly ──────────────────────────────────────────────────

  const children: (Paragraph | Table)[] = [];

  // Title block
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 40 },
      children: [bold("ANC SPORTS ENTERPRISES, LLC", 28)],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 40 },
      children: [bold("SCOPE OF WORK (INSTALLATION)", 24)],
    }),
    spacer(),
    new Paragraph({
      spacing: { after: 40 },
      children: [bold("Project: "), normal(input.projectName)],
    }),
    new Paragraph({
      spacing: { after: 40 },
      children: [bold("Client: "), normal(input.clientName)],
    }),
    new Paragraph({
      spacing: { after: 40 },
      children: [bold("Venue: "), normal(input.venue)],
    })
  );

  if (input.address) {
    children.push(
      new Paragraph({
        spacing: { after: 40 },
        children: [bold("Address: "), normal(input.address)],
      })
    );
  }

  children.push(
    new Paragraph({
      spacing: { after: 40 },
      children: [bold("Date: "), normal(date)],
    }),
    spacer()
  );

  // 1. Project Overview
  children.push(heading("1. PROJECT OVERVIEW"));
  children.push(bodyParagraph(BOILERPLATE.PROJECT_OVERVIEW));

  // 2. Objective
  children.push(heading("2. OBJECTIVE"));
  const displayCount = input.displays.reduce((s, d) => s + d.quantity, 0);
  children.push(
    bodyParagraph(
      `ANC will furnish all labor, materials, and equipment necessary to install ${displayCount} LED display system${displayCount !== 1 ? "s" : ""} at ${input.venue} as described in this Scope of Work.`
    )
  );

  // 3. Installation Timeline
  children.push(heading("3. INSTALLATION TIMELINE"));
  children.push(
    bodyParagraph(
      `Estimated installation duration is ${installWeeks} weeks from receipt of Notice to Proceed. A detailed installation schedule will be provided within 5 business days of contract execution. The schedule is contingent upon timely access to all display locations and completion of prerequisite work by others.`
    )
  );

  // 4. Electrical Connection
  children.push(heading("4. ELECTRICAL CONNECTION"));
  children.push(bodyParagraph(BOILERPLATE.ELECTRICAL_CONNECTION));

  // 5. Testing
  children.push(heading("5. TESTING & COMMISSIONING"));
  children.push(bodyParagraph(BOILERPLATE.TESTING));

  // 6. ANC Signoff
  children.push(heading("6. ANC SIGNOFF"));
  children.push(bodyParagraph(BOILERPLATE.ANC_SIGNOFF));

  // 7. Reference Equipment
  children.push(heading("7. REFERENCE EQUIPMENT"));
  children.push(
    bodyParagraph("The following LED display systems are included in this Scope of Work:")
  );
  children.push(spacer());
  children.push(buildEquipmentTable(input.displays));
  children.push(spacer());

  // 8. Scope of Work
  children.push(heading("8. SCOPE OF WORK"));

  // 8a. General Inclusions
  children.push(heading("8.1 General Inclusions", HeadingLevel.HEADING_2));
  children.push(
    bodyParagraph("The following items are included for all displays in this project:")
  );
  for (const item of inclusions) {
    children.push(bullet(item));
  }

  // 8b. General Exclusions
  children.push(heading("8.2 General Exclusions", HeadingLevel.HEADING_2));
  children.push(
    bodyParagraph(
      "The following items are excluded from ANC's scope and are the responsibility of the owner or owner's contractor:"
    )
  );
  for (const item of exclusions) {
    children.push(bullet(item));
  }

  // 8c. Per-Display Scope
  children.push(heading("8.3 Per-Display Scope of Work", HeadingLevel.HEADING_2));
  for (const display of input.displays) {
    children.push(...buildDisplayScope(display, input));
  }

  // 9. Itemized Pricing
  children.push(spacer());
  children.push(heading("9. ITEMIZED PRICING"));
  children.push(spacer());
  children.push(buildPricingTable(input.displays, currency));

  // ─── Create Document ────────────────────────────────────────────────────

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: "Calibri", size: 22 },
        },
        heading1: {
          run: { font: "Calibri", size: 28, bold: true, color: "1F2937" },
          paragraph: { spacing: { before: 360, after: 120 } },
        },
        heading2: {
          run: { font: "Calibri", size: 24, bold: true, color: "374151" },
          paragraph: { spacing: { before: 240, after: 100 } },
        },
        heading3: {
          run: { font: "Calibri", size: 22, bold: true, color: "4B5563" },
          paragraph: { spacing: { before: 200, after: 80 } },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: convertInchesToTwip(1),
              bottom: convertInchesToTwip(1),
              left: convertInchesToTwip(1),
              right: convertInchesToTwip(1),
            },
          },
        },
        children,
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  return Buffer.from(buffer);
}
