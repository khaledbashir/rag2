/**
 * Unified RFP Analysis Pipeline — Types
 *
 * Single pipeline replaces pdf-triage, pdf-filter, and rfp/process.
 * Mistral OCR for text/tables, Gemini 2.0 Flash for drawing vision.
 */

// ============================================================================
// PAGE-LEVEL TYPES (per-page analysis output)
// ============================================================================

export type PageCategory =
  | "led_specs"       // LED display specs, schedules, requirements
  | "drawing"         // Architectural/AV/electrical drawings
  | "cost_schedule"   // Pricing, cost breakdowns, bid forms
  | "scope_of_work"   // SOW, project descriptions, timelines
  | "technical"       // Technical specs (non-LED), power, structural
  | "legal"           // Terms, conditions, insurance, bonds
  | "boilerplate"     // Cover pages, TOC, bios, certifications
  | "schedule"        // Project timelines, milestones, Gantt charts
  | "unknown";

export interface AnalyzedPage {
  /** 0-based page index */
  index: number;
  /** 1-based page number */
  pageNumber: number;
  /** Category assigned by AI or heuristics */
  category: PageCategory;
  /** How relevant this page is to LED display extraction (0-100) */
  relevance: number;
  /** Structured markdown from Mistral OCR */
  markdown: string;
  /** Tables extracted as HTML (from Mistral OCR) */
  tables: Array<{ id: string; content: string; format: string }>;
  /** Thumbnail as base64 PNG (for UI) */
  thumbnail?: string;
  /** Whether this page was analyzed by Gemini vision (drawings only) */
  visionAnalyzed: boolean;
  /** Vision analysis summary (only for drawing pages) */
  visionSummary?: string;
  /** LED specs extracted from this page (if any) */
  extractedSpecs?: ExtractedLEDSpec[];
  /** Short human-readable summary of what's on this page */
  summary: string;
  /** Detection method: how we classified this page */
  classifiedBy: "text-heuristic" | "gemini-vision" | "mistral-ocr";
}

// ============================================================================
// LED EXTRACTION — THE UNIFIED SPEC
// ============================================================================

/**
 * One LED display extracted from the RFP.
 *
 * This is the single source of truth for extracted display data.
 * Maps directly to ScreenConfig (Prisma) and ExtractedScreen (autoRfpResponse).
 */
export interface ExtractedLEDSpec {
  /** Display name from RFP (e.g. "North Main Videoboard") */
  name: string;
  /** Physical location (e.g. "North End Zone, Upper Level") */
  location: string;
  /** Width in feet */
  widthFt: number | null;
  /** Height in feet */
  heightFt: number | null;
  /** Horizontal resolution in pixels */
  widthPx: number | null;
  /** Vertical resolution in pixels */
  heightPx: number | null;
  /** Pixel pitch in mm */
  pixelPitchMm: number | null;
  /** Brightness in nits */
  brightnessNits: number | null;
  /** Indoor or outdoor */
  environment: "indoor" | "outdoor";
  /** Number of identical displays */
  quantity: number;
  /** Mounting/service access type */
  serviceType: "front" | "rear" | "top" | null;
  /** Mounting method */
  mountingType: string | null;
  /** Max power in watts */
  maxPowerW: number | null;
  /** Weight in lbs */
  weightLbs: number | null;
  /** Special requirements (weatherproof, curved, etc.) */
  specialRequirements: string[];
  /** AI confidence 0-1 */
  confidence: number;
  /** Source page(s) where this spec was found */
  sourcePages: number[];
  /** How it was extracted */
  sourceType: "text" | "drawing" | "table";
  /** Citation for traceability */
  citation: string;
  /** Raw notes from AI */
  notes: string | null;
  /** Item category — what type of equipment this is */
  category?: "led_display" | "scoreboard" | "clock" | "control_system" | "other";
  /** Whether this is a cost alternate (not base bid) */
  isAlternate?: boolean;
  /** Alternate ID from the RFP (e.g., "A1", "B3") */
  alternateId?: string | null;
  /** Description of what this alternate changes */
  alternateDescription?: string | null;
  /** Cabinet-snapped width after product selection (original widthFt stays locked) */
  activeWidthFt?: number | null;
  /** Cabinet-snapped height after product selection (original heightFt stays locked) */
  activeHeightFt?: number | null;
  /** Number of full cabinets (from packCabinetsAndModules) */
  cabinetCount?: number | null;
  /** Number of fill modules for remainder (from packCabinetsAndModules) */
  moduleCount?: number | null;
  /** Blended price per sqft (80% standard + 20% custom if modules needed) */
  blendedPriceSqFt?: number | null;
  /** Explicit product selection from user (e.g. estimator catalog browser) */
  selectedProductId?: string | null;
  /** Cached display name of selected product */
  selectedProductName?: string | null;
}

// ============================================================================
// PROJECT-LEVEL EXTRACTION
// ============================================================================

export interface ExtractedProjectInfo {
  clientName: string | null;
  projectName: string | null;
  venue: string | null;
  location: string | null;
  isOutdoor: boolean;
  isUnionLabor: boolean;
  bondRequired: boolean;
  specialRequirements: string[];
  /** Schedule phases if found */
  schedulePhases: Array<{
    phaseName: string;
    startDate: string | null;
    endDate: string | null;
    duration: string | null;
  }>;
}

// ============================================================================
// REQUIREMENTS EXTRACTION (Step 2: Key Points)
// ============================================================================

export type RequirementCategory =
  | "compliance"    // NEMA ratings, UL listings, certifications
  | "technical"     // IP video, resolution, color space, processing
  | "deadline"      // Submission dates, milestones, completion dates
  | "financial"     // Bond, insurance, payment terms
  | "operational"   // Warranty, maintenance, spare parts, training
  | "environmental" // Weather, IP rating, temperature range
  | "other";

export type RequirementStatus = "critical" | "verified" | "risk" | "info";

export interface ExtractedRequirement {
  /** Short description of the requirement */
  description: string;
  /** Category */
  category: RequirementCategory;
  /** Status/severity */
  status: RequirementStatus;
  /** Date if deadline-related */
  date: string | null;
  /** Source page(s) */
  sourcePages: number[];
  /** Direct quote from RFP */
  rawText: string | null;
}

// ============================================================================
// FULL ANALYSIS RESULT
// ============================================================================

export interface RFPAnalysisResult {
  /** All pages with classification and extraction */
  pages: AnalyzedPage[];
  /** All LED displays found across all pages */
  screens: ExtractedLEDSpec[];
  /** Incomplete specs quarantined for manual entry (name/location but no physical specs) */
  incompleteSpecs?: IncompleteSpec[];
  /** Project-level metadata */
  project: ExtractedProjectInfo;
  /** Summary statistics */
  stats: {
    totalPages: number;
    relevantPages: number;
    drawingPages: number;
    specsFound: number;
    extractionAccuracy: "High" | "Standard" | "Low";
    processingTimeMs: number;
    mistralPagesProcessed: number;
    geminiPagesProcessed: number;
  };
  /** Source files processed */
  files: Array<{
    filename: string;
    pageCount: number;
    sizeBytes: number;
  }>;
  /** Warnings surfaced to the user (non-fatal issues during extraction) */
  warnings?: string[];
  /** True if all AI extraction providers failed — results may be empty due to errors, not absence of data */
  extractionFailed?: boolean;
}

/**
 * A display referenced in the RFP with name/location but no measurable physical specs.
 * Surfaced to the user as "incomplete — manual entry required" instead of silently dropped.
 */
export interface IncompleteSpec {
  name: string;
  location: string;
  notes: string | null;
  sourcePages: number[];
  reason: string;
}

// ============================================================================
// PIPELINE CONFIG
// ============================================================================

export interface AnalysisPipelineOptions {
  /** Skip Gemini vision analysis (faster, text-only) */
  skipVision?: boolean;
  /** Minimum relevance score to include page in output (0-100) */
  relevanceThreshold?: number;
  /** Max pages to process (for large RFPs) */
  maxPages?: number;
  /** Generate thumbnails for UI */
  generateThumbnails?: boolean;
  /** Callback for progress updates */
  onProgress?: (progress: AnalysisProgress) => void;
}

export interface AnalysisProgress {
  stage: "uploading" | "ocr" | "classifying" | "vision" | "extracting" | "complete";
  percent: number;
  message: string;
  currentPage?: number;
  totalPages?: number;
}
