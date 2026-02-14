/**
 * ProposalTemplate5 - "ANC Hybrid"
 * 
 * Unified master template for Budget, Proposal, and LOI.
 * Combines the best elements from all templates:
 * - Base: Modern template (clean, professional)
 * - Tables: Modern styling (blue headers, zebra striping)
 * - Footer: Bold template footer (dark blue slash/accent)
 * - Pricing/Spec text: Classic hierarchy (display name ALL CAPS/BOLD, specs smaller underneath)
 * - Layout: Tightened (9-10pt fonts, reduced margins, minimal row padding)
 * 
 * Notes, Scope of Work, and Signature Lines are optional for ALL document types.
 */

import React from "react";

// Components
import { ProposalLayout } from "@/app/components";
import LogoSelectorServer from "@/app/components/reusables/LogoSelectorServer";
import ExhibitA_TechnicalSpecs from "@/app/components/templates/proposal-pdf/exhibits/ExhibitA_TechnicalSpecs";
import PageBreak from "@/app/components/templates/proposal-pdf/PageBreak";

// Helpers
import { formatNumberWithCommas, formatCurrency, sanitizeNitsForDisplay, stripDensityAndHDRFromSpecText, normalizePitch } from "@/lib/helpers";
import { resolveDocumentMode } from "@/lib/documentMode";
import {
    DOCUMENT_MODES,
    CURRENCY_FORMAT,
} from "@/services/rfp/productCatalog";
import type { DocumentMode as CatalogDocumentMode } from "@/services/rfp/productCatalog";

// Types
import { ProposalType } from "@/types";
import { PricingTable, RespMatrix, RespMatrixCategory, RespMatrixItem } from "@/types/pricing";
import { computeTableTotals, computeDocumentTotalFromTables } from "@/lib/pricingMath";
import {
    SectionHeader as SectionHeaderComponent,
    SignatureBlock as SignatureBlockComponent,
    PaymentTermsSection as PaymentTermsSectionComponent,
    NotesSection as NotesSectionComponent,
    ScopeOfWorkSection as ScopeOfWorkSectionComponent,
    HybridFooter as HybridFooterComponent,
    ContinuationPageHeader as ContinuationPageHeaderComponent,
    ProjectScheduleSection as ProjectScheduleSectionComponent,
    RespMatrixSOW as RespMatrixSOWComponent,
} from "./pdf-sections";

interface ProposalTemplate5Props extends ProposalType {
    forceWhiteLogo?: boolean;
    screens?: any[];
    isSharedView?: boolean;
}

const ProposalTemplate5 = (data: ProposalTemplate5Props) => {
    const { sender, receiver, details, forceWhiteLogo, screens: screensProp, isSharedView = false } = data;
    const screens = screensProp || details?.screens || [];
    const internalAudit = details?.internalAudit as any;

    const documentMode = resolveDocumentMode(details);
    const catalogMode = documentMode.toLowerCase() as CatalogDocumentMode;
    const docModeConfig = DOCUMENT_MODES[catalogMode] || DOCUMENT_MODES.proposal;
    const docLabel = docModeConfig.headerText;
    const isLOI = documentMode === "LOI";

    // Guard against raw numbers (e.g., project IDs mistakenly used as names)
    const rawPurchaserName = receiver?.name || "";
    const purchaserName = rawPurchaserName && !/^\d+$/.test(rawPurchaserName.trim()) ? rawPurchaserName : "Client";
    // Prompt 42: Purchaser legal name for LOI (defaults to client name if not set)
    const purchaserLegalName = ((details as any)?.purchaserLegalName || "").trim() || purchaserName;
    const purchaserAddress = (() => {
        const parts = [receiver?.address, receiver?.city, receiver?.zipCode].filter(Boolean);
        return parts.length > 0 ? parts.join(", ") : "";
    })();

    // Prompt 43: Currency detection from pricingDocument
    const pricingDocument = (details as any)?.pricingDocument || (data as any)?.pricingDocument;
    const mirrorMode =
        (details as any)?.mirrorMode === true || ((pricingDocument?.tables || []).length ?? 0) > 0;
    const currency: "CAD" | "USD" = pricingDocument?.currency || "USD";

    // Prompt 51: Master table index — designates which pricing table is the "Project Grand Total"
    // Auto-detect: if no explicit masterTableIndex, check if tables[0] is a summary/rollup table
    const rollUpRegex = /\b(total|roll.?up|summary|project\s+grand|grand\s+total|project\s+total|cost\s+summary|pricing\s+summary)\b/i;
    const pricingTables = pricingDocument?.tables || [];
    let masterTableIndex: number | null = (details as any)?.masterTableIndex ?? null;
    if (masterTableIndex === null && pricingTables.length > 1 && rollUpRegex.test(pricingTables[0]?.name || "")) {
        masterTableIndex = 0;
    }

    // Prompt 42: Description overrides for inline typo editing (Mirror Mode)
    const descriptionOverrides: Record<string, string> = (details as any)?.descriptionOverrides || {};
    const priceOverrides: Record<string, number> = (details as any)?.priceOverrides || {};

    // Hardcoded per business requirement: always WORK / PRICING.
    const colHeaderLeft = "WORK";
    const colHeaderRight = "PRICING";

    // Detect product type from screens to adjust header text
    const detectProductType = (): "LED" | "LCD" | "Display" => {
        if (!screens || screens.length === 0) return "Display";

        const productTypes = new Set<string>();
        screens.forEach((screen: any) => {
            const type = (screen?.productType || "").toString().trim().toUpperCase();
            if (type) productTypes.add(type);
        });

        // If all screens are LCD, use LCD
        if (productTypes.size === 1 && productTypes.has("LCD")) return "LCD";
        // If all screens are LED, use LED
        if (productTypes.size === 1 && productTypes.has("LED")) return "LED";
        // Mixed or unknown, use generic "Display"
        return "Display";
    };

    const productType = detectProductType();
    const displayTypeLabel = productType === "Display" ? "Display" : `${productType} Display`;

    // Build mapping from screen group → custom display name (mirrors NataliaMirrorTemplate)
    // screen.group matches pricing table names (both come from Margin Analysis headers)
    // Priority: externalName (PDF/Client Name) > edited name (Screen Name differs from group)
    const screenNameMap: Record<string, string> = {};
    screens.forEach((screen: any) => {
        const group = screen?.group;
        if (!group) return;
        const explicitOverride = screen?.customDisplayName || screen?.externalName;
        if (explicitOverride) {
            screenNameMap[group] = explicitOverride;
        } else if (screen?.name && screen.name !== group) {
            // User edited Screen Name from the original Excel section name
            screenNameMap[group] = screen.name;
        }
    });
    const templateConfig = ((details as any)?.templateConfig || {}) as Record<string, any>;
    const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
    const contentPaddingX = clamp(Number(templateConfig?.contentPaddingX ?? 24) || 24, 12, 48);
    const headerToIntroGap = clamp(Number(templateConfig?.headerToIntroGap ?? 16) || 16, 4, 64);
    const introToBodyGap = clamp(Number(templateConfig?.introToBodyGap ?? 16) || 16, 4, 72);
    const sectionSpacing = clamp(Number(templateConfig?.sectionSpacing ?? 16) || 16, 6, 36);
    const pricingTableGap = clamp(Number(templateConfig?.pricingTableGap ?? 16) || 16, 6, 36);
    const tableRowHeight = clamp(Number(templateConfig?.tableRowHeight ?? 24) || 24, 20, 40);
    const rowPaddingY = clamp(Math.round((tableRowHeight - 16) / 2), 2, 12);
    const accentColor = (templateConfig?.accentColor || "").toString().trim();
    const primaryColor = /^#[0-9A-Fa-f]{6}$/.test(accentColor) ? accentColor : "#0A52EF";
    const autoPushLargeTables = Boolean(templateConfig?.autoPushLargeTables ?? false);
    const tableSplitThreshold = clamp(Number(templateConfig?.tableSplitThreshold ?? 14) || 14, 10, 26);
    const tableSplitRiskDetected = (() => {
        const tables = (pricingDocument?.tables || []) as any[];
        if (!tables.length) return false;
        return tables.some((table: any) => {
            const items = Array.isArray(table?.items) ? table.items : [];
            const alternates = Array.isArray(table?.alternates) ? table.alternates : [];
            const longRows = items.filter((row: any) => ((row?.description || "").toString().length > 88)).length;
            const estimatedRows = items.length + alternates.length + 4 + Math.min(3, longRows);
            return estimatedRows > tableSplitThreshold;
        });
    })();
    const shouldPushPricingToNewPage = autoPushLargeTables && tableSplitRiskDetected;

    // Hybrid color palette - Modern base with Bold accents
    const colors = {
        primary: primaryColor,
        primaryDark: "#002C73",
        primaryLight: "#E8F0FE",
        accent: "#6366F1",
        text: "#1F2937",
        textMuted: "#6B7280",
        textLight: "#9CA3AF",
        white: "#FFFFFF",
        surface: "#F9FAFB",
        border: "#E5E7EB",
        borderLight: "#F3F4F6",
    };

    // ===== UNIVERSAL TOGGLES - Available for ALL document types =====
    const showNotes = (details as any)?.showNotes ?? true;
    const showScopeOfWork = (details as any)?.showScopeOfWork ?? false;
    const showSignatureBlock = (details as any)?.showSignatureBlock ?? true;
    const showPaymentTerms = (details as any)?.showPaymentTerms ?? true;
    const showSpecifications = (details as any)?.showSpecifications ?? true;
    const showPricingTables = (details as any)?.showPricingTables ?? true;
    const showIntroText = (details as any)?.showIntroText ?? true;
    const showCompanyFooter = (details as any)?.showCompanyFooter ?? true;
    const generatedSchedule = (details as any)?.generatedSchedule;
    const generatedScheduleTasks = Array.isArray(generatedSchedule?.tasks) ? generatedSchedule.tasks : [];
    const hasGeneratedSchedule = !mirrorMode && generatedScheduleTasks.length > 0;
    const showExhibitA = (details as any)?.showExhibitA ?? false;
    const shouldRenderLegalIntro = docModeConfig.includeLegalIntro;
    const shouldRenderPaymentTerms = docModeConfig.includePaymentTerms && showPaymentTerms;
    const shouldRenderSignatureBlock = docModeConfig.includeSignatures && showSignatureBlock;
    const shouldRenderCompanyFooter = showCompanyFooter && isLOI;

    // Page layout: landscape modes render detail tables in a two-column grid
    const pageLayout: string = (details as any)?.pageLayout || "portrait-letter";
    const isLandscape = pageLayout.startsWith("landscape");

    // FR-4.3: Custom editable text fields
    const customIntroText = (details as any)?.additionalNotes || "";
    const customPaymentTerms = (details as any)?.paymentTerms || "";

    // ===== HELPERS =====
    /** Display name: prefer PDF/Client Name (externalName), normalize " -" to " - ", ALL CAPS per Natalia */
    const getScreenHeader = (screen: any) => {
        const raw = (screen?.externalName || screen?.customDisplayName || screen?.name || "Display").toString().trim();
        const cleaned = sanitizeNitsForDisplay(raw) || "Display";
        const normalized = cleaned.replace(/\s*-\s*/g, " - ").trim();
        return normalized ? normalized.toUpperCase() : "DISPLAY";
    };

    const splitDisplayNameAndSpecs = (value: string) => {
        const raw = (value || "").toString().trim();
        if (!raw) return { header: "", specs: "" };
        const idxParen = raw.indexOf("(");
        const idxColon = raw.indexOf(":");
        const idx = idxParen === -1 ? idxColon : idxColon === -1 ? idxParen : Math.min(idxParen, idxColon);
        if (idx === -1) return { header: raw, specs: "" };
        const header = raw.slice(0, idx).trim().replace(/[-–—]\s*$/, "").trim();
        const specs = raw.slice(idx).trim();
        return { header, specs };
    };

    /**
     * Format pixel pitch with proper decimal preservation.
     * Uses normalizePitch to guard against decimal-stripped values (125 → 1.25).
     */
    const formatPitchMm = (value: any): string => {
        const corrected = normalizePitch(value);
        if (corrected <= 0) return "";
        return corrected < 2 ? corrected.toFixed(2) : corrected.toFixed(corrected % 1 === 0 ? 0 : 2);
    };

    const buildDescription = (screen: any) => {
        const heightFt = screen?.heightFt ?? screen?.height;
        const widthFt = screen?.widthFt ?? screen?.width;
        const pitchMm = screen?.pitchMm ?? screen?.pixelPitch;
        const brightness = screen?.brightnessNits ?? screen?.brightness;
        const parts: string[] = [];
        if (heightFt && widthFt && Number(heightFt) > 0 && Number(widthFt) > 0) {
            parts.push(`${Number(heightFt).toFixed(1)}' × ${Number(widthFt).toFixed(1)}'`);
        }
        const formattedPitch = formatPitchMm(pitchMm);
        if (formattedPitch) parts.push(`${formattedPitch}mm pitch`);
        if (brightness && Number(brightness) > 0) parts.push(`${formatNumberWithCommas(brightness)} Brightness`);
        // Note: QTY intentionally NOT added here - displayed in dedicated Quantity column
        return parts.join(" · ");
    };

    /**
     * Strip "(QTY N)" or "QTY N" patterns from description text
     * Quantity should be shown in dedicated column, not embedded in description
     */
    const stripQtyFromDescription = (text: string): string => {
        if (!text) return "";
        return text
            .replace(/\s*\(QTY\s*\d+\)/gi, "")  // (QTY 1), (QTY 2), etc.
            .replace(/\s*QTY\s*\d+\s*$/gi, "") // trailing "QTY 1"
            .replace(/\s+-\s*QTY\s*\d+/gi, "") // " - QTY 1"
            .trim();
    };

    // ===== COMPONENTS =====

    // Unified Section Header — blue vertical bar accent + text (Natalia-approved)
    const templateSpacing = { contentPaddingX, headerToIntroGap, introToBodyGap, sectionSpacing, pricingTableGap, tableRowHeight, rowPaddingY };
    const SectionHeader = ({ title, subtitle }: { title: string; subtitle?: string }) => (
        <SectionHeaderComponent title={title} subtitle={subtitle} colors={colors} spacing={templateSpacing} />
    );

    // Calculate project total (shared between LOI summary and pricing section)
    const calculateProjectTotal = () => {
        const softCostItems = internalAudit?.softCostItems || [];
        const pricingDocument = (details as any)?.pricingDocument;
        const pricingTables = (pricingDocument?.tables || []) as Array<{ id?: string; name?: string; grandTotal?: number }>;
        const quoteItems = (((details as any)?.quoteItems || []) as any[]).filter(Boolean);

        // If pricingDocument.tables exists, sum all table grandTotals
        if (pricingTables.length > 0) {
            return pricingTables.reduce((sum, table) => sum + (Number(table?.grandTotal ?? 0) || 0), 0);
        }

        // Otherwise, fall back to quoteItems or screens + softCostItems
        const lineItems = quoteItems.length > 0
            ? quoteItems.map((it: any) => ({ price: Number(it.price || 0) || 0, isAlternate: it.isAlternate || false }))
            : [
                ...(screens || []).map((screen: any) => {
                    const auditRow = isSharedView
                        ? null
                        : internalAudit?.perScreen?.find((s: any) => s.id === screen.id || s.name === screen.name);
                    const price = auditRow?.breakdown?.sellPrice || auditRow?.breakdown?.finalClientTotal || 0;
                    return { price: Number(price) || 0, isAlternate: screen?.isAlternate || false };
                }).filter((it) => it.isAlternate || Math.abs(it.price) >= 0.01),
                ...softCostItems.map((item: any) => ({
                    price: Number(item?.sell || 0),
                    isAlternate: item?.isAlternate || false,
                })).filter((it: any) => it.isAlternate || Math.abs(it.price) >= 0.01),
            ];

        return lineItems.filter((it) => !it.isAlternate).reduce((sum, it) => sum + (Number(it.price) || 0), 0);
    };

    // LOI Master Table Summary - Shows BEFORE detailed pricing tables per Natalia requirement
    const LOISummaryTable = () => {
        const total = calculateProjectTotal();

        return (
            <div data-preview-section="pricing" className="px-6 mt-2 break-inside-avoid" style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
                <SectionHeader title="Project Summary" />
                <div className="rounded-lg border overflow-hidden" style={{ borderColor: colors.border }}>
                    <div
                        className="grid grid-cols-12 px-4 py-1.5 break-inside-avoid"
                        style={{ borderColor: colors.primary, background: colors.primaryLight }}
                    >
                        <div className="col-span-8 font-bold text-xs uppercase tracking-wide" style={{ color: colors.primaryDark }}>
                            Project Grand Total
                        </div>
                        <div className="col-span-4 text-right font-bold text-sm" style={{ color: colors.primaryDark }}>
                            {formatCurrency(total, Math.abs(total) < 0.01 ? "—" : undefined, currency)}
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    // Prompt 51: Master Table Summary — renders the designated "Project Grand Total" table at top
    const MasterTableSummary = () => {
        if (masterTableIndex === null) return null;
        const pricingTables = (pricingDocument?.tables || []) as any[];
        const masterTable = pricingTables[masterTableIndex];
        if (!masterTable) return null;

        const tableHeaderOverrides = ((details as any)?.tableHeaderOverrides || {}) as Record<string, string>;
        const tableName = (masterTable?.name ?? "").toString().trim();
        const tableId = masterTable?.id;
        const override = tableId ? tableHeaderOverrides[tableId] : undefined;
        // Priority: Override > Screen Name Map > Original Name
        const label = (override ?? screenNameMap[tableName] ?? (tableName || "Project Total")).toString().trim();

        // Gather items from the master table (parser outputs "items", not "rows")
        const rows = (masterTable?.items || masterTable?.rows || []) as any[];
        // Centralized round-then-sum via pricingMath.ts
        const masterTotals = computeTableTotals(masterTable as PricingTable, priceOverrides, descriptionOverrides);
        const { subtotal, tax, bond, grandTotal } = masterTotals;

        return (
            <div data-preview-section="pricing" className="px-6 mt-4 break-inside-avoid" style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                    <div style={{ width: '3px', height: '12px', borderRadius: '1px', background: colors.primary, flexShrink: 0 }} />
                    <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: colors.primaryDark }}>Project Pricing</span>
                </div>
                <div className="rounded-lg border overflow-hidden" style={{ borderColor: colors.border }}>
                    {/* Clean header — text + thin blue underline (no background fill) */}
                    <div
                        className="grid grid-cols-12 px-3 py-1 text-[9px] font-semibold uppercase tracking-wider border-b-2 break-inside-avoid"
                        style={{ borderColor: colors.primary, color: colors.primaryDark, background: 'transparent' }}
                    >
                        <div className="col-span-8">{colHeaderLeft}</div>
                        <div className="col-span-4 text-right">{colHeaderRight}</div>
                    </div>

                    {/* Rows */}
                    {rows.map((row: any, idx: number) => {
                        const origDesc = (row?.description || row?.name || "Item").toString().trim();
                        const desc = (descriptionOverrides[`${tableId}:${idx}`] || origDesc);
                        const origPrice = Number(row?.sellingPrice ?? row?.price ?? row?.amount ?? 0);
                        const price = priceOverrides[`${tableId}:${idx}`] !== undefined ? priceOverrides[`${tableId}:${idx}`] : origPrice;
                        return (
                            <div
                                key={`master-row-${idx}`}
                                className="grid grid-cols-12 px-3 py-1.5 border-t break-inside-avoid items-center"
                                style={{
                                    borderColor: colors.borderLight,
                                    background: idx % 2 === 1 ? colors.surface : colors.white,
                                    minHeight: '24px',
                                }}
                            >
                                <div className="col-span-8 font-bold text-[10px] tracking-wide uppercase" style={{ color: colors.text }}>
                                    {desc.toUpperCase()}
                                </div>
                                <div className="col-span-4 text-right font-bold text-xs whitespace-nowrap" style={{ color: colors.primaryDark }}>
                                    {formatCurrency(price, Math.abs(price) < 0.01 ? "—" : undefined, currency)}
                                </div>
                            </div>
                        );
                    })}

                    {/* Subtotal */}
                    {rows.length > 0 && Math.abs(subtotal) >= 0.01 && subtotal !== grandTotal && (
                        <div className="grid grid-cols-12 px-3 py-1 border-t break-inside-avoid" style={{ borderColor: colors.border }}>
                            <div className="col-span-8 font-bold text-[10px] uppercase tracking-wide" style={{ color: colors.textMuted }}>Subtotal</div>
                            <div className="col-span-4 text-right font-bold text-xs" style={{ color: colors.text }}>
                                {formatCurrency(subtotal, currency)}
                            </div>
                        </div>
                    )}

                    {/* Tax */}
                    {Math.abs(tax) >= 0.01 && (
                        <div className="grid grid-cols-12 px-3 py-1 border-t break-inside-avoid" style={{ borderColor: colors.borderLight }}>
                            <div className="col-span-8 text-[10px] uppercase tracking-wide" style={{ color: colors.textMuted }}>Tax</div>
                            <div className="col-span-4 text-right text-xs" style={{ color: colors.text }}>
                                {formatCurrency(tax, currency)}
                            </div>
                        </div>
                    )}

                    {/* Bond */}
                    {Math.abs(bond) >= 0.01 && (
                        <div className="grid grid-cols-12 px-3 py-1 border-t break-inside-avoid" style={{ borderColor: colors.borderLight }}>
                            <div className="col-span-8 text-[10px] uppercase tracking-wide" style={{ color: colors.textMuted }}>Performance Bond</div>
                            <div className="col-span-4 text-right text-xs" style={{ color: colors.text }}>
                                {formatCurrency(bond, currency)}
                            </div>
                        </div>
                    )}

                    {/* Grand Total */}
                    <div
                        className="grid grid-cols-12 px-3 py-1 border-t-2 break-inside-avoid"
                        style={{ borderColor: colors.primary, background: colors.primaryLight }}
                    >
                        <div className="col-span-8 font-bold text-[10px] uppercase tracking-wide" style={{ color: colors.primaryDark }}>
                            {label.toUpperCase()}{currency === "CAD" ? " (CAD)" : ""}
                        </div>
                        <div className="col-span-4 text-right font-bold text-xs" style={{ color: colors.primaryDark }}>
                            {formatCurrency(grandTotal, Math.abs(grandTotal) < 0.01 ? "—" : undefined, currency)}
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    // Hybrid Pricing Section - Classic text hierarchy (UPPERCASE BOLD name, smaller specs)
    // When pricingDocument.tables exists (Mirror Mode), render FULL DETAIL per table.
    // Otherwise fall back to quoteItems or screens + internalAudit.
    const PricingSection = () => {
        const softCostItems = internalAudit?.softCostItems || [];
        const pricingDocument = (details as any)?.pricingDocument;
        const pricingTables = (pricingDocument?.tables || []) as any[];
        const tableHeaderOverrides = ((details as any)?.tableHeaderOverrides || {}) as Record<string, string>;

        // Mirror Mode: render each table with full item detail
        if (pricingTables.length > 0) {
            const detailTables = pricingTables
                .map((table: any, origIdx: number) => ({ table, origIdx }))
                .filter(({ origIdx }) => origIdx !== masterTableIndex);

            // Document total: centralized round-then-sum via pricingMath.ts
            const documentTotal = computeDocumentTotalFromTables(
                pricingTables as PricingTable[],
                priceOverrides,
                descriptionOverrides,
            );

            // Render a single detail table card (reused in both portrait and landscape)
            const renderDetailTable = ({ table, origIdx }: { table: any; origIdx: number }) => {
                const tableName = (table?.name ?? "").toString().trim();
                const tableId = table?.id;
                const override = tableId ? tableHeaderOverrides[tableId] : undefined;
                const label = (override || screenNameMap[tableName] || (tableName || "Section")).toString().trim();
                const items = (table?.items || []) as any[];
                // Fix 5: Only include alternates that have actual content (non-empty description AND non-zero price)
                const alternates = ((table?.alternates || []) as any[]).filter((alt: any) => {
                    const desc = (alt?.description || "").toString().trim();
                    const price = Number(alt?.priceDifference ?? alt?.price ?? 0);
                    return desc.length > 0 && Math.abs(price) >= 0.01;
                });
                // Centralized round-then-sum via pricingMath.ts
                const detailTotals = computeTableTotals(table as PricingTable, priceOverrides, descriptionOverrides);
                const { subtotal, taxLabel, tax: taxAmount, bond, grandTotal } = detailTotals;

                return (
                    <div data-preview-section="pricing" key={tableId || `table-${origIdx}`} className="break-inside-avoid" style={{ pageBreakInside: 'avoid', breakInside: 'avoid', marginTop: `${pricingTableGap}px` }}>
                        <div className="rounded-lg border overflow-hidden" style={{ borderColor: colors.border }}>
                            {/* Table header — text + thin blue underline */}
                            <div
                                className="grid grid-cols-12 px-3 py-1 text-[9px] font-semibold uppercase tracking-wider border-b-2 break-inside-avoid"
                                style={{ borderColor: colors.primary, color: colors.primaryDark, background: 'transparent', breakAfter: 'avoid', pageBreakAfter: 'avoid' }}
                            >
                                <div className="col-span-8">{label.toUpperCase()}</div>
                                <div className="col-span-4 text-right">PRICING{currency === "CAD" ? " (CAD)" : ""}</div>
                            </div>

                            {/* Line items — pre-filtered by computeTableTotals, but render using original items for zebra striping */}
                            {items.map((item: any, idx: number) => {
                                const itemPrice = detailTotals.items.find(ri => ri.originalIndex === idx);
                                if (!itemPrice) return null; // filtered out by computeTableTotals ($0 items)
                                return (
                                    <div
                                        key={`${tableId}-item-${idx}`}
                                        className="grid grid-cols-12 px-3 py-1.5 border-t break-inside-avoid items-center"
                                        style={{
                                            borderColor: colors.borderLight,
                                            background: idx % 2 === 1 ? colors.surface : colors.white,
                                            minHeight: `${tableRowHeight}px`,
                                            paddingTop: `${rowPaddingY}px`,
                                            paddingBottom: `${rowPaddingY}px`,
                                        }}
                                    >
                                        <div className="col-span-8 pr-2 text-[10px]" style={{ color: colors.text }}>
                                            {itemPrice.description}
                                        </div>
                                        <div className="col-span-4 text-right font-semibold text-[10px] whitespace-nowrap" style={{ color: colors.primaryDark }}>
                                            {itemPrice.isIncluded
                                                ? <span style={{ color: colors.text }}>INCLUDED</span>
                                                : formatCurrency(itemPrice.price, currency)}
                                        </div>
                                    </div>
                                );
                            })}

                            {/* Footer: Subtotal / Tax / Bond / Grand Total */}
                            <div className="border-t-2" style={{ borderColor: colors.border }}>
                                {Math.abs(subtotal) >= 0.01 && subtotal !== grandTotal && (
                                    <div className="grid grid-cols-12 px-3 py-1 text-[10px] font-bold" style={{ color: colors.text }}>
                                        <div className="col-span-8">SUBTOTAL</div>
                                        <div className="col-span-4 text-right">{formatCurrency(subtotal, currency)}</div>
                                    </div>
                                )}
                                {Math.abs(taxAmount) >= 0.01 && (
                                    <div className="grid grid-cols-12 px-3 py-1 text-[10px]" style={{ color: colors.textMuted }}>
                                        <div className="col-span-8">{taxLabel}</div>
                                        <div className="col-span-4 text-right">{formatCurrency(taxAmount, currency)}</div>
                                    </div>
                                )}
                                {Math.abs(bond) >= 0.01 && (
                                    <div className="grid grid-cols-12 px-3 py-1 text-[10px]" style={{ color: colors.textMuted }}>
                                        <div className="col-span-8">BOND</div>
                                        <div className="col-span-4 text-right">{formatCurrency(bond, currency)}</div>
                                    </div>
                                )}
                                <div
                                    className="grid grid-cols-12 px-3 py-1.5 border-t break-inside-avoid"
                                    style={{ borderColor: colors.primary, background: colors.primaryLight }}
                                >
                                    <div className="col-span-8 font-bold text-[10px] uppercase tracking-wide" style={{ color: colors.primaryDark }}>GRAND TOTAL</div>
                                    <div className="col-span-4 text-right font-bold text-xs" style={{ color: colors.primaryDark }}>{formatCurrency(grandTotal, currency)}</div>
                                </div>
                            </div>
                        </div>

                        {/* Alternates — separate table AFTER grand total (mirrors Excel structure) */}
                        {alternates.length > 0 && (
                            <div className="mt-2 rounded-lg border overflow-hidden break-inside-avoid" style={{ borderColor: colors.border, pageBreakInside: 'avoid', breakInside: 'avoid' }}>
                                <div
                                    className="grid grid-cols-12 px-3 py-1 text-[9px] font-semibold uppercase tracking-wider border-b-2 break-inside-avoid"
                                    style={{ borderColor: colors.primary, color: colors.primaryDark, background: 'transparent' }}
                                >
                                    <div className="col-span-8">ALTERNATES — ADD TO COST ABOVE</div>
                                    <div className="col-span-4 text-right">PRICING{currency === "CAD" ? " (CAD)" : ""}</div>
                                </div>
                                {alternates.map((alt: any, aidx: number) => (
                                <div
                                    key={`alt-${aidx}`}
                                    className="grid grid-cols-12 px-3 py-1.5 border-t break-inside-avoid items-center"
                                    style={{
                                        borderColor: colors.borderLight,
                                        background: aidx % 2 === 1 ? colors.surface : colors.white,
                                        minHeight: `${tableRowHeight}px`,
                                        paddingTop: `${rowPaddingY}px`,
                                        paddingBottom: `${rowPaddingY}px`,
                                    }}
                                >
                                        <div className="col-span-8 pr-2 text-[10px]" style={{ color: colors.text }}>
                                            {(alt?.description || "Alternate").toString()}
                                        </div>
                                        <div className="col-span-4 text-right font-semibold text-[10px] whitespace-nowrap" style={{ color: colors.primaryDark }}>
                                            {formatCurrency(Number(alt?.priceDifference ?? 0), currency)}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                );
            };

            return (
                <>
                    {/* Landscape: two-column grid for detail tables. Portrait: single column */}
                    {isLandscape ? (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                            {detailTables.map((entry) => (
                                <div key={entry.table?.id || `table-${entry.origIdx}`}>
                                    {renderDetailTable(entry)}
                                </div>
                            ))}
                        </div>
                    ) : (
                        detailTables.map((entry) => renderDetailTable(entry))
                    )}

                    {/* Document total (when multiple detail tables and no master table) */}
                    {detailTables.length > 1 && masterTableIndex === null && (
                        <div className="mt-5 break-inside-avoid" style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
                            <div className="rounded-lg border overflow-hidden" style={{ borderColor: colors.primary }}>
                                <div className="grid grid-cols-12 px-3 py-1" style={{ background: colors.primaryLight }}>
                                    <div className="col-span-8 font-bold text-xs uppercase tracking-wide" style={{ color: colors.primaryDark }}>
                                        PROJECT GRAND TOTAL{currency === "CAD" ? " (CAD)" : ""}
                                    </div>
                                    <div className="col-span-4 text-right font-bold text-sm" style={{ color: colors.primaryDark }}>
                                        {formatCurrency(documentTotal, currency)}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </>
            );
        }

        // Intelligence Mode fallback: quoteItems or screens + internalAudit
        type LineItem = { key: string; name: string; description: string; price: number; isAlternate?: boolean };
        // Get quote items if available
        const quoteItems = (((details as any)?.quoteItems || []) as any[]).filter(Boolean);

        const lineItems: LineItem[] = quoteItems.length > 0
            ? quoteItems.map((it: any, idx: number) => {
                const rawLocation = (it.locationName || "ITEM").toString();
                const matchingScreen = screens.find((s: any) => {
                    if (s.id && it.id && s.id === it.id) return true;
                    const sName = (s.externalName || s.name || "").toString().trim().toUpperCase();
                    const itName = (it.locationName || "").toString().trim().toUpperCase();
                    if (sName === itName && sName.length > 0) return true;
                    if (sName.length > 3 && itName.includes(sName)) return true;
                    return false;
                });
                const customOverride = matchingScreen?.customDisplayName;
                const effectiveLocation = customOverride || rawLocation;
                const split = splitDisplayNameAndSpecs(effectiveLocation);
                const header = (split.header || effectiveLocation).toString();

                // Strip location name from description
                let desc = (it.description || "").toString();
                const stripLeadingLocation = (locationName: string, raw: string) => {
                    const loc = (locationName || "").toString().trim();
                    const text = (raw || "").toString().trim();
                    if (!loc || !text) return text;
                    const locUpper = loc.toUpperCase();
                    const textUpper = text.toUpperCase();
                    if (textUpper === locUpper) return "";
                    const dashPrefix = `${locUpper} - `;
                    if (textUpper.startsWith(dashPrefix)) return text.slice(dashPrefix.length).trim();
                    if (textUpper.startsWith(locUpper)) return text.slice(loc.length).replace(/^(\s*[-–—:]\s*)/, "").trim();
                    return text;
                };
                desc = stripLeadingLocation(rawLocation, desc);
                desc = stripLeadingLocation(effectiveLocation, desc);
                let combined = [split.specs, desc].filter(Boolean).join(" ").trim();
                combined = stripQtyFromDescription(stripDensityAndHDRFromSpecText(sanitizeNitsForDisplay(combined)));

                const normalizedHeader = header.replace(/\s*-\s*/g, " - ").trim();
                return {
                    key: it.id || `quote-${idx}`,
                    name: stripQtyFromDescription(sanitizeNitsForDisplay(normalizedHeader)).toUpperCase(),
                    description: combined,
                    price: Number(it.price || 0) || 0,
                    isAlternate: it.isAlternate || false,
                };
            }).filter((it: any) => it.isAlternate || Math.abs(it.price) >= 0.01)
            : [
                ...(screens || []).map((screen: any, idx: number) => {
                    const auditRow = isSharedView
                        ? null
                        : internalAudit?.perScreen?.find((s: any) => s.id === screen.id || s.name === screen.name);
                    const price = auditRow?.breakdown?.sellPrice || auditRow?.breakdown?.finalClientTotal || 0;
                    const label = (screen?.externalName || screen?.customDisplayName || screen?.name || "Display").toString().trim();
                    const split = splitDisplayNameAndSpecs(label);
                    const rawDesc = split.specs || buildDescription(screen);
                    const cleanDesc = stripQtyFromDescription(stripDensityAndHDRFromSpecText(sanitizeNitsForDisplay(rawDesc)));
                    return {
                        key: `screen-${screen?.id || screen?.name || idx}`,
                        name: stripQtyFromDescription((split.header ? sanitizeNitsForDisplay(split.header) : getScreenHeader(screen))).toUpperCase(),
                        description: cleanDesc,
                        price: Number(price) || 0,
                        isAlternate: screen?.isAlternate || false,
                    };
                }).filter((it: any) => it.isAlternate || Math.abs(it.price) >= 0.01),
                ...softCostItems.map((item: any, idx: number) => ({
                    key: `soft-${idx}`,
                    name: stripQtyFromDescription(sanitizeNitsForDisplay((item?.name || "Item").toString())).toUpperCase(),
                    description: stripQtyFromDescription(stripDensityAndHDRFromSpecText(sanitizeNitsForDisplay((item?.description || "").toString()))),
                    price: Number(item?.sell || 0),
                    isAlternate: item?.isAlternate || false,
                })).filter((it: any) => it.isAlternate || Math.abs(it.price) >= 0.01),
            ];

        const primaryItems = lineItems.filter((it) => !it.isAlternate);
        const alternateItems = lineItems.filter((it) => it.isAlternate);
        const subtotal = primaryItems.reduce((sum, it) => sum + (Number(it.price) || 0), 0);

        return (
            <div data-preview-section="pricing" className="mt-2 break-inside-avoid" style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
                {/* Modern table container */}
                <div className="rounded-lg border overflow-hidden" style={{ borderColor: colors.border }}>
                    {/* Header — text + thin blue underline */}
                    <div
                        className="grid grid-cols-12 px-3 py-1 text-[9px] font-semibold uppercase tracking-wider border-b-2 break-inside-avoid"
                        style={{ borderColor: colors.primary, color: colors.primaryDark, background: 'transparent' }}
                    >
                        <div className="col-span-8">{colHeaderLeft}</div>
                        <div className="col-span-4 text-right">{colHeaderRight}</div>
                    </div>

                    {/* Primary Items - Classic hierarchy: UPPERCASE BOLD name, smaller specs (tight rows) */}
                    {primaryItems.map((item, idx) => (
                        <div
                            key={item.key}
                            className="grid grid-cols-12 px-3 py-1.5 border-t break-inside-avoid items-center"
                            style={{
                                borderColor: colors.borderLight,
                                background: idx % 2 === 1 ? colors.surface : colors.white,
                                minHeight: `${tableRowHeight}px`,
                                paddingTop: `${rowPaddingY}px`,
                                paddingBottom: `${rowPaddingY}px`,
                            }}
                        >
                            <div className="col-span-8 pr-2">
                                {/* Line 1: UPPERCASE BOLD - allow wrapping */}
                                <div className="font-bold text-[9px] tracking-wide uppercase leading-tight" style={{ color: colors.text }}>
                                    {item.name}
                                </div>
                                {/* Line 2: Specs - allow wrapping, compact */}
                                {item.description && (
                                    <div className="text-[8px] leading-tight" style={{ color: colors.textMuted }}>
                                        {item.description}
                                    </div>
                                )}
                            </div>
                            <div className="col-span-4 text-right font-bold text-xs whitespace-nowrap" style={{ color: colors.primaryDark }}>
                                {formatCurrency(item.price, Math.abs(Number(item.price)) < 0.01 ? "—" : undefined, currency)}
                            </div>
                        </div>
                    ))}

                    {/* PROJECT TOTAL = sum of primary items only (alternates excluded) */}
                    <div
                        className="grid grid-cols-12 px-3 py-1.5 border-t-2 break-inside-avoid"
                        style={{ borderColor: colors.border, background: colors.white }}
                    >
                        <div className="col-span-8 font-bold text-[10px] uppercase tracking-wide" style={{ color: colors.text }}>
                            Project Total{currency === "CAD" ? " (CAD)" : ""}
                        </div>
                        <div className="col-span-4 text-right font-bold text-xs" style={{ color: colors.text }}>
                            {formatCurrency(subtotal, Math.abs(subtotal) < 0.01 ? "—" : undefined, currency)}
                        </div>
                    </div>

                    {/* Alternate Items — shown below total, visually distinct */}
                    {alternateItems.length > 0 && (
                        <>
                            <div
                                className="grid grid-cols-12 px-3 py-1 border-t break-inside-avoid"
                                style={{ borderColor: colors.border, background: colors.surface }}
                            >
                                <div className="col-span-12 text-[8px] font-bold uppercase tracking-widest" style={{ color: colors.textMuted }}>
                                    Alternates (not included in total)
                                </div>
                            </div>
                            {alternateItems.map((item, idx) => (
                                <div
                                    key={item.key}
                                    className="grid grid-cols-12 px-3 py-1.5 border-t break-inside-avoid items-center"
                                    style={{
                                        borderColor: colors.borderLight,
                                        background: colors.surface,
                                        minHeight: `${tableRowHeight}px`,
                                        paddingTop: `${rowPaddingY}px`,
                                        paddingBottom: `${rowPaddingY}px`,
                                        opacity: 0.75,
                                    }}
                                >
                                    <div className="col-span-8 pr-2">
                                        <div className="text-[10px] tracking-wide uppercase italic" style={{ color: colors.textMuted }}>
                                            {item.name}
                                        </div>
                                        {item.description && (
                                            <div className="text-[8px] leading-none italic" style={{ color: colors.textMuted }}>
                                                {item.description}
                                            </div>
                                        )}
                                    </div>
                                    <div className="col-span-4 text-right text-xs whitespace-nowrap italic" style={{ color: colors.textMuted }}>
                                        {formatCurrency(item.price, Math.abs(Number(item.price)) < 0.01 ? "—" : undefined, currency)}
                                    </div>
                                </div>
                            ))}
                        </>
                    )}
                </div>
            </div>
        );
    };

    // Payment Terms Section
    const PaymentTermsSection = () => (
        <PaymentTermsSectionComponent colors={colors} spacing={templateSpacing} customPaymentTerms={customPaymentTerms} />
    );

    // Notes Section - Universal (available for all document types)
    const NotesSection = () => (
        <NotesSectionComponent colors={colors} spacing={templateSpacing} additionalNotes={details?.additionalNotes} />
    );

    // Scope of Work Section - Universal (available for all document types)
    const ScopeOfWorkSection = () => (
        <ScopeOfWorkSectionComponent colors={colors} spacing={templateSpacing} scopeOfWorkText={(details as any)?.scopeOfWorkText} />
    );

    // Signature Block - Universal (available for all document types)
    const SignatureBlock = () => (
        <SignatureBlockComponent colors={colors} receiverName={receiver?.name} signatureBlockText={(details as any)?.signatureBlockText} />
    );

    // Continuation page header — thin blue underline with client + project name
    const ContinuationPageHeader = () => (
        <ContinuationPageHeaderComponent colors={colors} purchaserName={purchaserName} proposalName={details?.proposalName} />
    );

    // Resp Matrix Statement of Work — from Excel "Resp Matrix" sheet OR Intelligence Mode explicit opt-in
    // Fix 10: Only use intelligence resp matrix if explicitly opted in (not just "not false")
    const intelligenceRespMatrix = (details as any)?.includeResponsibilityMatrix === true
        ? ((details as any)?.responsibilityMatrix ?? null)
        : null;
    const respMatrixRaw: RespMatrix | null = pricingDocument?.respMatrix ?? intelligenceRespMatrix;
    // Apply manual format override if set (auto = use detected format)
    const respMatrixFormatOverride: string = (details as any)?.respMatrixFormatOverride || "auto";
    const respMatrix: RespMatrix | null = respMatrixRaw
        ? { ...respMatrixRaw, format: respMatrixFormatOverride !== "auto" ? (respMatrixFormatOverride as RespMatrix["format"]) : respMatrixRaw.format }
        : null;

    const RespMatrixSOW = () => (
        <RespMatrixSOWComponent colors={colors} spacing={templateSpacing} respMatrix={respMatrix} />
    );

    const ProjectScheduleSection = () => {
        if (!hasGeneratedSchedule) return null;
        return (
            <ProjectScheduleSectionComponent
                colors={colors}
                spacing={templateSpacing}
                generatedSchedule={generatedSchedule}
                ntpDate={(details as any)?.ntpDate}
            />
        );
    };

    // Simplified Footer — www.anc.com + blue vertical accent (matches header style)
    const HybridFooter = () => (
        <HybridFooterComponent colors={colors} />
    );

    return (
        <ProposalLayout data={data} disableFixedFooter>
            {/* Compact Header — logo + document label, half the original height */}
            <div data-preview-section="header" className="flex justify-between items-center pt-2 pb-1 border-b break-inside-avoid" style={{ borderColor: colors.border, background: 'transparent', marginBottom: `${headerToIntroGap}px`, paddingLeft: `${contentPaddingX}px`, paddingRight: `${contentPaddingX}px` }}>
                <LogoSelectorServer theme="light" width={70} height={35} className="p-0" />
                <div className="text-right break-inside-avoid" style={{ background: 'transparent' }}>
                    <div className="text-[8px] uppercase tracking-widest font-semibold" style={{ color: colors.primary, background: 'transparent' }}>{docLabel}</div>
                    <h1 className="text-xs font-bold mt-0.5" style={{ color: colors.text, background: 'transparent' }}>{details?.proposalName || receiver?.name || "Client Name"}</h1>
                </div>
            </div>

            {/* Intro - 10pt font */}
            {showIntroText && (
                <div data-preview-section="intro" className="break-inside-avoid" style={{ marginBottom: `${introToBodyGap}px`, paddingLeft: `${contentPaddingX}px`, paddingRight: `${contentPaddingX}px` }}>
                    <div className="text-[10px] leading-snug" style={{ color: colors.textMuted }}>
                        {(shouldRenderLegalIntro && (details as any)?.loiHeaderText?.trim()) ? (
                            <p className="text-justify whitespace-pre-wrap">{(details as any).loiHeaderText.trim()}</p>
                        ) : customIntroText?.trim() ? (
                            <p className="text-justify whitespace-pre-wrap">{customIntroText.trim()}</p>
                        ) : shouldRenderLegalIntro ? (
                            <p className="text-justify">
                                This Sales Quotation will set forth the terms by which <strong style={{ color: colors.text }}>{purchaserLegalName}</strong> ("Purchaser"){purchaserAddress ? ` located at ${purchaserAddress}` : ""} and <strong style={{ color: colors.text }}>ANC Sports Enterprises, LLC</strong> ("ANC") located at 2 Manhattanville Road, Suite 402, Purchase, NY 10577 (collectively, the "Parties") agree that ANC will provide following LED Display and services (the "Display System") described below for the <strong style={{ color: colors.text }}>{details?.proposalName || (details as any)?.clientName || receiver?.name || "project"}</strong>.
                            </p>
                        ) : documentMode === "PROPOSAL" ? (
                            <p>
                                ANC is pleased to present the following {displayTypeLabel} proposal for <strong style={{ color: colors.text }}>{purchaserName}</strong> per the specifications and pricing below.
                            </p>
                        ) : (
                            <p>
                                ANC is pleased to present the following {displayTypeLabel} budget to <strong style={{ color: colors.text }}>{purchaserName}</strong> per the specifications below.
                            </p>
                        )}
                    </div>
                </div>
            )}

            {/* Prompt 58: Custom Proposal Notes (Fix 3) */}
            {((details as any)?.customProposalNotes) && (
                <div data-preview-section="intro" className="break-inside-avoid" style={{ marginBottom: `${introToBodyGap}px`, paddingLeft: `${contentPaddingX}px`, paddingRight: `${contentPaddingX}px` }}>
                    <div className="text-[10px] leading-snug whitespace-pre-wrap" style={{ color: colors.textMuted }}>
                        {(details as any).customProposalNotes}
                    </div>
                </div>
            )}

            {/* ════════════════════════════════════════════════════════════
                LOI MODE — Natalia's required page structure (Prompt 41)
                Structure A (master table): Intro → Summary → Payment/Sig → Breakdown → Specs
                Structure B (no master):    Intro → Breakdown → Payment/Sig → Specs
               ════════════════════════════════════════════════════════════ */}
            {isLOI ? (
                masterTableIndex !== null ? (
                    /* ── Structure A: Business/Legal → THE KICK → Technical ── */
                    <>
                        {/* ═══ BUSINESS (Page 1): Pricing Summary + Detail Breakdown ═══ */}
                        {showPricingTables && <MasterTableSummary />}
                        {showPricingTables && shouldPushPricingToNewPage && (
                            <>
                                <PageBreak />
                                <ContinuationPageHeader />
                            </>
                        )}
                        {showPricingTables && (
                            <div className="px-6">
                                <PricingSection />
                            </div>
                        )}

                        {/* ═══ LEGAL (Page 2): Payment Terms + Signatures at top ═══ */}
                        <PageBreak />
                        <ContinuationPageHeader />
                        {shouldRenderPaymentTerms && (
                            <div className="px-6">
                                <PaymentTermsSection />
                            </div>
                        )}
                        {showNotes && (
                            <div className="px-6">
                                <NotesSection />
                            </div>
                        )}
                        {shouldRenderSignatureBlock && (
                            <div className="px-6 break-inside-avoid">
                                <SignatureBlock />
                            </div>
                        )}

                        {/* ═══ THE KICK (Page 3): Technical content starts on fresh page ═══ */}
                        {(showSpecifications || showExhibitA) && screens.length > 0 && (
                            <>
                                <PageBreak />
                                <ContinuationPageHeader />
                                <div data-preview-section="exhibit-a" className="px-6">
                                    <ExhibitA_TechnicalSpecs data={data} showSOW={showScopeOfWork} headingMode="exhibit" />
                                </div>
                            </>
                        )}
                        {hasGeneratedSchedule && (
                            <div className="px-6">
                                <ProjectScheduleSection />
                            </div>
                        )}

                        {/* ═══ TECHNICAL (Pages 4-5): SOW + Matrix flow continuously ═══ */}
                        {showScopeOfWork && (details as any)?.scopeOfWorkText?.trim() && (
                            <div className="px-6">
                                <SectionHeader title="Exhibit B — Statement of Work" />
                                <ScopeOfWorkSection />
                            </div>
                        )}
                        <RespMatrixSOW />

                        <div className="px-6">
                            <HybridFooter />
                        </div>
                    </>
                ) : (
                    /* ── Structure B: No master table — detail tables first ── */
                    <>
                        {/* Pricing tables immediately after intro */}
                        {showPricingTables && shouldPushPricingToNewPage && (
                            <>
                                <PageBreak />
                                <ContinuationPageHeader />
                            </>
                        )}
                        {showPricingTables && (
                            <div className="px-6">
                                <PricingSection />
                            </div>
                        )}

                        {/* Then: Payment Terms + Notes + Signature Block */}
                        {shouldRenderPaymentTerms && (
                            <div className="px-6">
                                <PaymentTermsSection />
                            </div>
                        )}
                        {showNotes && (
                            <div className="px-6">
                                <NotesSection />
                            </div>
                        )}
                        {shouldRenderSignatureBlock && (
                            <div className="px-6 break-inside-avoid">
                                <SignatureBlock />
                            </div>
                        )}

                        {/* Technical Specifications — flow after signatures */}
                        {(showSpecifications || showExhibitA) && screens.length > 0 && (
                            <>
                                <PageBreak />
                                <ContinuationPageHeader />
                                <div data-preview-section="exhibit-a" className="px-6">
                                    <ExhibitA_TechnicalSpecs data={data} showSOW={showScopeOfWork} headingMode="exhibit" />
                                </div>
                            </>
                        )}
                        {hasGeneratedSchedule && (
                            <div className="px-6">
                                <ProjectScheduleSection />
                            </div>
                        )}

                        {/* SOW — flows after specs */}
                        {showScopeOfWork && (details as any)?.scopeOfWorkText?.trim() && (
                            <div className="px-6">
                                <SectionHeader title="Exhibit B — Statement of Work" />
                                <ScopeOfWorkSection />
                            </div>
                        )}

                        {/* Resp Matrix SOW (if present in Excel) — own page per Natalia */}
                        <RespMatrixSOW />

                        <div className="px-6">
                            <HybridFooter />
                        </div>
                    </>
                )
            ) : (
                /* Budget / Proposal order: Header → Intro → Master Table → Page Break → Pricing → Notes → Specs → Exhibit A */
                <>
                    {/* Master table (project summary) on page 1 */}
                    {showPricingTables && masterTableIndex !== null && <MasterTableSummary />}

                    {/* Page break: detail section breakdowns start on a new page */}
                    {showPricingTables && masterTableIndex !== null && <PageBreak />}
                    {showPricingTables && masterTableIndex !== null && <ContinuationPageHeader />}
                    {showPricingTables && masterTableIndex === null && shouldPushPricingToNewPage && <PageBreak />}
                    {showPricingTables && masterTableIndex === null && shouldPushPricingToNewPage && <ContinuationPageHeader />}

                    {/* Pricing tables */}
                    {showPricingTables && (
                        <div className="px-6">
                            <PricingSection />
                        </div>
                    )}

                    {showNotes && (
                        <div className="px-6">
                            <NotesSection />
                        </div>
                    )}
                    {(showSpecifications || showExhibitA) && screens.length > 0 && (
                        <>
                            <PageBreak />
                            <ContinuationPageHeader />
                            <div data-preview-section="exhibit-a" className="px-6">
                                <ExhibitA_TechnicalSpecs data={data} showSOW={showScopeOfWork} headingMode="plain" />
                            </div>
                        </>
                    )}
                    {hasGeneratedSchedule && (
                        <>
                            <PageBreak />
                            <ContinuationPageHeader />
                            <div className="px-6">
                                <ProjectScheduleSection />
                            </div>
                        </>
                    )}
                    {/* SOW on own page with Exhibit B header */}
                    {showScopeOfWork && (
                        <>
                            <PageBreak />
                            <ContinuationPageHeader />
                            <div className="px-6">
                                <SectionHeader title="Exhibit B — Statement of Work" />
                                <ScopeOfWorkSection />
                            </div>
                        </>
                    )}
                    {/* Resp Matrix SOW (if present in Excel) — own page */}
                    <RespMatrixSOW />

                    {shouldRenderPaymentTerms && (
                        <div className="px-6">
                            <PaymentTermsSection />
                        </div>
                    )}
                    {shouldRenderSignatureBlock && (
                        <>
                            <PageBreak />
                            <ContinuationPageHeader />
                            <div className="px-6 break-inside-avoid">
                                <SignatureBlock />
                            </div>
                        </>
                    )}
                    <div className="px-6">
                        <HybridFooter />
                    </div>
                </>
            )}
        </ProposalLayout>
    );
};

export default ProposalTemplate5;
