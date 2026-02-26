/**
 * Smart Assembly Bundler — Auto-suggests hidden/forgotten line items per display.
 *
 * Every LED display needs more than just panels: video processors, receiving cards,
 * fiber converters, mounting hardware, spare modules, cable kits. Estimators forget
 * these items regularly, leaving $$$ on the table.
 *
 * This engine examines display configuration and returns a suggested accessory list
 * with costs, quantities, and reasons. Users can exclude individual items.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface BundleItem {
    /** Unique rule ID (stable across renders for toggle state) */
    id: string;
    /** Human-readable name */
    name: string;
    /** Grouping category */
    category: "signal" | "structural" | "electrical" | "accessory" | "service";
    /** Cost per unit */
    unitCost: number;
    /** Auto-calculated quantity */
    quantity: number;
    /** quantity * unitCost */
    totalCost: number;
    /** Why this was suggested */
    reason: string;
    /** What triggered inclusion */
    trigger: string;
}

export interface BundleResult {
    items: BundleItem[];
    totalCost: number;
    /** Items grouped by category */
    byCategory: Record<string, BundleItem[]>;
}

/** Minimal display info needed for bundle calculation */
export interface BundleInput {
    displayType: string;
    displayName: string;
    widthFt: number;
    heightFt: number;
    pixelPitch: string;
    locationType: string;
    serviceType: string;
    isReplacement: boolean;
    isIndoor: boolean;
    dataRunDistance: string;
    liftType: string;
    installComplexity: string;
    /** Total cabinet count from Cabinet Tetris (if available) */
    totalCabinets?: number;
    /** Area in square feet */
    areaSqFt: number;
    /** Items the user has excluded */
    excludedIds: string[];
}

// ============================================================================
// RULE DEFINITIONS
// ============================================================================

interface BundleRule {
    id: string;
    name: string;
    category: BundleItem["category"];
    unitCost: number;
    /** Calculate quantity from display config. Return 0 to skip. */
    quantity: (input: BundleInput) => number;
    reason: string;
    trigger: string;
}

const RULES: BundleRule[] = [
    // ── Signal Processing ──────────────────────────────────────────────
    {
        id: "video_processor",
        name: "Video Processor (Novastar / Brompton)",
        category: "signal",
        unitCost: 12000,
        quantity: (d) => {
            // Scoreboards, center-hung, and large displays need dedicated processor
            const isLarge = d.areaSqFt > 150;
            const needsProcessor = ["scoreboard", "center-hung", "end-zone"].includes(d.displayType) || isLarge;
            return needsProcessor ? 1 : 0;
        },
        reason: "Required for LED signal processing and content scaling",
        trigger: "scoreboard / large display",
    },
    {
        id: "receiving_cards",
        name: "Receiving Cards",
        category: "signal",
        unitCost: 85,
        quantity: (d) => {
            // ~1 receiving card per 4 cabinets (or per 20 sqft if no cabinet data)
            if (d.totalCabinets) return Math.ceil(d.totalCabinets / 4);
            return Math.max(1, Math.ceil(d.areaSqFt / 20));
        },
        reason: "Each card drives ~4 cabinets of LED panels",
        trigger: "all displays",
    },
    {
        id: "sending_card",
        name: "Sending Card",
        category: "signal",
        unitCost: 450,
        quantity: () => 1,
        reason: "Interfaces between processor and receiving cards",
        trigger: "all displays",
    },
    {
        id: "signal_cable_kit",
        name: "Signal Cable Kit (Cat6 / Ethernet)",
        category: "signal",
        unitCost: 15,
        quantity: (d) => {
            // 1 cable per receiving card + extras
            if (d.totalCabinets) return Math.ceil(d.totalCabinets / 4) + 2;
            return Math.max(4, Math.ceil(d.areaSqFt / 20) + 2);
        },
        reason: "Signal distribution from sending to receiving cards",
        trigger: "all displays",
    },
    {
        id: "fiber_media_converter",
        name: "Fiber Media Converter Pair",
        category: "signal",
        unitCost: 1200,
        quantity: (d) => d.dataRunDistance === "fiber" ? 1 : 0,
        reason: "Required for fiber optic signal runs >300ft",
        trigger: "fiber data run",
    },
    {
        id: "backup_processor",
        name: "Backup Video Processor",
        category: "signal",
        unitCost: 12000,
        quantity: (d) => d.areaSqFt > 300 ? 1 : 0,
        reason: "Redundancy for mission-critical large displays",
        trigger: "display > 300 sqft",
    },

    // ── Electrical ─────────────────────────────────────────────────────
    {
        id: "power_distribution",
        name: "Power Distribution Unit (PDU)",
        category: "electrical",
        unitCost: 850,
        quantity: (d) => {
            // 1 PDU per ~50 cabinets or ~200 sqft
            if (d.totalCabinets) return Math.max(1, Math.ceil(d.totalCabinets / 50));
            return Math.max(1, Math.ceil(d.areaSqFt / 200));
        },
        reason: "Distributes power to LED cabinets with circuit protection",
        trigger: "all displays",
    },
    {
        id: "power_cables",
        name: "Power Cable Kit (C13/C14)",
        category: "electrical",
        unitCost: 8,
        quantity: (d) => d.totalCabinets || Math.ceil(d.areaSqFt / 5),
        reason: "One power cable per cabinet",
        trigger: "all displays",
    },
    {
        id: "surge_protector",
        name: "Surge Protection Device",
        category: "electrical",
        unitCost: 350,
        quantity: (d) => Math.max(1, Math.ceil(d.areaSqFt / 200)),
        reason: "Protects LED investment from power surges",
        trigger: "all displays",
    },
    {
        id: "ups_battery",
        name: "UPS Battery Backup",
        category: "electrical",
        unitCost: 2500,
        quantity: (d) => {
            const isScoreboard = ["scoreboard", "center-hung"].includes(d.displayType);
            return isScoreboard ? 1 : 0;
        },
        reason: "Prevents blackout during power interruption for game-critical displays",
        trigger: "scoreboard / center-hung",
    },

    // ── Structural / Mounting ──────────────────────────────────────────
    {
        id: "mounting_brackets",
        name: "Cabinet Mounting Brackets",
        category: "structural",
        unitCost: 25,
        quantity: (d) => {
            // 2 brackets per cabinet
            const cabs = d.totalCabinets || Math.ceil(d.areaSqFt / 5);
            return cabs * 2;
        },
        reason: "Secures each cabinet to structural frame",
        trigger: "all displays",
    },
    {
        id: "rigging_hardware",
        name: "Rigging / Fly Hardware",
        category: "structural",
        unitCost: 3500,
        quantity: (d) => {
            const needsRigging = ["center-hung", "scoreboard"].includes(d.displayType)
                && d.locationType !== "wall";
            return needsRigging ? 1 : 0;
        },
        reason: "Flying hardware for suspended displays",
        trigger: "center-hung / suspended",
    },
    {
        id: "weatherproof_enclosure",
        name: "Weatherproof Enclosure Surcharge",
        category: "structural",
        unitCost: 0, // percentage-based, see quantity
        quantity: (d) => {
            // 15% surcharge on outdoor displays, applied as flat per-sqft
            if (!d.isIndoor) return Math.round(d.areaSqFt * 12); // ~$12/sqft
            return 0;
        },
        reason: "IP65 weather sealing for outdoor installation",
        trigger: "outdoor",
    },

    // ── TV Wall Mounts ────────────────────────────────────────────────
    {
        id: "tv_mount_fixed",
        name: "Chief RMF3 — Fixed Wall Mount (49\"-65\")",
        category: "structural",
        unitCost: 80,
        quantity: (d) => {
            const name = (d.displayName || d.displayType || "").toLowerCase();
            const isTV = name.includes("tv") || name.includes("commercial") || name.includes("concourse-display")
                || name.includes("uh5j") || name.includes("sm5j") || name.includes("um5k") || name.includes("lg ");
            return isTV ? 1 : 0;
        },
        reason: "Chief RMF3 medium-fit fixed wall mount for commercial TVs 49\"–65\"",
        trigger: "TV / commercial display",
    },

    // ── Accessories ────────────────────────────────────────────────────
    {
        id: "spare_receiving_cards",
        name: "Spare Receiving Cards (2%)",
        category: "accessory",
        unitCost: 85,
        quantity: (d) => {
            const totalCards = d.totalCabinets ? Math.ceil(d.totalCabinets / 4) : Math.ceil(d.areaSqFt / 20);
            return Math.max(1, Math.ceil(totalCards * 0.02));
        },
        reason: "Replacement stock for field failures",
        trigger: "all displays",
    },
    {
        id: "spare_power_supplies",
        name: "Spare Power Supplies (2%)",
        category: "accessory",
        unitCost: 120,
        quantity: (d) => {
            const cabs = d.totalCabinets || Math.ceil(d.areaSqFt / 5);
            return Math.max(1, Math.ceil(cabs * 0.02));
        },
        reason: "Replacement stock for field failures",
        trigger: "all displays",
    },
    {
        id: "calibration_kit",
        name: "Calibration Probe Kit",
        category: "accessory",
        unitCost: 800,
        quantity: (d) => d.areaSqFt > 100 ? 1 : 0,
        reason: "On-site brightness/color calibration for commissioning",
        trigger: "display > 100 sqft",
    },
    {
        id: "content_mgmt_license",
        name: "Content Management Software License (1yr)",
        category: "accessory",
        unitCost: 2400,
        quantity: (d) => {
            const needsCMS = ["scoreboard", "center-hung", "marquee"].includes(d.displayType);
            return needsCMS ? 1 : 0;
        },
        reason: "Software for scheduling and playing content on display",
        trigger: "scoreboard / marquee",
    },

    // ── Services ───────────────────────────────────────────────────────
    {
        id: "commissioning",
        name: "System Commissioning & Testing",
        category: "service",
        unitCost: 0,
        quantity: (d) => {
            // $2/sqft for commissioning labor
            return Math.round(d.areaSqFt * 2);
        },
        reason: "On-site testing, calibration, and client sign-off",
        trigger: "all displays",
    },
    {
        id: "demo_disposal",
        name: "Demo / Disposal of Existing Display",
        category: "service",
        unitCost: 3500,
        quantity: (d) => d.isReplacement ? 1 : 0,
        reason: "Removal and disposal of existing LED system",
        trigger: "replacement install",
    },
    {
        id: "training",
        name: "Operator Training (On-Site)",
        category: "service",
        unitCost: 1500,
        quantity: (d) => {
            const needsTraining = ["scoreboard", "center-hung", "marquee"].includes(d.displayType);
            return needsTraining ? 1 : 0;
        },
        reason: "Train venue staff on content management and basic troubleshooting",
        trigger: "scoreboard / marquee",
    },
    {
        id: "as_built_docs",
        name: "As-Built Documentation Package",
        category: "service",
        unitCost: 2000,
        quantity: (d) => d.installComplexity === "complex" || d.installComplexity === "heavy" ? 1 : 0,
        reason: "Detailed as-built drawings and system documentation for complex installs",
        trigger: "complex / heavy install",
    },
];

// ============================================================================
// ENGINE
// ============================================================================

/**
 * Calculate suggested bundle items for a display configuration.
 * Returns all matching items (including excluded ones, marked for UI toggle).
 */
export function calculateBundle(input: BundleInput): BundleResult {
    const items: BundleItem[] = [];

    for (const rule of RULES) {
        const qty = rule.quantity(input);
        if (qty <= 0) continue;

        // For rules with unitCost=0, the quantity IS the total cost (used for $/sqft calcs)
        const totalCost = rule.unitCost > 0 ? qty * rule.unitCost : qty;

        items.push({
            id: rule.id,
            name: rule.name,
            category: rule.category,
            unitCost: rule.unitCost > 0 ? rule.unitCost : totalCost,
            quantity: rule.unitCost > 0 ? qty : 1,
            totalCost,
            reason: rule.reason,
            trigger: rule.trigger,
        });
    }

    // Filter out user-excluded items for cost calculation
    const activeItems = items.filter((item) => !input.excludedIds.includes(item.id));
    const totalCost = activeItems.reduce((sum, item) => sum + item.totalCost, 0);

    // Group by category
    const byCategory: Record<string, BundleItem[]> = {};
    for (const item of items) {
        if (!byCategory[item.category]) byCategory[item.category] = [];
        byCategory[item.category].push(item);
    }

    return { items, totalCost, byCategory };
}

/**
 * Get just the active (non-excluded) bundle cost for a display.
 * Used by EstimatorBridge for quick cost integration.
 */
export function getActiveBundleCost(input: BundleInput): number {
    const result = calculateBundle(input);
    return result.totalCost;
}

/** Category labels for UI display */
export const CATEGORY_LABELS: Record<string, string> = {
    signal: "Signal Processing",
    structural: "Structural / Mounting",
    electrical: "Electrical",
    accessory: "Accessories & Spares",
    service: "Services",
};
