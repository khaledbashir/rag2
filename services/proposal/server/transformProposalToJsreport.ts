import { ProposalType } from "@/types";
import { computeTableTotals, computeDocumentTotalFromTables } from "@/lib/pricingMath";
import { normalizePitch } from "@/lib/helpers";
import { resolveDocumentMode } from "@/lib/documentMode";
import { DOCUMENT_MODES, DocumentMode as CatalogDocumentMode } from "@/services/rfp/productCatalog";

// ─── Types ───────────────────────────────────────────────────────────────────

interface JsreportPricingItem {
    description: string;
    price: string;
}

interface JsreportPricingTable {
    label: string;
    items: JsreportPricingItem[];
    subtotal?: string;
    taxLabel?: string;
    tax?: string;
    bond?: string;
    tariff?: string;
    grandTotal: string;
}

interface JsreportScreen {
    name: string;
    height: string;
    width: string;
    pitch: string;
    resH: string;
    resW: string;
    brightness: string;
    qty: number;
}

export interface JsreportProposalData {
    // Header / footer
    companyName: string;
    documentTypeLabel: string; // "LETTER OF INTENT", "SALES QUOTATION", etc.
    documentMode: string; // "LOI", "PROPOSAL", "BUDGET"
    date: string;
    proposalNumber: string;
    projectName: string;
    clientName: string;

    // Layout Flags
    isLOI: boolean;
    masterTableIndex: number | null;
    showPricingTables: boolean;
    showSpecifications: boolean;
    showExhibitA: boolean;
    showScopeOfWork: boolean;
    showNotes: boolean;
    showPaymentTerms: boolean;
    showSignatureBlock: boolean;
    hasGeneratedSchedule: boolean;

    // Content
    introText: string; // The specific intro text or legal intro
    customProposalNotes: string | null;
    scopeOfWorkText: string | null;

    // Config
    purchaserLegalName: string;
    purchaserAddress: string;

    // Data
    pricingTables: JsreportPricingTable[];
    masterTable?: JsreportPricingTable; // The summary table if masterTableIndex is set
    detailTables: JsreportPricingTable[]; // The tables to show in detail (excluding master if LOI A)

    screens: JsreportScreen[];
    notes: string[];

    // Signature
    signatureFontFamily: string;

    // Totals
    documentTotal: string;
    currency: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatCurrency(amount: number, currency: string = "USD"): string {
    if (!isFinite(amount)) return "$0.00";
    const prefix = currency === "CAD" ? "C$" : "$";
    const formatted = Math.abs(amount)
        .toFixed(2)
        .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return amount < 0 ? `(${prefix}${formatted})` : `${prefix}${formatted}`;
}

function formatFeetPlain(val: any): string {
    const n = Number(val);
    if (!isFinite(n)) return "";
    return `${n.toFixed(2)}'`;
}

function formatPitch(val: any): string {
    const corrected = normalizePitch(val);
    if (corrected <= 0) return "";
    return corrected < 2
        ? corrected.toFixed(2)
        : corrected.toFixed(corrected % 1 === 0 ? 0 : 2);
}

function computePixels(feetValue: any, pitchMm: any): number {
    const ft = Number(feetValue);
    const pitch = normalizePitch(pitchMm);
    if (!isFinite(ft) || ft <= 0 || pitch <= 0) return 0;
    return Math.round((ft * 304.8) / pitch);
}

function numberWithCommas(n: number): string {
    return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function getDateString(): string {
    const d = new Date();
    const months = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    ];
    return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

// ─── Main Transform ──────────────────────────────────────────────────────────

export function transformProposalToJsreport(
    data: ProposalType & { _audit?: any },
): JsreportProposalData {
    const details = data.details as any;
    const { receiver } = data;

    // 1. Resolve Document Mode & Config
    const documentMode = resolveDocumentMode(details); // "LOI" | "PROPOSAL" | "BUDGET"
    const catalogMode = documentMode.toLowerCase() as CatalogDocumentMode;
    const docModeConfig = DOCUMENT_MODES[catalogMode] || DOCUMENT_MODES.proposal;
    const docLabel = docModeConfig.headerText;
    const isLOI = documentMode === "LOI";

    const pricingDocument = details?.pricingDocument || (data as any)?.pricingDocument;
    const currency: string = pricingDocument?.currency || "USD";
    const priceOverrides = details?.priceOverrides || {};
    const descriptionOverrides = details?.descriptionOverrides || {};
    const tableHeaderOverrides = (details?.tableHeaderOverrides || {}) as Record<string, string>;

    // 2. Pricing Tables & Master Table Logic
    const rawTables = (pricingDocument?.tables || []) as any[];

    // Auto-detect master table if not explicit
    const rollUpRegex = /\b(total|roll.?up|summary|project\s+grand|grand\s+total|project\s+total|cost\s+summary|pricing\s+summary)\b/i;
    let masterTableIndex: number | null = details?.masterTableIndex ?? null;
    if (masterTableIndex === null && rawTables.length > 1 && rollUpRegex.test(rawTables[0]?.name || "")) {
        masterTableIndex = 0;
    }

    // Helper to transform a single table
    const transformTable = (table: any): JsreportPricingTable => {
        const totals = computeTableTotals(table, priceOverrides, descriptionOverrides);
        const tableName = (table?.name ?? "").toString().trim();
        const tableId = table?.id;
        const override = tableId ? tableHeaderOverrides[tableId] : undefined;
        const label = (override || tableName || "Section").toString().trim();

        const items: JsreportPricingItem[] = totals.items.map((item: any) => ({
            description: item.description,
            price: item.isIncluded ? "INCLUDED" : formatCurrency(item.price, currency),
        }));

        const result: JsreportPricingTable = {
            label: label.toUpperCase(),
            items,
            grandTotal: formatCurrency(totals.grandTotal, currency),
        };

        if (Math.abs(totals.subtotal) >= 0.01 && totals.subtotal !== totals.grandTotal) {
            result.subtotal = formatCurrency(totals.subtotal, currency);
        }
        if (Math.abs(totals.tax) >= 0.01) {
            result.taxLabel = totals.taxLabel || "Tax";
            result.tax = formatCurrency(totals.tax, currency);
        }
        if (Math.abs(totals.bond) >= 0.01) {
            result.bond = formatCurrency(totals.bond, currency);
        }
        if (Math.abs(totals.tariff ?? 0) >= 0.01) {
            result.tariff = formatCurrency(totals.tariff, currency);
        }
        return result;
    };

    const allPricingTables = rawTables.map(transformTable);
    const masterTable = masterTableIndex !== null && allPricingTables[masterTableIndex] ? allPricingTables[masterTableIndex] : undefined;

    // Logic for "Detail Tables":
    // If LOI & master table exists (Structure A), detail tables are ALL tables EXCLUDING the master table.
    // Otherwise, detail tables are just ALL tables.
    const detailTables = (isLOI && masterTableIndex !== null)
        ? allPricingTables.filter((_, idx) => idx !== masterTableIndex)
        : allPricingTables;

    // 3. Screens (Specs)
    const rawScreens = (details?.screens || []).filter((s: any) => !s?.hiddenFromSpecs);
    const screens: JsreportScreen[] = rawScreens.map((screen: any) => {
        const h = screen?.heightFt ?? screen?.height ?? 0;
        const w = screen?.widthFt ?? screen?.width ?? 0;
        const pitch = screen?.pitchMm ?? screen?.pixelPitch ?? 0;
        const pixelsH = screen?.pixelsH || computePixels(h, pitch);
        const pixelsW = screen?.pixelsW || computePixels(w, pitch);
        const rawBrightness = screen?.brightness ?? screen?.brightnessNits ?? screen?.nits;
        const brightnessNumber = Number(rawBrightness);
        const brightnessText =
            rawBrightness == null || rawBrightness === "" || rawBrightness === 0
                ? "—"
                : isFinite(brightnessNumber) && brightnessNumber > 0
                    ? numberWithCommas(brightnessNumber)
                    : "—";

        return {
            name: screen?.customDisplayName || screen?.externalName || screen?.name || "Display",
            height: formatFeetPlain(h),
            width: formatFeetPlain(w),
            pitch: pitch ? `${formatPitch(pitch)}` : "—",
            resH: pixelsH ? pixelsH.toString() : "—",
            resW: pixelsW ? pixelsW.toString() : "—",
            brightness: brightnessText,
            qty: Number(screen?.quantity || 1),
        };
    });

    // 4. Strings & Text

    // Purchaser Name logic from Template
    const rawPurchaserName = receiver?.name || "";
    const purchaserName = rawPurchaserName && !/^\d+$/.test(rawPurchaserName.trim()) ? rawPurchaserName : "Client";
    const purchaserLegalName = ((details as any)?.purchaserLegalName || "").trim() || purchaserName;
    const purchaserAddress = (() => {
        const parts = [receiver?.address, receiver?.city, receiver?.zipCode].filter(Boolean);
        return parts.length > 0 ? parts.join(", ") : "";
    })();

    // Intro Text Logic
    let introText = "";
    if (isLOI && details?.loiHeaderText?.trim()) {
        introText = details.loiHeaderText.trim();
    } else if (details?.introText?.trim()) {
        introText = details.introText.trim();
    } else if (isLOI) {
        // Fallback LOI Text
        introText = `This Sales Quotation will set forth the terms by which <strong style="color:black">${purchaserLegalName}</strong> ("Purchaser")${purchaserAddress ? ` located at ${purchaserAddress}` : ""} and <strong style="color:black">ANC Sports Enterprises, LLC</strong> ("ANC") located at 2 Manhattanville Road, Suite 402, Purchase, NY 10577 (collectively, the "Parties") agree that ANC will provide following LED Display and services described below for the <strong style="color:black">${details?.proposalName || "project"}</strong>.`;
    } else {
        // Generic fallback
        introText = `ANC is pleased to present the following proposal for <strong style="color:black">${purchaserName}</strong> per the specifications and pricing below.`;
    }

    // Notes
    const customNotes = details?.customProposalNotes || details?.additionalNotes || "";
    const noteLines: string[] = customNotes
        ? customNotes.split("\n").map((l: string) => l.trim()).filter((l: string) => l.length > 0)
        : [
            "All prices quoted in USD. Valid for 30 days from date of proposal.",
            "Payment terms: 50% upon signing, 40% upon delivery, 10% upon completion.",
        ];

    // Document Total
    const docTotal = rawTables.length > 0
        ? computeDocumentTotalFromTables(rawTables, priceOverrides, descriptionOverrides)
        : 0;

    // 5. Flags
    // Apply defaults if undefined (logic mirrored from applyDocumentModeDefaults, but simplified here since we just want final values)
    // Actually, usually the UI saves these. If undefined, we default based on config.
    const showPaymentTerms = details.showPaymentTerms ?? docModeConfig.includePaymentTerms;
    const showSignatureBlock = details.showSignatureBlock ?? docModeConfig.includeSignatures;
    const showNotes = details.showNotes ?? true;
    const showScopeOfWork = details.showScopeOfWork ?? false;

    // LOI specific defaults
    let showExhibitA = details.showExhibitA;
    if (showExhibitA === undefined) showExhibitA = isLOI ? true : (documentMode === "PROPOSAL"); // Default true for LOI/Proposal, false for Budget

    let showSpecifications = details.showSpecifications;
    if (showSpecifications === undefined) showSpecifications = !isLOI; // Default true for Proposal/Budget, false for LOI (unless Exhibit A is used)

    const hasGeneratedSchedule = false; // Placeholder for now

    return {
        // Headers
        companyName: "ANC",
        documentTypeLabel: docLabel,
        documentMode,
        date: getDateString(),
        proposalNumber: details?.proposalId || "DRAFT",
        projectName: details?.proposalName || "Digital Display Systems",
        clientName: purchaserName,

        // Flags
        isLOI,
        masterTableIndex: masterTableIndex,
        showPricingTables: (rawTables.length > 0),
        showSpecifications: !!showSpecifications,
        showExhibitA: !!showExhibitA,
        showScopeOfWork: !!showScopeOfWork,
        showNotes: !!showNotes,
        showPaymentTerms: !!showPaymentTerms,
        showSignatureBlock: !!showSignatureBlock,
        hasGeneratedSchedule,

        // Content
        introText,
        customProposalNotes: details?.customProposalNotes || null,
        scopeOfWorkText: details?.scopeOfWorkText || null,

        // Config
        purchaserLegalName,
        purchaserAddress,

        // Data
        pricingTables: allPricingTables,
        masterTable,
        detailTables,
        screens,
        notes: noteLines,

        signatureFontFamily: details?.signature?.fontFamily || "Dancing Script",

        documentTotal: formatCurrency(docTotal, currency),
        currency,
    };
}
