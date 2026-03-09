/**
 * Form Fill Bridge — Client-side functions that write copilot-parsed data
 * into the react-hook-form state via setValue.
 *
 * This runs in the browser. It receives a setValue function from useFormContext
 * and writes structured data into the proposal form fields.
 * Auto-save picks up changes automatically.
 */

import type { UseFormSetValue, UseFormGetValues } from "react-hook-form";
import type { StageAction } from "./proposalConversationFlow";
import { getProductByPitch, getProduct } from "@/services/rfp/productCatalog";

// ============================================================================
// TYPES
// ============================================================================

export interface FormFillContext {
    setValue: UseFormSetValue<any>;
    getValues: UseFormGetValues<any>;
}

// ============================================================================
// SCREEN SPEC NLP PARSER
// ============================================================================

export interface ParsedScreenSpec {
    name: string;
    widthFt: number;
    heightFt: number;
    pitchMm: number;
    quantity: number;
    productType?: string;
}

/**
 * Parse natural language screen specification into structured data.
 * Handles: "add concourse display 280 by 9 feet 4mm",
 *          "add 3 T4-B1 screens 8x8 ft 4mm indoor",
 *          "new screen PATH Hall 90ft wide 18ft tall 4mm nitxeon"
 */
export function parseScreenSpec(text: string): ParsedScreenSpec | null {
    const s = text.trim();

    // Extract quantity — "add 3 screens", "3x", etc.
    let quantity = 1;
    const qtyMatch = s.match(/\b(\d+)\s*(?:x\s+)?(?:screen|display|panel|unit)/i)
        || s.match(/\badd\s+(\d+)\b/i);
    if (qtyMatch) quantity = parseInt(qtyMatch[1], 10) || 1;

    // Extract pitch — "4mm", "2.5 mm", "10mm"
    let pitchMm = 0;
    const pitchMatch = s.match(/(\d+(?:\.\d+)?)\s*mm\b/i);
    if (pitchMatch) pitchMm = parseFloat(pitchMatch[1]);

    // Extract dimensions — various patterns
    let widthFt = 0, heightFt = 0;

    // "280 by 9 feet", "280x9 ft", "280 x 9ft"
    const dimByMatch = s.match(/(\d+(?:\.\d+)?)\s*(?:ft|feet|')?\s*(?:by|x|×)\s*(\d+(?:\.\d+)?)\s*(?:ft|feet|')?/i);
    if (dimByMatch) {
        widthFt = parseFloat(dimByMatch[1]);
        heightFt = parseFloat(dimByMatch[2]);
    }

    // "90ft wide 18ft tall", "90' wide 18' tall"
    if (!widthFt || !heightFt) {
        const wMatch = s.match(/(\d+(?:\.\d+)?)\s*(?:ft|feet|')\s*(?:wide|w\b)/i);
        const hMatch = s.match(/(\d+(?:\.\d+)?)\s*(?:ft|feet|')\s*(?:tall|high|h\b)/i);
        if (wMatch) widthFt = parseFloat(wMatch[1]);
        if (hMatch) heightFt = parseFloat(hMatch[1]);
    }

    // "W 90 H 18", "width 90 height 18" (feet assumed)
    if (!widthFt || !heightFt) {
        const whMatch = s.match(/(?:width|w)\s*[:=]?\s*(\d+(?:\.\d+)?)\s*.*?(?:height|h)\s*[:=]?\s*(\d+(?:\.\d+)?)/i);
        if (whMatch) {
            widthFt = parseFloat(whMatch[1]);
            heightFt = parseFloat(whMatch[2]);
        }
    }

    if (widthFt <= 0 || heightFt <= 0 || pitchMm <= 0) return null;

    // Match product from pitch
    let productType: string | undefined;
    const matchedProduct = getProductByPitch(pitchMm);
    if (matchedProduct) productType = matchedProduct.id;

    // Also check for explicit product name — "nitxeon", "mesh", "mip"
    const lower = s.toLowerCase();
    if (lower.includes("nitxeon") && !productType) productType = "4mm-nitxeon";
    if (lower.includes("mesh")) productType = "10mm-mesh";
    if (lower.includes("mip")) productType = "2.5mm-mip";

    // Extract display name — strip out dimensions, pitch, quantity, commands
    let name = s
        .replace(/\b(?:add|new|create|insert)\s+(?:a\s+)?(?:\d+\s+)?/i, "")
        .replace(/\b\d+(?:\.\d+)?\s*(?:ft|feet|')\s*(?:by|x|×)\s*\d+(?:\.\d+)?\s*(?:ft|feet|')?/gi, "")
        .replace(/\b\d+(?:\.\d+)?\s*(?:ft|feet|')\s*(?:wide|tall|high|w\b|h\b)/gi, "")
        .replace(/\b\d+(?:\.\d+)?\s*mm\b/gi, "")
        .replace(/\b(?:screen|display|panel|unit)s?\b/gi, "")
        .replace(/\b(?:indoor|outdoor)\b/gi, "")
        .replace(/\b(?:nitxeon|mesh|mip)\b/gi, "")
        .replace(/[,\-–—]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    if (!name || name.length < 2) name = "Display";

    return { name, widthFt, heightFt, pitchMm, quantity, productType };
}

// ============================================================================
// ACTION EXECUTOR
// ============================================================================

/**
 * Execute a list of stage actions against the form.
 * Returns a summary of what was changed.
 */
export function executeActions(
    ctx: FormFillContext,
    actions: StageAction[]
): string[] {
    const log: string[] = [];

    for (const action of actions) {
        switch (action.type) {
            case "fill_client_name":
                fillClientName(ctx, action.data.name);
                log.push(`Set client name: ${action.data.name}`);
                break;

            case "add_display":
                addDisplay(ctx, action.data);
                log.push(`Added display: ${action.data.widthM}m × ${action.data.heightM}m @ ${action.data.pitchMm}mm`);
                break;

            case "set_display_price":
                setDisplayPrice(ctx, action.data.index, action.data.price);
                log.push(`Set display ${action.data.index + 1} price: $${action.data.price.toLocaleString()}`);
                break;

            case "add_service":
                addServiceItem(ctx, action.data);
                log.push(`Added service: ${action.data.description} — $${action.data.price.toLocaleString()}`);
                break;

            case "set_tax":
                setTaxRate(ctx, action.data.rate);
                log.push(`Set tax rate: ${(action.data.rate * 100).toFixed(1)}%`);
                break;

            case "set_bond":
                setBondRate(ctx, action.data.rate);
                log.push(`Set bond rate: ${(action.data.rate * 100).toFixed(1)}%`);
                break;

            case "generate_pdf":
                setDocumentType(ctx, action.data.documentType);
                log.push(`Set document type: ${action.data.documentType}`);
                break;

            default:
                log.push(`Unknown action: ${(action as any).type}`);
        }
    }

    return log;
}

// ============================================================================
// INDIVIDUAL FILL FUNCTIONS
// ============================================================================

function fillClientName(ctx: FormFillContext, name: string) {
    ctx.setValue("receiver.name", name, { shouldDirty: true });
    // Also set proposalName if empty
    const currentName = ctx.getValues("details.proposalName");
    if (!currentName) {
        ctx.setValue("details.proposalName", name, { shouldDirty: true });
    }
}

function addDisplay(
    ctx: FormFillContext,
    data: { description: string; widthM: number; heightM: number; pitchMm: number; quantity: number }
) {
    const screens = ctx.getValues("details.screens") || [];

    // Convert meters to feet for the form (1m = 3.28084ft)
    const widthFt = data.widthM * 3.28084;
    const heightFt = data.heightM * 3.28084;

    // Add one screen entry per quantity
    for (let i = 0; i < data.quantity; i++) {
        const newScreen = {
            id: `copilot-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
            name: data.description || `Display ${screens.length + 1}`,
            externalName: "",
            group: "",
            pitchMm: data.pitchMm,
            widthFt: parseFloat(widthFt.toFixed(2)),
            heightFt: parseFloat(heightFt.toFixed(2)),
            quantity: 1,
            lineItems: [],
        };
        screens.push(newScreen);
    }

    ctx.setValue("details.screens", screens, { shouldDirty: true, shouldValidate: true });
}

function setDisplayPrice(ctx: FormFillContext, displayIndex: number, price: number) {
    const screens = ctx.getValues("details.screens") || [];
    if (displayIndex >= screens.length) return;

    // Set the LED panel cost as a line item
    const screen = screens[displayIndex];
    const existingItems = screen.lineItems || [];

    // Check if there's already an LED panel line item
    const ledIdx = existingItems.findIndex(
        (li: any) => li.category === "LED Panels" || li.category === "LED Display"
    );

    const lineItem = {
        category: "LED Panels",
        cost: price * 0.6,  // Estimate cost at 60% of sell
        margin: 0.4,
        price: price,
    };

    if (ledIdx >= 0) {
        existingItems[ledIdx] = lineItem;
    } else {
        existingItems.push(lineItem);
    }

    screens[displayIndex] = { ...screen, lineItems: [...existingItems] };
    ctx.setValue("details.screens", [...screens], { shouldDirty: true, shouldValidate: true });
}

function addServiceItem(
    ctx: FormFillContext,
    data: { description: string; price: number }
) {
    // Services go into quoteItems (the Sales Quotation Items in Step 3)
    const quoteItems = ctx.getValues("details.quoteItems") || [];

    quoteItems.push({
        id: `copilot-svc-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        location: data.description,
        price: data.price,
        description: data.description,
    });

    ctx.setValue("details.quoteItems", [...quoteItems], { shouldDirty: true });
}

function setTaxRate(ctx: FormFillContext, rate: number) {
    ctx.setValue("details.taxRateOverride", rate, { shouldDirty: true });
    // Also set in taxDetails for PDF generation
    ctx.setValue("details.taxDetails", {
        amount: rate * 100,
        amountType: "percentage",
        taxID: "",
    }, { shouldDirty: true });
}

function setBondRate(ctx: FormFillContext, rate: number) {
    ctx.setValue("details.bondRateOverride", rate, { shouldDirty: true });
}

function setDocumentType(ctx: FormFillContext, docType: "BUDGET" | "PROPOSAL" | "LOI" | "CONTRACT") {
    ctx.setValue("details.documentMode", docType, { shouldDirty: true });

    if (docType === "BUDGET") {
        ctx.setValue("details.documentType", "First Round", { shouldDirty: true });
        ctx.setValue("details.pricingType", "Budget", { shouldDirty: true });
    } else if (docType === "PROPOSAL") {
        ctx.setValue("details.documentType", "First Round", { shouldDirty: true });
        ctx.setValue("details.pricingType", "Hard Quoted", { shouldDirty: true });
    } else if (docType === "LOI" || docType === "CONTRACT") {
        ctx.setValue("details.documentType", "LOI", { shouldDirty: true });
        ctx.setValue("details.pricingType", "Hard Quoted", { shouldDirty: true });
    }
}

// ============================================================================
// SCREEN-AWARE ACTION EXECUTOR
// ============================================================================

export interface ScreenAction {
    action?: string;  // AnythingLLM path uses "action"
    type?: string;    // Kimi vision path uses "type"
    field?: string;
    value?: any;
    sectionIndex?: number;
    step?: number;
    reason?: string;  // Kimi sometimes includes reasoning
}

/**
 * Whitelist of form field paths the AI is allowed to write to via set_field.
 * Maps friendly names → react-hook-form paths.
 * If the AI sends a path that's already a valid form path, we check it against
 * the whitelist directly. If it sends a friendly name, we resolve it.
 */
const EDITABLE_FIELDS: Record<string, string> = {
    // Client / Receiver (full names + short aliases Kimi commonly sends)
    "clientName":           "receiver.name",
    "client_name":          "receiver.name",
    "client":               "receiver.name",
    "receiver.name":        "receiver.name",
    "clientAddress":        "receiver.address",
    "client_address":       "receiver.address",
    "address":              "receiver.address",
    "receiver.address":     "receiver.address",
    "clientCity":           "receiver.city",
    "client_city":          "receiver.city",
    "city":                 "receiver.city",
    "receiver.city":        "receiver.city",
    "clientState":          "receiver.state",
    "client_state":         "receiver.state",
    "state":                "receiver.state",
    "receiver.state":       "receiver.state",
    "clientCountry":        "receiver.country",
    "client_country":       "receiver.country",
    "country":              "receiver.country",
    "receiver.country":     "receiver.country",
    "clientZip":            "receiver.zipCode",
    "client_zip":           "receiver.zipCode",
    "zip":                  "receiver.zipCode",
    "zipCode":              "receiver.zipCode",
    "zip_code":             "receiver.zipCode",
    "receiver.zipCode":     "receiver.zipCode",
    "clientEmail":          "receiver.email",
    "client_email":         "receiver.email",
    "email":                "receiver.email",
    "receiver.email":       "receiver.email",
    "clientPhone":          "receiver.phone",
    "client_phone":         "receiver.phone",
    "phone":                "receiver.phone",
    "receiver.phone":       "receiver.phone",

    // Sender
    "senderName":           "sender.name",
    "sender.name":          "sender.name",
    "senderAddress":        "sender.address",
    "sender.address":       "sender.address",
    "senderCity":           "sender.city",
    "sender.city":          "sender.city",
    "senderCountry":        "sender.country",
    "sender.country":       "sender.country",
    "senderEmail":          "sender.email",
    "sender.email":         "sender.email",
    "senderPhone":          "sender.phone",
    "sender.phone":         "sender.phone",

    // Document settings
    "documentMode":                     "details.documentMode",
    "details.documentMode":             "details.documentMode",
    "proposalName":                     "details.proposalName",
    "details.proposalName":             "details.proposalName",
    "location":                         "details.location",
    "details.location":                 "details.location",
    "currency":                         "details.currency",
    "details.currency":                 "details.currency",
    "language":                         "details.language",
    "details.language":                 "details.language",
    "proposalDate":                     "details.proposalDate",
    "details.proposalDate":             "details.proposalDate",
    "dueDate":                          "details.dueDate",
    "details.dueDate":                  "details.dueDate",
    "purchaseOrderNumber":              "details.purchaseOrderNumber",
    "details.purchaseOrderNumber":      "details.purchaseOrderNumber",

    // Text fields
    "introductionText":                 "details.additionalNotes",
    "introText":                        "details.additionalNotes",
    "details.introductionText":         "details.additionalNotes",
    "paymentTerms":                     "details.paymentTerms",
    "details.paymentTerms":             "details.paymentTerms",
    "signatureBlockText":               "details.signatureBlockText",
    "signatureText":                    "details.signatureBlockText",
    "details.signatureBlockText":       "details.signatureBlockText",
    "additionalNotes":                  "details.additionalNotes",
    "notes":                            "details.additionalNotes",
    "details.additionalNotes":          "details.additionalNotes",
    "customProposalNotes":              "details.customProposalNotes",
    "details.customProposalNotes":      "details.customProposalNotes",
    "loiHeaderText":                    "details.loiHeaderText",
    "details.loiHeaderText":            "details.loiHeaderText",
    "scopeOfWorkText":                  "details.scopeOfWorkText",
    "details.scopeOfWorkText":          "details.scopeOfWorkText",
    "specsSectionTitle":                "details.specsSectionTitle",
    "details.specsSectionTitle":        "details.specsSectionTitle",

    // Rates & margins
    "taxRate":                          "details.taxRateOverride",
    "taxRateOverride":                  "details.taxRateOverride",
    "details.taxRateOverride":          "details.taxRateOverride",
    "bondRate":                         "details.bondRateOverride",
    "bondRateOverride":                 "details.bondRateOverride",
    "details.bondRateOverride":         "details.bondRateOverride",
    "insuranceRate":                    "details.insuranceRateOverride",
    "details.insuranceRateOverride":    "details.insuranceRateOverride",
    "overheadRate":                     "details.overheadRate",
    "details.overheadRate":             "details.overheadRate",
    "profitRate":                       "details.profitRate",
    "details.profitRate":               "details.profitRate",
    "globalMargin":                     "details.globalMargin",
    "details.globalMargin":             "details.globalMargin",

    // Signer
    "signerName":                       "details.signerName",
    "details.signerName":               "details.signerName",
    "signerTitle":                      "details.signerTitle",
    "details.signerTitle":              "details.signerTitle",

    // PDF section toggles
    "showPricingTables":                "details.showPricingTables",
    "details.showPricingTables":        "details.showPricingTables",
    "showIntroText":                    "details.showIntroText",
    "details.showIntroText":            "details.showIntroText",
    "showSpecifications":               "details.showSpecifications",
    "details.showSpecifications":       "details.showSpecifications",
    "showPaymentTerms":                 "details.showPaymentTerms",
    "details.showPaymentTerms":         "details.showPaymentTerms",
    "showSignatureBlock":               "details.showSignatureBlock",
    "details.showSignatureBlock":       "details.showSignatureBlock",
    "showNotes":                        "details.showNotes",
    "details.showNotes":                "details.showNotes",
    "showScopeOfWork":                  "details.showScopeOfWork",
    "details.showScopeOfWork":          "details.showScopeOfWork",
    "showCompanyFooter":                "details.showCompanyFooter",
    "details.showCompanyFooter":        "details.showCompanyFooter",
    "showAssumptions":                  "details.showAssumptions",
    "details.showAssumptions":          "details.showAssumptions",
    "showExhibitA":                     "details.showExhibitA",
    "details.showExhibitA":             "details.showExhibitA",
    "showExhibitB":                     "details.showExhibitB",
    "details.showExhibitB":             "details.showExhibitB",
    "showBaseBidTable":                 "details.showBaseBidTable",
    "details.showBaseBidTable":         "details.showBaseBidTable",
    "includePricingBreakdown":          "details.includePricingBreakdown",
    "details.includePricingBreakdown":  "details.includePricingBreakdown",

    // Venue
    "venue":                            "details.venue",
    "details.venue":                    "details.venue",
};

/**
 * Resolve a field name (friendly or form path) to a whitelisted form path.
 * Returns null if not allowed.
 */
function resolveFieldPath(field: string): string | null {
    // Try exact match first, then lowercase (Kimi may send "City" or "city")
    return EDITABLE_FIELDS[field] || EDITABLE_FIELDS[field.toLowerCase()] || null;
}

/**
 * Execute screen-aware actions returned by the LLM.
 * These modify form state directly based on what the user asked the copilot to do.
 * Returns a log of what was changed + any special flags (e.g. downloadPdf, navigateStep).
 */
export function executeScreenActions(
    ctx: FormFillContext,
    screenActions: ScreenAction[]
): { log: string[]; downloadPdf?: boolean; navigateStep?: number } {
    const log: string[] = [];
    let downloadPdf = false;
    let navigateStep: number | undefined;

    for (const sa of screenActions) {
        // Normalize: Kimi sends "type", AnythingLLM sends "action" — accept both
        const actionType = sa.action || sa.type || "";

        switch (actionType) {
            // ---- GENERIC FIELD SETTER (the big one) ----
            case "set_field": {
                if (!sa.field) {
                    log.push("set_field: missing field name");
                    break;
                }
                const formPath = resolveFieldPath(sa.field);
                if (!formPath) {
                    log.push(`set_field: "${sa.field}" is not an editable field`);
                    break;
                }
                if (sa.value === undefined || sa.value === null) {
                    log.push(`set_field: no value provided for "${sa.field}"`);
                    break;
                }
                ctx.setValue(formPath as any, sa.value, { shouldDirty: true });
                log.push(`Set ${sa.field} → ${typeof sa.value === "string" ? `"${sa.value.slice(0, 80)}"` : sa.value}`);
                break;
            }

            case "set_document_mode": {
                const mode = String(sa.value).toUpperCase() as "BUDGET" | "PROPOSAL" | "LOI" | "CONTRACT";
                if (["BUDGET", "PROPOSAL", "LOI", "CONTRACT"].includes(mode)) {
                    setDocumentType(ctx, mode);
                    log.push(`Switched document type to ${mode}`);
                }
                break;
            }

            case "set_intro_text": {
                if (typeof sa.value === "string") {
                    ctx.setValue("details.additionalNotes", sa.value, { shouldDirty: true });
                    log.push("Updated intro text");
                }
                break;
            }

            case "append_intro_text":
            case "append_text": {
                // Generic append — works for any text field
                if (typeof sa.value === "string") {
                    const appendField = sa.field ? resolveFieldPath(sa.field) : "details.additionalNotes";
                    if (appendField) {
                        const current = ctx.getValues(appendField as any) || "";
                        const separator = current ? "\n" : "";
                        ctx.setValue(appendField as any, current + separator + sa.value, { shouldDirty: true });
                        log.push(`Appended to ${sa.field || "additionalNotes"}`);
                    }
                }
                break;
            }

            case "set_payment_terms": {
                if (typeof sa.value === "string") {
                    ctx.setValue("details.paymentTerms", sa.value, { shouldDirty: true });
                    log.push("Updated payment terms");
                }
                break;
            }

            case "set_notes": {
                if (typeof sa.value === "string") {
                    ctx.setValue("details.additionalNotes", sa.value, { shouldDirty: true });
                    log.push("Updated notes");
                }
                break;
            }

            case "set_signature_text": {
                if (typeof sa.value === "string") {
                    ctx.setValue("details.signatureBlockText", sa.value, { shouldDirty: true });
                    log.push("Updated signature block text");
                }
                break;
            }

            case "fix_section_header": {
                const idx = sa.sectionIndex ?? (typeof sa.value === "object" ? undefined : undefined);
                if (typeof idx === "number" && typeof sa.value === "string") {
                    const overrides = ctx.getValues("details.tableHeaderOverrides") || {};
                    const key = String(idx);
                    overrides[key] = sa.value;
                    ctx.setValue("details.tableHeaderOverrides", { ...overrides }, { shouldDirty: true });
                    log.push(`Fixed section ${idx + 1} header → "${sa.value}"`);
                }
                break;
            }

            case "add_screen": {
                // Value is either a raw text string (NLP parse) or structured screen data
                const rawSpec = typeof sa.value === "string" ? sa.value : null;
                const structured = typeof sa.value === "object" && sa.value ? sa.value : null;

                let spec: ParsedScreenSpec | null = null;
                if (rawSpec) {
                    spec = parseScreenSpec(rawSpec);
                } else if (structured) {
                    spec = {
                        name: structured.name || structured.externalName || "Display",
                        widthFt: Number(structured.widthFt || structured.width || 0),
                        heightFt: Number(structured.heightFt || structured.height || 0),
                        pitchMm: Number(structured.pitchMm || structured.pitch || 0),
                        quantity: Number(structured.quantity || 1),
                        productType: structured.productType,
                    };
                }

                if (!spec || spec.widthFt <= 0 || spec.heightFt <= 0 || spec.pitchMm <= 0) {
                    log.push("add_screen: could not parse screen specs — need width, height (ft), and pitch (mm)");
                    break;
                }

                if (!spec.productType) {
                    const match = getProductByPitch(spec.pitchMm);
                    if (match) spec.productType = match.id;
                }

                const currentScreens: any[] = ctx.getValues("details.screens") || [];
                const newScreen = {
                    externalName: spec.name,
                    name: "",
                    widthFt: spec.widthFt,
                    heightFt: spec.heightFt,
                    pitchMm: spec.pitchMm,
                    quantity: spec.quantity,
                    productType: spec.productType || "",
                    zoneComplexity: "standard",
                    zoneSize: "auto",
                    isReplacement: false,
                    useExistingStructure: false,
                    includeSpareParts: false,
                    isManualLineItem: false,
                };
                ctx.setValue("details.screens" as any, [...currentScreens, newScreen], { shouldDirty: true });
                log.push(`Added screen "${spec.name}" (${spec.widthFt}' × ${spec.heightFt}', ${spec.pitchMm}mm, qty ${spec.quantity})`);
                break;
            }

            case "list_screens": {
                const screens: any[] = ctx.getValues("details.screens") || [];
                if (screens.length === 0) {
                    log.push("No screens configured yet.");
                } else {
                    const summary = screens.map((s: any, i: number) => {
                        const name = s.externalName || s.name || `Screen ${i + 1}`;
                        const w = s.widthFt || 0;
                        const h = s.heightFt || 0;
                        const p = s.pitchMm || 0;
                        return `${i + 1}. ${name} — ${w}' × ${h}', ${p}mm, qty ${s.quantity || 1}`;
                    }).join("\n");
                    log.push(`Current screens:\n${summary}`);
                }
                break;
            }

            case "remove_screen": {
                const screens: any[] = ctx.getValues("details.screens") || [];
                if (screens.length === 0) {
                    log.push("No screens to remove.");
                    break;
                }

                let removeIdx = -1;
                // By index — "remove screen 3" → value is 3 (1-based)
                if (typeof sa.value === "number") {
                    removeIdx = sa.value - 1; // convert to 0-based
                }
                // By name — "remove the elevator screen"
                if (typeof sa.value === "string") {
                    const target = sa.value.toLowerCase().trim();
                    // Try exact index first — "3", "screen 3"
                    const indexMatch = target.match(/^(?:screen\s*)?(\d+)$/);
                    if (indexMatch) {
                        removeIdx = parseInt(indexMatch[1], 10) - 1;
                    } else {
                        // Fuzzy name match
                        removeIdx = screens.findIndex((s: any) => {
                            const name = ((s.externalName || s.name || "").toString()).toLowerCase();
                            return name.includes(target) || target.includes(name);
                        });
                    }
                }

                if (removeIdx < 0 || removeIdx >= screens.length) {
                    log.push(`remove_screen: could not find screen matching "${sa.value}"`);
                    break;
                }

                const removed = screens[removeIdx];
                const removedName = removed.externalName || removed.name || `Screen ${removeIdx + 1}`;
                const updated = screens.filter((_: any, i: number) => i !== removeIdx);
                ctx.setValue("details.screens" as any, updated, { shouldDirty: true });
                log.push(`Removed screen "${removedName}"`);
                break;
            }

            case "download_pdf": {
                downloadPdf = true;
                log.push("Triggering PDF download");
                break;
            }

            case "navigate_step": {
                // Kimi sends value, AnythingLLM sends step — accept both
                const stepNum = sa.step ?? (typeof sa.value === "number" ? sa.value : undefined);
                if (typeof stepNum === "number" && stepNum >= 0 && stepNum <= 3) {
                    navigateStep = stepNum;
                    log.push(`Navigating to step ${stepNum + 1}`);
                }
                break;
            }

            default:
                if (actionType) log.push(`Unknown screen action: ${actionType}`);
        }
    }

    return { log, downloadPdf, navigateStep };
}
