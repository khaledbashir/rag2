/**
 * Verification System Types
 * Complete type definitions for 4-layer verification, auto-fix, and exception handling
 */

// ============================================================================
// VERIFICATION MANIFEST
// ============================================================================

/**
 * Control totals captured at each stage of the pipeline
 * Stored with proposal for audit trail
 */
export interface VerificationManifest {
    id: string;
    proposalId: string;
    timestamp: string;
    
    // STAGE 1: Excel Import Metrics
    excelImport: {
        fileName: string;
        rowCount: number;              // Total rows read from Excel
        screenCount: number;           // Valid screens extracted
        altRowsSkipped: number;        // ALT/Alternate rows filtered
        blankRowsSkipped: number;      // Rows without valid data
        headerRowIndex: number;        // Where headers were found
        sheetsRead: string[];          // List of sheets accessed
    };
    
    // STAGE 2: Per-Screen Calculations
    perScreen: PerScreenManifest[];
    
    // STAGE 3: Proposal Totals (Aggregated)
    proposalTotals: ProposalTotalsManifest;
    
    // STAGE 4: Source vs Calculated Comparison
    reconciliation: ReconciliationManifest;
    
    // STAGE 5: All 4 Layers Verification Results
    layers: {
        layer1: LayerVerification;  // Excel vs Calculation
        layer2: LayerVerification;  // PDF vs Ugly Sheet
        layer3: LayerVerification;  // Rounding Check
        layer4: LayerVerification;  // AI Visual Verification
    };
}

export interface PerScreenManifest {
    name: string;
    rowIndex: number;                 // Row in Excel (for traceability)
    areaSqFt: number;
    pixelResolution: number;
    pixelMatrix: string;
    
    // Source values (from Excel)
    source: {
        hardwareCost: number;
        installCost: number;
        otherCost: number;
        shippingCost: number;
        totalCost: number;
        sellPrice: number;
        ancMargin: number;
        bondCost: number;
        finalTotal: number;
    };
    
    // Calculated values (from Natalia)
    calculated: {
        hardwareCost: number;
        structureCost: number;
        installCost: number;
        laborCost: number;
        powerCost: number;
        shippingCost: number;
        totalCost: number;
        sellPrice: number;
        ancMargin: number;
        bondCost: number;
        boTaxCost: number;
        finalTotal: number;
    };
    
    // Variance analysis
    variance: {
        totalCost: number;
        sellPrice: number;
        finalTotal: number;
        percentVariance: number;
    };
}

export interface ProposalTotalsManifest {
    screenCount: number;
    totalAreaSqFt: number;
    totalPixelResolution: number;
    
    // Source totals (sum of Excel columns)
    sourceTotals: {
        hardwareCost: number;
        totalCost: number;
        sellPrice: number;
        ancMargin: number;
        bondCost: number;
        finalTotal: number;
    };
    
    // Calculated totals (sum of Natalia calculations)
    calculatedTotals: {
        hardwareCost: number;
        structureCost: number;
        installCost: number;
        laborCost: number;
        totalCost: number;
        sellPrice: number;
        ancMargin: number;
        bondCost: number;
        boTaxCost: number;
        finalTotal: number;
    };
    
    // Variance
    variance: {
        finalTotal: number;
        percentVariance: number;
    };
}

export interface ReconciliationManifest {
    sourceFinalTotal: number;
    calculatedFinalTotal: number;
    variance: number;
    variancePercent: number;
    isMatch: boolean;
    matchType: 'EXACT' | 'WITHIN_THRESHOLD' | 'EXCEEDS_THRESHOLD';
}

// ============================================================================
// LAYER VERIFICATION (4 Layers)
// ============================================================================

export interface LayerVerification {
    layer: 'LAYER_1' | 'LAYER_2' | 'LAYER_3' | 'LAYER_4';
    name: string;
    status: VerificationStatus;
    timestamp: string;
    duration?: number;  // in milliseconds
    
    // Results
    results: {
        source: any;
        calculated: any;
        variance?: number;
        variancePercent?: number;
    };
    
    // Details
    details?: {
        checksPerformed: number;
        checksPassed: number;
        checksFailed: number;
        issues?: string[];
    };
}

// ============================================================================
// RECONCILIATION REPORT
// ============================================================================

/**
 * Human-readable reconciliation report
 * Generated after verification for user review
 */
export interface ReconciliationReport {
    id: string;
    proposalId: string;
    timestamp: string;
    status: VerificationStatus;
    
    // Summary
    summary: {
        totalScreens: number;
        verifiedScreens: number;
        screensWithVariance: number;
        totalVariance: number;
        maxVariance: number;
        avgVariance: number;
    };
    
    // Excel source totals
    excelSource: {
        finalTotal: number;
        screenCount: number;
        bondTotal: number;
        taxTotal: number;
        marginPercent: number;
    };
    
    // Natalia calculated totals
    nataliaCalculated: {
        finalTotal: number;
        screenCount: number;
        bondTotal: number;
        taxTotal: number;
        marginPercent: number;
    };
    
    // Variance analysis
    variances: {
        finalTotal: VarianceDetail;
        screenCount: VarianceDetail;
        bondTotal: VarianceDetail;
        taxTotal: VarianceDetail;
    };
    
    // Per-screen breakdown
    perScreen: PerScreenReconciliation[];
    
    // Exceptions found
    exceptions: Exception[];
    
    // Recommended actions
    recommendations: ActionRecommendation[];
}

export interface VarianceDetail {
    variance: number;
    percent: number;
    acceptable: boolean;
    threshold: number;
}

export interface PerScreenReconciliation {
    name: string;
    status: 'MATCH' | 'VARIANCE' | 'MISSING' | 'ERROR';
    sourceTotal: number;
    calculatedTotal: number;
    variance: number;
    variancePercent: number;
    issues: string[];
}

// ============================================================================
// VERIFICATION STATUS
// ============================================================================

export enum VerificationStatus {
    PENDING = 'PENDING',           // Not yet verified
    VERIFIED = 'VERIFIED',         // All totals match exactly
    WARNING = 'WARNING',           // Minor variances (< $1 or < 0.1%)
    ERROR = 'ERROR',               // Major variances or critical issues
    BLOCKED = 'BLOCKED'            // Cannot proceed without fixes
}

export interface VerificationBadge {
    status: VerificationStatus;
    color: 'green' | 'yellow' | 'red' | 'gray';
    icon: string;
    message: string;
    subtext: string;
    timestamp: string;
    
    // Permissions
    canExportPDF: boolean;
    canShareLink: boolean;
    canSign: boolean;
    
    // Actions
    actions: BadgeAction[];
}

export interface BadgeAction {
    label: string;
    action: string;
    primary?: boolean;
    destructive?: boolean;
}

// ============================================================================
// EXCEPTIONS
// ============================================================================

export enum ExceptionType {
    // Data Quality Issues
    MISSING_FIELD = 'MISSING_FIELD',
    INVALID_VALUE = 'INVALID_VALUE',
    NON_NUMERIC_COST = 'NON_NUMERIC_COST',
    
    // Calculation Issues
    CALC_MISMATCH = 'CALC_MISMATCH',
    ROUNDING_DRIFT = 'ROUNDING_DRIFT',
    MARGIN_VIOLATION = 'MARGIN_VIOLATION',
    
    // Mapping Issues
    COLUMN_DRIFT = 'COLUMN_DRIFT',
    HEADER_NOT_FOUND = 'HEADER_NOT_FOUND',
    SHEET_NOT_FOUND = 'SHEET_NOT_FOUND',
    
    // Business Rule Issues
    ALT_ROW_SKIPPED = 'ALT_ROW_SKIPPED',
    SCREEN_DROPPED = 'SCREEN_DROPPED',
    FORMULA_NOT_UPDATED = 'FORMULA_NOT_UPDATED',
}

export enum ExceptionSeverity {
    INFO = 'INFO',
    WARNING = 'WARNING',
    ERROR = 'ERROR',
    CRITICAL = 'CRITICAL',
}

export enum ExceptionCategory {
    DATA_QUALITY = 'DATA_QUALITY',
    CALC_MISMATCH = 'CALC_MISMATCH',
    MAPPING_ERROR = 'MAPPING_ERROR',
    BUSINESS_RULE = 'BUSINESS_RULE',
}

export interface Exception {
    id: string;
    type: ExceptionType;
    category: ExceptionCategory;
    severity: ExceptionSeverity;
    
    // Context
    screenName?: string;
    fieldName?: string;
    rowIndex?: number;
    columnIndex?: number;
    
    // Values
    expected?: any;
    actual?: any;
    variance?: number;
    
    // Message
    message: string;
    description: string;
    
    // Auto-fix
    autoFixable: boolean;
    
    // Resolution
    resolved: boolean;
    resolvedAt?: string;
    resolvedBy?: 'system' | 'user';
}


// ============================================================================
// ACTION RECOMMENDATIONS
// ============================================================================

export interface ActionRecommendation {
    priority: 'HIGH' | 'MEDIUM' | 'LOW';
    category: 'FIX_NOW' | 'REVIEW' | 'IGNORE';
    title: string;
    description: string;
    
    // What the user should do
    action: {
        type: 'FILL_FIELD' | 'REVIEW_VARIANCE' | 'APPROVE' | 'REJECT';
        target?: string;
        options?: string[];
    };
    
    // Impact
    impact: {
        fixesExceptions: string[];
        unblocksActions: string[];
    };
}

// ============================================================================
// VERIFICATION CONFIG
// ============================================================================

export interface VerificationConfig {
    // Thresholds
    varianceThreshold: number;          // Default: $0.01
    variancePercentThreshold: number;   // Default: 0.001 (0.1%)
    
    // Blocking behavior
    blockOnError: boolean;              // Default: true
    blockOnWarning: boolean;            // Default: false
    
    
    // Reporting
    logExceptions: boolean;             // Default: true
    generateReport: boolean;            // Default: true
    
    // AI Visual Verification
    enableAIVerification: boolean;     // Default: true
    aiVerificationSpeed: number;        // Default: 100ms per row
}

export const DEFAULT_VERIFICATION_CONFIG: VerificationConfig = {
    varianceThreshold: 0.01,
    variancePercentThreshold: 0.001,
    blockOnError: true,
    blockOnWarning: false,
    logExceptions: true,
    generateReport: true,
    enableAIVerification: true,
    aiVerificationSpeed: 100,
};

// ============================================================================
// AI VISUAL VERIFICATION
// ============================================================================

export interface AIVerificationState {
    isRunning: boolean;
    currentRow: number;
    totalRows: number;
    percentComplete: number;
    currentScreen?: string;
    
    // Current row being verified
    currentCheck: {
        excelRow: ExcelRowPreview;
        pdfRow: PDFRowPreview;
        isMatch: boolean;
        variance?: number;
    };
    
    // Results so far
    results: AIVerificationResult[];
}

export interface ExcelRowPreview {
    lineNumber: number;
    screenName: string;
    widthFt: number;
    heightFt: number;
    pitchMm: number;
    total: number;
    rawData: any;
}

export interface PDFRowPreview {
    pageNumber: number;
    lineNumber: number;
    screenName: string;
    widthFt: number;
    heightFt: number;
    pitchMm: number;
    total: number;
}

export interface AIVerificationResult {
    rowNumber: number;
    screenName: string;
    excelTotal: number;
    pdfTotal: number;
    variance: number;
    isMatch: boolean;
    fix?: {
        type: string;
        action: string;
        explanation: string;
    };
}

// ============================================================================
// EDITABLE PDF PREVIEW
// ============================================================================

export interface EditablePDFState {
    isEditable: boolean;
    editedFields: string[];
    lastRecalculated: string;
    
    // Track what's been edited
    changes: {
        field: string;
        oldValue: any;
        newValue: any;
        timestamp: string;
    }[];
}

export interface PDFEditAction {
    field: string;
    value: any;
    fieldType: 'currency' | 'text' | 'number' | 'date';
    screenIndex?: number;
}

export interface RecalculationResult {
    success: boolean;
    newTotals: {
        subtotal: number;
        bond: number;
        boTax: number;
        finalTotal: number;
    };
    verification: {
        layer2Passed: boolean;
        variance?: number;
    };
    timestamp: string;
}
