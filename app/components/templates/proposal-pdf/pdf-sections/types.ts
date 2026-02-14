/**
 * Shared types and config for PDF template sub-components.
 * All sections receive this context from the parent ProposalTemplate5.
 */

export interface TemplateColors {
    primary: string;
    primaryDark: string;
    primaryLight: string;
    accent: string;
    text: string;
    textMuted: string;
    textLight: string;
    white: string;
    surface: string;
    border: string;
    borderLight: string;
}

export interface TemplateSpacing {
    contentPaddingX: number;
    headerToIntroGap: number;
    introToBodyGap: number;
    sectionSpacing: number;
    pricingTableGap: number;
    tableRowHeight: number;
    rowPaddingY: number;
}

export interface TemplateContext {
    colors: TemplateColors;
    spacing: TemplateSpacing;
    currency: "CAD" | "USD";
    isLandscape: boolean;
    colHeaderLeft: string;
    colHeaderRight: string;
    descriptionOverrides: Record<string, string>;
    priceOverrides: Record<string, number>;
    screenNameMap: Record<string, string>;
    tableHeaderOverrides: Record<string, string>;
    masterTableIndex: number | null;
    autoPushLargeTables: boolean;
    tableSplitThreshold: number;
}
