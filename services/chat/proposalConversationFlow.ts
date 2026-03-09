/**
 * Proposal Conversation Flow — State Machine
 * 
 * Guides the estimator through building a proposal conversationally.
 * Each stage has a question, expected input type, and parser.
 */

// ============================================================================
// TYPES
// ============================================================================

export enum ConversationStage {
    GREETING = "GREETING",
    CLIENT_NAME = "CLIENT_NAME",
    DISPLAYS = "DISPLAYS",
    DISPLAY_PRICING = "DISPLAY_PRICING",
    SERVICES = "SERVICES",
    PM_WARRANTY = "PM_WARRANTY",
    TAX_BOND = "TAX_BOND",
    REVIEW = "REVIEW",
    GENERATE = "GENERATE",
    DONE = "DONE",
}

export interface ParsedDisplay {
    description: string;
    widthM: number;
    heightM: number;
    pitchMm: number;
    quantity: number;
}

export interface ParsedServiceItem {
    description: string;
    price: number;
}

export interface CollectedData {
    clientName?: string;
    displays: ParsedDisplay[];
    displayPrices: number[];  // parallel to displays array
    services: ParsedServiceItem[];
    taxRate?: number;
    bondRate?: number;
    documentType?: "BUDGET" | "PROPOSAL" | "LOI" | "CONTRACT";
    /** Tracks consecutive parse failures per stage for escalating help */
    retryCount?: number;
}

export interface ConversationState {
    stage: ConversationStage;
    collected: CollectedData;
}

export interface StageAction {
    type:
        | "fill_client_name"
        | "add_display"
        | "set_display_price"
        | "add_service"
        | "update_service"
        | "remove_service"
        | "set_tax"
        | "set_bond"
        | "generate_pdf"
        | "reset";
    data: any;
}

export interface StageResult {
    reply: string;
    actions: StageAction[];
    nextStage: ConversationStage;
    collected: CollectedData;
    summary?: {
        displayCount: number;
        subtotal: number;
        tax: number;
        grandTotal: number;
    };
}

// ============================================================================
// PARSERS
// ============================================================================

/** Extract dollar amounts from text — handles many formats:
 *  "$213,690" → 213690
 *  "200k" or "200K" → 200000
 *  "1.5M" or "1.5 million" → 1500000
 *  "trillion dollars" → (rejected, too vague)
 *  "200000" (bare number) → 200000
 */
export function parseDollarAmounts(text: string): number[] {
    const results: number[] = [];

    // Pattern 1: $-prefixed amounts — "$213,690" or "$1.5M"
    const dollarMatches = text.match(/\$[\d,]+(?:\.\d+)?\s*[kKmMbB]?/g) || [];
    for (const m of dollarMatches) {
        const val = parseAmountWithSuffix(m.replace(/[$,]/g, ""));
        if (val && val > 0) results.push(val);
    }

    // Pattern 2: Number + word multiplier — "200 thousand", "1.5 million"
    const wordPattern = /([\d,.]+)\s*(thousand|million|billion|mil|k|m|b)\b/gi;
    let wm;
    while ((wm = wordPattern.exec(text)) !== null) {
        const val = parseAmountWithSuffix(wm[1].replace(/,/g, "") + wm[2][0]);
        if (val && val > 0 && !results.includes(val)) results.push(val);
    }

    // Pattern 3: Bare large numbers (no $ sign) — "200000" or "213,690"
    if (results.length === 0) {
        const bareMatches = text.match(/\b[\d,]{4,}(?:\.\d{1,2})?\b/g) || [];
        for (const m of bareMatches) {
            const val = parseFloat(m.replace(/,/g, ""));
            if (Number.isFinite(val) && val >= 100) results.push(val);
        }
    }

    return results;
}

function parseAmountWithSuffix(s: string): number | null {
    const cleaned = s.trim().toLowerCase();
    const multipliers: Record<string, number> = { k: 1_000, m: 1_000_000, b: 1_000_000_000 };
    const lastChar = cleaned[cleaned.length - 1];
    if (multipliers[lastChar]) {
        const num = parseFloat(cleaned.slice(0, -1));
        return Number.isFinite(num) ? num * multipliers[lastChar] : null;
    }
    const num = parseFloat(cleaned);
    return Number.isFinite(num) ? num : null;
}

/** Extract percentage: "13% HST" → 0.13 */
export function parsePercentage(text: string): number | null {
    const match = text.match(/([\d.]+)\s*%/);
    if (!match) return null;
    const val = parseFloat(match[1]);
    return Number.isFinite(val) ? val / 100 : null;
}

/** Parse display descriptions from natural language */
export function parseDisplays(text: string): ParsedDisplay[] {
    const displays: ParsedDisplay[] = [];

    // Split on "and", ";", "+", or newlines for multiple displays
    const segments = text.split(/\band\b|[;+\n]/i).map((s) => s.trim()).filter(Boolean);

    for (const seg of segments) {
        // Extract quantity
        let quantity = 1;
        const qtyMatch = seg.match(/^(\d+)\s*x?\s/i) || seg.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten)\b/i);
        if (qtyMatch) {
            const wordMap: Record<string, number> = {
                one: 1, two: 2, three: 3, four: 4, five: 5,
                six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
            };
            quantity = wordMap[qtyMatch[1].toLowerCase()] || parseInt(qtyMatch[1]) || 1;
        }

        // Extract dimensions — supports many formats:
        // "4.05m x 10.20m", "4m x 8m", "4x8m", "4 x 8", "13.3ft x 33.5ft"
        // "4.05 x 10.20", "4.05mx10.20m", "13'4" x 33'6""
        const dimMatch =
            seg.match(/([\d.]+)\s*(?:m|ft|'|feet|meter|meters)?\s*[x×by]\s*([\d.]+)\s*(?:m|ft|'|feet|meter|meters)?/i);
        if (!dimMatch) continue; // Skip if no dimensions found

        let dim1 = parseFloat(dimMatch[1]);
        let dim2 = parseFloat(dimMatch[2]);

        // If units are feet, convert to meters
        const isFeet = /ft|feet|'/i.test(seg);
        if (isFeet) {
            dim1 = dim1 * 0.3048;
            dim2 = dim2 * 0.3048;
        }

        // Convention: smaller = height, larger = width (landscape)
        const widthM = Math.max(dim1, dim2);
        const heightM = Math.min(dim1, dim2);

        // Extract pitch: "2.5mm" or "2.5 mm pitch" or "P2.5"
        const pitchMatch = seg.match(/([\d.]+)\s*mm/i) || seg.match(/p\s*([\d.]+)/i);
        const pitchMm = pitchMatch ? parseFloat(pitchMatch[1]) : 0;

        // Build description
        const desc = seg
            .replace(/^\d+\s*x?\s*/i, "")
            .replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten)\b\s*/i, "")
            .trim() || `LED Display ${widthM.toFixed(2)}m x ${heightM.toFixed(2)}m`;

        displays.push({
            description: desc,
            widthM: parseFloat(widthM.toFixed(2)),
            heightM: parseFloat(heightM.toFixed(2)),
            pitchMm,
            quantity,
        });
    }

    return displays;
}

/** Parse service items: "Installation $115,185, PM $12,500" */
export function parseServiceItems(text: string): ParsedServiceItem[] {
    const items: ParsedServiceItem[] = [];

    // Split on commas, semicolons, newlines, or "and"
    const segments = text.split(/[,;\n]|\band\b/i).map((s) => s.trim()).filter(Boolean);

    for (const seg of segments) {
        const amounts = parseDollarAmounts(seg);
        if (amounts.length === 0) continue;

        // Description is everything before the dollar sign
        const descMatch = seg.match(/^(.*?)\s*\$/);
        const description = descMatch ? descMatch[1].trim() : seg.replace(/\$[\d,.]+/, "").trim();

        items.push({
            description: description || "Service Item",
            price: amounts[0],
        });
    }

    return items;
}

// ============================================================================
// STAGE PROMPTS
// ============================================================================

const STAGE_PROMPTS: Record<ConversationStage, string> = {
    [ConversationStage.GREETING]:
        "Hey! Let's build this proposal. What client is this for?",
    [ConversationStage.CLIENT_NAME]:
        "What client is this proposal for?",
    [ConversationStage.DISPLAYS]:
        "Nice. What displays are we quoting? Give me dimensions and pitch — like \"4m x 10m, 2.5mm pitch\". I can handle multiple.",
    [ConversationStage.DISPLAY_PRICING]:
        "", // Dynamic — depends on display count
    [ConversationStage.SERVICES]:
        "Now the services — installation, structural, electrical, rigging, etc. Just list them with prices, like \"Structural $114k, Labor $183k\".",
    [ConversationStage.PM_WARRANTY]:
        "Any PM, engineering, or warranty costs? Same format works. Or say \"skip\" if there aren't any.",
    [ConversationStage.TAX_BOND]:
        "Last thing — tax and bond rates? Like \"13% HST\" or \"8.25% tax, 2% bond\". Say \"skip\" if none.",
    [ConversationStage.REVIEW]:
        "", // Dynamic — shows summary
    [ConversationStage.GENERATE]:
        "What are we generating — budget estimate, formal proposal, or LOI?",
    [ConversationStage.DONE]:
        "Done! Your PDF is being generated now.",
};

export function getStagePrompt(stage: ConversationStage, collected: CollectedData): string {
    if (stage === ConversationStage.DISPLAY_PRICING) {
        const count = collected.displays.length;
        if (count === 1) {
            const d = collected.displays[0];
            return `Got it — ${d.widthM}m × ${d.heightM}m display added. What's the sell price? You can say $200k, $200,000, or just 200000.`;
        }
        return `${count} displays locked in. What's the pricing? You can say "$213k each" or list them individually.`;
    }

    if (stage === ConversationStage.REVIEW) {
        return buildReviewSummary(collected);
    }

    return STAGE_PROMPTS[stage] || "";
}

function buildReviewSummary(collected: CollectedData): string {
    const displayTotal = collected.displayPrices.reduce((sum, p) => sum + p, 0);
    const serviceTotal = collected.services.reduce((sum, s) => sum + s.price, 0);
    const subtotal = displayTotal + serviceTotal;
    const taxAmt = subtotal * (collected.taxRate || 0);
    const bondAmt = subtotal * (collected.bondRate || 0);
    const grandTotal = subtotal + taxAmt + bondAmt;

    const fmt = (n: number) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    let summary = `Here's your summary:\n`;
    summary += `• Client: ${collected.clientName || "—"}\n`;
    summary += `• ${collected.displays.length} display(s)\n`;
    summary += `• ${collected.services.length} service item(s)\n`;
    summary += `• Subtotal: ${fmt(subtotal)}\n`;
    if (collected.taxRate) summary += `• Tax (${(collected.taxRate * 100).toFixed(1)}%): ${fmt(taxAmt)}\n`;
    if (collected.bondRate) summary += `• Bond (${(collected.bondRate * 100).toFixed(1)}%): ${fmt(bondAmt)}\n`;
    summary += `• Grand Total: ${fmt(grandTotal)}\n\n`;
    summary += `Ready to generate? Say "budget estimate", "proposal", or "LOI".`;

    return summary;
}

// ============================================================================
// STAGE PROCESSOR
// ============================================================================

// ============================================================================
// NAVIGATION & FRUSTRATION DETECTION
// ============================================================================

const STAGE_ORDER: ConversationStage[] = [
    ConversationStage.CLIENT_NAME,
    ConversationStage.DISPLAYS,
    ConversationStage.DISPLAY_PRICING,
    ConversationStage.SERVICES,
    ConversationStage.PM_WARRANTY,
    ConversationStage.TAX_BOND,
    ConversationStage.REVIEW,
];

function getPreviousStage(current: ConversationStage): ConversationStage {
    const idx = STAGE_ORDER.indexOf(current);
    return idx > 0 ? STAGE_ORDER[idx - 1] : ConversationStage.CLIENT_NAME;
}

function getNextStage(current: ConversationStage): ConversationStage {
    const idx = STAGE_ORDER.indexOf(current);
    return idx < STAGE_ORDER.length - 1 ? STAGE_ORDER[idx + 1] : ConversationStage.REVIEW;
}

function isNavCommand(text: string): { type: "back" | "skip" | "restart" } | null {
    const t = text.toLowerCase().trim();
    if (/^(go\s*back|back|undo|redo|previous|prev)$/i.test(t)) return { type: "back" };
    if (/^(skip|next|move on|continue|pass|n\/a|none)$/i.test(t)) return { type: "skip" };
    if (/^(start\s*over|restart|reset|begin\s*again)$/i.test(t)) return { type: "restart" };
    return null;
}

function isFrustrated(text: string): boolean {
    return /listen to me|are you even|wtf|what the|this is broken|stupid|doesn'?t work|not working|help me|can you hear/i.test(text);
}

function retryMessage(stage: ConversationStage, retryCount: number, collected: CollectedData): string {
    if (retryCount <= 1) {
        // First fail — casual nudge
        switch (stage) {
            case ConversationStage.DISPLAYS:
                return "I need dimensions — something like 4m x 8m. Just width × height and I'll handle the rest.";
            case ConversationStage.DISPLAY_PRICING:
                return "Just need a number — $200k, $200,000, or even just 200000 works.";
            case ConversationStage.SERVICES:
                return "Give me a service name and price — like \"Installation $115k\". I'll add it.";
            case ConversationStage.TAX_BOND:
                return "Just the percentage — like 13% or 8.25%.";
            default:
                return "Didn't quite get that — try again?";
        }
    } else if (retryCount === 2) {
        // Second fail — more detail + escape routes
        switch (stage) {
            case ConversationStage.DISPLAYS:
                return "Here's what works:\n\n" +
                    "• \"4m x 8m\" — just two numbers with an x\n" +
                    "• \"One LED wall, 4.05m x 10.20m, 2.5mm pitch\"\n" +
                    "• \"13ft x 33ft\" — feet work too\n\n" +
                    "Or say \"skip\" to move on, \"go back\" to change the client name.";
            case ConversationStage.DISPLAY_PRICING:
                return "Any of these work:\n\n" +
                    "• \"$213k each\" — same price for all\n" +
                    "• \"$213,690, $41,948\" — one per display\n" +
                    "• \"200000\" — bare number is fine\n\n" +
                    "Or \"skip\" to set prices later.";
            case ConversationStage.SERVICES:
                return "Try something like:\n\n" +
                    "• \"Installation $115k, Structural $114k\"\n" +
                    "• \"Labor 183000, Electrical 249000\"\n\n" +
                    "Or \"skip\" to move on.";
            default:
                return "Not sure what that means. Say \"skip\" to move on or \"go back\".";
        }
    } else {
        // Third+ fail — full escape menu
        return "Let's try a different approach:\n\n" +
            "• \"skip\" — move to the next step\n" +
            "• \"go back\" — redo the previous step\n" +
            "• \"start over\" — fresh start\n\n" +
            "You can always fill in the form directly too — I won't be offended.";
    }
}

// ============================================================================
// STAGE PROCESSOR
// ============================================================================

export function processStage(
    stage: ConversationStage,
    message: string,
    collected: CollectedData
): StageResult {
    const text = message.trim();
    const actions: StageAction[] = [];
    let nextStage = stage;
    let reply = "";

    // --- Global navigation commands (work at any stage) ---
    const nav = isNavCommand(text);
    if (nav) {
        collected.retryCount = 0;
        if (nav.type === "back") {
            nextStage = getPreviousStage(stage);
            reply = `OK, going back. ${getStagePrompt(nextStage, collected)}`;
            return { reply, actions, nextStage, collected };
        }
        if (nav.type === "skip") {
            nextStage = getNextStage(stage);
            reply = `Skipped. ${getStagePrompt(nextStage, collected)}`;
            return { reply, actions, nextStage, collected };
        }
        if (nav.type === "restart") {
            const fresh = createInitialState().collected;
            reply = "Starting over. " + getStagePrompt(ConversationStage.CLIENT_NAME, fresh);
            return { reply, actions, nextStage: ConversationStage.CLIENT_NAME, collected: fresh };
        }
    }

    // --- Frustration detection ---
    if (isFrustrated(text)) {
        collected.retryCount = 0;
        reply = "Sorry about that — I know it's frustrating. Let me be clearer.\n\n";
        reply += "Right now I need: ";
        switch (stage) {
            case ConversationStage.DISPLAYS:
                reply += "display dimensions, like \"4m x 8m\".";
                break;
            case ConversationStage.DISPLAY_PRICING:
                reply += "a dollar amount for each display, like \"$200,000\".";
                break;
            case ConversationStage.SERVICES:
                reply += "service items with prices, like \"Installation $115,000\".";
                break;
            default:
                reply += getStagePrompt(stage, collected);
        }
        reply += "\n\nOr say \"skip\" to move on, \"go back\" to redo the last step.";
        return { reply, actions, nextStage: stage, collected };
    }

    switch (stage) {
        case ConversationStage.GREETING:
        case ConversationStage.CLIENT_NAME: {
            collected.retryCount = 0;
            // Any non-empty text is the client name
            const clientName = text.replace(/^(it's|its|for)\s+/i, "").trim();
            collected.clientName = clientName;
            actions.push({ type: "fill_client_name", data: { name: clientName } });
            reply = `Got it — ${clientName}. ${getStagePrompt(ConversationStage.DISPLAYS, collected)}`;
            nextStage = ConversationStage.DISPLAYS;
            break;
        }

        case ConversationStage.DISPLAYS: {
            const displays = parseDisplays(text);
            if (displays.length === 0) {
                collected.retryCount = (collected.retryCount || 0) + 1;
                reply = retryMessage(stage, collected.retryCount, collected);
                break;
            }
            collected.retryCount = 0;
            collected.displays.push(...displays);
            for (const d of displays) {
                actions.push({ type: "add_display", data: d });
            }
            reply = getStagePrompt(ConversationStage.DISPLAY_PRICING, collected);
            nextStage = ConversationStage.DISPLAY_PRICING;
            break;
        }

        case ConversationStage.DISPLAY_PRICING: {
            const prices = parseDollarAmounts(text);
            if (prices.length === 0) {
                collected.retryCount = (collected.retryCount || 0) + 1;
                reply = retryMessage(stage, collected.retryCount, collected);
                break;
            }
            collected.retryCount = 0;

            // If "each" is mentioned and only one price, apply to all
            if (prices.length === 1 && /each|all|per/i.test(text)) {
                for (let i = 0; i < collected.displays.length; i++) {
                    collected.displayPrices[i] = prices[0];
                    actions.push({ type: "set_display_price", data: { index: i, price: prices[0] } });
                }
            } else {
                // Map prices to displays in order
                for (let i = 0; i < Math.min(prices.length, collected.displays.length); i++) {
                    collected.displayPrices[i] = prices[i];
                    actions.push({ type: "set_display_price", data: { index: i, price: prices[i] } });
                }
            }

            reply = `Prices set. ${getStagePrompt(ConversationStage.SERVICES, collected)}`;
            nextStage = ConversationStage.SERVICES;
            break;
        }

        case ConversationStage.SERVICES: {
            // Allow skipping
            if (/^(skip|none|no|n\/a)$/i.test(text.trim())) {
                collected.retryCount = 0;
                reply = `Skipped. ${getStagePrompt(ConversationStage.PM_WARRANTY, collected)}`;
                nextStage = ConversationStage.PM_WARRANTY;
                break;
            }
            const services = parseServiceItems(text);
            if (services.length === 0) {
                collected.retryCount = (collected.retryCount || 0) + 1;
                reply = retryMessage(stage, collected.retryCount, collected);
                break;
            }
            collected.retryCount = 0;
            collected.services.push(...services);
            for (const s of services) {
                actions.push({ type: "add_service", data: s });
            }
            reply = `${services.length} service item(s) added. ${getStagePrompt(ConversationStage.PM_WARRANTY, collected)}`;
            nextStage = ConversationStage.PM_WARRANTY;
            break;
        }

        case ConversationStage.PM_WARRANTY: {
            // Allow skipping
            if (/^(skip|none|no|n\/a)$/i.test(text.trim())) {
                collected.retryCount = 0;
                reply = getStagePrompt(ConversationStage.TAX_BOND, collected);
                nextStage = ConversationStage.TAX_BOND;
                break;
            }
            const services = parseServiceItems(text);
            if (services.length === 0) {
                collected.retryCount = (collected.retryCount || 0) + 1;
                reply = retryMessage(stage, collected.retryCount, collected);
                break;
            }
            collected.retryCount = 0;
            collected.services.push(...services);
            for (const s of services) {
                actions.push({ type: "add_service", data: s });
            }
            reply = `Added. ${getStagePrompt(ConversationStage.TAX_BOND, collected)}`;
            nextStage = ConversationStage.TAX_BOND;
            break;
        }

        case ConversationStage.TAX_BOND: {
            // Allow skipping
            if (/^(skip|none|no|n\/a|0|0%)$/i.test(text.trim())) {
                collected.retryCount = 0;
                nextStage = ConversationStage.REVIEW;
                reply = getStagePrompt(ConversationStage.REVIEW, collected);
                break;
            }
            const pct = parsePercentage(text);
            if (pct === null) {
                collected.retryCount = (collected.retryCount || 0) + 1;
                reply = retryMessage(stage, collected.retryCount, collected);
                break;
            }
            collected.retryCount = 0;

            // Check if there's a bond rate too
            const allPcts = text.match(/([\d.]+)\s*%/g) || [];
            if (allPcts.length >= 2) {
                const vals = allPcts.map((m) => parseFloat(m) / 100);
                collected.taxRate = vals[0];
                collected.bondRate = vals[1];
                actions.push({ type: "set_tax", data: { rate: vals[0] } });
                actions.push({ type: "set_bond", data: { rate: vals[1] } });
            } else {
                // Determine if it's tax or bond based on keywords
                if (/bond|performance/i.test(text)) {
                    collected.bondRate = pct;
                    actions.push({ type: "set_bond", data: { rate: pct } });
                } else {
                    collected.taxRate = pct;
                    actions.push({ type: "set_tax", data: { rate: pct } });
                }
            }

            nextStage = ConversationStage.REVIEW;
            reply = getStagePrompt(ConversationStage.REVIEW, collected);
            break;
        }

        case ConversationStage.REVIEW: {
            // Parse document type from response
            if (/budget/i.test(text)) {
                collected.documentType = "BUDGET";
            } else if (/proposal|formal|quote/i.test(text)) {
                collected.documentType = "PROPOSAL";
            } else if (/loi|letter/i.test(text)) {
                collected.documentType = "LOI";
            } else if (/yes|yeah|yep|sure|go|ready|generate/i.test(text)) {
                collected.documentType = "BUDGET"; // Default
            } else {
                reply = "Say \"budget estimate\", \"proposal\", or \"LOI\" to generate.";
                break;
            }

            actions.push({ type: "generate_pdf", data: { documentType: collected.documentType } });
            nextStage = ConversationStage.DONE;
            reply = `Generating ${collected.documentType === "BUDGET" ? "Budget Estimate" : collected.documentType === "PROPOSAL" ? "Formal Proposal" : "Letter of Intent"}... Your PDF will download shortly.`;
            break;
        }

        case ConversationStage.DONE: {
            reply = "The proposal has been generated! Create a new project to start another, or ask me anything about this one.";
            break;
        }

        default:
            reply = "Something went wrong with the conversation flow. Try again.";
    }

    return { reply, actions, nextStage, collected };
}

// ============================================================================
// INITIAL STATE
// ============================================================================

export function createInitialState(): ConversationState {
    return {
        stage: ConversationStage.GREETING,
        collected: {
            displays: [],
            displayPrices: [],
            services: [],
            retryCount: 0,
        },
    };
}

/** Check if a message is off-topic (not related to the current stage) */
export function isOffTopic(stage: ConversationStage, message: string): boolean {
    const text = message.toLowerCase().trim();

    // General questions that should go to AnythingLLM
    const offTopicPatterns = [
        /^(what|how|why|when|where|who|can you|tell me|explain)/,
        /^(search|find|look up)/,
        /\?$/,
        /^@agent/,
    ];

    // Don't flag as off-topic during greeting/client name (anything is valid)
    if (stage === ConversationStage.GREETING || stage === ConversationStage.CLIENT_NAME) {
        return false;
    }

    // Don't flag during review (yes/no/generate are valid)
    if (stage === ConversationStage.REVIEW || stage === ConversationStage.DONE) {
        return false;
    }

    return offTopicPatterns.some((p) => p.test(text));
}
