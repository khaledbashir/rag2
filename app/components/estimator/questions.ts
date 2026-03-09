/**
 * Estimator Questionnaire — Question definitions and flow logic
 *
 * Typeform-style: one question at a time, with dependencies.
 * Answers map directly to ScreenInput + project-level options for the estimator.
 *
 * Framework: 4 phases, 7 cost categories (3A-3G), ROM vs Detailed depth.
 */

// ============================================================================
// TYPES
// ============================================================================

export type QuestionType =
    | "text"
    | "number"
    | "select"
    | "multi-select"
    | "dimensions"    // Width × Height compound input
    | "yes-no"
    | "display-loop"  // Special: "Add another display?" branching
    | "display-type"  // Display type presets with auto-fill
    | "product-select" // Product catalog selector
    | "section";      // Visual separator / phase header

export interface QuestionOption {
    value: string;
    label: string;
    description?: string;
    /** Optional environment tag for filtering (e.g., pixel pitch by indoor/outdoor) */
    environment?: "indoor" | "outdoor" | "both";
}

export interface Question {
    id: string;
    phase: "project" | "display" | "financial" | "review";
    type: QuestionType;
    label: string;
    subtitle?: string;
    placeholder?: string;
    options?: QuestionOption[];
    defaultValue?: any;
    required?: boolean;
    /** Show only if this function returns true given current answers */
    showIf?: (answers: Record<string, any>, displayIndex: number) => boolean;
    /** Unit label shown after number inputs */
    unit?: string;
    /** Min/max for number inputs */
    min?: number;
    max?: number;
    step?: number;
    /** Which sheet tab this answer affects (for live preview highlighting) */
    affectsSheet?: string;
    /** Quick-action buttons shown below the input (e.g. "Not Included" sets value to 0) */
    quickActions?: { label: string; value: any; skipToEnd?: boolean }[];
}

// ============================================================================
// PROJECT PHASE — Collected once
// ============================================================================

export const PROJECT_QUESTIONS: Question[] = [
    {
        id: "clientName",
        phase: "project",
        type: "text",
        label: "Client Name",
        subtitle: "Company or organization name",
        placeholder: "e.g., Indiana Fever, NBCU, USC Athletics",
        required: true,
        affectsSheet: "Budget Summary",
    },
    {
        id: "projectName",
        phase: "project",
        type: "text",
        label: "Project Name",
        subtitle: "Internal project name or venue",
        placeholder: "e.g., Gainbridge Fieldhouse LED Upgrade",
        required: true,
        affectsSheet: "Budget Summary",
    },
    {
        id: "location",
        phase: "project",
        type: "text",
        label: "Location",
        subtitle: "City, State — used for tax rates and labor multipliers",
        placeholder: "e.g., Indianapolis, IN",
        required: true,
        affectsSheet: "Budget Summary",
    },
    {
        id: "docType",
        phase: "project",
        type: "select",
        label: "Document Type",
        subtitle: "This determines headers, signatures, and payment terms",
        options: [
            { value: "budget", label: "Budget Estimate", description: "Early-stage ROM with no commitments" },
            { value: "proposal", label: "Proposal", description: "Formal sales quotation" },
            { value: "loi", label: "Letter of Intent", description: "Full legal document with signatures" },
        ],
        defaultValue: "budget",
        required: true,
        affectsSheet: "Budget Summary",
    },
    {
        id: "estimateDepth",
        phase: "project",
        type: "select",
        label: "Estimate Depth",
        subtitle: "ROM auto-calculates everything. Detailed unlocks per-category cost overrides.",
        options: [
            { value: "rom", label: "ROM / Budget", description: "Quick estimate — ~10 min, auto-calculate from area + complexity" },
            { value: "detailed", label: "Detailed", description: "Full breakdown — 7 cost categories per display, per-item overrides" },
        ],
        defaultValue: "rom",
        required: true,
        affectsSheet: "Budget Summary",
    },
    {
        id: "currency",
        phase: "project",
        type: "select",
        label: "Currency",
        options: [
            { value: "USD", label: "USD", description: "US Dollar" },
            { value: "CAD", label: "CAD", description: "Canadian Dollar" },
            { value: "EUR", label: "EUR", description: "Euro" },
            { value: "GBP", label: "GBP", description: "British Pound" },
        ],
        defaultValue: "USD",
        affectsSheet: "Budget Summary",
    },
    {
        id: "isIndoor",
        phase: "project",
        type: "yes-no",
        label: "Environment",
        subtitle: "Affects environment ratings and material requirements",
        defaultValue: true,
        affectsSheet: "Display Details",
    },
    {
        id: "isNewInstall",
        phase: "project",
        type: "yes-no",
        label: "New Installation",
        subtitle: "No = replacement/upgrade of existing displays",
        defaultValue: true,
        affectsSheet: "Labor Worksheet",
    },
    {
        id: "isUnion",
        phase: "project",
        type: "yes-no",
        label: "Union Labor",
        subtitle: "Union projects typically cost 15-25% more for labor",
        defaultValue: false,
        affectsSheet: "Labor Worksheet",
    },
];

// ============================================================================
// DISPLAY TYPE PRESETS — Auto-fill downstream fields
// ============================================================================

export interface DisplayTypePreset {
    value: string;
    label: string;
    description: string;
    defaults: Partial<DisplayAnswers>;
}

export const DISPLAY_TYPE_PRESETS: DisplayTypePreset[] = [
    {
        value: "main-scoreboard",
        label: "Main Scoreboard",
        description: "Center-hung or end-wall primary video board",
        defaults: { locationType: "scoreboard", pixelPitch: "4", installComplexity: "standard" },
    },
    {
        value: "center-hung",
        label: "Center-Hung",
        description: "Suspended 4-sided scoreboard cluster",
        defaults: { locationType: "scoreboard", pixelPitch: "4", installComplexity: "complex" },
    },
    {
        value: "ribbon-board",
        label: "Ribbon Board",
        description: "Long, narrow perimeter display for sponsorship",
        defaults: { locationType: "ribbon", pixelPitch: "6", installComplexity: "standard" },
    },
    {
        value: "fascia-board",
        label: "Fascia Board",
        description: "Mounted on balcony fascia or suite rail",
        defaults: { locationType: "fascia", pixelPitch: "4", installComplexity: "standard" },
    },
    {
        value: "concourse-display",
        label: "Concourse Display",
        description: "Wall-mounted indoor close-view display",
        defaults: { locationType: "wall", pixelPitch: "2.5", installComplexity: "simple" },
    },
    {
        value: "end-zone",
        label: "End Zone Board",
        description: "Large end-wall or end-zone video board",
        defaults: { locationType: "wall", pixelPitch: "6", installComplexity: "standard" },
    },
    {
        value: "marquee",
        label: "Marquee / Entrance",
        description: "Exterior entrance or roadside display",
        defaults: { locationType: "outdoor", pixelPitch: "10", installComplexity: "standard" },
    },
    {
        value: "auxiliary",
        label: "Auxiliary Board",
        description: "Secondary info display, stats, or wayfinding",
        defaults: { locationType: "wall", pixelPitch: "4", installComplexity: "simple" },
    },
    {
        value: "courtside-table",
        label: "Courtside Table",
        description: "LED courtside table — add-on product (Screen + Install only)",
        defaults: { locationType: "courtside", pixelPitch: "3.9", installComplexity: "standard" },
    },
    {
        value: "stanchion",
        label: "Stanchion",
        description: "LED stanchion display — add-on product (Screen + Install only)",
        defaults: { locationType: "stanchion", pixelPitch: "3.9", installComplexity: "standard" },
    },
    {
        value: "custom",
        label: "Custom",
        description: "Enter a custom name and configure manually",
        defaults: {},
    },
];

// ============================================================================
// HELPERS — Add-on product types skip most install questions
// ============================================================================

/** Courtside tables and stanchions only need Screen + Install — no structural/electrical/PM */
const ADDON_PRODUCT_TYPES = ["courtside-table", "stanchion"];
function isAddonProduct(answers: Record<string, any>): boolean {
    return ADDON_PRODUCT_TYPES.includes(answers.displayType);
}

// ============================================================================
// DISPLAY PHASE — Repeated per display
// ============================================================================

export const DISPLAY_QUESTIONS: Question[] = [
    {
        id: "displayType",
        phase: "display",
        type: "display-type",
        label: "Display Type",
        subtitle: "Pick a preset to auto-fill settings, or choose Custom",
        required: true,
        affectsSheet: "Display Details",
    },
    {
        id: "displayName",
        phase: "display",
        type: "text",
        label: "Display Name",
        subtitle: "Give this display a name for the estimate",
        placeholder: "Main Scoreboard",
        showIf: (answers) => answers.displayType === "custom",
        required: true,
        affectsSheet: "Display Details",
    },
    {
        id: "locationType",
        phase: "display",
        type: "select",
        label: "Installation Type",
        subtitle: "Determines structural and install cost models",
        options: [
            { value: "wall", label: "Wall Mount", description: "Flat wall, existing structure" },
            { value: "fascia", label: "Fascia / Balcony", description: "Mounted on fascia or balcony rail" },
            { value: "scoreboard", label: "Scoreboard / Center-Hung", description: "Suspended from ceiling/structure" },
            { value: "ribbon", label: "Ribbon Board", description: "Long, narrow display around venue perimeter" },
            { value: "freestanding", label: "Freestanding / Column", description: "Requires new structural support" },
            { value: "outdoor", label: "Outdoor / Marquee", description: "External, weather-rated" },
            { value: "courtside", label: "Courtside Table", description: "LED courtside table — Screen + Install" },
            { value: "stanchion", label: "Stanchion", description: "LED stanchion display — Screen + Install" },
        ],
        showIf: (answers) => answers.displayType === "custom",
        required: true,
        affectsSheet: "Display Details",
    },
    {
        id: "dimensions",
        phase: "display",
        type: "dimensions",
        label: "Dimensions (ft)",
        subtitle: "Width and height in feet",
        required: true,
        affectsSheet: "Display Details",
    },
    {
        id: "pixelPitch",
        phase: "display",
        type: "select",
        label: "Pixel Pitch",
        subtitle: "Smaller pitch = higher resolution = higher cost",
        options: [
            { value: "1.2", label: "1.2mm", description: "Ultra-fine — premium indoor", environment: "indoor" },
            { value: "1.5", label: "1.5mm", description: "Fine — indoor close-view", environment: "indoor" },
            { value: "1.875", label: "1.875mm", description: "Fine — indoor standard", environment: "indoor" },
            { value: "2.5", label: "2.5mm", description: "Standard indoor", environment: "indoor" },
            { value: "3.9", label: "3.9mm", description: "Indoor/outdoor versatile", environment: "both" },
            { value: "4", label: "4mm", description: "Standard indoor/outdoor", environment: "both" },
            { value: "6", label: "6mm", description: "Medium distance", environment: "both" },
            { value: "8", label: "8mm", description: "Medium/large viewing distance", environment: "both" },
            { value: "10", label: "10mm", description: "Large viewing distance", environment: "both" },
            { value: "16", label: "16mm", description: "Highway/billboard", environment: "outdoor" },
        ],
        defaultValue: "4",
        required: true,
        affectsSheet: "Display Details",
    },
    {
        id: "altPitches",
        phase: "display",
        type: "multi-select",
        label: "Alternate Pitches",
        subtitle: "Pick additional pitch options — same display, only LED cost changes. Skip if no alternates needed.",
        options: [
            { value: "1.2", label: "1.2mm", description: "Ultra-fine — premium indoor", environment: "indoor" },
            { value: "1.5", label: "1.5mm", description: "Fine — indoor close-view", environment: "indoor" },
            { value: "1.875", label: "1.875mm", description: "Fine — indoor standard", environment: "indoor" },
            { value: "2.5", label: "2.5mm", description: "Standard indoor", environment: "indoor" },
            { value: "3.9", label: "3.9mm", description: "Indoor/outdoor versatile", environment: "both" },
            { value: "4", label: "4mm", description: "Standard indoor/outdoor", environment: "both" },
            { value: "6", label: "6mm", description: "Medium distance", environment: "both" },
            { value: "8", label: "8mm", description: "Medium/large viewing distance", environment: "both" },
            { value: "10", label: "10mm", description: "Large viewing distance", environment: "both" },
            { value: "16", label: "16mm", description: "Highway/billboard", environment: "outdoor" },
        ],
        defaultValue: [],
        required: false,
        affectsSheet: "Display Details",
    },
    {
        id: "productId",
        phase: "display",
        type: "product-select",
        label: "LED Product",
        subtitle: "Select a product from the catalog to auto-fill cost/sqft and specs",
        affectsSheet: "Display Details",
    },
    {
        id: "installComplexity",
        phase: "display",
        type: "select",
        label: "Install Complexity",
        subtitle: "Affects structural steel and labor rates",
        options: [
            { value: "simple", label: "Simple", description: "Basic wall mount, ground level access" },
            { value: "standard", label: "Standard", description: "Standard rigging, reasonable access" },
            { value: "complex", label: "Complex", description: "Difficult access, custom steel, multi-phase" },
            { value: "heavy", label: "Heavy", description: "Crane work, extreme heights, structural mods" },
        ],
        defaultValue: "standard",
        required: true,
        showIf: (answers) => !isAddonProduct(answers),
        affectsSheet: "Labor Worksheet",
    },
    {
        id: "serviceType",
        phase: "display",
        type: "select",
        label: "Service Access",
        subtitle: "How will the display be serviced after install?",
        options: [
            { value: "Front/Rear", label: "Front / Rear", description: "Standard access — 20% structure" },
            { value: "Top", label: "Top Only", description: "Top-access only — 10% structure" },
        ],
        defaultValue: "Front/Rear",
        showIf: (answers) => !isAddonProduct(answers),
        affectsSheet: "Labor Worksheet",
    },
    {
        id: "isReplacement",
        phase: "display",
        type: "yes-no",
        label: "Replacement",
        subtitle: "Adds demolition costs if yes",
        defaultValue: false,
        showIf: (answers) => !isAddonProduct(answers),
        affectsSheet: "Labor Worksheet",
    },
    {
        id: "useExistingStructure",
        phase: "display",
        type: "yes-no",
        label: "Use Existing Structure",
        subtitle: "Reduces structural costs significantly",
        defaultValue: false,
        showIf: (answers) => !isAddonProduct(answers) && answers.isReplacement === true,
        affectsSheet: "Labor Worksheet",
    },
    {
        id: "steelScope",
        phase: "display",
        type: "select",
        label: "Steel Scope",
        subtitle: "What level of steel work is needed for this display?",
        options: [
            { value: "existing", label: "Use Existing", description: "Mount to existing structure — minimal steel" },
            { value: "secondary", label: "Secondary Steel Only", description: "New mounting frame, existing primary structure" },
            { value: "full", label: "Full Steel Build", description: "New primary + secondary steel structure" },
        ],
        defaultValue: "full",
        showIf: (answers) => !isAddonProduct(answers) && !answers.useExistingStructure,
        required: true,
        affectsSheet: "Labor Worksheet",
    },
    {
        id: "liftType",
        phase: "display",
        type: "select",
        label: "Lift / Crane Equipment",
        subtitle: "What equipment is needed for installation access?",
        options: [
            { value: "none", label: "None / Ground Level", description: "No lift needed — walk-up access" },
            { value: "scissor", label: "Scissor Lift", description: "Standard lift — ~$500/week rental" },
            { value: "boom", label: "Boom Lift", description: "Extended reach — ~$1,500/week rental" },
            { value: "crane", label: "Crane", description: "Heavy lift — ~$5,000+/day" },
        ],
        defaultValue: "scissor",
        required: true,
        showIf: (answers) => !isAddonProduct(answers),
        affectsSheet: "Labor Worksheet",
    },
    {
        id: "powerDistance",
        phase: "display",
        type: "select",
        label: "Power Source Distance",
        subtitle: "Distance from nearest electrical panel to display location",
        options: [
            { value: "near", label: "< 10 ft", description: "Adjacent panel — minimal conduit run" },
            { value: "medium", label: "10 – 50 ft", description: "Same room — standard conduit run" },
            { value: "far", label: "> 50 ft / New Run", description: "Remote panel — new circuit run required" },
        ],
        defaultValue: "near",
        required: true,
        showIf: (answers) => !isAddonProduct(answers),
        affectsSheet: "Labor Worksheet",
    },
    {
        id: "dataRunDistance",
        phase: "display",
        type: "select",
        label: "Data Run Distance",
        subtitle: "Length of data cabling from control room to display",
        options: [
            { value: "copper", label: "< 300 ft (Copper)", description: "Standard Cat6 — low cost" },
            { value: "fiber", label: "> 300 ft (Fiber)", description: "Fiber optic conversion — adds ~$3,000" },
        ],
        defaultValue: "copper",
        required: true,
        showIf: (answers) => !isAddonProduct(answers),
        affectsSheet: "Labor Worksheet",
    },
    {
        id: "includeSpareParts",
        phase: "display",
        type: "yes-no",
        label: "Spare Parts",
        subtitle: "Typically 5% of LED hardware cost",
        defaultValue: true,
        affectsSheet: "Budget Summary",
    },
    {
        id: "addAnother",
        phase: "display",
        type: "display-loop",
        label: "Add Another Display",
        subtitle: "You can add as many displays as the project needs",
    },
];

// ============================================================================
// FINANCIAL PHASE — Collected once after all displays
// ============================================================================

export const FINANCIAL_QUESTIONS: Question[] = [
    {
        id: "marginTier",
        phase: "financial",
        type: "select",
        label: "Margin Tier",
        subtitle: "Budget = lower margins for early-stage. Proposal = full margins for client-facing.",
        options: [
            { value: "budget", label: "Budget Tier", description: "LED: 15%, Installation Services: 20% — for internal ROM estimates" },
            { value: "proposal", label: "Proposal Tier", description: "LED: 38%, Installation Services: 20% — for client-facing quotes" },
        ],
        defaultValue: "budget",
        required: true,
        affectsSheet: "Budget Summary",
    },
    {
        id: "ledMargin",
        phase: "financial",
        type: "number",
        label: "LED Hardware Margin",
        subtitle: "Margin on LED panels and hardware. Budget: 15%, Proposal: 38%.",
        defaultValue: 15,
        unit: "%",
        min: 5,
        max: 60,
        step: 1,
        affectsSheet: "Budget Summary",
    },
    {
        id: "servicesMargin",
        phase: "financial",
        type: "number",
        label: "Services Margin",
        subtitle: "Margin on labor, install, PM, engineering. Standard: 20%.",
        defaultValue: 20,
        unit: "%",
        min: 0,
        max: 60,
        step: 1,
        affectsSheet: "Budget Summary",
        quickActions: [{ label: "Supply Only", value: 0, skipToEnd: true }],
    },
    {
        id: "defaultMargin",
        phase: "financial",
        type: "number",
        label: "Blended Margin (Fallback)",
        subtitle: "Fallback if you prefer a single margin. Divisor model: Sell = Cost / (1 - margin).",
        defaultValue: 30,
        unit: "%",
        min: 5,
        max: 60,
        step: 1,
        affectsSheet: "Budget Summary",
    },
    {
        id: "bondRate",
        phase: "financial",
        type: "number",
        label: "Bond Rate",
        subtitle: "Performance bond — standard is 1.5%",
        defaultValue: 1.5,
        unit: "%",
        min: 0,
        max: 10,
        step: 0.1,
        affectsSheet: "Budget Summary",
        quickActions: [{ label: "Not Included", value: 0 }],
    },
    {
        id: "salesTaxRate",
        phase: "financial",
        type: "number",
        label: "Sales Tax Rate",
        subtitle: "Location-dependent — NYC is 8.875%, default is 9.5%",
        defaultValue: 9.5,
        unit: "%",
        min: 0,
        max: 15,
        step: 0.125,
        affectsSheet: "Budget Summary",
        quickActions: [{ label: "Not Included", value: 0 }],
    },
    {
        id: "costPerSqFtOverride",
        phase: "financial",
        type: "number",
        label: "Cost per SqFt Override",
        subtitle: "Leave at 0 to use catalog-based pricing. Set a value to override for all displays.",
        defaultValue: 0,
        unit: "$/sqft",
        min: 0,
        max: 2000,
        step: 5,
        affectsSheet: "Display Details",
    },
    {
        id: "pmComplexity",
        phase: "financial",
        type: "select",
        label: "PM Complexity",
        subtitle: "Affects PM and engineering fee multipliers",
        options: [
            { value: "standard", label: "Standard", description: "Single venue, straightforward install — 1× base fee" },
            { value: "complex", label: "Complex", description: "Multi-phase, tight schedule, coordination heavy — 2× base fee" },
            { value: "major", label: "Major", description: "Multi-venue, long duration, full-time PM — 3× base fee" },
        ],
        defaultValue: "standard",
        required: true,
        affectsSheet: "Labor Worksheet",
    },
    {
        id: "targetPrice",
        phase: "financial",
        type: "number",
        label: "Target Price (Profit Shield)",
        subtitle: "Profit Shield — enter the client's budget and we'll reverse-calculate the required margin. Leave at 0 to skip.",
        defaultValue: 0,
        unit: "$",
        min: 0,
        max: 50000000,
        step: 1000,
        affectsSheet: "Budget Summary",
    },
    // ── CMS (Content Management System) ──────────────────────────────
    {
        id: "includeCms",
        phase: "financial",
        type: "yes-no",
        label: "CMS (Content Management)",
        subtitle: "Content management system for scheduling and controlling display content",
        defaultValue: false,
        affectsSheet: "Budget Summary",
    },
    {
        id: "cmsAllocation",
        phase: "financial",
        type: "number",
        label: "CMS Allocation",
        subtitle: "Enter the total CMS cost. This will appear as a separate section on the Budget Summary.",
        defaultValue: 0,
        unit: "$",
        min: 0,
        max: 5000000,
        step: 500,
        showIf: (answers) => answers.includeCms === true,
        affectsSheet: "Budget Summary",
    },
    // ── Scoring System ───────────────────────────────────────────────
    {
        id: "includeScoring",
        phase: "financial",
        type: "yes-no",
        label: "Scoring System",
        subtitle: "Scoreboard control, timing, and scoring software/hardware",
        defaultValue: false,
        affectsSheet: "Budget Summary",
    },
    {
        id: "scoringAllocation",
        phase: "financial",
        type: "number",
        label: "Scoring Allocation",
        subtitle: "Enter the total scoring system cost. This will appear as a separate section on the Budget Summary.",
        defaultValue: 0,
        unit: "$",
        min: 0,
        max: 5000000,
        step: 500,
        showIf: (answers) => answers.includeScoring === true,
        affectsSheet: "Budget Summary",
    },
    // ── Warranty ─────────────────────────────────────────────────────
    {
        id: "includeWarranty",
        phase: "financial",
        type: "select",
        label: "Warranty",
        subtitle: "Extended warranty for LED hardware and installation",
        options: [
            { value: "none", label: "Not Included", description: "No warranty line item" },
            { value: "included", label: "Included (No Charge)", description: "Listed on proposal but at $0" },
            { value: "priced", label: "Priced Warranty", description: "Enter years and cost" },
        ],
        defaultValue: "none",
        affectsSheet: "Budget Summary",
    },
    {
        id: "warrantyYears",
        phase: "financial",
        type: "select",
        label: "Warranty Term",
        subtitle: "Number of years of extended warranty coverage",
        options: [
            { value: "1", label: "1 Year", description: "Standard warranty" },
            { value: "2", label: "2 Years", description: "" },
            { value: "3", label: "3 Years", description: "Most common" },
            { value: "5", label: "5 Years", description: "Premium coverage" },
        ],
        defaultValue: "1",
        showIf: (answers) => answers.includeWarranty === "priced" || answers.includeWarranty === "included",
        affectsSheet: "Budget Summary",
    },
    {
        id: "warrantyAllocation",
        phase: "financial",
        type: "number",
        label: "Warranty Allocation",
        subtitle: "Enter the total warranty cost. Leave at 0 to auto-calculate based on hardware value.",
        defaultValue: 0,
        unit: "$",
        min: 0,
        max: 5000000,
        step: 500,
        showIf: (answers) => answers.includeWarranty === "priced",
        affectsSheet: "Budget Summary",
    },
];

// ============================================================================
// FLOW HELPERS
// ============================================================================

export interface EstimatorAnswers {
    // Project
    clientName: string;
    projectName: string;
    location: string;
    docType: "budget" | "proposal" | "loi";
    estimateDepth: "rom" | "detailed";
    currency: "USD" | "CAD" | "EUR" | "GBP";
    isIndoor: boolean;
    isNewInstall: boolean;
    isUnion: boolean;
    // Displays (array of per-display answers)
    displays: DisplayAnswers[];
    // Financial — tiered margins
    marginTier: "budget" | "proposal";
    ledMargin: number;       // LED hardware margin (separate from services)
    servicesMargin: number;  // Services/labor margin
    defaultMargin: number;   // Blended fallback
    bondRate: number;
    salesTaxRate: number;
    costPerSqFtOverride: number;
    pmComplexity: string;    // "standard" | "complex" | "major"
    targetPrice: number;     // Profit Shield — 0 = not set, >0 = reverse-calc margin
    // CMS
    includeCms: boolean;
    cmsAllocation: number;
    // Scoring
    includeScoring: boolean;
    scoringAllocation: number;
    // Warranty
    includeWarranty: "none" | "included" | "priced";
    warrantyYears: string;
    warrantyAllocation: number;
}

export interface DisplayAnswers {
    displayType: string;       // Preset key or "custom"
    displayName: string;
    locationType: string;
    widthFt: number;
    heightFt: number;
    pixelPitch: string;
    productId: string;         // ManufacturerProduct ID from catalog
    productName: string;       // Cached product display name
    installComplexity: string;
    serviceType: string;
    isReplacement: boolean;
    useExistingStructure: boolean;
    includeSpareParts: boolean;
    // Phase 2 additions — structural / logistics
    steelScope: string;        // "existing" | "secondary" | "full"
    liftType: string;          // "none" | "scissor" | "boom" | "crane"
    powerDistance: string;      // "near" | "medium" | "far"
    dataRunDistance: string;    // "copper" | "fiber"
    // Smart Assembly Bundle — excluded accessory IDs
    excludedBundleItems: string[];
    // Alt pitch — alternate pixel pitch options (only LED cost changes)
    altPitches: string[];
}

export function getDefaultAnswers(): EstimatorAnswers {
    return {
        clientName: "",
        projectName: "",
        location: "",
        docType: "budget",
        estimateDepth: "rom",
        currency: "USD",
        isIndoor: true,
        isNewInstall: true,
        isUnion: false,
        displays: [],
        marginTier: "budget",
        ledMargin: 15,
        servicesMargin: 20,
        defaultMargin: 30,
        bondRate: 1.5,
        salesTaxRate: 9.5,
        costPerSqFtOverride: 0,
        pmComplexity: "standard",
        targetPrice: 0,
        includeCms: false,
        cmsAllocation: 0,
        includeScoring: false,
        scoringAllocation: 0,
        includeWarranty: "none",
        warrantyYears: "1",
        warrantyAllocation: 0,
    };
}

export function getDefaultDisplayAnswers(): DisplayAnswers {
    return {
        displayType: "",
        displayName: "",
        locationType: "wall",
        widthFt: 0,
        heightFt: 0,
        pixelPitch: "4",
        productId: "",
        productName: "",
        installComplexity: "standard",
        serviceType: "Front/Rear",
        isReplacement: false,
        useExistingStructure: false,
        includeSpareParts: true,
        steelScope: "full",
        liftType: "scissor",
        powerDistance: "near",
        dataRunDistance: "copper",
        excludedBundleItems: [],
        altPitches: [],
    };
}

/**
 * Get all questions for the current flow state.
 * Returns a flat list with display questions expanded per display.
 */
export function getAllQuestions(displayCount: number): Question[] {
    const questions: Question[] = [...PROJECT_QUESTIONS];

    for (let i = 0; i < Math.max(displayCount, 1); i++) {
        questions.push(...DISPLAY_QUESTIONS.map((q) => ({
            ...q,
            id: `display_${i}_${q.id}`,
            label: displayCount > 0 && q.phase === "display" && q.id === "displayName"
                ? `Display ${i + 1} — what's it called?`
                : q.label,
        })));
    }

    questions.push(...FINANCIAL_QUESTIONS);
    return questions;
}

/**
 * Total question count for progress bar calculation
 */
export function getTotalQuestionCount(displayCount: number): number {
    const visibleDisplay = DISPLAY_QUESTIONS.filter((q) => q.type !== "display-loop");
    return PROJECT_QUESTIONS.length + (visibleDisplay.length * Math.max(displayCount, 1)) + FINANCIAL_QUESTIONS.length;
}
