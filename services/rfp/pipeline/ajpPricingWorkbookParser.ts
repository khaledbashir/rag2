import ExcelJS from "exceljs";
import type {
  BidFormInstallationBreakdown,
  BidFormProjectSummary,
  PricingData,
} from "./bidFormFiller";

function parseNumber(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value.replace(/[$,%\s]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (typeof value === "object" && "result" in (value as Record<string, unknown>)) {
    return parseNumber((value as Record<string, unknown>).result);
  }
  return null;
}

function cellNumber(sheet: ExcelJS.Worksheet, row: number, column: number): number | null {
  return parseNumber(sheet.getRow(row).getCell(column).value);
}

function cellText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (typeof value === "object") {
    const objectValue = value as Record<string, unknown>;
    if (Array.isArray(objectValue.richText)) {
      return (objectValue.richText as Array<{ text?: string }>)
        .map((part) => part.text ?? "")
        .join("");
    }
    if (objectValue.text != null) return String(objectValue.text);
    if (objectValue.result != null) return String(objectValue.result);
  }
  return String(value);
}

function normalizedSheetName(name: string): string {
  return name.toLowerCase().replace(/[\s_-]/g, "");
}

function findSheet(workbook: ExcelJS.Workbook, names: string[]): ExcelJS.Worksheet | null {
  const normalizedNames = new Set(names.map(normalizedSheetName));
  return workbook.worksheets.find((sheet) => normalizedNames.has(normalizedSheetName(sheet.name))) ?? null;
}

const NAME_STOP_WORDS = new Set([
  "add", "alternate", "at", "base", "bid", "display", "increase", "led", "level",
  "mm", "resolution", "ribbon", "screen", "the", "to", "video",
]);

function nameTokens(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .split(/\s+/)
      .filter((token) => token.length > 1 && !NAME_STOP_WORDS.has(token)),
  );
}

function alternateId(value: string): string | null {
  return value.match(/\balt(?:ernate)?\s*#?\s*(\d+[a-z]?)/i)?.[1]?.toLowerCase() ?? null;
}

function nameScore(left: string, right: string): number {
  const leftAlternate = alternateId(left);
  const rightAlternate = alternateId(right);
  if ((leftAlternate || rightAlternate) && leftAlternate !== rightAlternate) return -1;

  const leftTokens = nameTokens(left);
  const rightTokens = nameTokens(right);
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;
  let overlap = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) overlap += 1;
  }
  return overlap / Math.max(leftTokens.size, rightTokens.size);
}

function isDisplayName(value: string): boolean {
  return value.length > 0 && !/^option$|^total\b|^\+/i.test(value);
}

function parseChip(model: string): { model?: string; manufacturer?: string } {
  const chipModel = model.match(/\(([^)]+)\)/)?.[1]?.trim();
  if (!chipModel) return {};
  const manufacturer = /^(?:ns|rs)(?:\b|\d)|nationstar/i.test(chipModel) ? "Nationstar" : undefined;
  return { model: chipModel, manufacturer };
}

function findBestFormColumn(
  formSheet: ExcelJS.Worksheet,
  displayName: string,
  expectedColumn: number,
): number | null {
  const expectedName = cellText(formSheet.getRow(4).getCell(expectedColumn).value);
  // ANC's Form sheet is deliberately column-aligned with LED Cost Sheet rows.
  // Prefer that contract; fuzzy matching is only a fallback for older files.
  if (expectedName) return expectedColumn;

  let bestColumn: number | null = null;
  let bestScore = 0;
  for (let column = 2; column <= formSheet.columnCount; column++) {
    const score = nameScore(displayName, cellText(formSheet.getRow(4).getCell(column).value));
    if (score > bestScore) {
      bestScore = score;
      bestColumn = column;
    }
  }
  return bestScore >= 0.35 ? bestColumn : null;
}

function looksLikeInstallationSheet(sheet: ExcelJS.Worksheet): boolean {
  const structuralHeading = cellText(sheet.getRow(19).getCell(2).value);
  const laborHeading = cellText(sheet.getRow(28).getCell(2).value);
  return /structural/i.test(structuralHeading) && /installation|labor/i.test(laborHeading);
}

function findInstallationSheet(
  workbook: ExcelJS.Workbook,
  displayName: string,
): ExcelJS.Worksheet | null {
  let bestSheet: ExcelJS.Worksheet | null = null;
  let bestScore = 0;
  for (const sheet of workbook.worksheets) {
    if (!looksLikeInstallationSheet(sheet)) continue;
    const title = cellText(sheet.getRow(15).getCell(2).value) || sheet.name;
    const score = Math.max(nameScore(displayName, sheet.name), nameScore(displayName, title));
    if (score > bestScore) {
      bestScore = score;
      bestSheet = sheet;
    }
  }
  return bestScore >= 0.3 ? bestSheet : null;
}

function parseInstallationBreakdown(sheet: ExcelJS.Worksheet): BidFormInstallationBreakdown {
  const breakdown: BidFormInstallationBreakdown = {
    structuralSteel: 0,
    heavyEquipment: 0,
    componentInstallation: 0,
    namingSignage: 0,
    claddingTrim: 0,
    electricalData: cellNumber(sheet, 44, 11) ?? 0,
  };

  for (const rowNumber of [20, 21, 22, 23, 24, 25, 29, 30, 31, 32, 33, 34]) {
    const label = cellText(sheet.getRow(rowNumber).getCell(2).value).trim().toLowerCase();
    const sellingPrice = cellNumber(sheet, rowNumber, 11) ?? 0;
    if (!label && sellingPrice === 0) continue;

    if (/heavy\s*equipment/.test(label)) {
      breakdown.heavyEquipment += sellingPrice;
    } else if (/header\s*signage|naming\s*signage/.test(label)) {
      breakdown.namingSignage += sellingPrice;
    } else if (/cladding|trim|flashing|padding/.test(label)) {
      breakdown.claddingTrim += sellingPrice;
    } else if (/steel|substructure|plywood/.test(label)) {
      breakdown.structuralSteel += sellingPrice;
    } else {
      // Shipping, removal, LED labor, PM/travel, protective covers, netting,
      // and other display-specific scope all belong to component installation.
      breakdown.componentInstallation += sellingPrice;
    }
  }

  breakdown.total =
    breakdown.structuralSteel +
    breakdown.heavyEquipment +
    breakdown.componentInstallation +
    breakdown.namingSignage +
    breakdown.claddingTrim +
    breakdown.electricalData;
  return breakdown;
}

function parseProjectSummary(workbook: ExcelJS.Workbook): BidFormProjectSummary {
  const summary: BidFormProjectSummary = {
    taxAmount: 0,
    projectManagement: 0,
    generalConditions: 0,
    engineeringPermitsFees: 0,
    trainingEventSupport: 0,
    travelExpenses: 0,
    warrantyPartsAndLabor: [],
    warrantyPartsOnly: [],
  };

  const marginSheet = findSheet(workbook, ["Margin Analysis", "Margin-Analysis", "MarginAnalysis"]);
  if (marginSheet) {
    for (let rowNumber = 1; rowNumber <= marginSheet.rowCount; rowNumber++) {
      const label = cellText(marginSheet.getRow(rowNumber).getCell(2).value).trim();
      if (/^tax\b/i.test(label)) summary.taxAmount += cellNumber(marginSheet, rowNumber, 4) ?? 0;
    }
  }

  const additionalItems = findSheet(workbook, ["Additional Items"]);
  if (additionalItems) {
    for (let rowNumber = 1; rowNumber <= additionalItems.rowCount; rowNumber++) {
      const label = cellText(additionalItems.getRow(rowNumber).getCell(3).value).trim().toLowerCase();
      const price = cellNumber(additionalItems, rowNumber, 8) ?? 0;
      if (/project\s*management/.test(label)) summary.projectManagement += price;
      else if (/general\s*conditions/.test(label)) summary.generalConditions += price;
      else if (/event\s*support|training/.test(label)) summary.trainingEventSupport += price;
      else if (/travel/.test(label)) summary.travelExpenses += price;
    }
  }

  for (const sheet of workbook.worksheets) {
    if (!looksLikeInstallationSheet(sheet) || alternateId(sheet.name)) continue;
    summary.engineeringPermitsFees += cellNumber(sheet, 52, 11) ?? 0;
  }

  const warranty = findSheet(workbook, ["Extended Warranty (ANC)", "Extended Warranty"]);
  if (warranty) {
    for (let rowNumber = 3; rowNumber <= 10; rowNumber++) {
      summary.warrantyPartsOnly.push(cellNumber(warranty, rowNumber, 5) ?? 0);
      summary.warrantyPartsAndLabor.push(cellNumber(warranty, rowNumber, 8) ?? 0);
    }
  }

  return summary;
}

/**
 * Parse a modern ANC pricing workbook into the exact per-display and project
 * values required by an AJP bid form.
 */
export function parseAjpPricingWorkbook(workbook: ExcelJS.Workbook): PricingData[] {
  const ledSheet = findSheet(workbook, ["LED Cost Sheet", "LED_Cost_Sheet", "LED Cost"]);
  if (!ledSheet) return [];

  const formSheet = findSheet(workbook, ["Form"]);
  const projectSummary = parseProjectSummary(workbook);
  const pricing: PricingData[] = [];

  for (let rowNumber = 1; rowNumber <= ledSheet.rowCount; rowNumber++) {
    const name = cellText(ledSheet.getRow(rowNumber).getCell(1).value).trim();
    if (!isDisplayName(name)) continue;

    const hardwareCost = cellNumber(ledSheet, rowNumber, 17);
    const processingCost = cellNumber(ledSheet, rowNumber, 19);
    const shippingCost = cellNumber(ledSheet, rowNumber, 20);
    const totalCost = cellNumber(ledSheet, rowNumber, 21);
    const totalSellingPrice = cellNumber(ledSheet, rowNumber, 23);
    if (hardwareCost == null && totalSellingPrice == null) continue;

    const nextRowName = cellText(ledSheet.getRow(rowNumber + 1).getCell(1).value).trim();
    const nextRowHasLegacySplits =
      !isDisplayName(nextRowName) &&
      [17, 19, 20].some((column) => cellNumber(ledSheet, rowNumber + 1, column) != null);
    const sellingFactor = totalCost && totalSellingPrice != null ? totalSellingPrice / totalCost : 1;
    const displaySellingPrice = nextRowHasLegacySplits
      ? cellNumber(ledSheet, rowNumber + 1, 17)
      : (hardwareCost ?? 0) * sellingFactor;
    const processingSellingPrice = nextRowHasLegacySplits
      ? cellNumber(ledSheet, rowNumber + 1, 19)
      : (processingCost ?? 0) * sellingFactor;
    const shippingSellingPrice = nextRowHasLegacySplits
      ? cellNumber(ledSheet, rowNumber + 1, 20)
      : (shippingCost ?? 0) * sellingFactor;

    const installationSheet = findInstallationSheet(workbook, name);
    const installation = installationSheet ? parseInstallationBreakdown(installationSheet) : undefined;
    const formColumn = formSheet ? findBestFormColumn(formSheet, name, pricing.length + 2) : null;
    const productModel = formSheet && formColumn
      ? cellText(formSheet.getRow(10).getCell(formColumn).value).trim()
      : "";
    const formDescription = formSheet && formColumn
      ? cellText(formSheet.getRow(4).getCell(formColumn).value)
      : "";
    const describedBrightness = parseNumber(formDescription.match(/([\d,]+)\s*nits?/i)?.[1]);
    const chip = parseChip(productModel);

    pricing.push({
      name,
      hardwareCost: hardwareCost ?? 0,
      processingCost: processingCost ?? 0,
      shippingCost: shippingCost ?? 0,
      installCost: installation?.total ?? 0,
      totalCost: totalCost ?? (hardwareCost ?? 0) + (processingCost ?? 0) + (shippingCost ?? 0),
      hardwareSellingPrice: displaySellingPrice ?? 0,
      servicesSellingPrice: (processingSellingPrice ?? 0) + (shippingSellingPrice ?? 0),
      totalSellingPrice:
        totalSellingPrice ??
        (displaySellingPrice ?? 0) + (processingSellingPrice ?? 0) + (shippingSellingPrice ?? 0),
      bidFormDisplaySellingPrice: displaySellingPrice ?? 0,
      bidFormProcessingSellingPrice: processingSellingPrice ?? 0,
      bidFormShippingSellingPrice: shippingSellingPrice ?? 0,
      bidFormInstallSellingPrice: installation?.total,
      bidFormInstallation: installation,
      bidFormBrightnessNits: formSheet && formColumn
        ? describedBrightness ?? cellNumber(formSheet, 59, formColumn) ?? undefined
        : undefined,
      bidFormMaxPowerW: formSheet && formColumn
        ? cellNumber(formSheet, 36, formColumn) ?? undefined
        : undefined,
      bidFormChipModel: chip.model,
      bidFormChipManufacturer: chip.manufacturer,
      bidFormProductManufacturer: formSheet && formColumn
        ? cellText(formSheet.getRow(9).getCell(formColumn).value).trim() || undefined
        : undefined,
      bidFormProductModel: productModel || undefined,
      bidFormProjectSummary: pricing.length === 0 ? projectSummary : undefined,
    });
  }

  return pricing;
}
