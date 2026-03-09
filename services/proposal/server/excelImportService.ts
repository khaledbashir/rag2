import * as xlsx from 'xlsx';
import * as Sentry from '@sentry/nextjs';
import { InternalAudit, ScreenAudit } from '@/lib/estimator';
import { formatDimension, formatCurrencyInternal } from '@/lib/math';
import { computeManifest } from '@/lib/verification';
import { detectExceptions } from '@/lib/exceptions';
import { VerificationManifest, Exception } from '@/types/verification';
import { findLedOrCostSheet, findMarginAnalysisSheet } from '@/lib/sheetDetection';

interface ParsedANCProposal {
    formData: any; // Matches ProposalType structure
    internalAudit: InternalAudit;
    verificationManifest: VerificationManifest; // NEW: Verification manifest
    exceptions: Exception[]; // NEW: Detected exceptions
    excelData: any;
}

function isAlternateRowLabel(label: string) {
    const v = (label ?? "").toString().trim().toLowerCase();
    return /^(alt(\b|[^a-z])|alternate(\b|[^a-z]))/.test(v);
}

function sanitizeScreenDisplayName(value: any): string {
    const raw = (value ?? "").toString().trim();
    if (!raw) return "";

    // Strip parser/debug wrappers like "-- ... ---"
    let cleaned = raw.replace(/^\s*-+\s*/g, "").replace(/\s*-+\s*$/g, "").trim();
    // Strip parser metadata e.g. "(Page 95, Score 10)"
    cleaned = cleaned.replace(/\(\s*Page\s*\d+\s*,\s*Score\s*[\d.]+\s*\)/gi, "").trim();
    cleaned = cleaned.replace(/\s{2,}/g, " ").trim();
    return cleaned;
}

/**
 * Parses the ANC Master Excel spreadsheet to extract pre-calculated proposal data.
 * Focuses on 'LED Sheet', 'Install (In-Bowl)', and 'Install (Concourse)' tabs.
 */
export async function parseANCExcel(buffer: Buffer, fileName?: string): Promise<ParsedANCProposal> {
    try {
        const workbook = xlsx.read(buffer, { type: 'buffer', cellStyles: true });

    // 1. Primary Data Source: fuzzy match LED / Cost / Sheet (e.g. "LED Sheet", "LED Cost Sheet", "Copy of LED Sheet")
    const ledSheetName = findLedOrCostSheet(workbook);
    const ledSheet = ledSheetName ? workbook.Sheets[ledSheetName] : null;
    if (!ledSheet) {
        const names = (workbook.SheetNames || Object.keys(workbook.Sheets || {})).join(', ') || 'none';
        throw new Error(`No sheet matching LED/Cost/Sheet found. Tab names in file: ${names}. Rename a tab to include "LED" and "Sheet" (or "Cost").`);
    }
    const ledData: any[][] = xlsx.utils.sheet_to_json(ledSheet, { header: 1 });

    // Extract hidden row indices from the LED Cost Sheet (requires cellStyles: true)
    const hiddenLedRows = new Set<number>();
    if (ledSheet['!rows']) {
        (ledSheet['!rows'] as any[]).forEach((r: any, i: number) => {
            if (r?.hidden) hiddenLedRows.add(i);
        });
    }
    if (hiddenLedRows.size > 0) {
        console.log(`[EXCEL IMPORT] LED Cost Sheet hidden rows detected: ${[...hiddenLedRows].join(', ')} (${hiddenLedRows.size} total)`);
    }

    // 2. Financial Source of Truth: fuzzy match Margin / Analysis / Total
    const marginSheetName = findMarginAnalysisSheet(workbook);
    const marginSheet = marginSheetName ? workbook.Sheets[marginSheetName] : null;
    const marginData: any[][] = marginSheet ? xlsx.utils.sheet_to_json(marginSheet, { header: 1 }) : [];

    // --- ROBUST COLUMN MAPPING ---
    // Find the header row (the first real table header row, not a title row)
    let headerRowIndex = 1;
    const headerSearchLimit = Math.min(ledData.length, 20);
    for (let i = 0; i < headerSearchLimit; i++) {
        const row = ledData[i] || [];
        const first = (row[0] ?? "").toString().trim().toUpperCase();
        const hasOption = first === "OPTION" || row.some((c) => (c ?? "").toString().trim().toUpperCase() === "OPTION");
        const hasPitch = row.some((c) => (c ?? "").toString().trim().toUpperCase() === "PITCH");
        const hasDisplayName = row.some((c) => (c ?? "").toString().trim().toUpperCase() === "DISPLAY NAME");

        if ((hasOption && hasPitch) || hasDisplayName) {
            headerRowIndex = i;
            break;
        }
    }

    const headers = ledData[headerRowIndex];
    if (!headers) throw new Error("Could not find header row in LED Sheet");

    const headerText = headers.map((h) => (h ?? "").toString().trim().toUpperCase());
    const isLedCostSheetFormat = headerText.some(t => t === "OPTION") &&
        headerText.some(t => t === "PITCH" || t.startsWith("PITCH") || t.includes("PITCH")) &&
        headerText.some(t => t.includes("SCREEN"));

    // Header-name detection — primary method. Fixed indices are fallback only.
    // This prevents silent wrong-data extraction when columns shift position.
    const findCol = (regex: RegExp) => headers.findIndex(h => regex.test((h ?? "").toString().trim()));

    const detectedName     = findCol(/^(display\s*name|display|option|screen\s*name)$/i);
    const detectedPitch    = findCol(/^(mm\s*pitch|pixel\s*pitch|pitch)$/i);
    const detectedHeight   = findCol(/^(active\s*)?h(eight)?\s*(\(ft\.?\))?$|^h$/i);
    const detectedWidth    = findCol(/^(active\s*)?w(idth)?\s*(\(ft\.?\))?$|^w$/i);
    const detectedPixelsH  = findCol(/res.*h|pixel.*h|^h\s*\(px\)|resolution.*h/i);
    const detectedPixelsW  = findCol(/res.*w|pixel.*w|^w\s*\(px\)|resolution.*w/i);
    const detectedQty      = findCol(/^(qty|quantity|#\s*of\s*screens?|no\.?\s*of\s*screens?|of\s*screens?)$/i);
    const detectedBright   = findCol(/nit|bright/i);
    const detectedHardware = findCol(/display\s*cost|hardware\s*cost/i);
    const detectedSell     = findCol(/^(sell\s*price|selling\s*price|total\s*price|led\s*price|price)$/i);
    const detectedMargin   = findCol(/^(led\s*margin|anc\s*margin|margin)$/i);
    const detectedBond     = findCol(/bond/i);
    const detectedFinal    = findCol(/total\s*with\s*bond|final\s*total|grand\s*total/i);

    // Fallback fixed indices (ANC standard layout — used only when header detection fails)
    const FALLBACK = {
        name: 0, pitch: 4, height: 5, width: 6,
        pixelsH: 7, pixelsW: 9, brightnessNits: 12,
        quantity: isLedCostSheetFormat ? 11 : 2,
        hardwareCost: isLedCostSheetFormat ? 16 : 16,
        installCost: 17, otherCost: 18, shippingCost: 19,
        totalCost: 20, sellPrice: 22, ancMargin: 23, bondCost: 24, finalTotal: 25,
    };

    // For name column: if detected at col 1+ check if col 0 actually has data in first data row.
    // Some files (e.g. NBTEST Audit) have "Display Name" header in col 1 due to merged cells,
    // but the actual screen names are in col 0.
    const firstDataRow = ledData[headerRowIndex + 1] || [];
    const col0HasData = firstDataRow[0] !== undefined && firstDataRow[0] !== null && String(firstDataRow[0]).trim() !== "";
    const resolvedNameCol = detectedName > 0 && col0HasData ? 0 : (detectedName >= 0 ? detectedName : FALLBACK.name);

    const colIdx: any = {
        name:             resolvedNameCol,
        pitch:            detectedPitch    >= 0 ? detectedPitch    : FALLBACK.pitch,
        height:           detectedHeight   >= 0 ? detectedHeight   : FALLBACK.height,
        width:            detectedWidth    >= 0 ? detectedWidth    : FALLBACK.width,
        pixelsH:          detectedPixelsH  >= 0 ? detectedPixelsH  : FALLBACK.pixelsH,
        pixelsW:          detectedPixelsW  >= 0 ? detectedPixelsW  : FALLBACK.pixelsW,
        brightness:       detectedBright   >= 0 ? detectedBright   : FALLBACK.brightnessNits,
        quantity:         detectedQty      >= 0 ? detectedQty      : FALLBACK.quantity,
        hardwareCost:     detectedHardware >= 0 ? detectedHardware : FALLBACK.hardwareCost,
        installCost:      FALLBACK.installCost,
        otherCost:        FALLBACK.otherCost,
        shippingCost:     FALLBACK.shippingCost,
        totalCost:        FALLBACK.totalCost,
        sellPrice:        detectedSell     >= 0 ? detectedSell     : FALLBACK.sellPrice,
        ancMargin:        detectedMargin   >= 0 ? detectedMargin   : FALLBACK.ancMargin,
        bondCost:         detectedBond     >= 0 ? detectedBond     : FALLBACK.bondCost,
        finalTotal:       detectedFinal    >= 0 ? detectedFinal    : FALLBACK.finalTotal,
        serviceType:      findCol(/service\s*type|access/i),
        structuralTonnage:findCol(/tonnage|steel\s*tons|tte/i),
        hdrStatus:        findCol(/hdr/i),
    };

    console.log(`[EXCEL IMPORT] Column map (header-detected): name=${colIdx.name} pitch=${colIdx.pitch} h=${colIdx.height} w=${colIdx.width} qty=${colIdx.quantity} sell=${colIdx.sellPrice}`);

    const marginRows = marginSheet ? parseMarginAnalysisRows(marginData) : [];
    const subTotalRow = marginRows.find((r) => r.name.toLowerCase().includes("sub total") && r.name.toLowerCase().includes("bid form")) || null;

    const screens: any[] = [];
    const perScreenAudits: ScreenAudit[] = [];
    let altRowsDetected = 0;
    let blankRowsSkipped = 0;

    for (let i = headerRowIndex + 1; i < ledData.length; i++) {
        const row = ledData[i];
        const projectName = row[colIdx.name];
        const cleanedProjectName = sanitizeScreenDisplayName(projectName);

        // Valid project row usually has a name and numeric dimensions/pitch
        const normalizedName = cleanedProjectName.toLowerCase();
        const nameCellUpper = (row[colIdx.name] ?? "").toString().trim().toUpperCase();
        const firstNonEmptyCellUpper = (() => {
            for (const c of row) {
                const t = (c ?? "").toString().trim();
                if (t.length > 0) return t.toUpperCase();
            }
            return "";
        })();

        if (
            nameCellUpper === "OPTION" ||
            nameCellUpper === "DISPLAY NAME" ||
            firstNonEmptyCellUpper === "OPTION" ||
            firstNonEmptyCellUpper === "DISPLAY NAME" ||
            row.some((c) => (c ?? "").toString().trim().toUpperCase() === "DISPLAY NAME")
        ) {
            continue;
        }

        const parseDimension = (v: any): number => Number(String(v ?? "").replace(/[^\d.\-]/g, ""));
        const pitchNum = parseDimension(row[colIdx.pitch]);
        const heightNum = parseDimension(row[colIdx.height]);
        const widthNum = parseDimension(row[colIdx.width]);

        if (
            cleanedProjectName !== "" &&
            normalizedName !== "option" &&
            Number.isFinite(pitchNum) &&
            pitchNum > 0 &&
            Number.isFinite(heightNum) &&
            heightNum > 0 &&
            Number.isFinite(widthNum) &&
            widthNum > 0
        ) {
            // REQ-111: Alternate Row Detection (Natalia Math)
            // PRD: Rows starting with "ALT" or "Alternate" are flagged but preserved.
            // Mirror Mode requires true 1:1 pass-through - templates decide what to render.
            // Intelligence Mode can filter these out to prevent inflated Base Bid.
            const isAlternate = isAlternateRowLabel(cleanedProjectName);
            if (isAlternate) {
                console.log(`[EXCEL IMPORT] Detected Alternate Row (preserved): "${cleanedProjectName}"`);
                altRowsDetected++;
            }

            const pitch = row[colIdx.pitch];
            const heightFt = row[colIdx.height];
            const widthFt = row[colIdx.width];
            const pixelsH = row[colIdx.pixelsH];
            const pixelsW = row[colIdx.pixelsW];

            // Brightness Row-Hide Logic
            let brightness = row[colIdx.brightnessNits];
            if (brightness === undefined || brightness === null || brightness === 0 || brightness === '0' || String(brightness).toUpperCase() === 'N/A' || String(brightness).trim() === '') {
                brightness = undefined;
            }

            const hdrValue = colIdx.hdrStatus !== -1 ? row[colIdx.hdrStatus] : null;
            const isHDR = hdrValue === true || String(hdrValue).toLowerCase() === 'yes' || String(hdrValue).toLowerCase() === 'true';

            const safeNumAt = (idx: number) => (idx >= 0 ? (Number(row[idx]) || 0) : 0);

            // Financial fields
            const hardwareCost = safeNumAt(colIdx.hardwareCost);
            const installCost = safeNumAt(colIdx.installCost);
            const otherCost = safeNumAt(colIdx.otherCost);
            const structureCost = safeNumAt(colIdx.installCost) * 0.5;
            const laborCost = safeNumAt(colIdx.installCost) * 0.5 + safeNumAt(colIdx.otherCost);
            const shippingCost = safeNumAt(colIdx.shippingCost);
            const totalCostBeforeMargin = safeNumAt(colIdx.totalCost) || hardwareCost + installCost + otherCost;
            const sellPrice = safeNumAt(colIdx.sellPrice);
            const ancMargin = safeNumAt(colIdx.ancMargin);
            const bondCost = safeNumAt(colIdx.bondCost);
            const finalClientTotal = safeNumAt(colIdx.finalTotal);

            const screen: any = {
                name: cleanedProjectName,
                rowIndex: i + 1,
                sourceRef: { sheet: ledSheetName, row: i + 1 },
                pitchMm: parseDimension(pitch),
                heightFt: parseDimension(heightFt),
                widthFt: parseDimension(widthFt),
                pixelsH: parseInt(pixelsH) || 0,
                pixelsW: parseInt(pixelsW) || 0,
                brightness: brightness, // REQ: Rename to Brightness
                serviceType: colIdx.serviceType >= 0 ? row[colIdx.serviceType] : undefined,
                structuralTonnage: colIdx.structuralTonnage >= 0 ? row[colIdx.structuralTonnage] : undefined,
                isHDR: isHDR,
                isAlternate: isAlternate, // Flag for templates to filter in Intelligence mode
                quantity: Number(colIdx.quantity >= 0 ? row[colIdx.quantity] : 1) || 1,
                lineItems: [],
                hardwareCost,
                installCost,
                otherCost,
                shippingCost,
                totalCost: totalCostBeforeMargin,
                sellPrice,
                ancMargin,
                bondCost,
                finalTotal: finalClientTotal,
            };

            // Mark screens from hidden LED rows so specs/PDF can exclude them
            if (hiddenLedRows.has(i)) {
                screen.hiddenFromSpecs = true;
                console.log(`[EXCEL IMPORT] Screen "${cleanedProjectName}" at row ${i} is HIDDEN → hiddenFromSpecs=true`);
            }

            let description = `Resolution: ${screen.pixelsH}h x ${screen.pixelsW}w. `;
            if (brightness) {
                description += `Brightness: ${brightness}.`;
            }
            screen.description = description;

            const marginRow = marginRows.length > 0 ? pickBestMarginRow(marginRows, cleanedProjectName) : null;
            if (marginRow) {
                screen.totalCost = marginRow.cost;
                screen.sellPrice = marginRow.sell;
                screen.ancMargin = marginRow.marginAmount;
                screen.finalTotal = marginRow.sell;

                // Assign Group/Section from Margin Analysis
                screen.group = marginRow.section;

                // Mark as matched
                marginRow.matched = true;
            }

            const audit: ScreenAudit = {
                name: cleanedProjectName,
                productType: 'LED Display',
                quantity: Number(colIdx.quantity >= 0 ? row[colIdx.quantity] : 1) || 1,
                areaSqFt: formatDimension((parseFloat(heightFt) || 0) * (parseFloat(widthFt) || 0)),
                pixelResolution: (parseInt(pixelsH) || 0) * (parseInt(pixelsW) || 0),
                pixelMatrix: `${pixelsH} x ${pixelsW} @ ${pitch}mm`,
                breakdown: {
                    hardware: formatCurrencyInternal(marginRow?.cost ?? hardwareCost),
                    structure: 0,
                    install: 0,
                    labor: 0,
                    power: 0,
                    shipping: 0,
                    pm: 0,
                    generalConditions: 0,
                    travel: 0,
                    submittals: 0,
                    engineering: 0,
                    permits: 0,
                    cms: 0,
                    demolition: 0,
                    ancMargin: formatCurrencyInternal(marginRow?.marginAmount ?? ancMargin),
                    sellPrice: formatCurrencyInternal(marginRow?.sell ?? sellPrice),
                    bondCost: 0,
                    totalCost: formatCurrencyInternal(marginRow?.cost ?? totalCostBeforeMargin),
                    finalClientTotal: marginRow?.sell ?? finalClientTotal,
                    sellingPricePerSqFt: heightFt && widthFt ? (marginRow?.sell ?? finalClientTotal) / (parseFloat(heightFt) * (parseFloat(widthFt) || 1)) : 0,
                    marginAmount: marginRow?.marginAmount ?? ancMargin,
                    boTaxCost: 0,
                    salesTaxCost: 0, // REQ-125: Sales tax (calculated at project level)
                    salesTaxRate: 0.095 // REQ-125: Default 9.5% tax rate
                }
            };

            screens.push(screen);
            perScreenAudits.push(audit);
        } else if (typeof projectName === 'string' && projectName.trim() !== "") {
            blankRowsSkipped++;
        }
    }

    // Normalize/fallback names and dedupe exact duplicates.
    const dedupeSeen = new Set<string>();
    const dedupedScreens: any[] = [];
    for (let idx = 0; idx < screens.length; idx++) {
        const screen = screens[idx];
        const baseName = sanitizeScreenDisplayName(screen?.name);
        const normalizedNameForOutput =
            baseName && !/^unnamed\s+screen$/i.test(baseName)
                ? baseName
                : `Display ${dedupedScreens.length + 1}`;

        const signature = [
            normalizedNameForOutput.toLowerCase(),
            Number(screen?.heightFt ?? 0) || 0,
            Number(screen?.widthFt ?? 0) || 0,
            Number(screen?.pitchMm ?? 0) || 0,
            Number(screen?.pixelsH ?? 0) || 0,
            Number(screen?.pixelsW ?? 0) || 0,
        ].join("|");

        if (dedupeSeen.has(signature)) continue;
        dedupeSeen.add(signature);
        dedupedScreens.push({ ...screen, name: normalizedNameForOutput });
    }
    screens.splice(0, screens.length, ...dedupedScreens);

    if (marginRows.length > 0) {
        const normalizedScreenNames = new Set(
            screens.map((s: any) => (s?.name || "").toString().trim().toLowerCase()).filter(Boolean)
        );
        const sectionNames = new Set(
            marginRows
                .filter((r) => !r.isAlternate && !r.isTotalLike && r.section)
                .map((r) => (r.section || "").toString().trim().toLowerCase())
                .filter(Boolean)
        );
        for (const sectionName of sectionNames) {
            if (!normalizedScreenNames.has(sectionName)) {
                console.warn(`[EXCEL IMPORT] Missing screen spec match for pricing section: "${sectionName}"`);
            }
        }
    }

    const totals = aggregateTotals(perScreenAudits);

    // REQ-UserFeedback: Include non-LED items (Structure, Installation, Labor, etc.) in Project Total
    // Extract unmatched margin rows as soft costs
    const softCostItems: Array<{ name: string; cost: number; sell: number }> = [];
    let softCostTotal = 0;

    for (const row of marginRows) {
        // Skip if already matched to a screen, is an alternate, or is a total row
        if (row.matched || row.isAlternate || row.isTotalLike) continue;

        // Check if this row looks like a soft cost (not an LED screen)
        const nameNorm = row.name.toLowerCase();
        const isSoftCost =
            nameNorm.includes('structure') ||
            nameNorm.includes('structural') ||
            nameNorm.includes('install') ||
            nameNorm.includes('labor') ||
            nameNorm.includes('electrical') ||
            nameNorm.includes('power') ||
            nameNorm.includes('pm ') ||
            nameNorm.includes('project management') ||
            nameNorm.includes('travel') ||
            nameNorm.includes('engineering') ||
            nameNorm.includes('permits') ||
            nameNorm.includes('bond') ||
            nameNorm.includes('insurance') ||
            nameNorm.includes('shipping') ||
            nameNorm.includes('freight') ||
            nameNorm.includes('demolition') ||
            nameNorm.includes('rigging') ||
            nameNorm.includes('crane') ||
            nameNorm.includes('commissioning') ||
            nameNorm.includes('training') ||
            nameNorm.includes('warranty') ||
            nameNorm.includes('general conditions') ||
            nameNorm.includes('overhead');

        if (isSoftCost) {
            softCostItems.push({
                name: row.name,
                cost: row.cost,
                sell: row.sell
            });
            softCostTotal += row.sell;
        } else if ((row.cost > 0 || row.sell > 0) && !row.name.toLowerCase().includes('display') && !row.name.toLowerCase().includes('screen')) {
            // REQ-UserFeedback: Include any unmatched row with valid pricing (catches items not in keyword list)
            softCostItems.push({
                name: row.name,
                cost: row.cost,
                sell: row.sell
            });
            softCostTotal += row.sell;
        }
    }

    // Add soft costs to totals
    if (softCostTotal > 0) {
        console.log(`[EXCEL IMPORT] Including ${softCostItems.length} soft cost items totaling $${softCostTotal.toFixed(2)}`);
        totals.sellPrice += softCostTotal;
        totals.finalClientTotal += softCostTotal;
    }

    // SubTotal Row Reconciliation:
    // The Excel "Sub Total (Bid Form)" row is the estimator's source of truth.
    // But we must NOT blindly overwrite the aggregated total (which includes soft costs).
    // Strategy: Use SubTotal row if it's >= aggregated total (it likely includes soft costs).
    // If SubTotal < aggregated, it means soft costs were added on top — keep the larger value.
    if (subTotalRow) {
        const subTotalSell = Number(subTotalRow.sell || 0);
        const subTotalCost = Number(subTotalRow.cost || 0);

        // If SubTotal row has valid numbers AND is >= our computed total, use it (it's more authoritative)
        if (subTotalSell > 0 && subTotalSell >= totals.finalClientTotal) {
            totals.totalCost = subTotalCost || totals.totalCost;
            totals.sellPrice = subTotalSell;
            totals.ancMargin = Number(subTotalRow.marginAmount || totals.ancMargin);
            totals.margin = Number(subTotalRow.marginAmount || totals.margin);
            totals.finalClientTotal = subTotalSell;
        }
        // Otherwise: SubTotal is less than our aggregate (soft costs were injected) — keep the higher aggregate
    }
    const internalAudit: InternalAudit = {
        perScreen: perScreenAudits,
        totals: totals,
        softCostItems: softCostItems // REQ-UserFeedback: Track soft costs separately
    };

    // Construct the Unified FormData object
    // REQ-User-Feedback: Structure Margin Analysis data for exact PDF mirroring
    const marginAnalysis = groupMarginAnalysisRows(marginRows);

    // ── Strategy 2: Read from Excel cells (preferred) ──
    const extractFromCells = (): string | null => {
        const isCleanName = (s: string) =>
            s.length >= 3 && s.length <= 80
            && !/^\d+$/.test(s)                 // not pure numbers
            && !/^[a-z]{2,8}$/.test(s)          // not a short generic word
            && !/^(option|total|subtotal|cost|margin|sell|price)/i.test(s);

        const extractFromLabel = (cell: string): string | null => {
            const patterns = [
                /^Project\s*Name:\s*(.+)$/i,
                /^Client:\s*(.+)$/i,
                /^Customer:\s*(.+)$/i,
                /^Venue:\s*(.+)$/i,
                /^Project:\s*(.+)$/i,
            ];
            for (const p of patterns) {
                const m = cell.match(p);
                if (m && m[1].trim()) return m[1].trim();
            }
            return null;
        };

        // Check Margin Analysis sheet first (often has the project name in A1/B1/A2)
        if (marginData.length > 0) {
            for (let r = 0; r < Math.min(marginData.length, 5); r++) {
                const row = marginData[r] || [];
                for (let c = 0; c < Math.min(row.length, 3); c++) {
                    const cell = (row[c] ?? "").toString().trim();
                    const label = extractFromLabel(cell);
                    if (label && isCleanName(label)) return label;
                }
            }
        }

        // Check LED sheet first 10 rows for labeled cells
        const searchRows = ledData.slice(0, 10);
        for (const row of searchRows) {
            for (let c = 0; c < (row?.length ?? 0); c++) {
                const cell = (row[c] ?? "").toString().trim();
                const label = extractFromLabel(cell);
                if (label && isCleanName(label)) return label;
            }
        }

        // Check all other sheets (P&L, etc.) first 5 rows, first 3 cols
        for (const sheetName of workbook.SheetNames) {
            if (sheetName === ledSheetName || sheetName === marginSheetName) continue;
            const sheet = workbook.Sheets[sheetName];
            if (!sheet) continue;
            const data: any[][] = xlsx.utils.sheet_to_json(sheet, { header: 1 });
            for (let r = 0; r < Math.min(data.length, 5); r++) {
                const row = data[r] || [];
                for (let c = 0; c < Math.min(row.length, 3); c++) {
                    const cell = (row[c] ?? "").toString().trim();
                    const label = extractFromLabel(cell);
                    if (label && isCleanName(label)) return label;
                }
            }
        }

        // Fallback: check ledData[0][0] raw value (some files just put the name there)
        const firstCell = (ledData[0]?.[0] ?? "").toString().trim();
        if (firstCell && isCleanName(firstCell) && !firstCell.includes('\t')) return firstCell;

        return null;
    };

    // ── Strategy 1: Parse the filename ──
    // Pattern: ANC_[ClientName]_LED_Displays_[DocType]_[Date].xlsx
    const extractFromFilename = (): string | null => {
        if (!fileName || typeof fileName !== "string") return null;
        let base = fileName;
        // Remove extension
        base = base.replace(/\.xlsx?$/i, "");
        // Remove "Copy_of_" / "Copy of "
        base = base.replace(/^Copy[_ ]of[_ ]/i, "");
        // Remove "Cost_Analysis_-_" / "Cost Analysis - "
        base = base.replace(/^Cost[_ ]Analysis[_ ][-–—][_ ]/i, "");
        // Remove "ANC_" prefix (with or without "x_")
        base = base.replace(/^anc[_ ](x[_ ])?/i, "");
        // Remove document type suffixes: _LED_Displays, _LED, _Budget, _Proposal, _LOI and everything after
        base = base.replace(/[_ ](LED[_ ]Displays?|LED|LCD|Budget|Proposal|LOI|Quotation|Estimate)[_ ]?.*/i, "");
        // Remove date patterns: YYYY-MM-DD, MM-DD-YY, M_DD_YYYY (with any separator)
        base = base.replace(/[_ -]*\d{4}[-/._]\d{1,2}[-/._]\d{1,2}[_ -]*/g, "");
        base = base.replace(/[_ -]*\d{1,2}[-/._]\d{1,2}[-/._]\d{2,4}[_ -]*/g, "");
        // Remove copy indicators like (1), (2)
        base = base.replace(/\s*\(\d+\)\s*/g, "");
        // Replace underscores with spaces
        base = base.replace(/_/g, " ");
        // Trim dashes, whitespace, and separators from edges
        base = base.replace(/^[\s\-–—:]+|[\s\-–—:]+$/g, "").trim();
        // Reject if result is purely numeric or too short
        if (base.length < 2 || /^\d+$/.test(base)) return null;
        return base;
    };

    const extractClientName = (): string => {
        return extractFromCells() || extractFromFilename() || "New Project";
    };

    const clientNameResult = extractClientName();
    const formData = {
        receiver: {
            name: clientNameResult,
        },
        details: {
            proposalName: clientNameResult !== "New Project" ? clientNameResult : 'ANC LED Display Proposal',
            screens,
            internalAudit,
            subTotal: totals.sellPrice, // REQ-User-Feedback: Explicit subtotal for PDF logic
            clientSummary: totals, // Initial summary
            mirrorMode: marginSheet ? true : false, // Auto-flip to mirror if Excel has details
            marginAnalysis, // NEW: Full structured data from Margin Analysis
        }
    };

    // VERIFICATION INTEGRATION: Compute manifest during Excel import
    // This captures control totals at the source (Excel) stage
    const excelData = {
        proposalId: 'pending', // Will be set when proposal is created
        fileName: typeof fileName === "string" && fileName.trim() !== "" ? fileName : 'import.xlsx',
        screens,
        rowCount: ledData.length,
        screenCount: screens.length,
        altRowsDetected,
        blankRowsSkipped,
        headerRowIndex,
        sheetsRead: ['LED Cost Sheet', 'Margin Analysis'].filter(Boolean),
    };

    const verificationManifest: VerificationManifest = computeManifest(
        excelData,
        internalAudit
    );

    // Detect exceptions early
    const exceptions = detectExceptions(verificationManifest);

    return {
        formData,
        internalAudit,
        verificationManifest, // NEW: Include verification manifest
        exceptions, // NEW: Include detected exceptions
        excelData,
    };
    } catch (e) {
        Sentry.captureException(e, { tags: { area: "excelImportService" }, extra: { fileName } });
        throw e;
    }
}

function parseMarginAnalysisRows(data: any[][]) {
    const rows: Array<{
        name: string;
        cost: number;
        sell: number;
        sellRaw: any; // Capture raw for "INCLUDED" check
        marginAmount: number;
        marginPct: number;
        rowIndex: number;
        section: string | null;
        isAlternate: boolean;
        isTotalLike: boolean;
        matched?: boolean;
    }> = [];

    const norm = (s: any) => String(s ?? "").toLowerCase().replace(/\s+/g, " ").trim();

    let headerRow = -1;
    let costIndex = -1;
    let sellIndex = -1;
    let marginAmountIndex = -1;
    let marginPctIndex = -1;
    let labelIndex = -1;

    for (let i = 0; i < Math.min(data.length, 40); i++) {
        const row = data[i] || [];
        const rowText = row.map(norm);

        // Find indices dynamically
        const cIdx = rowText.findIndex(t => t === "cost");
        const sIdx = rowText.findIndex(t => t === "selling price" || t === "sell price" || t === "sale price" || t === "sales price");

        if (cIdx !== -1 && sIdx !== -1) {
            headerRow = i;
            costIndex = cIdx;
            sellIndex = sIdx;
            // Label column: first non-empty text column to the left of cost, or col 0
            labelIndex = cIdx > 0 ? cIdx - 1 : 0;

            // Try to find margin columns, otherwise assume relative positions
            const mIdx = rowText.findIndex(t => t === "margin $" || t === "margin amount" || t === "margin");
            const mpIdx = rowText.findIndex(t => t === "margin %" || t === "margin percent" || t === "%");

            marginAmountIndex = mIdx !== -1 ? mIdx : sIdx + 1;
            marginPctIndex = mpIdx !== -1 ? mpIdx : sIdx + 2;

            break;
        }
    }

    if (headerRow === -1) return rows;

    let currentSection: string | null = null;
    let isInAlternates = false;

    for (let i = headerRow + 1; i < data.length; i++) {
        const row = data[i] || [];

        // Use dynamic indices
        const labelRaw = labelIndex >= 0 ? row[labelIndex] : row[0];
        const label = (labelRaw !== null && labelRaw !== undefined && typeof labelRaw === "string") ? labelRaw.trim() : String(labelRaw ?? "").trim();
        const labelNorm = norm(labelRaw);

        // Defensive number parsing: handle null, undefined, 'INCLUDED', 'N/A'
        const safeNum = (v: any) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
        const costRaw = costIndex >= 0 ? row[costIndex] : row[1];
        const cost = safeNum(costRaw);
        const sellRaw = sellIndex >= 0 ? row[sellIndex] : row[2];
        const sell = safeNum(sellRaw);
        const marginAmount = safeNum(marginAmountIndex >= 0 ? row[marginAmountIndex] : row[3]);
        const marginPct = safeNum(marginPctIndex >= 0 ? row[marginPctIndex] : row[4]);

        // A row is numeric if the original cells had actual numbers (not just empty → 0)
        const hasRealNumericData =
            (costRaw !== null && costRaw !== undefined && costRaw !== "" && Number.isFinite(Number(costRaw))) ||
            (sellRaw !== null && sellRaw !== undefined && sellRaw !== "" && Number.isFinite(Number(sellRaw)));

        const numericRow =
            hasRealNumericData &&
            label.length > 0;

        const isTotalLike =
            labelNorm.includes("total") ||
            labelNorm.includes("sub total") ||
            labelNorm.includes("subtotal") ||
            labelNorm === "tax" ||
            labelNorm === "bond";

        if (!numericRow) {
            if (label.length > 0) {
                if (labelNorm.includes("alternates")) isInAlternates = true;
                if (labelNorm.includes("alternate") && labelNorm.includes("cost")) isInAlternates = true;
                if (!labelNorm.includes("revision") && !labelNorm.includes("project name")) {
                    currentSection = label;
                }
            }
            continue;
        }

        const isAlternate = isInAlternates || isAlternateRowLabel(label);

        rows.push({
            name: label,
            cost: Number.isFinite(cost) ? cost : 0,
            sell: Number.isFinite(sell) ? sell : 0,
            sellRaw,
            marginAmount: Number.isFinite(marginAmount) ? marginAmount : 0,
            marginPct: Number.isFinite(marginPct) ? marginPct : 0,
            rowIndex: i + 1,
            section: currentSection,
            isAlternate,
            isTotalLike,
        });
    }

    return rows;
}

function groupMarginAnalysisRows(rows: ReturnType<typeof parseMarginAnalysisRows>) {
    const sections: Record<string, any> = {};
    const result: any[] = [];

    rows.forEach(row => {
        if (row.isTotalLike || row.isAlternate) return;

        const sectionName = row.section || "General";

        if (!sections[sectionName]) {
            sections[sectionName] = {
                name: sectionName,
                items: [],
                subTotal: 0
            };
            result.push(sections[sectionName]);
        }

        // Only mark INCLUDED when the Excel cell explicitly says "included" — never infer from $0 alone.
        const isIncluded = /\bincluded\b/i.test(String(row.sellRaw ?? "")) ||
            /\bincluded\b/i.test(String(row.name ?? ""));

        sections[sectionName].items.push({
            name: row.name,
            sellingPrice: row.sell,
            isIncluded,
            raw: row
        });

        sections[sectionName].subTotal += row.sell;
    });

    return result;
}

function pickBestMarginRow(marginRows: ReturnType<typeof parseMarginAnalysisRows>, screenName: string) {
    const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
    const s = norm(screenName);
    if (!s) return null;

    let best: { row: (typeof marginRows)[number]; score: number } | null = null;

    for (const row of marginRows) {
        if (row.isAlternate) continue;
        if (row.isTotalLike) continue;
        const r = norm(row.name);
        let score = 0;
        if (r.includes(s)) score = s.length;
        else if (s.includes(r)) score = r.length;
        if (score > 0 && (!best || score > best.score)) best = { row, score };
    }

    if (!best) return null;
    if (best.score < Math.min(10, s.length)) return null;
    return best.row;
}

function aggregateTotals(audits: ScreenAudit[]) {
    const initial = {
        hardware: 0,
        structure: 0,
        install: 0,
        labor: 0,
        power: 0,
        shipping: 0,
        pm: 0,
        demolition: 0,
        generalConditions: 0,
        travel: 0,
        submittals: 0,
        engineering: 0,
        permits: 0,
        cms: 0,
        ancMargin: 0,
        sellPrice: 0,
        bondCost: 0,
        margin: 0,
        totalCost: 0,
        boTaxCost: 0,
        finalClientTotal: 0,
        sellingPricePerSqFt: 0,
    };

    const summed = audits.reduce((acc, curr) => {
        const b = curr.breakdown;
        return {
            hardware: acc.hardware + (Number(b.hardware) || 0),
            structure: acc.structure + (Number(b.structure) || 0),
            install: acc.install + (Number(b.install) || 0),
            labor: acc.labor + (Number(b.labor) || 0),
            power: acc.power + (Number(b.power) || 0),
            shipping: acc.shipping + (Number(b.shipping) || 0),
            pm: acc.pm + (Number(b.pm) || 0),
            demolition: acc.demolition + (Number(b.demolition) || 0),
            generalConditions: acc.generalConditions + (Number(b.generalConditions) || 0),
            travel: acc.travel + (Number(b.travel) || 0),
            submittals: acc.submittals + (Number(b.submittals) || 0),
            engineering: acc.engineering + (Number(b.engineering) || 0),
            permits: acc.permits + (Number(b.permits) || 0),
            cms: acc.cms + (Number(b.cms) || 0),
            ancMargin: acc.ancMargin + (Number(b.ancMargin) || 0),
            sellPrice: acc.sellPrice + (Number(b.sellPrice) || 0),
            bondCost: acc.bondCost + (Number(b.bondCost) || 0),
            margin: acc.margin + (Number(b.marginAmount || b.ancMargin) || 0),
            totalCost: acc.totalCost + (Number(b.totalCost) || 0),
            boTaxCost: acc.boTaxCost + (Number(b.boTaxCost) || 0),
            finalClientTotal: acc.finalClientTotal + (Number(b.finalClientTotal) || 0),
            sellingPricePerSqFt: 0,
        };
    }, initial);

    // Weighted average for selling price per sq ft
    const totalArea = audits.reduce((acc, curr) => acc + (curr.areaSqFt || 0), 0);
    if (totalArea > 0) {
        summed.sellingPricePerSqFt = summed.finalClientTotal / totalArea;
    }

    return summed;
}
