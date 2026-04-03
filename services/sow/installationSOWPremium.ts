/**
 * Premium Installation SOW Generator — polished DOCX template.
 *
 * Same data as the standard generator, but with professional styling:
 * - ANC blue accent bars and section headers
 * - Display specs in bordered tables
 * - Modern Calibri typography throughout
 * - Page numbers + branded footer
 * - Cover-page-style title block
 *
 * Reuses InstallSOWInput and buildSOWPreview from the standard generator.
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
  Header,
  Footer,
  ImageRun,
  PageNumber,
  NumberFormat,
  Tab,
  TabStopType,
  TabStopPosition,
} from "docx";
import {
  INSTALL_TASKS,
  DEFAULT_EXCLUSIONS,
  UNION_INCLUSIONS,
  STRUCTURE_TYPES,
  BOILERPLATE,
  estimateCabinets,
} from "./installationSOWTemplates";
import { buildSOWPreview, type InstallSOWInput } from "./installationSOWGenerator";
import fs from "fs";
import path from "path";

// ─── Brand Colors ──────────────────────────────────────────────────────────

const BLUE = "0A52EF";
const DARK_BLUE = "082F8A";
const LIGHT_BLUE_BG = "EBF2FF";
const GRAY_600 = "4B5563";
const GRAY_400 = "9CA3AF";
const WHITE = "FFFFFF";
const BLACK = "111827";

// ─── Helpers ───────────────────────────────────────────────────────────────

function txt(text: string, opts: { bold?: boolean; size?: number; color?: string; font?: string; italic?: boolean } = {}): TextRun {
  return new TextRun({
    text,
    bold: opts.bold,
    italics: opts.italic,
    size: opts.size ?? 21,
    font: opts.font ?? "Calibri",
    color: opts.color ?? BLACK,
  });
}

function blueHeading(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 360, after: 120 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: BLUE, space: 4 } },
    children: [txt(text.toUpperCase(), { bold: true, size: 24, color: BLUE })],
  });
}

function subHeading(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 240, after: 80 },
    children: [txt(text, { bold: true, size: 22, color: DARK_BLUE })],
  });
}

function body(text: string): Paragraph {
  return new Paragraph({
    spacing: { after: 80 },
    children: [txt(text, { size: 20, color: GRAY_600 })],
  });
}

function bulletItem(text: string): Paragraph {
  return new Paragraph({
    spacing: { after: 40 },
    indent: { left: convertInchesToTwip(0.35) },
    children: [txt(`•  ${text}`, { size: 20, color: GRAY_600 })],
  });
}

function numberedItem(num: string, text: string, isBold = false): Paragraph {
  return new Paragraph({
    spacing: { after: 50 },
    indent: { left: convertInchesToTwip(0.25) },
    children: [
      txt(`${num} `, { bold: true, size: 20, color: DARK_BLUE }),
      txt(text, { bold: isBold, size: 20, color: isBold ? BLACK : GRAY_600 }),
    ],
  });
}

function spacer(pts = 200): Paragraph {
  return new Paragraph({ spacing: { before: pts } });
}

/** Thin blue table cell border */
const thinBorder = {
  style: BorderStyle.SINGLE as const,
  size: 1,
  color: "D1D5DB",
};

const cellBorders = {
  top: thinBorder,
  bottom: thinBorder,
  left: thinBorder,
  right: thinBorder,
};

function tableCell(text: string, opts: { bold?: boolean; shading?: string; width?: number; align?: (typeof AlignmentType)[keyof typeof AlignmentType] } = {}): TableCell {
  return new TableCell({
    width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
    borders: cellBorders,
    shading: opts.shading ? { type: ShadingType.SOLID, color: opts.shading } : undefined,
    children: [
      new Paragraph({
        alignment: opts.align ?? AlignmentType.LEFT,
        spacing: { before: 40, after: 40 },
        children: [txt(text, { bold: opts.bold, size: 18, color: opts.bold ? DARK_BLUE : GRAY_600 })],
      }),
    ],
  });
}

function headerCell(text: string, width?: number): TableCell {
  return new TableCell({
    width: width ? { size: width, type: WidthType.PERCENTAGE } : undefined,
    borders: cellBorders,
    shading: { type: ShadingType.SOLID, color: BLUE },
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 50, after: 50 },
        children: [txt(text, { bold: true, size: 18, color: WHITE })],
      }),
    ],
  });
}

// ─── Premium DOCX Generator ───────────────────────────────────────────────

export async function generatePremiumSOW(input: InstallSOWInput): Promise<Buffer> {
  const date = input.date || new Date().toISOString().split("T")[0];
  const revision = input.revision || 1;
  const preview = buildSOWPreview(input);

  const children: (Paragraph | Table)[] = [];

  // ═══════════════════════════════════════════════════════════════════════════
  // TITLE BLOCK — blue accent bar + project info
  // ═══════════════════════════════════════════════════════════════════════════

  // Blue accent bar (full-width table trick)
  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: 100, type: WidthType.PERCENTAGE },
              shading: { type: ShadingType.SOLID, color: BLUE },
              borders: {
                top: { style: BorderStyle.NONE, size: 0, color: BLUE },
                bottom: { style: BorderStyle.NONE, size: 0, color: BLUE },
                left: { style: BorderStyle.NONE, size: 0, color: BLUE },
                right: { style: BorderStyle.NONE, size: 0, color: BLUE },
              },
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  spacing: { before: 200, after: 200 },
                  children: [txt("SCOPE OF WORK", { bold: true, size: 36, color: WHITE })],
                }),
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  spacing: { after: 200 },
                  children: [txt(preview.subtitle, { size: 24, color: WHITE })],
                }),
              ],
            }),
          ],
        }),
      ],
    })
  );

  children.push(spacer(200));

  // Project info in a clean 2-column table
  const infoRows = [
    ["PROJECT", input.projectName],
    ["CLIENT", input.clientName || "—"],
    ["VENUE", input.venue || "—"],
    ["ADDRESS", input.address || "—"],
    ["DATE", `${date}  •  Revision #${revision}`],
  ];

  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: infoRows.map(([label, value]) =>
        new TableRow({
          children: [
            new TableCell({
              width: { size: 22, type: WidthType.PERCENTAGE },
              borders: { top: thinBorder, bottom: thinBorder, left: { style: BorderStyle.SINGLE, size: 8, color: BLUE }, right: thinBorder },
              shading: { type: ShadingType.SOLID, color: LIGHT_BLUE_BG },
              children: [new Paragraph({ spacing: { before: 40, after: 40 }, children: [txt(label, { bold: true, size: 18, color: DARK_BLUE })] })],
            }),
            new TableCell({
              width: { size: 78, type: WidthType.PERCENTAGE },
              borders: cellBorders,
              children: [new Paragraph({ spacing: { before: 40, after: 40 }, children: [txt(value, { size: 18, color: GRAY_600 })] })],
            }),
          ],
        })
      ),
    })
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // DISPLAY SUMMARY TABLE
  // ═══════════════════════════════════════════════════════════════════════════

  children.push(blueHeading("Display Summary"));

  const displayTableRows = [
    new TableRow({
      children: [
        headerCell("Display", 30),
        headerCell("Dimensions", 20),
        headerCell("Pitch", 12),
        headerCell("Qty", 10),
        headerCell("Env", 13),
        headerCell("Structure", 15),
      ],
    }),
    ...input.displays.map((d, idx) => {
      const cab = estimateCabinets(d.widthFt, d.heightFt, d.pixelPitch);
      return new TableRow({
        children: [
          tableCell(d.name, { bold: true }),
          tableCell(`${d.heightFt}'H × ${d.widthFt}'W`, { align: AlignmentType.CENTER }),
          tableCell(`${d.pixelPitch}mm`, { align: AlignmentType.CENTER }),
          tableCell(String(d.quantity), { align: AlignmentType.CENTER }),
          tableCell(d.environment || "Indoor", { align: AlignmentType.CENTER }),
          tableCell(STRUCTURE_TYPES[d.structureType || "wall"] || "Custom", { align: AlignmentType.CENTER }),
        ],
      });
    }),
  ];

  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: displayTableRows,
    })
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTIONS (Overview, Objective, Installation, Electrical, Testing, Signoff)
  // ═══════════════════════════════════════════════════════════════════════════

  for (const section of preview.sections) {
    children.push(blueHeading(section.title));
    for (const para of section.content.split("\n\n")) {
      if (para.trim()) children.push(body(para.trim()));
    }
  }

  // Custom sections (before scope)
  const beforeScopeSections = (input.customSections || []).filter(s => s.position === "before-scope");
  for (const cs of beforeScopeSections) {
    children.push(blueHeading(cs.title));
    for (const para of cs.content.split("\n\n")) {
      if (para.trim()) children.push(body(para.trim()));
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // REFERENCE DOCUMENTS (optional)
  // ═══════════════════════════════════════════════════════════════════════════

  let nextSectionNum = 1;
  if (input.includeReferenceDocuments) {
    children.push(blueHeading("Reference Documents & Equipment"));
    children.push(numberedItem(`${nextSectionNum}.`, "Reference Drawings (see attached):", true));
    const drawings = input.referenceDrawings?.length ? input.referenceDrawings : ["Photos of Existing wall"];
    drawings.forEach((drawing, i) => {
      children.push(bulletItem(drawing));
    });
    nextSectionNum++;
    children.push(numberedItem(`${nextSectionNum}.`, "Equipment:", true));
    children.push(bulletItem("LED Panels/Detail"));
    nextSectionNum++;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SCOPE OF WORK
  // ═══════════════════════════════════════════════════════════════════════════

  children.push(blueHeading("Scope of Work"));

  // General Inclusions
  children.push(subHeading(`${nextSectionNum}. General Inclusions`));
  for (const display of input.displays) {
    const idx = input.displays.indexOf(display) + 1;
    const cab = estimateCabinets(display.widthFt, display.heightFt, display.pixelPitch);
    const structLabel = STRUCTURE_TYPES[display.structureType || "wall"] || STRUCTURE_TYPES.custom;

    children.push(numberedItem(`${nextSectionNum}.${idx}.`, `${display.name} – QTY ${display.quantity}:`, true));
    if (display.hasDemolition) {
      children.push(bulletItem("Demolition and disposal of existing display."));
    }
    children.push(bulletItem(`Fabrication and installation of secondary structure consisting of ${structLabel}.`));
    children.push(bulletItem(`LED cabinets (Approx ${cab.total} cabinets) (${cab.rows} Rows of ${cab.cols} Cabinets) per display (${display.heightFt}'h × ${display.widthFt}'W)`));
    children.push(bulletItem("Power and low voltage cables for display."));
  }
  nextSectionNum++;

  // General Exclusions
  children.push(subHeading(`${nextSectionNum}. General Exclusions`));
  const exclusions = [...DEFAULT_EXCLUSIONS, ...(input.customExclusions || [])];
  exclusions.forEach((ex) => {
    children.push(bulletItem(ex));
  });
  if (input.isUnionLabor) {
    UNION_INCLUSIONS.forEach((inc) => children.push(bulletItem(`[INCLUDED] ${inc}`)));
  }
  nextSectionNum++;

  // Per-display detailed tasks
  for (const display of input.displays) {
    children.push(subHeading(`${nextSectionNum}. ${display.name} — Detailed Tasks`));
    const structureDetail = (display.structureType === "wall" || display.structureType === "wall-plywood")
      ? `of ${STRUCTURE_TYPES[display.structureType || "wall"]} for mounting display's cabinets`
      : "displays and any necessary sub structure";

    let taskNum = 1;
    for (const task of INSTALL_TASKS) {
      if (task.condition === "hasDemolition" && !display.hasDemolition) continue;
      if (task.condition === "hasStructural" && input.includeStructural === false) continue;
      if (task.condition === "hasElectrical" && input.includeElectrical === false) continue;
      const text = task.template
        .replace(/\{displayName\}/g, display.name)
        .replace(/\{structureDetail\}/g, structureDetail);
      children.push(numberedItem(`${nextSectionNum}.${taskNum}.`, text));
      taskNum++;
    }
    nextSectionNum++;
  }

  // Custom sections (after tasks)
  const afterTasksSections = (input.customSections || []).filter(s => s.position === "after-tasks");
  for (const cs of afterTasksSections) {
    children.push(blueHeading(cs.title));
    for (const para of cs.content.split("\n\n")) {
      if (para.trim()) children.push(body(para.trim()));
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ITEMIZED PRICING
  // ═══════════════════════════════════════════════════════════════════════════

  children.push(blueHeading("Itemized Pricing"));
  children.push(body(BOILERPLATE.ITEMIZED_PRICING));

  // Pricing table
  const pricingTableRows = [
    new TableRow({
      children: [
        headerCell("Display / Item", 50),
        headerCell("Description", 30),
        headerCell("Price", 20),
      ],
    }),
    ...input.displays.map((d) =>
      new TableRow({
        children: [
          tableCell(d.name, { bold: true }),
          tableCell(`${d.heightFt}'H × ${d.widthFt}'W, ${d.pixelPitch}mm, QTY ${d.quantity}`),
          tableCell(d.installPrice ? `$${d.installPrice.toLocaleString()}` : "$ ___________", { align: AlignmentType.RIGHT }),
        ],
      })
    ),
    new TableRow({
      children: [
        new TableCell({
          columnSpan: 2,
          borders: cellBorders,
          shading: { type: ShadingType.SOLID, color: LIGHT_BLUE_BG },
          children: [new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { before: 60, after: 60 }, children: [txt("TOTAL", { bold: true, size: 20, color: DARK_BLUE })] })],
        }),
        new TableCell({
          borders: cellBorders,
          shading: { type: ShadingType.SOLID, color: LIGHT_BLUE_BG },
          children: [new Paragraph({
            alignment: AlignmentType.RIGHT,
            spacing: { before: 60, after: 60 },
            children: [txt(
              input.displays.some(d => d.installPrice)
                ? `$${input.displays.reduce((s, d) => s + (d.installPrice || 0), 0).toLocaleString()}`
                : "$ ___________",
              { bold: true, size: 20, color: DARK_BLUE }
            )],
          })],
        }),
      ],
    }),
  ];

  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: pricingTableRows,
    })
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // BID DUE DATE
  // ═══════════════════════════════════════════════════════════════════════════

  children.push(spacer(300));
  children.push(
    new Paragraph({
      spacing: { after: 100 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: BLUE, space: 4 } },
      children: [
        txt("BID DUE DATE:  ", { bold: true, size: 22, color: BLUE }),
        txt(input.bidDueDate || "Please submit your bid via email to the ANC Contacts ASAP.", { size: 22 }),
      ],
    })
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // BUILD DOCUMENT
  // ═══════════════════════════════════════════════════════════════════════════

  // Load ANC logo for header
  let logoImage: ImageRun | null = null;
  try {
    const logoCandidates = ["anc-logo-blue.png", "anc-logo-blue-2023.png", "anc-logo.png"];
    let logoPath = "";
    for (const candidate of logoCandidates) {
      const p = path.join(process.cwd(), "public", candidate);
      if (fs.existsSync(p)) { logoPath = p; break; }
    }
    if (logoPath) {
      const logoData = fs.readFileSync(logoPath);
      logoImage = new ImageRun({
        data: logoData,
        transformation: { width: 120, height: 31 },
        type: "png",
      });
    }
  } catch {}

  const headerChildren: Paragraph[] = [];
  if (logoImage) {
    headerChildren.push(
      new Paragraph({
        alignment: AlignmentType.LEFT,
        border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: BLUE, space: 6 } },
        children: [logoImage, txt("    www.anc.com", { size: 14, color: GRAY_400 })],
      })
    );
  }

  const footerChildren: Paragraph[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      border: { top: { style: BorderStyle.SINGLE, size: 2, color: "E5E7EB", space: 6 } },
      children: [
        txt("ANC Sports Enterprises  •  ", { size: 14, color: GRAY_400 }),
        txt("www.anc.com", { size: 14, color: BLUE }),
        txt("  •  Page ", { size: 14, color: GRAY_400 }),
        new TextRun({ children: [PageNumber.CURRENT], size: 14, font: "Calibri", color: GRAY_400 }),
        txt(" of ", { size: 14, color: GRAY_400 }),
        new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 14, font: "Calibri", color: GRAY_400 }),
      ],
    }),
  ];

  const doc = new Document({
    styles: {
      default: {
        document: { run: { font: "Calibri", size: 21 } },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: convertInchesToTwip(1),
              bottom: convertInchesToTwip(0.75),
              left: convertInchesToTwip(0.9),
              right: convertInchesToTwip(0.9),
            },
            pageNumbers: { start: 1 },
          },
        },
        headers: {
          default: new Header({ children: headerChildren }),
        },
        footers: {
          default: new Footer({ children: footerChildren }),
        },
        children: children as Paragraph[],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  return Buffer.from(buffer);
}
