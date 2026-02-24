import { z } from "zod";

// Variables
import { DATE_OPTIONS } from "@/lib/variables";

// TODO: Refactor some of the validators. Ex: name and zipCode or address and country have same rules
// Field Validators
const fieldValidators = {
    name: z
        .string()
        .min(2, { message: "Must be at least 2 characters" })
        .max(50, { message: "Must be at most 50 characters" }),
    address: z
        .string()
        .min(2, { message: "Must be at least 2 characters" })
        .max(70, { message: "Must be between 2 and 70 characters" }),
    zipCode: z
        .string()
        .min(2, { message: "Must be between 2 and 20 characters" })
        .max(20, { message: "Must be between 2 and 20 characters" }),
    city: z
        .string()
        .min(1, { message: "Must be between 1 and 50 characters" })
        .max(50, { message: "Must be between 1 and 50 characters" }),
    country: z
        .string()
        .min(1, { message: "Must be between 1 and 70 characters" })
        .max(70, { message: "Must be between 1 and 70 characters" }),
    email: z
        .string()
        .email({ message: "Email must be a valid email" })
        .min(5, { message: "Must be between 5 and 30 characters" })
        .max(30, { message: "Must be between 5 and 30 characters" }),
    phone: z
        .string()
        .min(1, { message: "Must be between 1 and 50 characters" })
        .max(50, {
            message: "Must be between 1 and 50 characters",
        }),

    // Dates
    date: z
        .date()
        .transform((date) =>
            new Date(date).toLocaleDateString("en-US", DATE_OPTIONS)
        ),

    // Items
    quantity: z.coerce
        .number()
        .gt(0, { message: "Must be a number greater than 0" }),
    unitPrice: z.coerce
        .number()
        .gt(0, { message: "Must be a number greater than 0" })
        .lte(Number.MAX_SAFE_INTEGER, { message: `Must be ≤ ${Number.MAX_SAFE_INTEGER}` }),

    // Strings
    string: z.string(),
    stringMin1: z.string().min(1, { message: "Must be at least 1 character" }),
    stringToNumber: z.coerce.number(),

    // Charges
    stringToNumberWithMax: z.coerce.number().max(1000000),

    stringOptional: z.string().optional(),

    nonNegativeNumber: z.coerce.number().nonnegative({
        message: "Must be a positive number",
    }),
};

const CustomInputSchema = z.object({
    key: z.string(),
    value: z.string(),
});

const ProposalSenderSchema = z.object({
    name: fieldValidators.name,
    address: fieldValidators.address,
    zipCode: fieldValidators.zipCode,
    city: fieldValidators.city,
    country: fieldValidators.country,
    email: fieldValidators.email,
    phone: fieldValidators.phone,
    customInputs: z.array(CustomInputSchema).optional(),
});

const ProposalReceiverSchema = z.object({
    name: fieldValidators.name,
    address: fieldValidators.address,
    zipCode: fieldValidators.zipCode,
    city: fieldValidators.city,
    country: fieldValidators.country,
    email: fieldValidators.email,
    phone: fieldValidators.phone,
    customInputs: z.array(CustomInputSchema).optional(),
});

const ItemSchema = z.object({
    name: fieldValidators.stringMin1,
    description: fieldValidators.stringOptional,
    quantity: fieldValidators.quantity,
    unitPrice: fieldValidators.unitPrice,
    total: fieldValidators.stringToNumber,
});

const PaymentInformationSchema = z.object({
    bankName: fieldValidators.stringMin1,
    accountName: fieldValidators.stringMin1,
    accountNumber: fieldValidators.stringMin1,
});

const DiscountDetailsSchema = z.object({
    amount: fieldValidators.stringToNumberWithMax,
    amountType: fieldValidators.string,
});

const TaxDetailsSchema = z.object({
    amount: fieldValidators.stringToNumberWithMax,
    taxID: fieldValidators.string,
    amountType: fieldValidators.string,
});

const ShippingDetailsSchema = z.object({
    cost: fieldValidators.stringToNumberWithMax,
    costType: fieldValidators.string,
});

const SignatureSchema = z.object({
    data: fieldValidators.string,
    fontFamily: fieldValidators.string.optional(),
});

// Audit schemas
const ClientSummarySchema = z.object({
    subtotal: z.number(),
    total: z.number(),
    breakdown: z.object({
        hardware: z.number(),
        structure: z.number(),
        install: z.number(),
        others: z.number(),
    }),
});

const ScreenAuditSchema = z.object({
    name: fieldValidators.stringMin1,
    productType: fieldValidators.string.optional(),
    quantity: z.coerce.number().nonnegative().optional(),
    areaSqFt: z.coerce.number().nonnegative(),
    pixelResolution: z.coerce.number().nonnegative(),
    pixelMatrix: z.string().optional(),
    serviceType: z.string().optional(),
    breakdown: z.object({
        hardware: z.number(),
        structure: z.number(),
        install: z.number(),
        labor: z.number(),
        demolition: z.number().optional(),
        power: z.number(),
        shipping: z.number(),
        pm: z.number(),
        generalConditions: z.number(),
        travel: z.number(),
        submittals: z.number(),
        engineering: z.number(),
        permits: z.number(),
        cms: z.number(),
        ancMargin: z.number(),
        sellPrice: z.number(),
        bondCost: z.number(),
        marginAmount: z.number(),
        totalCost: z.number(),
        finalClientTotal: z.number(),
        sellingPricePerSqFt: z.number(),
        boTaxCost: z.number().optional(), // REQ-48
        salesTaxCost: z.number().optional(), // REQ-125
        salesTaxRate: z.number().optional(), // REQ-125
    }),
});

const InternalAuditSchema = z.object({
    perScreen: z.array(ScreenAuditSchema),
    totals: z.object({
        hardware: z.number(),
        structure: z.number(),
        install: z.number(),
        labor: z.number(),
        demolition: z.number().optional(),
        power: z.number(),
        shipping: z.number(),
        pm: z.number(),
        generalConditions: z.number(),
        travel: z.number(),
        submittals: z.number(),
        engineering: z.number(),
        permits: z.number(),
        cms: z.number(),
        ancMargin: z.number(),
        sellPrice: z.number(),
        bondCost: z.number(),
        margin: z.number(),
        totalCost: z.number(),
        finalClientTotal: z.number(),
        sellingPricePerSqFt: z.number(),
        boTaxCost: z.number().optional(), // REQ-48
    }),
});

const ProposalDetailsSchema = z.object({
    proposalLogo: fieldValidators.stringOptional,
    proposalId: fieldValidators.stringOptional,
    proposalName: fieldValidators.stringOptional, // Professional project name
    location: fieldValidators.stringOptional, // Project Location (e.g. "Dodger Stadium")
    clientName: fieldValidators.stringOptional,
    workspaceId: fieldValidators.stringOptional,
    aiWorkspaceSlug: fieldValidators.stringOptional,
    proposalNumber: fieldValidators.stringMin1,
    proposalDate: fieldValidators.date,
    dueDate: fieldValidators.date,
    ntpDate: z.string().optional(),
    purchaseOrderNumber: fieldValidators.stringOptional,
    currency: fieldValidators.string,
    language: fieldValidators.string,
    items: z.array(ItemSchema),
    // Screens (ANC-specific estimator inputs)
    screens: z.array(z.object({
        id: fieldValidators.stringOptional,
        name: fieldValidators.stringMin1, // Changed to "Internal Shorthand"
        externalName: fieldValidators.stringOptional, // Professional Client Name
        customDisplayName: fieldValidators.stringOptional, // Manual override for PDF Preview
        sourceRef: z.object({
            sheet: z.string(),
            row: z.number().int().positive(),
        }).optional(),
        productType: fieldValidators.string.optional(),
        zoneComplexity: z.enum(["standard", "complex"]).optional(),
        zoneSize: z.enum(["small", "medium", "large"]).optional(),
        widthFt: z.coerce.number().nonnegative().optional(),
        heightFt: z.coerce.number().nonnegative().optional(),
        quantity: z.coerce.number().nonnegative().optional(),
        pitchMm: z.coerce.number().nonnegative().optional(),
        pixelsH: z.coerce.number().nonnegative().optional(),
        pixelsW: z.coerce.number().nonnegative().optional(),
        brightness: z.string().optional(), // Terminology: Brightness (formerly Nits)
        costPerSqFt: z.coerce.number().nonnegative().optional(),
        desiredMargin: z.coerce.number().min(0).max(1).optional(),
        isManualLineItem: z.boolean().optional().default(false),
        manualCost: z.coerce.number().nonnegative().optional(),
        serviceType: z.string().optional(), // "Top" or "Front/Rear"
        formFactor: z.string().optional(), // "Straight" or "Curved"
        outletDistance: z.coerce.number().nonnegative().optional(),
        hiddenFromSpecs: z.boolean().optional().default(false),
        isReplacement: z.boolean().default(false),
        useExistingStructure: z.boolean().default(false),
        includeSpareParts: z.boolean().default(true),
        calculatedExhibitG: z.object({
            displayWidthFt: z.number(),
            displayHeightFt: z.number(),
            resolutionW: z.number(),
            resolutionH: z.number(),
            activeAreaM2: z.number(),
            activeAreaSqFt: z.number(),
            maxPowerW: z.number(),
            avgPowerW: z.number(),
            totalWeightLbs: z.number(),
            pitchMm: z.number(),
        }).optional(),
        calculatedPricing: z.object({
            installCost: z.number(),
            pmCost: z.number(),
            engCost: z.number(),
            hardwareCost: z.number().nullable(),
            totalEstimate: z.number().nullable(),
            zoneClass: z.enum(["standard", "medium", "large", "complex"]),
        }).optional(),
        aiSource: z.record(z.object({
            page: z.number().optional(),
            text: z.string().optional(),
            confidence: z.number().optional(),
        })).optional(),
    })).optional(),
    generatedSchedule: z.object({
        tasks: z.array(z.object({
            taskName: z.string(),
            locationName: z.string().nullable(),
            startDate: z.string(),
            endDate: z.string(),
            durationDays: z.number(),
            isParallel: z.boolean(),
            phase: z.string(),
        })),
        totalDurationDays: z.number(),
        completionDate: z.string(),
    }).optional(),
    extractedScheduleReference: z.array(z.object({
        phaseName: z.string(),
        phaseNumber: z.string().nullable().optional(),
        duration: z.string().nullable().optional(),
        startDate: z.string().nullable().optional(),
        endDate: z.string().nullable().optional(),
        taskCount: z.number().optional(),
    })).optional(),
    // Audit snapshots
    internalAudit: InternalAuditSchema.optional(),
    clientSummary: ClientSummarySchema.optional(),
    paymentInformation: PaymentInformationSchema.optional(),
    taxDetails: TaxDetailsSchema.optional(),
    discountDetails: DiscountDetailsSchema.optional(),
    shippingDetails: ShippingDetailsSchema.optional(),
    subTotal: fieldValidators.nonNegativeNumber,
    totalAmount: fieldValidators.nonNegativeNumber,
    totalAmountInWords: fieldValidators.string,
    additionalNotes: fieldValidators.stringOptional,
    scopeOfWorkText: fieldValidators.stringOptional, // Exhibit B - custom SOW text
    aiGeneratedSOW: z.object({
        designServices: z.string().optional(),
        constructionLogistics: z.string().optional(),
        constraints: z.string().optional(),
        generatedAt: z.string().optional(),
        editedByUser: z.boolean().optional().default(false),
    }).optional(),
    signatureBlockText: fieldValidators.stringOptional, // Custom legal text before signature lines
    specsSectionTitle: fieldValidators.stringOptional, // Custom title for specifications section (default: "SPECIFICATIONS")
    paymentTerms: fieldValidators.stringMin1,
    signature: SignatureSchema.optional(),
    updatedAt: fieldValidators.stringOptional,
    documentType: z.enum(["LOI", "First Round"]).default("First Round"),
    pricingType: z.enum(["Hard Quoted", "Budget"]).default("Budget"),
    documentMode: z.enum(["BUDGET", "PROPOSAL", "LOI"]).optional().default("BUDGET"),
    pageLayout: z.string().optional().default("portrait-letter"),
    specsDisplayMode: z.enum(["condensed", "extended"]).optional().default("extended"),
    mirrorMode: z.boolean().default(false),
    calculationMode: z.enum(["MIRROR", "INTELLIGENCE"]).default("INTELLIGENCE"),
    pricingDocument: z.any().optional().nullable(),
    pricingMode: z.string().optional().nullable(),
    status: fieldValidators.stringOptional,
    pdfTemplate: z.number(),
    taxRateOverride: z.number().optional(), // e.g., 0.095 for 9.5%
    bondRateOverride: z.number().optional(), // e.g., 0.015 for 1.5%
    insuranceRateOverride: z.number().optional(), // REQ-WVU: Separate from Bond
    overheadRate: z.number().optional().default(0.10), // REQ-WVU: 10%
    profitRate: z.number().optional().default(0.05), // REQ-WVU: 5%
    signerName: z.string().optional(), // REQ-WVU: Auto-pop names
    signerTitle: z.string().optional(), // REQ-WVU: Auto-pop titles
    globalMargin: z.number().optional(),
    metadata: z.object({
        filledByAI: z.array(z.string()).optional(), // DEPRECATED: use aiFilledFields
        risks: z.array(z.string()).optional(),
        structuralTonnage: z.number().optional(),
        reinforcingTonnage: z.number().optional(),
        // Master Truth Audit Trail
        aiFilledFields: z.array(z.string()).optional(),
        verifiedFields: z.record(z.object({
            verifiedBy: z.string(),
            verifiedAt: z.string(), // ISO String
        })).optional(),
    }).optional(),
    // Share Link Security
    shareExpiresAt: z.string().optional(),
    sharePasswordHash: z.string().optional(),
    venue: z.enum(["Milan Puskar Stadium", "WVU Coliseum", "Generic"]).default("Generic"), // REQ-47
    quoteItems: z.array(z.object({
        id: z.string(),
        locationName: z.string(),
        description: z.string(),
        price: z.number(),
    })).optional().default([]),
    // PDF Section Toggles (REQ-PdfConfig)
    includePricingBreakdown: z.boolean().optional().default(false), // Toggle for per-screen pricing detail
    showPricingTables: z.boolean().optional().default(true),
    showIntroText: z.boolean().optional().default(true),
    showBaseBidTable: z.boolean().optional().default(false),
    showSpecifications: z.boolean().optional().default(true),
    showCompanyFooter: z.boolean().optional().default(true),
    showPaymentTerms: z.boolean().optional().default(true), // Toggle for payment terms section
    showSignatureBlock: z.boolean().optional().default(true), // Toggle for signature block
    showAssumptions: z.boolean().optional().default(false), // Toggle for assumptions text (default OFF per client)
    showExhibitA: z.boolean().optional().default(false), // Toggle for Exhibit A (Statement of Work)
    showExhibitB: z.boolean().optional().default(false), // Toggle for Exhibit B (Cost Schedule)
    // Universal toggles for Hybrid Template - available for ALL document types
    showNotes: z.boolean().optional().default(true), // Toggle for Notes section (Budget, Proposal, LOI)
    showScopeOfWork: z.boolean().optional().default(false), // Toggle for Scope of Work section (all doc types)
    // FR-4.1: Manual Section Header Overrides (e.g., "G7" → "Ribbon Display")
    tableHeaderOverrides: z.record(z.string()).optional().default({}),
    // Mirror Mode: Line item description overrides (key: "tableId:itemIndex")
    descriptionOverrides: z.record(z.string()).optional().default({}),
    // Mirror Mode: Line item price/amount overrides (key: "tableId:itemIndex")
    priceOverrides: z.record(z.number()).optional().default({}),
    // Mirror LOI responsibility matrix controls
    includeResponsibilityMatrix: z.boolean().optional().default(false),
    responsibilityMatrix: z.any().optional().nullable(),
    respMatrixFormatOverride: z.enum(["auto", "short", "long", "hybrid"]).optional().default("auto"),
    parserValidationReport: z.any().optional().nullable(),
    sourceWorkbookHash: z.string().optional().nullable(),
    parserStrictVersion: z.string().optional().nullable(),
    // Prompt 51: index of table used for project grand total summary
    masterTableIndex: z.number().int().nullable().optional().default(null),
    // FR-4.2: Custom Proposal Notes (ad-hoc text injection)
    customProposalNotes: z.string().optional(),
    // FR-4.3: Editable Introduction Text (custom header blurb with currency disclaimers)
    introductionText: z.string().optional(),
    // Prompt 10: LOI opening legal paragraph (editable in LOI tab of Document Text Settings)
    loiHeaderText: z.string().optional(),
    // RFP Pipeline: source tracking + async embedding status
    source: z.string().nullable().optional(),
    embeddingStatus: z.string().nullable().optional(),
    // Google Sheet URL for quick access button
    googleSheetUrl: z.string().url("Invalid URL").optional().nullable().or(z.literal("")),
});

const ProposalSchema = z.object({
    sender: ProposalSenderSchema,
    receiver: ProposalReceiverSchema,
    details: ProposalDetailsSchema,
});

export { ProposalSchema, ItemSchema };
