/**
 * Estimator-specific intent parsing and execution.
 *
 * Parses natural language into estimator actions:
 * - "add a 20x10 scoreboard at 4mm"
 * - "set LED margin to 38%"
 * - "what's the total?"
 * - "make it union"
 * - "set currency to CAD"
 */

import type { EstimatorAnswers, DisplayAnswers } from "@/app/components/estimator/questions";
import { createNewDisplayAnswers } from "@/app/components/estimator/questions";
import type { ScreenCalc } from "@/app/components/estimator/EstimatorBridge";

// ============================================================================
// TYPES
// ============================================================================

export type EstimatorIntentType =
    | "add_display"
    | "remove_display"
    | "set_client_name"
    | "set_project_name"
    | "set_location"
    | "set_led_margin"
    | "set_services_margin"
    | "set_all_margins"
    | "set_bond_rate"
    | "set_tax_rate"
    | "set_complexity"
    | "set_currency"
    | "set_union"
    | "set_indoor"
    | "set_pixel_pitch"
    | "set_cost_override"
    | "set_margin_tier"
    | "set_number_of_displays"
    | "query_total"
    | "query_display"
    | "explain_cost"
    | "general_question";

export interface EstimatorIntent {
    type: EstimatorIntentType;
    confidence: number;
    params: Record<string, any>;
    originalMessage: string;
}

export interface EstimatorExecutionResult {
    success: boolean;
    message: string;
    updatedAnswers?: EstimatorAnswers;
}

// ============================================================================
// PATTERNS
// ============================================================================

interface IntentPattern {
    type: EstimatorIntentType;
    patterns: RegExp[];
    extractParams: (match: RegExpMatchArray, message: string) => Record<string, any>;
}

const INTENT_PATTERNS: IntentPattern[] = [
    // Add display: "add a 20x10 scoreboard at 4mm", "new display 30 by 15 ribbon at 2.5mm"
    {
        type: "add_display",
        patterns: [
            /(?:add|create|new)\s+(?:a\s+)?(?:(\d+(?:\.\d+)?)\s*(?:x|by|×)\s*(\d+(?:\.\d+)?)\s*(?:ft|feet|')?\s+)?(.+?)(?:\s+(?:at|@)\s*(\d+(?:\.\d+)?)\s*mm)?$/i,
            /(?:add|create|new)\s+(?:a\s+)?(?:display|screen|panel|board)\s*(?:called\s+)?["']?(.+?)["']?\s*(?:(\d+(?:\.\d+)?)\s*(?:x|by|×)\s*(\d+(?:\.\d+)?))?\s*(?:(?:at|@)\s*(\d+(?:\.\d+)?)\s*mm)?$/i,
        ],
        extractParams: (match, message) => {
            const result: Record<string, any> = { rawSpec: message };
            // Try to extract dimensions
            const dimMatch = message.match(/(\d+(?:\.\d+)?)\s*(?:x|by|×)\s*(\d+(?:\.\d+)?)\s*(?:ft|feet|')?/i);
            if (dimMatch) {
                result.widthFt = parseFloat(dimMatch[1]);
                result.heightFt = parseFloat(dimMatch[2]);
            }
            // Extract pitch
            const pitchMatch = message.match(/(\d+(?:\.\d+)?)\s*mm\b/i);
            if (pitchMatch) result.pixelPitch = pitchMatch[1];
            // Extract name (everything after add/create/new that isn't dimensions or pitch)
            const nameMatch = message.match(/(?:add|create|new)\s+(?:a\s+)?(?:\d+(?:\.\d+)?\s*(?:x|by|×)\s*\d+(?:\.\d+)?\s*(?:ft|feet|')?\s+)?(.+?)(?:\s+(?:at|@)\s*\d+|\s+\d+(?:\.\d+)?\s*(?:x|by|×)|\s*$)/i);
            if (nameMatch && nameMatch[1]) {
                let name = nameMatch[1].replace(/\b(?:display|screen|panel|board)\b/i, "").trim();
                if (name.length > 1) result.displayName = name;
            }
            // Extract location type hints
            const lower = message.toLowerCase();
            if (lower.includes("ribbon")) result.locationType = "ribbon";
            else if (lower.includes("scoreboard") || lower.includes("center")) result.locationType = "scoreboard";
            else if (lower.includes("fascia") || lower.includes("balcony")) result.locationType = "fascia";
            else if (lower.includes("outdoor") || lower.includes("marquee")) result.locationType = "outdoor";
            else if (lower.includes("freestanding") || lower.includes("column")) result.locationType = "freestanding";
            else if (lower.includes("wall")) result.locationType = "wall";
            return result;
        },
    },
    // Set client name
    {
        type: "set_client_name",
        patterns: [
            /(?:client|customer)\s+(?:is|name\s+is|name:?)\s+["']?(.+?)["']?$/i,
            /(?:set|change|update)\s+(?:the\s+)?client\s+(?:name\s+)?(?:to\s+)?["']?(.+?)["']?$/i,
            /(?:the\s+)?client\s+is\s+["']?(.+?)["']?$/i,
        ],
        extractParams: (match) => ({ name: (match[1] || "").trim() }),
    },
    // Set project name
    {
        type: "set_project_name",
        patterns: [
            /(?:project|estimate)\s+(?:is|name\s+is|name:?|called)\s+["']?(.+?)["']?$/i,
            /(?:set|change|update)\s+(?:the\s+)?project\s+(?:name\s+)?(?:to\s+)?["']?(.+?)["']?$/i,
            /(?:call|name)\s+(?:this|the)\s+(?:project|estimate)\s+["']?(.+?)["']?$/i,
        ],
        extractParams: (match) => ({ name: (match[1] || "").trim() }),
    },
    // Set location
    {
        type: "set_location",
        patterns: [
            /(?:location|venue|city|site)\s+(?:is|:)\s+["']?(.+?)["']?$/i,
            /(?:set|change|update)\s+(?:the\s+)?location\s+(?:to\s+)?["']?(.+?)["']?$/i,
            /(?:this\s+is\s+(?:in|at|for))\s+["']?(.+?)["']?$/i,
        ],
        extractParams: (match) => ({ location: (match[1] || "").trim() }),
    },
    // Set number of displays
    {
        type: "set_number_of_displays",
        patterns: [
            /(?:set|change)?\s*(?:number\s+of\s+)?displays?\s*(?:to|:|=)\s*(\d+)/i,
            /(\d+)\s+displays?/i,
        ],
        extractParams: (match) => ({ count: parseInt(match[1], 10) }),
    },
    // Remove display
    {
        type: "remove_display",
        patterns: [
            /(?:remove|delete)\s+(?:the\s+)?(?:last\s+)?(?:display|screen)\s*(?:#?\s*(\d+))?/i,
            /(?:remove|delete)\s+(?:display|screen)\s+["']?(.+?)["']?$/i,
        ],
        extractParams: (match) => {
            const idx = match[1] ? parseInt(match[1], 10) - 1 : -1; // -1 = last
            return { index: idx, name: match[2] || null };
        },
    },
    // Set LED margin
    {
        type: "set_led_margin",
        patterns: [
            /(?:set|change|update)\s+(?:the\s+)?(?:led|hardware)\s+margin\s+(?:to\s+)?(\d+(?:\.\d+)?)\s*%?/i,
            /(?:led|hardware)\s+margin\s*[:=]\s*(\d+(?:\.\d+)?)\s*%?/i,
        ],
        extractParams: (match) => ({ margin: parseFloat(match[1]) }),
    },
    // Set services margin
    {
        type: "set_services_margin",
        patterns: [
            /(?:set|change|update)\s+(?:the\s+)?(?:services?|labor)\s+margin\s+(?:to\s+)?(\d+(?:\.\d+)?)\s*%?/i,
            /(?:services?|labor)\s+margin\s*[:=]\s*(\d+(?:\.\d+)?)\s*%?/i,
        ],
        extractParams: (match) => ({ margin: parseFloat(match[1]) }),
    },
    // Set all margins
    {
        type: "set_all_margins",
        patterns: [
            /(?:set|change|update)\s+(?:the\s+)?(?:all\s+)?margin(?:s)?\s+(?:to\s+)?(\d+(?:\.\d+)?)\s*%?/i,
            /margin\s*[:=]\s*(\d+(?:\.\d+)?)\s*%?/i,
            /(\d+(?:\.\d+)?)\s*%?\s+margin/i,
        ],
        extractParams: (match) => ({ margin: parseFloat(match[1]) }),
    },
    // Set bond rate
    {
        type: "set_bond_rate",
        patterns: [
            /(?:set|change|update)\s+(?:the\s+)?bond\s+(?:rate\s+)?(?:to\s+)?(\d+(?:\.\d+)?)\s*%?/i,
            /bond\s*[:=]\s*(\d+(?:\.\d+)?)\s*%?/i,
        ],
        extractParams: (match) => ({ rate: parseFloat(match[1]) }),
    },
    // Set tax rate
    {
        type: "set_tax_rate",
        patterns: [
            /(?:set|change|update)\s+(?:the\s+)?(?:sales\s+)?tax\s+(?:rate\s+)?(?:to\s+)?(\d+(?:\.\d+)?)\s*%?/i,
            /tax\s*[:=]\s*(\d+(?:\.\d+)?)\s*%?/i,
        ],
        extractParams: (match) => ({ rate: parseFloat(match[1]) }),
    },
    // Set complexity
    {
        type: "set_complexity",
        patterns: [
            /(?:set|change|make|update)\s+(?:the\s+)?(?:install\s+)?complexity\s+(?:to\s+)?(simple|standard|complex|heavy)/i,
            /(?:make\s+it|it's|this\s+is)\s+(simple|standard|complex|heavy)/i,
        ],
        extractParams: (match) => ({ complexity: match[1].toLowerCase() }),
    },
    // Set currency
    {
        type: "set_currency",
        patterns: [
            /(?:set|change|switch|use)\s+(?:the\s+)?currency\s+(?:to\s+)?(USD|CAD|EUR|GBP)/i,
            /(?:switch\s+to|use)\s+(USD|CAD|EUR|GBP)/i,
        ],
        extractParams: (match) => ({ currency: match[1].toUpperCase() }),
    },
    // Set union
    {
        type: "set_union",
        patterns: [
            /(?:this\s+is\s+)?(?:a\s+)?union\s+(?:project|labor|job)/i,
            /(?:set|enable|turn\s+on)\s+union/i,
            /(?:no|not|disable|non)[\s-]?union/i,
        ],
        extractParams: (_match, message) => ({
            isUnion: !/(?:no|not|disable|non)[\s-]?union/i.test(message),
        }),
    },
    // Set indoor/outdoor
    {
        type: "set_indoor",
        patterns: [
            /(?:this\s+is\s+)?(?:an?\s+)?indoor\s+(?:project|install)/i,
            /(?:this\s+is\s+)?(?:an?\s+)?outdoor\s+(?:project|install)/i,
            /(?:set|change)\s+(?:to\s+)?(indoor|outdoor)/i,
        ],
        extractParams: (_match, message) => ({
            isIndoor: !/outdoor/i.test(message),
        }),
    },
    // Set pixel pitch
    {
        type: "set_pixel_pitch",
        patterns: [
            /(?:set|change|use|switch\s+to)\s+(?:pixel\s+)?pitch\s+(?:to\s+)?(\d+(?:\.\d+)?)\s*mm/i,
            /(?:use|switch\s+to)\s+(\d+(?:\.\d+)?)\s*mm/i,
        ],
        extractParams: (match) => ({ pitch: match[1] }),
    },
    // Set cost per sqft override
    {
        type: "set_cost_override",
        patterns: [
            /(?:set|change|override)\s+(?:the\s+)?cost\s+(?:per\s+)?(?:sq\s*ft|square\s+foot)\s+(?:to\s+)?\$?(\d+(?:\.\d+)?)/i,
            /\$(\d+(?:\.\d+)?)\s+(?:per\s+)?(?:sq\s*ft|square\s+foot)/i,
        ],
        extractParams: (match) => ({ costPerSqFt: parseFloat(match[1]) }),
    },
    // Set margin tier
    {
        type: "set_margin_tier",
        patterns: [
            /(?:set|switch|change)\s+(?:to\s+)?(budget|proposal)\s+(?:tier|margins?|pricing)/i,
            /(?:use|apply)\s+(budget|proposal)\s+(?:tier|margins?)/i,
        ],
        extractParams: (match) => ({ tier: match[1].toLowerCase() }),
    },
    // Query total
    {
        type: "query_total",
        patterns: [
            /(?:what(?:'s| is)|show\s+(?:me\s+)?(?:the\s+)?)?(?:the\s+)?(?:total|grand\s+total|project\s+total|final\s+total)/i,
            /(?:how\s+much|what\s+does\s+it|what\s+will\s+it)\s+cost/i,
            /(?:give\s+me\s+(?:a\s+)?)?summary/i,
        ],
        extractParams: () => ({}),
    },
    // Query display
    {
        type: "query_display",
        patterns: [
            /(?:tell\s+me\s+about|show|describe|what(?:'s| is))\s+(?:the\s+)?(?:display|screen)\s*(?:#?\s*(\d+))?/i,
            /(?:display|screen)\s+(?:details?|info|breakdown)/i,
        ],
        extractParams: (match) => ({ index: match[1] ? parseInt(match[1], 10) - 1 : 0 }),
    },
    // Explain cost
    {
        type: "explain_cost",
        patterns: [
            /(?:explain|break\s*down|how\s+(?:is|are))\s+(?:the\s+)?(?:cost|pricing|structural|install|electrical|hardware|margin)/i,
            /(?:why\s+(?:is|does))\s+(?:it|the|this)\s+(?:cost|price)/i,
        ],
        extractParams: (_match, message) => {
            const lower = message.toLowerCase();
            let category = "all";
            if (lower.includes("structural") || lower.includes("steel")) category = "structural";
            else if (lower.includes("install")) category = "install";
            else if (lower.includes("electrical")) category = "electrical";
            else if (lower.includes("hardware") || lower.includes("led")) category = "hardware";
            else if (lower.includes("margin")) category = "margin";
            return { category };
        },
    },
];

// ============================================================================
// PARSER
// ============================================================================

export function parseEstimatorIntent(message: string): EstimatorIntent {
    const trimmed = message.trim();

    // Check for add_display first with more specific patterns
    if (/(?:add|create|new)\s+/i.test(trimmed) && /(?:display|screen|panel|board|scoreboard|ribbon|fascia|wall)/i.test(trimmed)) {
        const pattern = INTENT_PATTERNS.find((p) => p.type === "add_display")!;
        const fakeMatch = [trimmed] as RegExpMatchArray;
        return {
            type: "add_display",
            confidence: 0.9,
            params: pattern.extractParams(fakeMatch, trimmed),
            originalMessage: trimmed,
        };
    }

    for (const { type, patterns, extractParams } of INTENT_PATTERNS) {
        for (const pattern of patterns) {
            const match = trimmed.match(pattern);
            if (match) {
                // Avoid matching "set_all_margins" when LED or services margin is explicitly specified
                if (type === "set_all_margins") {
                    const lower = trimmed.toLowerCase();
                    if (lower.includes("led") || lower.includes("hardware") || lower.includes("service") || lower.includes("labor")) {
                        continue;
                    }
                }
                return {
                    type,
                    confidence: 0.85,
                    params: extractParams(match, trimmed),
                    originalMessage: trimmed,
                };
            }
        }
    }

    // General question fallback
    if (trimmed.endsWith("?") || /^(what|how|why|when|where|who|can|could|would|should|is|are|do|does)/i.test(trimmed)) {
        return {
            type: "general_question",
            confidence: 0.5,
            params: { query: trimmed },
            originalMessage: trimmed,
        };
    }

    return {
        type: "general_question",
        confidence: 0,
        params: { query: trimmed },
        originalMessage: trimmed,
    };
}

// ============================================================================
// EXECUTOR
// ============================================================================

function fmt(n: number): string {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(n);
}

export function executeEstimatorIntent(
    intent: EstimatorIntent,
    answers: EstimatorAnswers,
    calcs: ScreenCalc[],
): EstimatorExecutionResult {
    switch (intent.type) {
        case "add_display": {
            const p = intent.params;
            const display: DisplayAnswers = {
                ...createNewDisplayAnswers(answers.displays.length),
                widthFt: p.widthFt || 0,
                heightFt: p.heightFt || 0,
                pixelPitch: p.pixelPitch || "4",
                locationType: p.locationType || "wall",
            };
            if (p.displayName) display.displayName = p.displayName;
            const updated = { ...answers, displays: [...answers.displays, display] };
            const parts: string[] = [`Added **${display.displayName}**`];
            if (display.widthFt && display.heightFt) {
                parts.push(`${display.widthFt}' x ${display.heightFt}' (${display.widthFt * display.heightFt} sqft)`);
            }
            if (p.pixelPitch) parts.push(`${p.pixelPitch}mm pitch`);
            if (p.locationType) parts.push(`${p.locationType} mount`);
            return { success: true, message: parts.join(" — ") + ".", updatedAnswers: updated };
        }

        case "remove_display": {
            if (answers.displays.length === 0) {
                return { success: false, message: "No displays to remove." };
            }
            let idx = intent.params.index;
            if (idx === -1 || idx >= answers.displays.length) idx = answers.displays.length - 1;
            const removed = answers.displays[idx];
            const displays = [...answers.displays];
            displays.splice(idx, 1);
            return {
                success: true,
                message: `Removed **${removed.displayName || `Display ${idx + 1}`}**.`,
                updatedAnswers: { ...answers, displays },
            };
        }

        case "set_led_margin": {
            const m = intent.params.margin;
            if (m < 0 || m > 90) return { success: false, message: `Invalid LED margin: ${m}%. Must be 0-90%.` };
            return {
                success: true,
                message: `LED hardware margin set to **${m}%**.`,
                updatedAnswers: { ...answers, ledMargin: m },
            };
        }

        case "set_services_margin": {
            const m = intent.params.margin;
            if (m < 0 || m > 90) return { success: false, message: `Invalid services margin: ${m}%. Must be 0-90%.` };
            return {
                success: true,
                message: `Services margin set to **${m}%**.`,
                updatedAnswers: { ...answers, servicesMargin: m },
            };
        }

        case "set_all_margins": {
            const m = intent.params.margin;
            if (m < 0 || m > 90) return { success: false, message: `Invalid margin: ${m}%. Must be 0-90%.` };
            return {
                success: true,
                message: `All margins set to **${m}%** (LED hardware + services).`,
                updatedAnswers: { ...answers, ledMargin: m, servicesMargin: m, defaultMargin: m },
            };
        }

        case "set_bond_rate": {
            const r = intent.params.rate;
            if (r < 0 || r > 10) return { success: false, message: `Invalid bond rate: ${r}%. Must be 0-10%.` };
            return {
                success: true,
                message: `Bond rate set to **${r}%**.`,
                updatedAnswers: { ...answers, bondRate: r },
            };
        }

        case "set_tax_rate": {
            const r = intent.params.rate;
            if (r < 0 || r > 15) return { success: false, message: `Invalid tax rate: ${r}%. Must be 0-15%.` };
            return {
                success: true,
                message: `Sales tax rate set to **${r}%**.`,
                updatedAnswers: { ...answers, salesTaxRate: r },
            };
        }

        case "set_complexity": {
            const c = intent.params.complexity;
            if (answers.displays.length === 0) {
                return { success: false, message: "No displays yet. Add a display first." };
            }
            const displays = answers.displays.map((d) => ({ ...d, installComplexity: c }));
            return {
                success: true,
                message: `Install complexity set to **${c}** for all ${displays.length} display(s).`,
                updatedAnswers: { ...answers, displays },
            };
        }

        case "set_currency": {
            const c = intent.params.currency as EstimatorAnswers["currency"];
            return {
                success: true,
                message: `Currency set to **${c}**.`,
                updatedAnswers: { ...answers, currency: c },
            };
        }

        case "set_union":
            return {
                success: true,
                message: intent.params.isUnion
                    ? "Union labor **enabled** (15% uplift on labor costs)."
                    : "Union labor **disabled**.",
                updatedAnswers: { ...answers, isUnion: intent.params.isUnion },
            };

        case "set_indoor":
            return {
                success: true,
                message: intent.params.isIndoor ? "Set to **indoor** installation." : "Set to **outdoor** installation.",
                updatedAnswers: { ...answers, isIndoor: intent.params.isIndoor },
            };

        case "set_pixel_pitch": {
            if (answers.displays.length === 0) {
                return { success: false, message: "No displays yet. Add a display first." };
            }
            const pitch = intent.params.pitch;
            const displays = answers.displays.map((d) => ({ ...d, pixelPitch: pitch }));
            return {
                success: true,
                message: `Pixel pitch set to **${pitch}mm** for all ${displays.length} display(s).`,
                updatedAnswers: { ...answers, displays },
            };
        }

        case "set_cost_override": {
            const cost = intent.params.costPerSqFt;
            return {
                success: true,
                message: cost > 0
                    ? `Cost per sqft override set to **$${cost}**.`
                    : "Cost per sqft override **cleared** (using catalog pricing).",
                updatedAnswers: { ...answers, costPerSqFtOverride: cost },
            };
        }

        case "set_margin_tier": {
            const tier = intent.params.tier as "budget" | "proposal";
            const ledMargin = 15;
            const servicesMargin = 20;
            return {
                success: true,
                message: `Tier selection is legacy now. Kept **${tier}** as a label, but margins stay at **15% LED / 20% services**.`,
                updatedAnswers: { ...answers, marginTier: tier, ledMargin, servicesMargin, defaultMargin: 15 },
            };
        }

        case "query_total": {
            if (calcs.length === 0) {
                return { success: true, message: "No displays added yet. Add a display to see totals." };
            }
            const grandCost = calcs.reduce((s, c) => s + c.totalCost, 0);
            const grandSell = calcs.reduce((s, c) => s + c.sellPrice, 0);
            const grandBond = calcs.reduce((s, c) => s + c.bondCost, 0);
            const grandTax = calcs.reduce((s, c) => s + c.salesTaxCost, 0);
            const grandFinal = calcs.reduce((s, c) => s + c.finalTotal, 0);
            const blendedMargin = grandCost > 0 ? ((1 - grandCost / grandSell) * 100).toFixed(1) : "0";

            let msg = `**Project Summary** (${calcs.length} display${calcs.length !== 1 ? "s" : ""})\n\n`;
            msg += `| | Amount |\n|---|---|\n`;
            msg += `| Total Cost | ${fmt(grandCost)} |\n`;
            msg += `| Sell Price | ${fmt(grandSell)} |\n`;
            msg += `| Project Margin | ${blendedMargin}% |\n`;
            msg += `| Bond | ${fmt(grandBond)} |\n`;
            msg += `| Sales Tax | ${fmt(grandTax)} |\n`;
            msg += `| **Grand Total** | **${fmt(grandFinal)}** |\n`;
            return { success: true, message: msg };
        }

        case "query_display": {
            const idx = intent.params.index || 0;
            if (idx >= calcs.length) {
                return { success: true, message: `Display #${idx + 1} doesn't exist. You have ${calcs.length} display(s).` };
            }
            const c = calcs[idx];
            let msg = `**${c.name}** — ${c.widthFt}' x ${c.heightFt}' (${c.areaSqFt} sqft) @ ${c.pixelPitch}mm\n\n`;
            msg += `| Category | Cost |\n|---|---|\n`;
            msg += `| LED Hardware | ${fmt(c.hardwareCost)} |\n`;
            msg += `| Structural | ${fmt(c.structureCost)} |\n`;
            msg += `| Installation | ${fmt(c.installCost)} |\n`;
            msg += `| Electrical | ${fmt(c.electricalCost)} |\n`;
            msg += `| PM | ${fmt(c.pmCost)} |\n`;
            msg += `| Engineering | ${fmt(c.engineeringCost)} |\n`;
            msg += `| Shipping | ${fmt(c.shippingCost)} |\n`;
            if (c.demolitionCost > 0) msg += `| Demolition | ${fmt(c.demolitionCost)} |\n`;
            msg += `| **Total Cost** | **${fmt(c.totalCost)}** |\n`;
            msg += `| Sell Price | ${fmt(c.sellPrice)} |\n`;
            msg += `| Margin | ${(c.marginPct * 100).toFixed(1)}% |\n`;
            msg += `| Final Total | ${fmt(c.finalTotal)} |\n`;
            return { success: true, message: msg };
        }

        case "explain_cost": {
            if (calcs.length === 0) {
                return { success: true, message: "No displays added yet. Add a display to see cost breakdowns." };
            }
            const cat = intent.params.category;
            const c = calcs[0]; // Explain first display as example
            let msg = "";

            if (cat === "hardware" || cat === "all") {
                msg += `**LED Hardware** — ${c.name}\n`;
                msg += `- Area: ${c.widthFt}' x ${c.heightFt}' = ${c.areaSqFt} sqft\n`;
                msg += `- Cost/sqft: $${c.costPerSqFt} (${c.pixelPitch}mm pitch)\n`;
                msg += `- Base: ${c.areaSqFt} x $${c.costPerSqFt} = ${fmt(c.hardwareCost - c.spareParts)}\n`;
                if (c.spareParts > 0) msg += `- Spare parts (5%): ${fmt(c.spareParts)}\n`;
                msg += `- **Total hardware: ${fmt(c.hardwareCost)}**\n\n`;
            }
            if (cat === "structural" || cat === "all") {
                msg += `**Structural** — ${c.name}\n`;
                msg += `- Structure cost: ${fmt(c.structureCost)}\n`;
                msg += `- Based on hardware value and service access type\n\n`;
            }
            if (cat === "install" || cat === "all") {
                msg += `**Installation** — ${c.name}\n`;
                msg += `- Install cost: ${fmt(c.installCost)}\n`;
                msg += `- Includes steel fabrication + LED panel mounting\n\n`;
            }
            if (cat === "margin" || cat === "all") {
                msg += `**Margin Analysis** — ${c.name}\n`;
                msg += `- Total cost: ${fmt(c.totalCost)}\n`;
                msg += `- Sell price: ${fmt(c.sellPrice)}\n`;
                msg += `- Formula: sellPrice = cost / (1 - marginPct)\n`;
                msg += `- Project margin: ${(c.marginPct * 100).toFixed(1)}%\n`;
            }
            if (!msg) msg = "Specify a cost category: hardware, structural, install, electrical, or margin.";
            return { success: true, message: msg };
        }

        case "set_client_name": {
            const name = intent.params.name;
            if (!name) return { success: false, message: "Please provide a client name." };
            return {
                success: true,
                message: `Client set to **${name}**.`,
                updatedAnswers: { ...answers, clientName: name },
            };
        }

        case "set_project_name": {
            const name = intent.params.name;
            if (!name) return { success: false, message: "Please provide a project name." };
            return {
                success: true,
                message: `Project name set to **${name}**.`,
                updatedAnswers: { ...answers, projectName: name },
            };
        }

        case "set_location": {
            const loc = intent.params.location;
            if (!loc) return { success: false, message: "Please provide a location." };
            return {
                success: true,
                message: `Location set to **${loc}**.`,
                updatedAnswers: { ...answers, location: loc },
            };
        }

        case "set_number_of_displays": {
            const count = intent.params.count;
            if (!count || count < 1 || count > 20) return { success: false, message: `Invalid display count: ${count}. Must be 1-20.` };
            const current = answers.displays.length;
            if (count === current) return { success: true, message: `Already have ${count} display(s).` };
            if (count > current) {
                const newDisplays = [...answers.displays];
                for (let i = current; i < count; i++) {
                    newDisplays.push(createNewDisplayAnswers(i));
                }
                return {
                    success: true,
                    message: `Added ${count - current} display(s). Now have **${count}** total.`,
                    updatedAnswers: { ...answers, displays: newDisplays },
                };
            }
            // Reduce
            return {
                success: true,
                message: `Reduced to **${count}** display(s) (removed ${current - count}).`,
                updatedAnswers: { ...answers, displays: answers.displays.slice(0, count) },
            };
        }

        case "general_question":
            return { success: false, message: "" }; // Will be handled by AI

        default:
            return { success: false, message: "" };
    }
}
