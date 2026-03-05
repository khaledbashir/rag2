/**
 * Audit-Ready Excel Export Service (Ferrari Edition)
 * 
 * Generates a "Formulaic" audit report for Finance.
 * Senior estimators can change inputs in Excel and see recalcs instantly.
 * 
 * P0 REQUIREMENT: LIVE FORMULAS
 * - Selling Price uses: =Cost / (1 - MarginCell)
 * - Bond uses: =SellingPrice * BondRateCell
 * - Total uses: =SUM(SellingPrice, Bond, Tax)
 * - Yellow cell format for all user-input cells
 * 
 * Implementations:
 * - Morgantown B&O Tax (2%) triggers automatically for WVU projects
 * - Yellow highlighting for Margin %, Bond Rate, Tax Rate, Cost Inputs
 * - Master Truth compliance with live formulas linked to input cells
 */

import ExcelJS from 'exceljs';
import { ScreenInput, ScreenAudit } from '@/lib/estimator';
import { excelCurrencyFmt } from '@/services/pricing/currencyService';

import { ProjectSummaryInfo, buildProjectSummary } from "./exportMirrorUglySheetExcel";

export interface AuditExcelOptions {
    proposalName?: string;
    clientName?: string;
    proposalDate?: string;
    status?: 'DRAFT' | 'FINAL';
    boTaxApplies?: boolean;
    structuralTonnage?: number;
    reinforcingTonnage?: number;
    pdfTotal?: number;
    bondRateOverride?: number;
    taxRateOverride?: number;
    currency?: string;
    summaryInfo?: ProjectSummaryInfo;
    aiGeneratedSOW?: {
        designServices?: string;
        constructionLogistics?: string;
        constraints?: string;
        generatedAt?: string;
        editedByUser?: boolean;
    };
    detectedRisks?: string[];
}

// ============================================================================
// HELPER: YELLOW CELL FORMATTING
// ============================================================================
 /**
 * Applies yellow background formatting to a cell (user-input indicator)
 * Usage for all input cells: Margin %, Bond Rate, Tax Rate, Cost Basis, etc.
 */
let CFMT = '"$"#,##0';

function formatAsInputCell(cell: ExcelJS.Cell): void {
    cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFFF00' } // Yellow (RGB 255, 255, 0)
    };
}

/**
 * Generate Formulaic Audit Excel Workbook
 */
export async function generateAuditExcel(
    screens: any[],
    options?: AuditExcelOptions
): Promise<ExcelJS.Workbook> {
    CFMT = excelCurrencyFmt(options?.currency);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'ANC Natalia Intelligence Core';
    workbook.created = new Date();

    // 0. Project Summary (first tab)
    const summarySheet = workbook.addWorksheet('Project Summary');
    const docTotal = screens.reduce((sum, s) => {
        const b = s.internalAudit?.breakdown || {};
        return sum + (Number(b.sellPrice || b.finalClientTotal) || 0);
    }, 0);
    buildProjectSummary(summarySheet, options?.summaryInfo || {
        projectName: options?.proposalName,
        clientName: options?.clientName,
        displayCount: screens.length,
    }, options?.currency, docTotal > 0 ? docTotal : undefined);

    // 1. Margin Analysis (The Master Truth)
    const marginSheet = workbook.addWorksheet('Margin Analysis', {
        properties: { tabColor: { argb: 'FF0A52EF' } } // ANC French Blue
    });
    buildMarginAnalysis(marginSheet, screens, options);

    // 2. LED Cost Sheet
    const ledSheet = workbook.addWorksheet('LED Cost Sheet', {
        properties: { tabColor: { argb: 'FFFFC107' } } // Amber
    });
    buildLEDCostSheet(ledSheet, screens);

    // 3. Install (Installation)
    const installSheet = workbook.addWorksheet('Install', {
        properties: { tabColor: { argb: 'FF28A745' } } // Green
    });
    buildInstallSheet(installSheet, screens);

    // 4. Project Management
    const pmSheet = workbook.addWorksheet('Project Management', {
        properties: { tabColor: { argb: 'FF17A2B8' } } // Cyan
    });
    buildPMSheet(pmSheet, screens);

    // 5. Electrical and Data
    const elecSheet = workbook.addWorksheet('Electrical and Data', {
        properties: { tabColor: { argb: 'FFFFC107' } } // Amber
    });
    buildElectricalSheet(elecSheet, screens);

    // 6. Professional Services
    const proSheet = workbook.addWorksheet('Professional Services', {
        properties: { tabColor: { argb: 'FF6C757D' } } // Grey
    });
    buildProfessionalServicesSheet(proSheet, screens);

    // 7. Control System/CMS
    const cmsSheet = workbook.addWorksheet('Control System CMS', {
        properties: { tabColor: { argb: 'FF6610F2' } } // Purple
    });
    buildControlSystemSheet(cmsSheet, screens);

    // 8. Shipping
    const shippingSheet = workbook.addWorksheet('Shipping', {
        properties: { tabColor: { argb: 'FFFD7E14' } } // Orange
    });
    buildShippingSheet(shippingSheet, screens);

    // 9. Alternates (Placeholder)
    const altSheet = workbook.addWorksheet('Alternates', {
        properties: { tabColor: { argb: 'FFDC3545' } } // Red
    });
    buildPlaceholderSheet(altSheet, "Alternates (Optional)", "Add alternate screen options here.");

    // 10. Content Creation (Placeholder)
    const contentSheet = workbook.addWorksheet('Content Creation', {
        properties: { tabColor: { argb: 'FFD63384' } } // Pink
    });
    buildPlaceholderSheet(contentSheet, "Content Creation", "Add content creation hours and rates here.");

    // 11. AI-Generated SOW (Statement of Work)
    const sowSheet = workbook.addWorksheet('AI SOW', {
        properties: { tabColor: { argb: 'FF0A52EF' } } // ANC Blue
    });
    buildSOWSheet(sowSheet, options);

    // 12. Tech Specs Only (no pricing — for installers/subs)
    const techSpecsSheet = workbook.addWorksheet('Tech Specs (Installers)', {
        properties: { tabColor: { argb: 'FF6C757D' } } // Grey
    });
    buildTechSpecsOnlySheet(techSpecsSheet, screens, options);

    return workbook;
}

export async function generateAuditExcelBuffer(screens: any[], options?: AuditExcelOptions): Promise<Buffer> {
    const workbook = await generateAuditExcel(screens, options);
    const buffer = await workbook.xlsx.writeBuffer();
    return buffer as unknown as Buffer;
}

// --- Sheet Builders ---

function buildMarginAnalysis(sheet: ExcelJS.Worksheet, screens: any[], options?: AuditExcelOptions) {
    // Header
    sheet.mergeCells('A1:I1');
    const titleCell = sheet.getCell('A1');
    titleCell.value = `ANC MARGIN ANALYSIS (MASTER TRUTH) - ${options?.proposalName || 'PROPOSAL'}`;
    titleCell.font = { size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0A52EF' } };
    titleCell.alignment = { horizontal: 'center' };

    sheet.mergeCells('A2:I2');
    sheet.getCell('A2').value = `Client: ${options?.clientName || 'N/A'} | Date: ${options?.proposalDate || new Date().toLocaleDateString()}`;
    sheet.getCell('A2').font = { italic: true };

    const HEADER_ROW = 4;
    let currentRow = 5;

    // Column Headers
    const headers = [
        { col: 'A', label: 'Screen / Section', width: 35 },
        { col: 'B', label: 'Metric', width: 25 },
        { col: 'C', label: 'Input Value', width: 15 },
        { col: 'D', label: 'Formula / Logic', width: 40 },
        { col: 'E', label: 'Total Cost', width: 18 },
        { col: 'F', label: 'Margin %', width: 12 },
        { col: 'G', label: 'Sell Price (Divisor)', width: 20 },
        { col: 'H', label: 'Tax/Bond Rate', width: 15 },
        { col: 'I', label: 'Final Item Total', width: 20 },
    ];

    headers.forEach(h => {
        const cell = sheet.getCell(`${h.col}${HEADER_ROW}`);
        cell.value = h.label;
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } };
        cell.alignment = { horizontal: 'center' };
        sheet.getColumn(h.col).width = h.width;
    });

    const sellPriceRows: number[] = [];

    screens.forEach(screen => {
        const audit = screen.internalAudit || screen._internalAudit || screen.audit;
        const b = audit?.breakdown || {};
        const globalMargin = screen.desiredMargin || 0.25;
        const catMargins = screen.categoryMargins as { led?: number; services?: number; cms?: number } | undefined;
        const usePerCategory = catMargins && (catMargins.led != null || catMargins.services != null || catMargins.cms != null);

        // Screen Header
        sheet.getCell(`A${currentRow}`).value = screen.name || "Unnamed Screen";
        sheet.getCell(`A${currentRow}`).font = { bold: true };
        sheet.getCell(`A${currentRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDEE2E6' } };
        currentRow++;

        // 1. HARDWARE (LED bucket)
        const hwRow = currentRow;
        sheet.getCell(`A${currentRow}`).value = 'Display Hardware';
        sheet.getCell(`B${currentRow}`).value = 'Area (SqFt)';
        const area = (audit?.areaSqFt || 0);
        sheet.getCell(`C${currentRow}`).value = area;
        sheet.getCell(`B${currentRow+1}`).value = 'Cost/SqFt';
        sheet.getCell(`C${currentRow+1}`).value = screen.costPerSqFt || 120;
        formatAsInputCell(sheet.getCell(`C${currentRow+1}`));

        sheet.getCell(`B${currentRow+2}`).value = 'Spare Parts (5%)';
        sheet.getCell(`C${currentRow+2}`).value = screen.includeSpareParts ? 'YES' : 'NO';
        formatAsInputCell(sheet.getCell(`C${currentRow+2}`));

        const costCell = sheet.getCell(`E${hwRow}`);
        costCell.value = {
            formula: `C${hwRow}*C${hwRow + 1}*(IF(C${hwRow + 2}="YES", 1.05, 1))`
        };
        costCell.numFmt = CFMT;
        costCell.font = { bold: true };

        currentRow += 3;

        if (usePerCategory) {
            // Per-category margin mode: separate rows for LED, Services, CMS

            // 2a. SERVICES bucket
            const svcCostTotal = (b.install || 0) + (b.labor || 0) + (b.structure || 0) + (b.power || 0) + (b.pm || 0) + (b.engineering || 0);
            const svcRow = currentRow;
            sheet.getCell(`A${svcRow}`).value = 'Services & Install';
            sheet.getCell(`B${svcRow}`).value = 'Combined Estimate';
            sheet.getCell(`C${svcRow}`).value = svcCostTotal;
            formatAsInputCell(sheet.getCell(`C${svcRow}`));
            sheet.getCell(`E${svcRow}`).value = { formula: `C${svcRow}` };
            sheet.getCell(`E${svcRow}`).numFmt = CFMT;
            currentRow++;

            // 2b. CMS bucket
            const cmsCostTotal = b.cms || 0;
            const cmsRow = currentRow;
            sheet.getCell(`A${cmsRow}`).value = 'CMS / Software';
            sheet.getCell(`B${cmsRow}`).value = 'CMS Cost';
            sheet.getCell(`C${cmsRow}`).value = cmsCostTotal;
            formatAsInputCell(sheet.getCell(`C${cmsRow}`));
            sheet.getCell(`E${cmsRow}`).value = { formula: `C${cmsRow}` };
            sheet.getCell(`E${cmsRow}`).numFmt = CFMT;
            currentRow++;

            // 2c. Shipping (LED bucket with hardware)
            const shippingRow = currentRow;
            sheet.getCell(`A${shippingRow}`).value = 'Shipping';
            sheet.getCell(`B${shippingRow}`).value = 'Shipping Cost';
            sheet.getCell(`C${shippingRow}`).value = b.shipping || 0;
            formatAsInputCell(sheet.getCell(`C${shippingRow}`));
            sheet.getCell(`E${shippingRow}`).value = { formula: `C${shippingRow}` };
            sheet.getCell(`E${shippingRow}`).numFmt = CFMT;
            currentRow++;

            // 3. Per-category margin & sell
            const ledMargin = catMargins.led ?? 0.30;
            const svcMargin = catMargins.services ?? 0.20;
            const cmsMargin = catMargins.cms ?? 0.35;

            // LED sell (hardware + shipping)
            const ledSellRow = currentRow;
            sheet.getCell(`A${currentRow}`).value = 'LED Hardware Sell';
            sheet.getCell(`D${currentRow}`).value = 'LED: (HW + Shipping) / (1 - Margin)';
            sheet.getCell(`F${currentRow}`).value = ledMargin;
            sheet.getCell(`F${currentRow}`).numFmt = '0.0%';
            formatAsInputCell(sheet.getCell(`F${currentRow}`));
            sheet.getCell(`G${currentRow}`).value = { formula: `IF(F${currentRow}>=1,E${hwRow}+E${shippingRow},(E${hwRow}+E${shippingRow})/(1-F${currentRow}))` };
            sheet.getCell(`G${currentRow}`).numFmt = CFMT;
            currentRow++;

            // Services sell
            const svcSellRow = currentRow;
            sheet.getCell(`A${currentRow}`).value = 'Services Sell';
            sheet.getCell(`D${currentRow}`).value = 'Services / (1 - Margin)';
            sheet.getCell(`F${currentRow}`).value = svcMargin;
            sheet.getCell(`F${currentRow}`).numFmt = '0.0%';
            formatAsInputCell(sheet.getCell(`F${currentRow}`));
            sheet.getCell(`G${currentRow}`).value = { formula: `IF(F${currentRow}>=1,E${svcRow},E${svcRow}/(1-F${currentRow}))` };
            sheet.getCell(`G${currentRow}`).numFmt = CFMT;
            currentRow++;

            // CMS sell
            const cmsSellRow = currentRow;
            sheet.getCell(`A${currentRow}`).value = 'CMS Sell';
            sheet.getCell(`D${currentRow}`).value = 'CMS / (1 - Margin)';
            sheet.getCell(`F${currentRow}`).value = cmsMargin;
            sheet.getCell(`F${currentRow}`).numFmt = '0.0%';
            formatAsInputCell(sheet.getCell(`F${currentRow}`));
            sheet.getCell(`G${currentRow}`).value = { formula: `IF(F${currentRow}>=1,E${cmsRow},E${cmsRow}/(1-F${currentRow}))` };
            sheet.getCell(`G${currentRow}`).numFmt = CFMT;
            currentRow++;

            // Total sell = LED + Services + CMS
            const sellRow = currentRow;
            sheet.getCell(`A${currentRow}`).value = 'TOTAL SELL PRICE';
            sheet.getCell(`A${currentRow}`).font = { bold: true };
            sheet.getCell(`D${currentRow}`).value = 'Per-category: LED + Services + CMS';
            sheet.getCell(`G${currentRow}`).value = { formula: `G${ledSellRow}+G${svcSellRow}+G${cmsSellRow}` };
            sheet.getCell(`G${currentRow}`).numFmt = CFMT;
            sheet.getCell(`G${currentRow}`).font = { bold: true };
            sellPriceRows.push(sellRow);

            currentRow += 2;
        } else {
            // Global (single) margin mode — original behavior
            const softCostTotal = (b.install || 0) + (b.labor || 0) + (b.structure || 0) + (b.power || 0) + (b.shipping || 0) + (b.pm || 0) + (b.engineering || 0);
            sheet.getCell(`A${currentRow+2}`).value = 'Services & Install';
            sheet.getCell(`B${currentRow}`).value = 'Combined Estimate';
            sheet.getCell(`C${currentRow}`).value = softCostTotal;
            formatAsInputCell(sheet.getCell(`C${currentRow}`));
            sheet.getCell(`E${currentRow}`).value = { formula: `C${currentRow}` };
            sheet.getCell(`E${currentRow}`).numFmt = CFMT;
            const softRow = currentRow;
            currentRow++;

            const sellRow = currentRow;
            sheet.getCell(`A${currentRow}`).value = 'TOTAL SELL PRICE';
            sheet.getCell(`D${currentRow}`).value = '(Hardware + Services) / (1 - Margin)';

            const totalCostRef = `(E${hwRow}+E${softRow})`;

            sheet.getCell(`F${currentRow}`).value = globalMargin;
            sheet.getCell(`F${currentRow}`).numFmt = '0.0%';
            formatAsInputCell(sheet.getCell(`F${currentRow}`));

            sheet.getCell(`G${currentRow}`).value = { formula: `IF(F${currentRow}>=1,${totalCostRef},${totalCostRef}/(1-F${currentRow}))` };
            sheet.getCell(`G${currentRow}`).numFmt = CFMT;
            sheet.getCell(`G${currentRow}`).font = { bold: true };
            sellPriceRows.push(sellRow);

            currentRow += 2;
        }
    });

    // TOTALS SECTION
    const totalStartRow = currentRow;
    sheet.getCell(`A${currentRow}`).value = 'PROJECT TOTALS';
    sheet.getCell(`A${currentRow}`).font = { bold: true, size: 12 };
    sheet.getCell(`A${currentRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0A52EF' } };
    sheet.getCell(`A${currentRow}`).font = { color: { argb: 'FFFFFFFF' }, bold: true };
    currentRow++;

    // Sum of Sell Prices
    const sellPriceRow = currentRow;
    sheet.getCell(`A${currentRow}`).value = 'TOTAL SELL PRICE';
    const sellSumFormula = sellPriceRows.length > 0 ? sellPriceRows.map(r => `G${r}`).join('+') : '0';
    sheet.getCell(`G${currentRow}`).value = { formula: sellSumFormula };
    sheet.getCell(`G${currentRow}`).numFmt = CFMT;
    sheet.getCell(`G${currentRow}`).font = { bold: true };
    currentRow++;

    // BOND
    const bondRow = currentRow;
    sheet.getCell(`A${currentRow}`).value = 'PERFORMANCE BOND (1.5%)';
    sheet.getCell(`H${currentRow}`).value = options?.bondRateOverride ?? 0.015;
    sheet.getCell(`H${currentRow}`).numFmt = '0.0%';
    formatAsInputCell(sheet.getCell(`H${currentRow}`));
    sheet.getCell(`I${currentRow}`).value = { formula: `G${sellPriceRow}*H${currentRow}` };
    sheet.getCell(`I${currentRow}`).numFmt = CFMT;
    currentRow++;

    // B&O TAX (Morgantown/WVU only) - conditional row creation
    let boTaxRow: number | undefined = undefined;
    if (options?.boTaxApplies) {
        boTaxRow = currentRow;
        sheet.getCell(`A${currentRow}`).value = 'CITY B&O TAX (2%) - MORGANTOWN/WVU';
        sheet.getCell(`H${currentRow}`).value = 0.02;
        sheet.getCell(`H${currentRow}`).numFmt = '0.0%';
        formatAsInputCell(sheet.getCell(`H${currentRow}`));
        sheet.getCell(`I${currentRow}`).value = { formula: `(G${sellPriceRow}+I${bondRow})*H${boTaxRow}` };
        sheet.getCell(`I${currentRow}`).numFmt = CFMT;
        currentRow++;
    }

    // SALES TAX
    const taxRow = currentRow;
    const effectiveTaxRate = options?.taxRateOverride ?? 0.095;
    sheet.getCell(`A${currentRow}`).value = `SALES TAX (${(effectiveTaxRate * 100).toFixed(1)}%)`;
    sheet.getCell(`H${currentRow}`).value = effectiveTaxRate;
    sheet.getCell(`H${currentRow}`).numFmt = '0.0%';
    formatAsInputCell(sheet.getCell(`H${currentRow}`));

    // Only include B&O Tax in Sales Tax formula if it applies
    if (options?.boTaxApplies) {
        sheet.getCell(`I${currentRow}`).value = { formula: `(G${sellPriceRow}+I${bondRow}+I${boTaxRow})*H${taxRow}` };
    } else {
        sheet.getCell(`I${currentRow}`).value = { formula: `(G${sellPriceRow}+I${bondRow})*H${taxRow}` };
    }
    sheet.getCell(`I${currentRow}`).numFmt = CFMT;
    currentRow++;

    // GRAND TOTAL
    if (options?.boTaxApplies && boTaxRow) {
        sheet.getCell(`A${currentRow}`).value = 'FINAL CLIENT TOTAL';
        sheet.getCell(`I${currentRow}`).value = { formula: `G${sellPriceRow}+I${bondRow}+I${boTaxRow}+I${taxRow}` };
    } else {
        sheet.getCell(`A${currentRow}`).value = 'FINAL CLIENT TOTAL';
        sheet.getCell(`I${currentRow}`).value = { formula: `G${sellPriceRow}+I${bondRow}+I${taxRow}` };
    }
    sheet.getCell(`I${currentRow}`).font = { bold: true, size: 14 };
    sheet.getCell(`I${currentRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD4EDDA' } };
    sheet.getCell(`I${currentRow}`).numFmt = CFMT;
}

function buildLEDCostSheet(sheet: ExcelJS.Worksheet, screens: any[]) {
    setupSheetHeader(sheet, 'LED TECHNICAL SPECIFICATIONS');
    const headers = ['Display Name', 'Pixel Pitch (mm)', 'Width (ft)', 'Height (ft)', 'Pixels W', 'Pixels H', 'Brightness (nits)', 'Est. Hardware Cost'];
    setupTableHeaders(sheet, 3, headers);

    let currentRow = 4;
    screens.forEach(s => {
        const audit = s.internalAudit || s._internalAudit || s.audit;
        const b = audit?.breakdown || {};
        
        sheet.getCell(`A${currentRow}`).value = s.name;
        sheet.getCell(`B${currentRow}`).value = s.pixelPitch || s.pitchMm;
        sheet.getCell(`C${currentRow}`).value = s.widthFt || s.width;
        sheet.getCell(`D${currentRow}`).value = s.heightFt || s.height;
        sheet.getCell(`E${currentRow}`).value = audit?.pixelResolution || 0; // Simplified
        sheet.getCell(`F${currentRow}`).value = 0; // Need calculation if missing
        sheet.getCell(`G${currentRow}`).value = s.brightness || 0;
        sheet.getCell(`H${currentRow}`).value = b.hardware || 0;
        sheet.getCell(`H${currentRow}`).numFmt = CFMT;
        currentRow++;
    });
    
    // Auto-width
    sheet.columns.forEach(col => { col.width = 15; });
    sheet.getColumn(1).width = 30;
}

function buildInstallSheet(sheet: ExcelJS.Worksheet, screens: any[]) {
    setupSheetHeader(sheet, 'INSTALLATION & LABOR COSTS');
    const headers = ['Display Name', 'Structural', 'Install', 'Labor', 'Demolition', 'Total Install'];
    setupTableHeaders(sheet, 3, headers);

    let currentRow = 4;
    screens.forEach(s => {
        const audit = s.internalAudit || s._internalAudit || s.audit;
        const b = audit?.breakdown || {};
        
        sheet.getCell(`A${currentRow}`).value = s.name;
        sheet.getCell(`B${currentRow}`).value = b.structure || 0;
        sheet.getCell(`C${currentRow}`).value = b.install || 0;
        sheet.getCell(`D${currentRow}`).value = b.labor || 0;
        sheet.getCell(`E${currentRow}`).value = b.demolition || 0;
        const total = (b.structure||0) + (b.install||0) + (b.labor||0) + (b.demolition||0);
        sheet.getCell(`F${currentRow}`).value = total;
        
        ['B','C','D','E','F'].forEach(c => {
            sheet.getCell(`${c}${currentRow}`).numFmt = CFMT;
        });
        currentRow++;
    });
    sheet.getColumn(1).width = 30;
}

function buildPMSheet(sheet: ExcelJS.Worksheet, screens: any[]) {
    setupSheetHeader(sheet, 'PROJECT MANAGEMENT');
    const headers = ['Display Name', 'PM Cost', 'General Conditions', 'Travel'];
    setupTableHeaders(sheet, 3, headers);

    let currentRow = 4;
    screens.forEach(s => {
        const audit = s.internalAudit || s._internalAudit || s.audit;
        const b = audit?.breakdown || {};
        
        sheet.getCell(`A${currentRow}`).value = s.name;
        sheet.getCell(`B${currentRow}`).value = b.pm || 0;
        sheet.getCell(`C${currentRow}`).value = b.generalConditions || 0;
        sheet.getCell(`D${currentRow}`).value = b.travel || 0;
        
        ['B','C','D'].forEach(c => {
            sheet.getCell(`${c}${currentRow}`).numFmt = CFMT;
        });
        currentRow++;
    });
    sheet.getColumn(1).width = 30;
}

function buildElectricalSheet(sheet: ExcelJS.Worksheet, screens: any[]) {
    setupSheetHeader(sheet, 'ELECTRICAL & DATA');
    const headers = ['Display Name', 'Power Requirements', 'Data/Signal', 'Total Cost'];
    setupTableHeaders(sheet, 3, headers);

    let currentRow = 4;
    screens.forEach(s => {
        const audit = s.internalAudit || s._internalAudit || s.audit;
        const b = audit?.breakdown || {};
        
        sheet.getCell(`A${currentRow}`).value = s.name;
        sheet.getCell(`B${currentRow}`).value = b.power || 0;
        sheet.getCell(`C${currentRow}`).value = 0; // Placeholder
        sheet.getCell(`D${currentRow}`).value = b.power || 0;
        
        ['B','C','D'].forEach(c => {
            sheet.getCell(`${c}${currentRow}`).numFmt = CFMT;
        });
        currentRow++;
    });
    sheet.getColumn(1).width = 30;
}

function buildProfessionalServicesSheet(sheet: ExcelJS.Worksheet, screens: any[]) {
    setupSheetHeader(sheet, 'PROFESSIONAL SERVICES');
    const headers = ['Display Name', 'Engineering', 'Permits', 'Submittals', 'Total'];
    setupTableHeaders(sheet, 3, headers);

    let currentRow = 4;
    screens.forEach(s => {
        const audit = s.internalAudit || s._internalAudit || s.audit;
        const b = audit?.breakdown || {};
        
        sheet.getCell(`A${currentRow}`).value = s.name;
        sheet.getCell(`B${currentRow}`).value = b.engineering || 0;
        sheet.getCell(`C${currentRow}`).value = b.permits || 0;
        sheet.getCell(`D${currentRow}`).value = b.submittals || 0;
        const total = (b.engineering||0) + (b.permits||0) + (b.submittals||0);
        sheet.getCell(`E${currentRow}`).value = total;
        
        ['B','C','D','E'].forEach(c => {
            sheet.getCell(`${c}${currentRow}`).numFmt = CFMT;
        });
        currentRow++;
    });
    sheet.getColumn(1).width = 30;
}

function buildShippingSheet(sheet: ExcelJS.Worksheet, screens: any[]) {
    setupSheetHeader(sheet, 'SHIPPING & LOGISTICS');
    const headers = ['Display Name', 'Shipping Cost'];
    setupTableHeaders(sheet, 3, headers);

    let currentRow = 4;
    screens.forEach(s => {
        const audit = s.internalAudit || s._internalAudit || s.audit;
        const b = audit?.breakdown || {};
        
        sheet.getCell(`A${currentRow}`).value = s.name;
        sheet.getCell(`B${currentRow}`).value = b.shipping || 0;
        sheet.getCell(`B${currentRow}`).numFmt = CFMT;
        currentRow++;
    });
    sheet.getColumn(1).width = 30;
}

function buildControlSystemSheet(sheet: ExcelJS.Worksheet, screens: any[]) {
    setupSheetHeader(sheet, 'CONTROL SYSTEM / CMS');
    const headers = ['Display Name', 'CMS / Control Cost'];
    setupTableHeaders(sheet, 3, headers);

    let currentRow = 4;
    screens.forEach(s => {
        const audit = s.internalAudit || s._internalAudit || s.audit;
        const b = audit?.breakdown || {};
        
        sheet.getCell(`A${currentRow}`).value = s.name;
        sheet.getCell(`B${currentRow}`).value = b.cms || 0;
        sheet.getCell(`B${currentRow}`).numFmt = CFMT;
        currentRow++;
    });
    sheet.getColumn(1).width = 30;
}

function buildPlaceholderSheet(sheet: ExcelJS.Worksheet, title: string, instruction: string) {
    setupSheetHeader(sheet, title);
    sheet.getCell('A3').value = instruction;
    sheet.getCell('A3').font = { italic: true };
}

/**
 * Build AI-Generated SOW Sheet
 * Includes detected risks and SOW content for audit trail
 */
function buildSOWSheet(sheet: ExcelJS.Worksheet, options?: AuditExcelOptions) {
    // Header
    sheet.mergeCells('A1:F1');
    const titleCell = sheet.getCell('A1');
    titleCell.value = 'AI-GENERATED STATEMENT OF WORK (SOW)';
    titleCell.font = { size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0A52EF' } };
    titleCell.alignment = { horizontal: 'center' };

    let currentRow = 3;

    // Detected Risks Section
    sheet.getCell(`A${currentRow}`).value = 'DETECTED RFP RISKS:';
    sheet.getCell(`A${currentRow}`).font = { bold: true, size: 12 };
    currentRow++;

    if (options?.detectedRisks && options.detectedRisks.length > 0) {
        options.detectedRisks.forEach(risk => {
            sheet.getCell(`A${currentRow}`).value = `• ${risk}`;
            currentRow++;
        });
    } else {
        sheet.getCell(`A${currentRow}`).value = 'No specific risks detected';
        sheet.getCell(`A${currentRow}`).font = { italic: true };
        currentRow++;
    }
    currentRow++;

    // Financial Overrides Section
    sheet.getCell(`A${currentRow}`).value = 'FINANCIAL OVERRIDES:';
    sheet.getCell(`A${currentRow}`).font = { bold: true, size: 12 };
    currentRow++;

    if (options?.bondRateOverride !== undefined) {
        const bondPercent = (options.bondRateOverride * 100).toFixed(1);
        sheet.getCell(`A${currentRow}`).value = `• Performance Bond Rate: ${bondPercent}%`;
        if (options.bondRateOverride >= 1.0) {
            sheet.getCell(`A${currentRow}`).font = { color: { argb: 'FFDC3545' }, bold: true }; // Red for 100%
            sheet.getCell(`B${currentRow}`).value = '⚠️ 100% BOND DETECTED';
            sheet.getCell(`B${currentRow}`).font = { color: { argb: 'FFDC3545' }, bold: true };
        }
        currentRow++;
    }
    currentRow++;

    // AI SOW Content
    const sow = options?.aiGeneratedSOW;
    if (sow) {
        // Generation metadata
        sheet.getCell(`A${currentRow}`).value = 'GENERATION METADATA:';
        sheet.getCell(`A${currentRow}`).font = { bold: true, size: 10 };
        currentRow++;
        
        if (sow.generatedAt) {
            sheet.getCell(`A${currentRow}`).value = `Generated: ${new Date(sow.generatedAt).toLocaleString()}`;
            currentRow++;
        }
        if (sow.editedByUser) {
            sheet.getCell(`A${currentRow}`).value = '⚠️ EDITED BY USER (Customized from AI draft)';
            sheet.getCell(`A${currentRow}`).font = { color: { argb: 'FFFFC107' }, bold: true };
            currentRow++;
        }
        currentRow++;

        // Design Services
        if (sow.designServices) {
            sheet.getCell(`A${currentRow}`).value = '1. DESIGN SERVICES:';
            sheet.getCell(`A${currentRow}`).font = { bold: true, size: 11 };
            currentRow++;
            
            sheet.getCell(`A${currentRow}`).value = sow.designServices;
            sheet.getCell(`A${currentRow}`).alignment = { wrapText: true };
            sheet.mergeCells(`A${currentRow}:F${currentRow + 2}`);
            currentRow += 4;
        }

        // Construction Logistics
        if (sow.constructionLogistics) {
            sheet.getCell(`A${currentRow}`).value = '2. CONSTRUCTION LOGISTICS:';
            sheet.getCell(`A${currentRow}`).font = { bold: true, size: 11 };
            currentRow++;
            
            sheet.getCell(`A${currentRow}`).value = sow.constructionLogistics;
            sheet.getCell(`A${currentRow}`).alignment = { wrapText: true };
            sheet.mergeCells(`A${currentRow}:F${currentRow + 2}`);
            currentRow += 4;
        }

        // Constraints
        if (sow.constraints) {
            sheet.getCell(`A${currentRow}`).value = '3. PROJECT CONSTRAINTS:';
            sheet.getCell(`A${currentRow}`).font = { bold: true, size: 11 };
            currentRow++;
            
            sheet.getCell(`A${currentRow}`).value = sow.constraints;
            sheet.getCell(`A${currentRow}`).alignment = { wrapText: true };
            sheet.mergeCells(`A${currentRow}:F${currentRow + 2}`);
            currentRow += 4;
        }
    } else {
        sheet.getCell(`A${currentRow}`).value = 'No AI-generated SOW content available';
        sheet.getCell(`A${currentRow}`).font = { italic: true };
    }

    // Column widths
    sheet.getColumn(1).width = 40;
    sheet.getColumn(2).width = 30;
    sheet.getColumn(3).width = 20;
    sheet.getColumn(4).width = 20;
    sheet.getColumn(5).width = 20;
    sheet.getColumn(6).width = 20;
}

// Helpers
function setupSheetHeader(sheet: ExcelJS.Worksheet, title: string) {
    sheet.mergeCells('A1:F1');
    const cell = sheet.getCell('A1');
    cell.value = title;
    cell.font = { size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } };
    cell.alignment = { horizontal: 'center' };
}

function setupTableHeaders(sheet: ExcelJS.Worksheet, row: number, headers: string[]) {
    headers.forEach((h, i) => {
        const cell = sheet.getCell(row, i + 1);
        cell.value = h;
        cell.font = { bold: true };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDEE2E6' } };
        cell.alignment = { horizontal: 'center' };
    });
}

/**
 * Tech Specs Only sheet — LED Cost Sheet replica without pricing columns.
 * For sharing with installers and subcontractors (Jeremy/Matt can extract and send).
 */
function buildTechSpecsOnlySheet(sheet: ExcelJS.Worksheet, screens: any[], options?: AuditExcelOptions) {
    sheet.mergeCells('A1:H1');
    const titleCell = sheet.getCell('A1');
    titleCell.value = `${options?.proposalName || options?.clientName || 'Project'} — LED Technical Specifications (No Pricing)`;
    titleCell.font = { size: 13, bold: true, color: { argb: 'FF002C73' } };
    titleCell.alignment = { horizontal: 'left', vertical: 'middle' };

    sheet.getCell('A2').value = `Generated: ${new Date().toLocaleDateString()}`;
    sheet.getCell('A2').font = { size: 9, color: { argb: 'FF6C757D' } };

    const headers = ['Display Name', 'Qty', 'Pixel Pitch (mm)', 'Height (ft)', 'Width (ft)', 'Pixels H', 'Pixels W', 'Sq Ft', 'Brightness (nits)', 'Service Type', 'Environment'];
    setupTableHeaders(sheet, 4, headers);

    let currentRow = 5;
    screens.forEach(s => {
        const audit = s.internalAudit || s._internalAudit || s.audit;
        const heightFt = Number(s.heightFt || s.height || 0);
        const widthFt = Number(s.widthFt || s.width || 0);
        const pitch = Number(s.pixelPitch || s.pitchMm || 0);
        const sqFt = heightFt * widthFt;
        const pixelsH = pitch > 0 ? Math.round((heightFt * 304.8) / pitch) : 0;
        const pixelsW = pitch > 0 ? Math.round((widthFt * 304.8) / pitch) : 0;

        sheet.getCell(`A${currentRow}`).value = s.name || s.externalName || 'Unnamed Display';
        sheet.getCell(`B${currentRow}`).value = Number(s.quantity || audit?.quantity || 1);
        sheet.getCell(`C${currentRow}`).value = pitch || null;
        sheet.getCell(`D${currentRow}`).value = heightFt || null;
        sheet.getCell(`E${currentRow}`).value = widthFt || null;
        sheet.getCell(`F${currentRow}`).value = pixelsH || null;
        sheet.getCell(`G${currentRow}`).value = pixelsW || null;
        sheet.getCell(`H${currentRow}`).value = sqFt > 0 ? Math.round(sqFt * 100) / 100 : null;
        sheet.getCell(`I${currentRow}`).value = Number(s.brightness || s.brightnessNits || 0) || null;
        sheet.getCell(`J${currentRow}`).value = s.serviceType || (s.isOutdoor ? 'Rear' : 'Front') || null;
        sheet.getCell(`K${currentRow}`).value = s.isOutdoor ? 'Outdoor' : 'Indoor';
        currentRow++;
    });

    sheet.getColumn(1).width = 40;
    sheet.getColumn(2).width = 8;
    sheet.getColumn(3).width = 16;
    sheet.getColumn(4).width = 12;
    sheet.getColumn(5).width = 12;
    sheet.getColumn(6).width = 12;
    sheet.getColumn(7).width = 12;
    sheet.getColumn(8).width = 10;
    sheet.getColumn(9).width = 16;
    sheet.getColumn(10).width = 14;
    sheet.getColumn(11).width = 12;
}
