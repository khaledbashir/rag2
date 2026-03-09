/**
 * SOW (Statement of Work) Template - Page 7
 * REQ-123: Bespoke SOW Generation based on RFP analysis
 * 
 * Standard legal language for ANC proposals.
 * Based on Standard Enterprise Gold Standard document.
 */

// Document Header Types (LOI, Hard Quote, Budget)
export const DOCUMENT_HEADERS = {
    LOI: {
        title: "LETTER OF INTENT",
        subtitle: "Non-Binding Preliminary Estimate",
        disclaimer: "This Letter of Intent represents a preliminary, non-binding estimate for budgetary purposes only. Final pricing will be provided upon receipt of complete project specifications."
    },
    HARD_QUOTE: {
        title: "SALES QUOTATION",
        subtitle: "Firm Fixed Price Proposal",
        disclaimer: "This quotation represents a firm fixed price valid for 30 days from the date of issue. Pricing is subject to change after the validity period."
    },
    BUDGET: {
        title: "BUDGET ESTIMATE",
        subtitle: "ROM (Rough Order of Magnitude)",
        disclaimer: "This Budget Estimate is provided for planning purposes and represents a ROM (±15%) based on preliminary specifications. Final pricing requires complete design documentation."
    },
    CONTRACT: {
        title: "CONTRACT",
        subtitle: "Binding Agreement",
        disclaimer: "This Contract constitutes a binding agreement between the parties. All terms, conditions, and pricing are final and subject to the terms and conditions attached hereto."
    }
};

// Environment-Specific Sections (Indoor vs Outdoor)
export const ENVIRONMENT_SECTIONS = {
    INDOOR: {
        title: "Indoor Display Environment",
        content: `Indoor Installation Requirements:
• Climate-controlled environment (65-80°F, <80% humidity)
• Minimum 500 lux ambient lighting compensation
• Fire suppression system compatibility verification
• ADA compliance for viewing distances
• Acoustic considerations for fan noise (<35dB at 10ft)

ANC indoor displays are optimized for controlled environments with typical Brightness rating of 800-1500.`
    },
    OUTDOOR: {
        title: "Outdoor Display Environment",
        content: `Outdoor Installation Requirements:
• IP65 or higher weatherproofing rating
• Operating temperature range: -22°F to 122°F (-30°C to 50°C)
• Direct sunlight compensation (minimum 5,000 Brightness rating)
• Wind load engineering per local building codes
• Lightning protection and surge suppression
• UV-resistant front service access

ANC outdoor displays include integrated HVAC and are designed for 24/7 operation in extreme conditions.`
    }
};

export const SOW_SECTIONS = {
    physicalInstallation: {
        title: "Physical Installation",
        content: `ANC will provide all labor and materials necessary to install the LED display system(s) in accordance with manufacturer specifications and applicable building codes. Installation includes:
• Mounting hardware and structural brackets
• LED modules and cabinets
• Power distribution units (PDUs)
• Data cabling and signal distribution
• Control system hardware

All installation work will be performed by trained ANC technicians or authorized contractors.`
    },

    electricalData: {
        title: "Electrical & Data",
        content: `Client is responsible for providing:
• Dedicated electrical circuits to display locations (specifications TBD based on final design)
• Network connectivity to control room location
• Climate-controlled environment meeting manufacturer specifications

ANC will provide:
• All internal power distribution within the display system
• Data network switches and distribution as required
• Integration with client's existing control infrastructure`
    },

    controlSystem: {
        title: "Control System",
        content: `ANC will provide a complete content management and display control system including:
• Content Management Software (CMS) license
• Display control processor(s)
• Remote monitoring and diagnostics capability
• Initial content templates and configuration
• Operator training (up to 8 hours on-site)

Annual software maintenance and support is included for the first year. Subsequent years are available under separate maintenance agreement.`
    },

    generalConditions: {
        title: "General Conditions",
        content: `Standard Terms:
• Payment terms: Net 30 from proposal date
• Lead time: 12-16 weeks from deposit receipt (subject to manufacturing capacity)
• Warranty: 5-year manufacturer warranty on LED modules; 2-year warranty on electronics
• All prices quoted in USD

Exclusions (unless specifically noted above):
• Permits and inspections
• Structural modifications to building
• Electrical service upgrades
• Scenic/decorative finishes around display
• Content creation beyond initial templates`
    },

    // Dynamic clauses based on AI detection
    unionLaborClause: `Union Labor Surcharge: Where required by local jurisdiction or client specification, installation will be performed by IBEW-certified union labor in accordance with applicable collective bargaining agreements. A 15% surcharge applies to all labor costs to cover union wages, benefits, and certified payroll requirements.`,

    replacementClause: `Replacement Equipment: This proposal includes removal and disposal of existing display equipment. Disposal will be performed in accordance with applicable environmental regulations. Client is responsible for providing access and any required permits for removal operations.`,

    prevailingWageClause: `Prevailing Wage: Installation labor rates are based on applicable prevailing wage requirements for the project jurisdiction as published by the Department of Labor. Certified payroll documentation will be provided upon request.`,

    sparePartsClause: `Spare Parts Inventory: Per RFP requirements, this proposal includes a minimum 5% spare parts inventory (attic stock) for LED modules and critical components. Spare parts will be delivered with the main shipment and stored on-site per client direction.`,

    performanceBondClause: `Performance Bond: A 1.5% Performance Bond is included in this proposal as required by the RFP. Bond documentation will be provided upon contract execution.`,

    structuralEngineeringClause: `Structural Engineering: This proposal includes structural engineering services by a licensed Professional Engineer (PE). Structural calculations and stamped drawings will be provided for permit submission. Steel tonnage estimates are based on preliminary analysis and subject to final engineering.`,
};

export interface SOWOptions {
    // Document type (determines header)
    documentType?: "LOI" | "HARD_QUOTE" | "BUDGET";
    pricingRound?: "First Round" | "Final" | "Revision";

    // Environment (Indoor vs Outdoor)
    environment?: "INDOOR" | "OUTDOOR" | "MIXED";

    // AI-detected requirements from RFP
    includeUnionLabor?: boolean;
    includeReplacement?: boolean;
    includePrevailingWage?: boolean;
    includeSpareParts?: boolean;
    includePerformanceBond?: boolean;
    includeStructuralEngineering?: boolean;

    // Technical Attributes (Context Fusion)
    signalSupport?: string; // e.g., "3G-SDI 1080P"
    rossCarbonite?: boolean;
    vdcpSupport?: boolean;
    structuralTonnage?: number;
    peStampedDrawings?: boolean;
    isOutdoor?: boolean;
    isMorgantown?: boolean;
    atticStockMentioned?: boolean;

    // Custom content
    customExclusions?: string[];
    customInclusions?: string[];
    projectSpecificNotes?: string;

    // Client/Project info for personalization
    clientName?: string;
    venueName?: string;
    projectLocation?: string;
}

/**
 * Get document header based on type
 */
export function getDocumentHeader(type: "LOI" | "HARD_QUOTE" | "BUDGET" = "BUDGET"): {
    title: string;
    subtitle: string;
    disclaimer: string;
} {
    return DOCUMENT_HEADERS[type] || DOCUMENT_HEADERS.BUDGET;
}

/**
 * REQ-123: Generate bespoke SOW based on RFP analysis and AI detection
 * 
 * Customizes the Statement of Work based on:
 * - Document type (LOI, Hard Quote, Budget)
 * - Environment (Indoor vs Outdoor)
 * - AI-detected requirements (Union Labor, Spare Parts, etc.)
 */
export function generateSOWContent(options: SOWOptions | string = {}): { title: string, content: string; category?: "DESIGN" | "CONSTRUCTION" | "CONSTRAINTS" | "OTHER" }[] {
    const sections: { title: string, content: string; category?: "DESIGN" | "CONSTRUCTION" | "CONSTRAINTS" | "OTHER" }[] = [];
    const opts = typeof options === 'string' ? { projectSpecificNotes: options } : options;

    // REQ: Sanitize content (Nits -> Brightness)
    const sanitize = (text: string) => text.replace(/nits/gi, "Brightness");

    // 1. Add environment-specific section FIRST (Indoor vs Outdoor)
    const env = opts.isOutdoor ? "OUTDOOR" : opts.environment || "INDOOR";
    if (env === "OUTDOOR") {
        sections.push({
            title: ENVIRONMENT_SECTIONS.OUTDOOR.title,
            content: sanitize(ENVIRONMENT_SECTIONS.OUTDOOR.content)
        });
    } else if (env === "INDOOR") {
        sections.push({
            title: ENVIRONMENT_SECTIONS.INDOOR.title,
            content: sanitize(ENVIRONMENT_SECTIONS.INDOOR.content)
        });
    }

    // 2. Add standard sections with technical injection
    let installationContent = SOW_SECTIONS.physicalInstallation.content;
    if (opts.structuralTonnage) {
        installationContent += `\n\nStructural Note: This project requires approximately ${opts.structuralTonnage} tons of structural steel reinforcing as identified in TTE engineering reports.`;
    }
    if (opts.peStampedDrawings) {
        installationContent += `\n• Provision of PE-stamped structural drawings for permit submission.`;
    }
    sections.push({
        title: SOW_SECTIONS.physicalInstallation.title,
        content: sanitize(installationContent),
        category: "CONSTRUCTION"
    });

    sections.push({
        title: SOW_SECTIONS.electricalData.title,
        content: sanitize(SOW_SECTIONS.electricalData.content),
        category: "CONSTRUCTION"
    });

    sections.push({
        title: SOW_SECTIONS.controlSystem.title,
        content: sanitize(SOW_SECTIONS.controlSystem.content),
        category: "DESIGN"
    });

    if (opts.peStampedDrawings || opts.includeStructuralEngineering) {
        sections.push({
            title: "Design Services: Engineering & Submittals",
            content: "• Provision of PE-stamped structural drawings and electrical shop drawings.\n• Detailed signal flow and rack elevation documentation.\n• One (1) round of submittal revisions included.",
            category: "DESIGN"
        });
    }

    // 3. Add AI-detected dynamic clauses based on RFP analysis
    if (opts.includeUnionLabor || opts.includePrevailingWage) {
        sections.push({
            title: "Labor Compliance (IBEW)",
            content: `Installation will be performed by IBEW-certified union labor in accordance with local prevailing wage requirements. Certified payroll will be provided upon request.`
        });
    }

    if (opts.includeReplacement) {
        sections.push({
            title: "Equipment Replacement & Disposal",
            content: sanitize(SOW_SECTIONS.replacementClause)
        });
    }

    if (opts.includeSpareParts || opts.atticStockMentioned) {
        const sparePct = opts.atticStockMentioned ? "5%" : "2%";
        sections.push({
            title: `Technical Logistics: Spare Parts Inventory (${sparePct} Attic Stock)`,
            content: `ANC will provide a ${sparePct} spare parts inventory (attic stock) including LED modules, power supplies, and receiving cards to ensure long-term serviceability.`,
            category: "CONSTRUCTION"
        });
    }

    if (opts.includePerformanceBond || opts.isMorgantown) {
        sections.push({
            title: "Project Constraints: Commercial & Compliance Terms",
            content: [
                opts.includePerformanceBond && "• A 1.5% Performance Bond is included in this proposal.",
                opts.isMorgantown && "• Morgantown City B&O Tax (2.0%) applied to all regional labor and materials."
            ].filter(Boolean).join("\n"),
            category: "CONSTRAINTS"
        });
    }

    // 4. Add custom inclusions
    if (opts.customInclusions?.length) {
        sections.push({
            title: "Additional Inclusions",
            content: sanitize(opts.customInclusions.map(i => `• ${i}`).join("\n"))
        });
    }

    // 5. Add General Conditions (always last before exclusions)
    sections.push({
        title: SOW_SECTIONS.generalConditions.title,
        content: sanitize(SOW_SECTIONS.generalConditions.content),
        category: "CONSTRAINTS"
    });

    // 6. Add custom exclusions
    if (opts.customExclusions?.length) {
        sections.push({
            title: "Project Constraints: Additional Exclusions",
            content: sanitize(opts.customExclusions.map(e => `• ${e}`).join("\n")),
            category: "CONSTRAINTS"
        });
    }

    // 7. Add project-specific notes
    if (opts.projectSpecificNotes && opts.projectSpecificNotes.length > 0) {
        sections.push({
            title: "Project-Specific Notes",
            content: sanitize(opts.projectSpecificNotes)
        });
    }

    return sections;
}

/**
 * Generate complete SOW with header for PDF
 */
export function generateFullSOW(options: SOWOptions): {
    header: { title: string; subtitle: string; disclaimer: string };
    sections: { title: string; content: string }[];
} {
    const docType = options.documentType || "BUDGET";
    return {
        header: getDocumentHeader(docType),
        sections: generateSOWContent(options)
    };
}

export default SOW_SECTIONS;
