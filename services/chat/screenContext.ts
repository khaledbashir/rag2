/**
 * Screen Context — Captures the current state of the proposal UI
 * so the copilot can see what the user sees.
 *
 * This runs CLIENT-SIDE only. It reads from react-hook-form state
 * via the FormFillContext (setValue/getValues). No API calls.
 */

import type { FormFillContext } from "./formFillBridge";
import type { PricingDocument, PricingTable } from "@/types/pricing";

// ============================================================================
// TYPES
// ============================================================================

export interface ScreenSection {
    index: number;
    name: string;
    lineItemCount: number;
    subtotal: number;
    hasAlternates: boolean;
}

export interface ScreenContext {
    // Where the user is
    currentStep: number; // 0=Ingestion, 1=Intelligence, 2=Math, 3=Export
    currentStepName: string;

    // Mode detection
    isMirrorMode: boolean;
    documentMode: "BUDGET" | "PROPOSAL" | "LOI" | "CONTRACT";
    calculationMode: "MIRROR" | "INTELLIGENCE";

    // Pricing tables from Excel (Mirror Mode)
    sections: ScreenSection[];
    grandTotal: number;
    currency: string;

    // Text fields (truncated to 200 chars)
    introText: string;
    paymentTerms: string;
    signatureText: string;
    additionalNotes: string;
    customProposalNotes: string;

    // Client info
    clientName: string;
    clientAddress: string;

    // Screen specs
    screenCount: number;

    // What's editable right now
    editableFields: string[];
    readOnlyReason: string;

    // Current values of all editable fields (for AI reference)
    fieldValues: Record<string, any>;
}

// ============================================================================
// STEP NAME MAPPING
// ============================================================================

const STEP_NAMES: Record<number, string> = {
    0: "Ingestion (Step 1 of 4)",
    1: "Intelligence (Step 2 of 4)",
    2: "Math (Step 3 of 4)",
    3: "Export (Step 4 of 4)",
};

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Pull the current screen state from react-hook-form.
 * Call this before every copilot message to give the AI full visibility.
 */
export function getScreenContext(
    ctx: FormFillContext,
    currentStep: number
): ScreenContext {
    const g = ctx.getValues;

    // Mode detection
    const mirrorMode = g("details.mirrorMode") === true;
    const documentMode = (g("details.documentMode") || "BUDGET") as "BUDGET" | "PROPOSAL" | "LOI" | "CONTRACT";
    const calculationMode = (g("details.calculationMode") || "INTELLIGENCE") as "MIRROR" | "INTELLIGENCE";

    // Pricing sections from PricingDocument (Mirror Mode)
    const pricingDoc = g("details.pricingDocument") as PricingDocument | undefined;
    const tables: PricingTable[] = pricingDoc?.tables || [];
    const sections: ScreenSection[] = tables.map((t, i) => ({
        index: i,
        name: t.name,
        lineItemCount: t.items.length,
        subtotal: t.subtotal,
        hasAlternates: (t.alternates?.length || 0) > 0,
    }));
    const grandTotal = pricingDoc?.documentTotal || 0;
    const currency = pricingDoc?.currency || g("details.currency") || "USD";

    // Text fields (truncated)
    const truncate = (val: any, max = 200): string => {
        const s = String(val || "");
        return s.length > max ? s.slice(0, max) + "..." : s;
    };

    const introText = truncate(g("details.additionalNotes"));
    const paymentTerms = truncate(g("details.paymentTerms"));
    const signatureText = truncate(g("details.signatureBlockText"));
    const additionalNotes = truncate(g("details.additionalNotes"));
    const customProposalNotes = truncate(g("details.customProposalNotes"));

    // Client info
    const clientName = g("receiver.name") || "";
    const clientAddress = [g("receiver.address"), g("receiver.city"), g("receiver.country")]
        .filter(Boolean)
        .join(", ");

    // Screen specs (Intelligence Mode screens)
    const screens = g("details.screens") || [];
    const screenCount = Array.isArray(screens) ? screens.length : 0;

    // Editable fields depend on mode + step
    const editableFields: string[] = [];
    const readOnlyFields: string[] = [];

    // Always editable
    editableFields.push("documentMode", "introductionText", "paymentTerms", "signatureBlockText", "additionalNotes", "customProposalNotes", "loiHeaderText");

    if (mirrorMode) {
        readOnlyFields.push("prices", "subtotals", "margins", "tax", "bond", "grandTotal", "lineItems");
        // Section header typo fixes ARE allowed
        editableFields.push("tableHeaderOverrides");
    } else {
        // Intelligence Mode — everything is editable
        editableFields.push("prices", "margins", "lineItems", "screens", "taxRateOverride", "bondRateOverride");
    }

    const readOnlyReason = mirrorMode
        ? "Mirror Mode — prices come from Excel and are read-only. To change pricing, update the Excel and re-upload."
        : "";

    // Collect current values of all key editable fields
    const fieldValues: Record<string, any> = {};
    const safeGet = (path: string) => { try { return g(path as any); } catch { return undefined; } };

    // Client / Receiver
    fieldValues.clientName = safeGet("receiver.name") || "";
    fieldValues.clientAddress = safeGet("receiver.address") || "";
    fieldValues.clientCity = safeGet("receiver.city") || "";
    fieldValues.clientCountry = safeGet("receiver.country") || "";
    fieldValues.clientZip = safeGet("receiver.zipCode") || "";
    fieldValues.clientEmail = safeGet("receiver.email") || "";
    fieldValues.clientPhone = safeGet("receiver.phone") || "";

    // Sender
    fieldValues.senderName = safeGet("sender.name") || "";
    fieldValues.senderAddress = safeGet("sender.address") || "";
    fieldValues.senderCity = safeGet("sender.city") || "";
    fieldValues.senderCountry = safeGet("sender.country") || "";
    fieldValues.senderEmail = safeGet("sender.email") || "";
    fieldValues.senderPhone = safeGet("sender.phone") || "";

    // Document settings
    fieldValues.proposalName = safeGet("details.proposalName") || "";
    fieldValues.location = safeGet("details.location") || "";
    fieldValues.currency = currency;
    fieldValues.language = safeGet("details.language") || "";
    fieldValues.proposalDate = safeGet("details.proposalDate") || "";
    fieldValues.dueDate = safeGet("details.dueDate") || "";
    fieldValues.purchaseOrderNumber = safeGet("details.purchaseOrderNumber") || "";
    fieldValues.documentMode = documentMode;

    // Text fields (full values for AI to see and modify)
    fieldValues.introductionText = truncate(safeGet("details.additionalNotes"), 500);
    fieldValues.paymentTerms = truncate(safeGet("details.paymentTerms"), 500);
    fieldValues.signatureBlockText = truncate(safeGet("details.signatureBlockText"), 500);
    fieldValues.additionalNotes = truncate(safeGet("details.additionalNotes"), 500);
    fieldValues.customProposalNotes = truncate(safeGet("details.customProposalNotes"), 500);
    fieldValues.loiHeaderText = truncate(safeGet("details.loiHeaderText"), 500);
    fieldValues.scopeOfWorkText = truncate(safeGet("details.scopeOfWorkText"), 500);
    fieldValues.specsSectionTitle = safeGet("details.specsSectionTitle") || "";

    // Rates
    fieldValues.taxRateOverride = safeGet("details.taxRateOverride");
    fieldValues.bondRateOverride = safeGet("details.bondRateOverride");
    fieldValues.insuranceRateOverride = safeGet("details.insuranceRateOverride");
    fieldValues.overheadRate = safeGet("details.overheadRate");
    fieldValues.profitRate = safeGet("details.profitRate");
    fieldValues.globalMargin = safeGet("details.globalMargin");

    // Signer
    fieldValues.signerName = safeGet("details.signerName") || "";
    fieldValues.signerTitle = safeGet("details.signerTitle") || "";

    // Venue
    fieldValues.venue = safeGet("details.venue") || "";

    // PDF toggles (booleans)
    fieldValues.showPricingTables = safeGet("details.showPricingTables");
    fieldValues.showIntroText = safeGet("details.showIntroText");
    fieldValues.showSpecifications = safeGet("details.showSpecifications");
    fieldValues.showPaymentTerms = safeGet("details.showPaymentTerms");
    fieldValues.showSignatureBlock = safeGet("details.showSignatureBlock");
    fieldValues.showNotes = safeGet("details.showNotes");
    fieldValues.showScopeOfWork = safeGet("details.showScopeOfWork");
    fieldValues.showCompanyFooter = safeGet("details.showCompanyFooter");
    fieldValues.showAssumptions = safeGet("details.showAssumptions");
    fieldValues.showExhibitA = safeGet("details.showExhibitA");
    fieldValues.showExhibitB = safeGet("details.showExhibitB");

    // Strip out empty/undefined values to keep payload small
    for (const key of Object.keys(fieldValues)) {
        if (fieldValues[key] === undefined || fieldValues[key] === "" || fieldValues[key] === null) {
            delete fieldValues[key];
        }
    }

    return {
        currentStep,
        currentStepName: STEP_NAMES[currentStep] || `Step ${currentStep}`,
        isMirrorMode: mirrorMode,
        documentMode,
        calculationMode,
        sections,
        grandTotal,
        currency,
        introText,
        paymentTerms,
        signatureText,
        additionalNotes,
        customProposalNotes,
        clientName,
        clientAddress,
        screenCount,
        editableFields,
        readOnlyReason,
        fieldValues,
    };
}

// ============================================================================
// FORMAT FOR SYSTEM PROMPT
// ============================================================================

/**
 * Format the screen context as a readable block for the AI system prompt.
 */
export function formatScreenContext(sc: ScreenContext): string {
    const lines: string[] = [];

    lines.push("== CURRENT SCREEN STATE ==");
    lines.push(`Step: ${sc.currentStepName}`);
    lines.push(`Mode: ${sc.isMirrorMode ? "Mirror Mode (Excel uploaded — prices are READ-ONLY)" : "Intelligence Mode (full editing)"}`);
    lines.push(`Document Type: ${sc.documentMode}`);
    lines.push(`Client: ${sc.clientName || "(not set)"}`);
    lines.push(`Currency: ${sc.currency}`);

    if (sc.sections.length > 0) {
        lines.push("");
        lines.push(`Pricing Sections (${sc.sections.length} total):`);
        for (const s of sc.sections) {
            const price = s.subtotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            const alt = s.hasAlternates ? " — has alternates" : "";
            lines.push(`  ${s.index + 1}. ${s.name} — ${s.lineItemCount} items — $${price}${alt}`);
        }
        const gt = sc.grandTotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        lines.push(`Grand Total: $${gt}`);
    } else if (sc.screenCount > 0) {
        lines.push(`\nScreens: ${sc.screenCount} display(s) configured`);
    } else {
        lines.push("\nNo pricing sections or screens configured yet.");
    }

    if (sc.introText) lines.push(`\nCurrent Intro Text: "${sc.introText}"`);
    if (sc.paymentTerms) lines.push(`Payment Terms: "${sc.paymentTerms}"`);
    if (sc.additionalNotes) lines.push(`Notes: "${sc.additionalNotes}"`);
    if (sc.customProposalNotes) lines.push(`Custom Notes: "${sc.customProposalNotes}"`);

    lines.push(`\nEditable right now: [${sc.editableFields.join(", ")}]`);
    if (sc.readOnlyReason) {
        lines.push(`NOT editable: ${sc.readOnlyReason}`);
    }

    return lines.join("\n");
}
