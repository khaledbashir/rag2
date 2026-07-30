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
import { splitPaymentTermsLines } from "@/lib/proposals/paymentTerms";
import PageBreak from "@/app/components/templates/proposal-pdf/PageBreak";

// Section sub-components
import PdfHeader from "./sections/PdfHeader";
import PdfPricingTables from "./sections/PdfPricingTables";
import PdfFreeformTables from "./sections/PdfFreeformTables";
import PdfRichBody from "./PdfRichBody";
import PdfSpecsTable from "./sections/PdfSpecsTable";
import PdfResponsibilityMatrix from "./sections/PdfResponsibilityMatrix";
import PdfSignatureBlock from "./sections/PdfSignatureBlock";
import PdfTermsAndConditions from "./sections/PdfTermsAndConditions";
import PdfServiceAgreement, { type ServiceAgreementConfig } from "./sections/PdfServiceAgreement";
import PdfServiceContract from "./PdfServiceContract";
import PdfServiceProposal from "./PdfServiceProposal";
import { matchTeamVenue } from "@/lib/serviceContracts/teamVenues";
import { cityStateFromAddress } from "@/lib/serviceContracts/serviceProposalIntro";
import type { ServicePricingDocument } from "@/types/servicePricing";
import { MasterTableSummary, LOISummaryTable } from "./sections/PdfProjectSummary";
import type { PdfColors, PdfTemplateSpacing } from "./sections/shared";

// Helpers
import { formatCurrency } from "@/lib/helpers";
import { resolveDocumentMode, getModeConfig } from "@/lib/documentMode";
import { FEATURES } from "@/lib/featureFlags";
import {
    DOCUMENT_MODES,
} from "@/services/rfp/productCatalog";
import type { DocumentMode as CatalogDocumentMode } from "@/services/rfp/productCatalog";

// Types
import { ProposalType } from "@/types";
import { RespMatrix } from "@/types/pricing";
import { getMasterRespMatrix } from "@/lib/respMatrixMaster";
import { buildChangeOrderIntroSegments } from "@/lib/changeOrderIntro";
import { buildLoiIntroSegments } from "@/lib/loiIntro";

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
    const docModeConfig = getModeConfig(documentMode);
    const isLOI = documentMode === "LOI" || documentMode === "CONTRACT";
    const isContract = documentMode === "CONTRACT";
    const isCO = documentMode === "CHANGE_ORDER";
    const isServiceAgreement = documentMode === "SERVICE_AGREEMENT";
    const isServiceContract = documentMode === "SERVICE_CONTRACT";
    const isServiceProposal = documentMode === "SERVICE_PROPOSAL";
    const shortFormDocumentName = isContract ? "Short Form Contract" : "Short Form Agreement";

    // Change Order metadata
    const changeOrderNumber = (((details as any)?.changeOrderNumber || "") + "").trim();
    const changeOrderRequestedBy = (((details as any)?.changeOrderRequestedBy || "") + "").trim();
    const changeOrderDateRaw = (((details as any)?.changeOrderDate || "") + "").trim();
    const changeOrderOriginalContractNumber = (((details as any)?.changeOrderOriginalContractNumber || "") + "").trim();
    const changeOrderOriginalContractAmount = Number((details as any)?.changeOrderOriginalContractAmount) || 0;
    const changeOrderPreviousTotalAmount = Number((details as any)?.changeOrderPreviousTotalAmount) || 0;
    const changeOrderOverheadPct = Number((details as any)?.changeOrderOverheadPct) || 0;
    const changeOrderIntroText = (((details as any)?.changeOrderIntroText || "") + "").trim();
    const changeOrderOriginalAgreementDate = (((details as any)?.changeOrderOriginalAgreementDate || "") + "").trim();

    // Header label — CO mode appends the CO number ("CHANGE ORDER · CO-01") so it shows in the header per the CO #4 spec.
    const docLabel = isCO && changeOrderNumber
        ? `${docModeConfig.headerText} · ${changeOrderNumber}`
        : docModeConfig.headerText;

    // T&C exhibit config — toggleable for both Short Form Agreement (LOI) and Short Form Contract.
    // Default off for SFA, on for CONTRACT — both can override via the toggle.
    const showTc = (details as any)?.showTermsAndConditions ?? isContract;
    const tcConfig = (isLOI && showTc) ? {
        purchaserName: (details as any)?.purchaserLegalName || receiver?.name || "Purchaser",
        warrantyYears: (details as any)?.tcWarrantyYears ?? 5,
        includeLaborWarranty: (details as any)?.tcIncludeLaborWarranty ?? true,
        includeMaterialsWarranty: (details as any)?.tcIncludeMaterialsWarranty ?? true,
        includeCms: (details as any)?.tcIncludeCms ?? false,
        includeGraphics: (details as any)?.tcIncludeGraphics ?? false,
        bodyOverride: (details as any)?.generalTermsBodyOverride ?? undefined,
    } : null;

    // Guard against raw numbers (e.g., project IDs mistakenly used as names)
    const rawPurchaserName = receiver?.name || "";
    const purchaserName = rawPurchaserName && !/^\d+$/.test(rawPurchaserName.trim()) ? rawPurchaserName : "Client";
    // Prompt 42: Purchaser legal name for LOI (defaults to client name if not set)
    const purchaserLegalName = ((details as any)?.purchaserLegalName || "").trim() || purchaserName;
    const purchaserAddress = (() => {
        const parts = [receiver?.address, receiver?.city, receiver?.zipCode].filter(Boolean);
        return parts.length > 0 ? parts.join(", ") : "";
    })();
    const venueLabel = (() => {
        const raw = ((details as any)?.venue || (details as any)?.location || "").toString().trim();
        if (!raw || raw.toLowerCase() === "generic") return "";
        return raw;
    })();

    // Prompt 43: Currency detection from pricingDocument
    const pricingDocument = (details as any)?.pricingDocument || (data as any)?.pricingDocument;
    const mirrorMode =
        (details as any)?.mirrorMode === true || ((pricingDocument?.tables || []).length ?? 0) > 0;
    // Prefer the user-selected currency from the form. Fall back to native pricingDocument currency.
    const currency: "CAD" | "USD" | "GBP" | "EUR" = (details as any)?.currency || pricingDocument?.currency || "USD";
    // USD → currency multiplier. Defaults to 1 (no conversion).
    const exchangeRate: number = typeof (details as any)?.exchangeRate === "number" && (details as any).exchangeRate > 0
        ? (details as any).exchangeRate
        : 1;

    // Prompt 51: Master table index — designates which pricing table is the "Project Grand Total"
    // -1 = user explicitly chose "None (no master table)" — NEVER override this.
    // null/undefined = never set — auto-detect is allowed.
    const rollUpRegex = /\b(total|roll.?up|summary|project\s+grand|grand\s+total|project\s+total|cost\s+summary|pricing\s+summary)\b/i;
    const pricingTables = pricingDocument?.tables || [];
    const rawMasterTableIndex = (details as any)?.masterTableIndex;
    let masterTableIndex: number | null = rawMasterTableIndex === -1 ? null : (rawMasterTableIndex ?? null);
    if (rawMasterTableIndex == null && masterTableIndex === null && pricingTables.length > 1 && rollUpRegex.test(pricingTables[0]?.name || "")) {
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
    // Date for PDF header — use revision date if available, otherwise today
    const headerDate = (() => {
        const raw = (details as any)?.revisionDate || (details as any)?.date || (details as any)?.updatedAt;
        const d = raw ? new Date(raw) : new Date();
        if (isNaN(d.getTime())) return new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
        return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
    })();

    const templateConfig = ((details as any)?.templateConfig || {}) as Record<string, any>;
    const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
    const contentPaddingX = clamp(Number(templateConfig?.contentPaddingX ?? 24) || 24, 12, 48);
    const headerToIntroGap = clamp(Number(templateConfig?.headerToIntroGap ?? 16) || 16, 4, 64);
    const introToBodyGap = clamp(Number(templateConfig?.introToBodyGap ?? 16) || 16, 4, 72);
    const sectionSpacing = clamp(Number(templateConfig?.sectionSpacing ?? 16) || 16, 6, 36);
    const pricingTableGap = clamp(Number(templateConfig?.pricingTableGap ?? 16) || 16, 6, 36);
    const tableRowHeight = clamp(Number(templateConfig?.tableRowHeight ?? 24) || 24, 20, 40);
    const rowPaddingY = clamp(Math.round((tableRowHeight - 16) / 2), 2, 12);
    // Font size control — default 14px (matches hardcoded Tailwind classes)
    const fontSizePt = clamp(Number(templateConfig?.fontSizePt ?? 14) || 14, 8, 18);
    const fontOffset = fontSizePt - 14; // offset from default; 0 = no change
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
    const showChangeOrderTotals = (details as any)?.showChangeOrderTotals ?? true;
    const showIntroText = (details as any)?.showIntroText ?? true;
    const showCompanyFooter = (details as any)?.showCompanyFooter ?? true;
    const generatedSchedule = (details as any)?.generatedSchedule;
    const generatedScheduleTasks = Array.isArray(generatedSchedule?.tasks) ? generatedSchedule.tasks : [];
    const hasGeneratedSchedule = !mirrorMode && generatedScheduleTasks.length > 0;
    const showExhibitA = (details as any)?.showExhibitA ?? false;
    const showResponsibilityMatrix = FEATURES.RESPONSIBILITY_MATRIX && ((details as any)?.showResponsibilityMatrix ?? true);
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
    const substantialCompletionDate = ((details as any)?.substantialCompletionDate || "").toString().trim();
    const showSubstantialCompletionDate = (details as any)?.showSubstantialCompletionDate ?? isContract;

    const formatShortFormDate = (raw: string) => {
        if (!raw) return "";
        const d = new Date(raw);
        if (isNaN(d.getTime())) return raw;
        return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
    };

    // ===== COMPONENTS =====

    // Unified Section Header — blue vertical bar accent + text (Natalia-approved)
    const templateSpacing = { contentPaddingX, headerToIntroGap, introToBodyGap, sectionSpacing, pricingTableGap, tableRowHeight, rowPaddingY };
    const SectionHeader = ({ title, subtitle }: { title: string; subtitle?: string }) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: subtitle ? '4px' : '8px' }}>
            <div style={{ width: '3px', height: '14px', borderRadius: '1px', background: colors.primary, flexShrink: 0 }} />
            <div>
                <span className="text-[14px] font-bold uppercase tracking-wider" style={{ color: colors.primaryDark }}>{title}</span>
                {subtitle && <div className="text-[14px] mt-0.5" style={{ color: colors.textMuted }}>{subtitle}</div>}
            </div>
        </div>
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
    const LOISummaryTableSection = () => {
        const total = calculateProjectTotal();
        return <LOISummaryTable colors={colors} currency={currency} exchangeRate={exchangeRate} total={total} />;
    };

    // Prompt 51: Master Table Summary — renders the designated "Project Grand Total" table at top
    const MasterTableSummarySection = () => {
        if (masterTableIndex === null) return null;
        const masterTable = pricingTables[masterTableIndex];
        if (!masterTable) return null;
        const tableHeaderOverrides = ((details as any)?.tableHeaderOverrides || {}) as Record<string, string>;
        return (
            <MasterTableSummary
                colors={colors}
                currency={currency}
                exchangeRate={exchangeRate}
                masterTable={masterTable}
                tableHeaderOverrides={tableHeaderOverrides}
                screenNameMap={screenNameMap}
                descriptionOverrides={descriptionOverrides}
                priceOverrides={priceOverrides}
                colHeaderLeft={colHeaderLeft}
                colHeaderRight={colHeaderRight}
            />
        );
    };

    // Hybrid Pricing Section - delegates to PdfPricingTables sub-component
    const PricingSection = () => (
        <PdfPricingTables
            colors={colors}
            spacing={templateSpacing}
            currency={currency}
            exchangeRate={exchangeRate}
            isLandscape={isLandscape}
            isSharedView={isSharedView}
            mirrorMode={mirrorMode}
            masterTableIndex={masterTableIndex}
            pricingDocument={pricingDocument}
            details={details}
            screens={screens}
            internalAudit={internalAudit}
            descriptionOverrides={descriptionOverrides}
            priceOverrides={priceOverrides}
            screenNameMap={screenNameMap}
            colHeaderLeft={colHeaderLeft}
            colHeaderRight={colHeaderRight}
        />
    );

    // Free-form Pricing Tables (Priority 1-tied) — user-built tables, any columns/rows.
    const freeformTables = ((details as any)?.freeformTables || []) as any[];
    const showFreeformTables = (details as any)?.showFreeformTables ?? true;
    const FreeformTablesSection = () =>
        showFreeformTables && freeformTables.length > 0 ? <PdfFreeformTables colors={colors} tables={freeformTables} /> : null;

    // Payment Terms Section
    const PaymentTermsSection = () => {
        // FR-4.3: Use custom payment terms if provided, otherwise use default
        const defaultTerms = "50% on Deposit\n40% on Mobilization\n10% on Substantial Completion";
        const raw = (customPaymentTerms?.trim() || defaultTerms).toString();
        const lines = splitPaymentTermsLines(raw);
        const completionLabel = showSubstantialCompletionDate ? formatShortFormDate(substantialCompletionDate) : "";
        if (lines.length === 0) return null;
        return (
            <div data-preview-section="payment-terms" className="mt-2">
                <SectionHeader title="Payment Terms" />
                <div className="rounded-lg p-3 text-[14px] leading-snug" style={{ background: colors.surface, color: colors.textMuted }}>
                    {completionLabel && (
                        <div className="mb-2" style={{ color: colors.text }}>
                            <strong>Substantial Completion:</strong> {completionLabel}
                        </div>
                    )}
                    {lines.map((line: string, idx: number) =>
                        line === ""
                            ? <div key={idx} style={{ height: "6px" }} />
                            : <div key={idx}>{line}</div>
                    )}
                </div>
            </div>
        );
    };

    // Notes Section - Universal (available for all document types)
    // Combines customProposalNotes (primary notes field) — renders after pricing, before payment terms
    const NotesSection = () => {
        const notesText = ((details as any)?.customProposalNotes || "").toString().trim();
        if (!notesText) return null;
        return (
            <div data-preview-section="notes" className="mt-2">
                <SectionHeader title="Notes" />
                {/* Same notes field the Service Proposal renders, so it must
                    format the same way — bullets/bold, plain text unchanged
                    (Natalia 2026-07-30). */}
                <div className="rounded-lg p-3 text-[14px] leading-snug" style={{ background: colors.surface, color: colors.text }}>
                    <PdfRichBody text={notesText} className="" />
                </div>
            </div>
        );
    };

    // Change Order Info Block — Project / CO# / Requested By / Date
    const ChangeOrderInfoBlock = () => {
        const projectLabel = (details?.proposalName || (details as any)?.clientName || receiver?.name || "—").toString();
        const coNumberLabel = changeOrderNumber || "—";
        const requestedByLabel = changeOrderRequestedBy || receiver?.name || "—";
        const dateLabel = formatShortFormDate(changeOrderDateRaw) || formatShortFormDate(headerDate || "") || "—";
        const rows: Array<[string, string]> = [
            ["Project", projectLabel],
            ["Change Order #", coNumberLabel],
            ...(changeOrderOriginalContractNumber ? [["Original Contract #", changeOrderOriginalContractNumber] as [string, string]] : []),
            ["Requested By", requestedByLabel],
            ["Date", dateLabel],
        ];
        return (
            <div className="mt-2" style={{ paddingLeft: `${contentPaddingX}px`, paddingRight: `${contentPaddingX}px` }}>
                <SectionHeader title="Change Order Details" />
                <div className="rounded-lg p-3 text-[14px] leading-snug" style={{ background: colors.surface, color: colors.text }}>
                    {rows.map(([label, value]) => (
                        <div key={label} className="flex" style={{ paddingTop: 2, paddingBottom: 2 }}>
                            <div style={{ width: 160, color: colors.textMuted, fontWeight: 600 }}>{label}</div>
                            <div style={{ flex: 1 }}>{value}</div>
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    // Change Order Description of Work — line-item table fed by details.items (CO line items).
    // Falls back to the existing PricingSection if no line items entered (covers LED-pricing-table use case).
    const ChangeOrderDescriptionOfWork = () => {
        const items = Array.isArray((details as any)?.items)
            ? (details as any).items.filter((it: any) => it && (it.name || it.description) && (Number(it.unitPrice) || Number(it.total) || Number(it.quantity)))
            : [];
        if (items.length === 0) return <PricingSection />;
        const fmt = (n: number) => formatCurrency((Number(n) || 0) * (exchangeRate || 1), undefined, currency);
        return (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginTop: 6 }}>
                <thead>
                    <tr>
                        <th style={{ background: colors.primary, color: colors.white, textAlign: "left", padding: "8px 10px", fontWeight: 700, fontSize: 11, letterSpacing: 1, textTransform: "uppercase", width: "55%" }}>Description</th>
                        <th style={{ background: colors.primary, color: colors.white, textAlign: "left", padding: "8px 10px", fontWeight: 700, fontSize: 11, letterSpacing: 1, textTransform: "uppercase", width: "10%" }}>Qty</th>
                        <th style={{ background: colors.primary, color: colors.white, textAlign: "right", padding: "8px 10px", fontWeight: 700, fontSize: 11, letterSpacing: 1, textTransform: "uppercase", width: "15%" }}>Unit Price</th>
                        <th style={{ background: colors.primary, color: colors.white, textAlign: "right", padding: "8px 10px", fontWeight: 700, fontSize: 11, letterSpacing: 1, textTransform: "uppercase", width: "20%" }}>Total</th>
                    </tr>
                </thead>
                <tbody>
                    {items.map((it: any, idx: number) => {
                        const qty = Number(it.quantity) || 0;
                        const unit = Number(it.unitPrice) || 0;
                        const explicitTotal = Number(it.total);
                        const lineTotal = Number.isFinite(explicitTotal) && explicitTotal !== 0 ? explicitTotal : qty * unit;
                        return (
                            <tr key={idx} style={{ background: idx % 2 === 0 ? "transparent" : colors.surface }}>
                                <td style={{ padding: "8px 10px", borderBottom: `1px solid ${colors.border}` }}>
                                    <div style={{ fontWeight: 600, color: colors.text }}>{it.name || it.description || `Line ${idx + 1}`}</div>
                                    {it.name && it.description && <div style={{ fontSize: 11, color: colors.textMuted }}>{it.description}</div>}
                                </td>
                                <td style={{ padding: "8px 10px", borderBottom: `1px solid ${colors.border}`, color: colors.text }}>{qty || "—"}</td>
                                <td style={{ padding: "8px 10px", borderBottom: `1px solid ${colors.border}`, textAlign: "right", color: colors.text, fontVariantNumeric: "tabular-nums" }}>{fmt(unit)}</td>
                                <td style={{ padding: "8px 10px", borderBottom: `1px solid ${colors.border}`, textAlign: "right", color: colors.text, fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{fmt(lineTotal)}</td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        );
    };

    // Change Order Totals — Subtotal / Tax / Overhead / Total CO / Original + previous COs / New Contract
    const ChangeOrderTotalsBlock = () => {
        // Subtotal: prefer hand-entered line items; fall back to the project pricing total.
        const lineItems = Array.isArray((details as any)?.items)
            ? (details as any).items.filter((it: any) => it && (it.name || it.description) && (Number(it.unitPrice) || Number(it.total) || Number(it.quantity)))
            : [];
        const itemsSubtotal = lineItems.reduce((sum: number, it: any) => {
            const qty = Number(it.quantity) || 0;
            const unit = Number(it.unitPrice) || 0;
            const explicit = Number(it.total);
            const lineTotal = Number.isFinite(explicit) && explicit !== 0 ? explicit : qty * unit;
            return sum + lineTotal;
        }, 0);
        const pricingTables = (pricingDocument?.tables || []) as Array<{ subtotal?: number; grandTotal?: number; tax?: { amount?: number; rate?: number } | null; items?: Array<{ sellingPrice?: number; price?: number }> }>;
        const pricingSubtotal = pricingTables.reduce((sum, table) => {
            const tableSubtotal = Number(table?.subtotal);
            if (Number.isFinite(tableSubtotal) && Math.abs(tableSubtotal) >= 0.01) return sum + tableSubtotal;
            const itemSubtotal = Array.isArray(table?.items)
                ? table.items.reduce((itemSum, item) => itemSum + (Number(item?.sellingPrice ?? item?.price ?? 0) || 0), 0)
                : 0;
            return sum + itemSubtotal;
        }, 0);
        const subtotal = lineItems.length > 0
            ? itemsSubtotal
            : pricingSubtotal > 0
                ? pricingSubtotal
                : calculateProjectTotal();
        const rawTaxRate = Number((details as any)?.changeOrderTaxRate ?? (details as any)?.taxRateOverride ?? 0) || 0;
        const normalizedTaxRate = rawTaxRate > 1 ? rawTaxRate / 100 : rawTaxRate;
        const pricingTaxAmount = pricingTables.reduce((sum, table) => {
            const amount = Number((table?.tax as any)?.amount);
            if (Number.isFinite(amount)) return sum + amount;
            return sum;
        }, 0);
        const taxAmt = lineItems.length === 0 && Math.abs(pricingTaxAmount) >= 0.01
            ? pricingTaxAmount
            : Math.round((subtotal * normalizedTaxRate) * 100) / 100;
        const overheadAmt = Math.round((subtotal * (changeOrderOverheadPct / 100)) * 100) / 100;
        const totalCO = subtotal + taxAmt + overheadAmt;
        const newContract = changeOrderOriginalContractAmount + changeOrderPreviousTotalAmount + totalCO;
        const fmt = (n: number) => formatCurrency((Number(n) || 0) * (exchangeRate || 1), undefined, currency);
        const taxLabel = normalizedTaxRate > 0 ? `Tax (${Math.round(normalizedTaxRate * 10000) / 100}%)` : "Tax";
        const rows: Array<[string, string, boolean]> = [
            ["Subtotal", fmt(subtotal), false],
            ...(Math.abs(taxAmt) >= 0.01 ? [[taxLabel, fmt(taxAmt), false] as [string, string, boolean]] : []),
            ...(Math.abs(overheadAmt) >= 0.01 ? [[`ANC Overhead (${changeOrderOverheadPct}%)`, fmt(overheadAmt), false] as [string, string, boolean]] : []),
            ["Total Change Order Amount", fmt(totalCO), true],
            ["Original Contract Amount", fmt(changeOrderOriginalContractAmount), false],
            ["Previous change order total amount", fmt(changeOrderPreviousTotalAmount), false],
            ["New Contract Amount", fmt(newContract), true],
        ];
        return (
            <div className="mt-3" style={{ paddingLeft: `${contentPaddingX}px`, paddingRight: `${contentPaddingX}px` }}>
                <SectionHeader title="Revised Contract Totals" />
                <div className="rounded-lg p-3 text-[14px] leading-snug" style={{ background: colors.surface, color: colors.text }}>
                    {rows.map(([label, value, emphasize]) => (
                        <div key={label} className="flex justify-between" style={{ paddingTop: 4, paddingBottom: 4, borderTop: emphasize ? `1px solid ${colors.border}` : "none" }}>
                            <div style={{ color: colors.textMuted, fontWeight: emphasize ? 700 : 500 }}>{label}</div>
                            <div style={{ fontWeight: emphasize ? 700 : 500, color: emphasize ? colors.text : colors.textMuted }}>{value}</div>
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    // Scope of Work Section - Universal (available for all document types)
    const ScopeOfWorkSection = () => {
        const raw = ((details as any)?.scopeOfWorkText || "").toString().trim();
        if (!raw) return null;
        return (
            <div className="rounded-lg p-3 text-[14px] leading-snug whitespace-pre-wrap" style={{ background: colors.surface, color: colors.text }}>
                {raw}
            </div>
        );
    };

    // Signature Block - delegates to PdfSignatureBlock sub-component
    // Build receiver address for signature block (matches reference: "250 N Hartford Ave, Columbus, OH 43222")
    const receiverSignatureAddress = (() => {
        const street = (receiver?.address || "").trim();
        const city = (receiver?.city || "").trim();
        const zip = (receiver?.zipCode || "").trim();
        const cityStateZip = [city, zip].filter(Boolean).join(" ");
        return [street, cityStateZip].filter(Boolean).join("\n");
    })();

    // LOI: loiHeaderText is the legal paragraph that goes BEFORE signature lines (not in intro)
    const resolvedSignatureText = (() => {
        const explicit = ((details as any)?.signatureBlockText || "").trim();
        if (explicit) return explicit;
        if (isLOI) {
            const loiLegal = ((details as any)?.loiHeaderText || "").trim();
            if (loiLegal) return loiLegal;
        }
        return "";
    })();

    const SignatureBlock = () => (
        <PdfSignatureBlock
            colors={colors}
            receiverName={isLOI ? purchaserLegalName : (receiver?.name || "Purchaser")}
            receiverAddress={receiverSignatureAddress}
            signatureBlockText={resolvedSignatureText}
        />
    );

    // Continuation page header — thin blue underline with client + project name
    const ContinuationPageHeader = () => {
        const proposalLabel = (details?.proposalName || "").trim();
        const clientLabel = (purchaserName || "").trim();
        const isSame = proposalLabel && clientLabel && proposalLabel.toLowerCase() === clientLabel.toLowerCase();
        const label = isSame ? clientLabel : `${clientLabel} • ${proposalLabel || "Proposal"}`;
        return (
            <div className="pb-2 mb-4 border-b-2" style={{ borderColor: colors.primary }}>
                <div className="text-[14px] font-semibold" style={{ color: colors.textMuted }}>
                    {label}
                </div>
            </div>
        );
    };

    // Resp Matrix Statement of Work — from Excel "Resp Matrix" sheet OR Intelligence Mode explicit opt-in
    // Fix 10: Only use intelligence resp matrix if explicitly opted in (not just "not false")
    const intelligenceRespMatrix = (details as any)?.includeResponsibilityMatrix === true
        ? ((details as any)?.responsibilityMatrix ?? null)
        : null;
    // Resolution order: (1) parsed sheet from uploaded workbook, (2) manually-edited override,
    // (3) ANC master matrix baked into the platform. The master makes the matrix auto-appear on
    // every proposal with no Excel sheet and no wizard — mirroring how the LED Exhibit A specs
    // page is auto-generated. Authors can still hide it via the showResponsibilityMatrix toggle.
    const respMatrixRaw: RespMatrix | null =
        pricingDocument?.respMatrix ?? intelligenceRespMatrix ?? getMasterRespMatrix();
    // Apply manual format override if set (auto = use detected format)
    const respMatrixFormatOverride: string = (details as any)?.respMatrixFormatOverride || "auto";
    const respMatrix: RespMatrix | null = respMatrixRaw
        ? { ...respMatrixRaw, format: respMatrixFormatOverride !== "auto" ? (respMatrixFormatOverride as RespMatrix["format"]) : respMatrixRaw.format }
        : null;

    // Resp Matrix SOW — delegates to PdfResponsibilityMatrix sub-component
    const RespMatrixSOW = () => (
        <PdfResponsibilityMatrix colors={colors} respMatrix={respMatrix} />
    );

    const ProjectScheduleSection = () => {
        if (!hasGeneratedSchedule) return null;

        // Extract schedule metadata
        const ntpLabel = generatedSchedule?.ntpDate || "—";
        const completionLabel = generatedSchedule?.completionDate || "—";
        const totalDuration = generatedSchedule?.totalDuration || 0;

        // Group tasks by phase
        const grouped = generatedScheduleTasks.reduce((acc: Array<{ phase: string; tasks: any[] }>, task: any) => {
            const phase = task?.phase || "General";
            let group = acc.find(g => g.phase === phase);
            if (!group) {
                group = { phase, tasks: [] };
                acc.push(group);
            }
            group.tasks.push(task);
            return acc;
        }, []);

        let taskNumber = 0;

        return (
            <div data-preview-section="schedule" className="mt-2 break-inside-avoid" style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
                <SectionHeader title="Project Schedule" subtitle="Generated from NTP date and screen configuration" />
                <div className="rounded-lg border overflow-hidden" style={{ borderColor: colors.border }}>
                    <div className="grid grid-cols-12 px-4 py-2 text-[14px] font-bold uppercase tracking-wider" style={{ background: colors.primaryLight, color: colors.primaryDark }}>
                        <div className="col-span-4">NTP: {ntpLabel || "—"}</div>
                        <div className="col-span-4 text-center">Completion: {completionLabel || "—"}</div>
                        <div className="col-span-4 text-right">Duration: {totalDuration > 0 ? `${totalDuration} business days` : "—"}</div>
                    </div>

                    <div className="grid grid-cols-12 px-4 py-1.5 text-[14px] font-semibold uppercase tracking-wider border-b-2" style={{ borderColor: colors.primary, color: colors.primaryDark, background: 'transparent' }}>
                        <div className="col-span-1">#</div>
                        <div className="col-span-4">Task</div>
                        <div className="col-span-2">Location</div>
                        <div className="col-span-2">Start</div>
                        <div className="col-span-2">End</div>
                        <div className="col-span-1 text-right">Days</div>
                    </div>

                    {grouped.map((group: { phase: string; tasks: any[] }) => (
                        <React.Fragment key={`phase-${group.phase}`}>
                            <div className="px-4 py-1.5 text-[14px] font-bold uppercase tracking-wider border-t" style={{ borderColor: colors.borderLight, background: colors.surface, color: colors.primaryDark }}>
                                {group.phase}
                            </div>
                            {group.tasks.map((task: any, idx: number) => {
                                taskNumber += 1;
                                return (
                                    <div
                                        key={`${group.phase}-${idx}-${task?.taskName || "task"}`}
                                        className="grid grid-cols-12 px-4 py-2 text-[14px] border-t items-center"
                                        style={{ borderColor: colors.borderLight, background: idx % 2 === 1 ? colors.surface : colors.white }}
                                    >
                                        <div className="col-span-1" style={{ color: colors.textMuted }}>{taskNumber}</div>
                                        <div className="col-span-4 font-semibold" style={{ color: colors.text }}>
                                            {task?.isParallel ? "↳ " : ""}{task?.taskName || "Task"}
                                        </div>
                                        <div className="col-span-2" style={{ color: colors.textMuted }}>{task?.locationName || "Global"}</div>
                                        <div className="col-span-2" style={{ color: colors.text }}>{task?.startDate || "—"}</div>
                                        <div className="col-span-2" style={{ color: colors.text }}>{task?.endDate || "—"}</div>
                                        <div className="col-span-1 text-right" style={{ color: colors.text }}>{task?.durationDays ?? "—"}</div>
                                    </div>
                                );
                            })}
                        </React.Fragment>
                    ))}
                </div>
            </div>
        );
    };

    // Simplified Footer — www.anc.com + blue vertical accent (matches header style)
    const HybridFooter = () => (
        <div className="mt-8 pt-3 border-t flex items-center justify-between" style={{ borderColor: colors.border }}>
            <div className="flex items-center gap-2">
                <div style={{ width: '3px', height: '16px', background: colors.primary, borderRadius: '1px' }} />
                <span className="text-[14px] font-semibold" style={{ color: colors.primary }}>www.anc.com</span>
            </div>
            <span className="text-[14px]" style={{ color: colors.textMuted }}>ANC Sports Enterprises, LLC</span>
        </div>
    );

    // Font size CSS override — applies offset to all hardcoded Tailwind text-[Xpx] classes
    const fontSizeOverrideCss = fontOffset !== 0 ? `
        .pdf-font-scaled .text-\\[12px\\] { font-size: ${12 + fontOffset}px !important; }
        .pdf-font-scaled .text-\\[13px\\] { font-size: ${13 + fontOffset}px !important; }
        .pdf-font-scaled .text-\\[14px\\] { font-size: ${14 + fontOffset}px !important; }
        .pdf-font-scaled .text-\\[15px\\] { font-size: ${15 + fontOffset}px !important; }
        .pdf-font-scaled .text-\\[16px\\] { font-size: ${16 + fontOffset}px !important; }
        .pdf-font-scaled .text-\\[11px\\] { font-size: ${11 + fontOffset}px !important; }
    ` : "";

    // SERVICE CONTRACT (Priority 1) — modular term-exhibit system. Renders the
    // verbatim contract body + toggleable/editable term exhibits from the template
    // registry. Legacy SERVICE_AGREEMENT resolves to SERVICE_CONTRACT (see
    // resolveDocumentMode), so this branch also serves any pre-existing SA proposals.
    if (isServiceContract || isServiceAgreement) {
        // Explicit service-contract identity fields (set in ServiceContractTermsPanel)
        // take precedence, then fall back to the derived project values.
        const scPurchaserName = ((details as any)?.serviceContractPurchaserName || "").toString().trim();
        const scVenueName = ((details as any)?.serviceContractVenueName || "").toString().trim();
        const scPurchaserAddress = ((details as any)?.serviceContractPurchaserAddress || "").toString().trim();
        const scAgreementDate = ((details as any)?.serviceContractAgreementDate || "").toString().trim();
        const scTermStart = ((details as any)?.serviceContractTermStart || "").toString().trim();
        const scTermEnd = ((details as any)?.serviceContractTermEnd || "").toString().trim();
        const scSvcDoc = ((details as any)?.servicePricingDocument ?? null) as ServicePricingDocument | null;

        const resolvedPurchaserName = scPurchaserName || (scSvcDoc?.clientName ?? "") || purchaserLegalName;
        // Auto-fill the venue + address from the team when the purchaser is a
        // known team and the user hasn't set them — so a Carolina Panthers
        // contract picks up Bank of America Stadium instead of a template default.
        const teamVenue = matchTeamVenue(resolvedPurchaserName);
        // Venue drives the title + body prose, so it must never be blank. Order:
        // explicit field > derived project value > team lookup > purchaser name.
        const resolvedVenueName = scVenueName || venueLabel || teamVenue?.venue || resolvedPurchaserName;
        const resolvedPurchaserAddress = scPurchaserAddress || purchaserAddress || teamVenue?.address || "";
        // Default the agreement date to today so the contract never renders a
        // stale template date; the panel lets the user override it.
        const resolvedAgreementDate =
            scAgreementDate ||
            new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

        // Term dates: explicit panel fields win, then the recognized workbook's
        // term years — never a stale template default for a different client
        // (the Panthers "June 30, 2026" bug class, Natalia 2026-07-10).
        const resolvedTermStart = scTermStart || (scSvcDoc?.termStartYear ? String(scSvcDoc.termStartYear) : "");
        const resolvedTermEnd = scTermEnd || (scSvcDoc?.termEndYear ? String(scSvcDoc.termEndYear) : "");

        const saConfig: Partial<ServiceAgreementConfig> = {
            purchaserName: resolvedPurchaserName,
            agreementDate: resolvedAgreementDate,
            venueName: resolvedVenueName,
            // Explicit empty override (rather than omit) so an unknown team never
            // falls through to the Ravens template address.
            purchaserAddress: resolvedPurchaserAddress,
            ...(resolvedTermStart ? { termStart: resolvedTermStart } : {}),
            ...(resolvedTermEnd ? { termEnd: resolvedTermEnd } : {}),
        };
        return (
            <ProposalLayout data={data} disableFixedFooter>
                {fontSizeOverrideCss && <style dangerouslySetInnerHTML={{ __html: fontSizeOverrideCss }} />}
                <div className={fontOffset !== 0 ? "pdf-font-scaled" : ""}>
                    <PdfHeader
                        colors={colors}
                        contentPaddingX={contentPaddingX}
                        headerToIntroGap={headerToIntroGap}
                        docLabel={docLabel}
                        proposalName={details?.proposalName || ""}
                        clientName={receiver?.name || "Client Name"}
                        date={headerDate}
                    />
                    <PdfServiceContract colors={colors} config={saConfig} details={details} />
                </div>
            </ProposalLayout>
        );
    }

    // SERVICE PROPOSAL (Natalia 2026-07-14) — the client-facing service offer
    // that precedes a Service Contract (same family; budget → proposal → LOI
    // pattern). Intro prose + mirrored service fee table from the imported
    // service sheet. Identity resolution mirrors the SERVICE_CONTRACT branch:
    // explicit panel fields > recognized workbook prefill > team lookup.
    if (isServiceProposal) {
        const svcDoc = ((details as any)?.servicePricingDocument ?? null) as ServicePricingDocument | null;

        const scPurchaserName = ((details as any)?.serviceContractPurchaserName || "").toString().trim();
        const scVenueName = ((details as any)?.serviceContractVenueName || "").toString().trim();
        const scPurchaserAddress = ((details as any)?.serviceContractPurchaserAddress || "").toString().trim();
        const scTermStart = ((details as any)?.serviceContractTermStart || "").toString().trim();
        const scTermEnd = ((details as any)?.serviceContractTermEnd || "").toString().trim();

        const resolvedPurchaserName = scPurchaserName || svcDoc?.clientName || purchaserLegalName;
        const teamVenue = matchTeamVenue(resolvedPurchaserName);
        const resolvedVenueName = scVenueName || venueLabel || teamVenue?.venue || resolvedPurchaserName;
        // Purchaser office address: explicit > derived project value. The team
        // lookup address is the STADIUM's — never assume it is the purchaser's
        // office; when unknown the intro simply omits the located-at clause.
        const resolvedPurchaserAddress = scPurchaserAddress || purchaserAddress || "";

        return (
            <ProposalLayout data={data} disableFixedFooter>
                {fontSizeOverrideCss && <style dangerouslySetInnerHTML={{ __html: fontSizeOverrideCss }} />}
                <div className={fontOffset !== 0 ? "pdf-font-scaled" : ""}>
                    <PdfHeader
                        colors={colors}
                        contentPaddingX={contentPaddingX}
                        headerToIntroGap={headerToIntroGap}
                        docLabel={docLabel}
                        proposalName={details?.proposalName || ""}
                        clientName={receiver?.name || "Client Name"}
                        date={headerDate}
                    />
                    <PdfServiceProposal
                        colors={colors}
                        details={details}
                        intro={{
                            purchaserName: resolvedPurchaserName,
                            purchaserAddress: resolvedPurchaserAddress,
                            venueName: resolvedVenueName,
                            venueCity: cityStateFromAddress(teamVenue?.address || resolvedPurchaserAddress),
                            teamName: svcDoc?.clientName || (teamVenue ? teamVenue.team : resolvedPurchaserName),
                            league: teamVenue?.league ?? null,
                            termYears: svcDoc?.termYears ?? null,
                            termStart: scTermStart || (svcDoc?.termStartYear ? String(svcDoc.termStartYear) : null),
                            termEnd: scTermEnd || (svcDoc?.termEndYear ? String(svcDoc.termEndYear) : null),
                        }}
                    />
                </div>
            </ProposalLayout>
        );
    }

    return (
        <ProposalLayout data={data} disableFixedFooter>
            {fontSizeOverrideCss && <style dangerouslySetInnerHTML={{ __html: fontSizeOverrideCss }} />}
            <div className={fontOffset !== 0 ? "pdf-font-scaled" : ""}>
            {/* Compact Header — logo + document label, half the original height */}
            <PdfHeader
                colors={colors}
                contentPaddingX={contentPaddingX}
                headerToIntroGap={headerToIntroGap}
                docLabel={docLabel}
                proposalName={details?.proposalName || ""}
                clientName={receiver?.name || "Client Name"}
                date={headerDate}
            />

            {/* Intro - 10pt font */}
            {showIntroText && (
                <div data-preview-section="intro" className="break-inside-avoid" style={{ marginBottom: `${introToBodyGap}px`, paddingLeft: `${contentPaddingX}px`, paddingRight: `${contentPaddingX}px` }}>
                    <div className="text-[14px] leading-snug" style={{ color: colors.textMuted }}>
                        {customIntroText?.trim() ? (
                            <p className="text-justify whitespace-pre-wrap">{customIntroText.trim()}</p>
                        ) : isCO ? (
                            changeOrderIntroText ? (
                                <p className="text-justify whitespace-pre-wrap">{changeOrderIntroText}</p>
                            ) : (
                                <p className="text-justify">
                                    {buildChangeOrderIntroSegments({
                                        changeOrderNumber,
                                        originalAgreementDate: formatShortFormDate(changeOrderOriginalAgreementDate) || changeOrderOriginalAgreementDate,
                                        purchaserLegalName,
                                        purchaserAddress,
                                        projectName: details?.proposalName || (details as any)?.clientName || receiver?.name || "",
                                    }).map((seg, i) =>
                                        seg.bold
                                            ? <strong key={i} style={{ color: colors.text }}>{seg.text}</strong>
                                            : <React.Fragment key={i}>{seg.text}</React.Fragment>
                                    )}
                                </p>
                            )
                        ) : documentMode === "LOI" ? (
                            /* Natalia 2026-07-30: Short Form Agreement opens with her
                               Letter of Intent paragraph. Short Form Contract keeps
                               its own wording in the branch below. */
                            <p className="text-justify">
                                {buildLoiIntroSegments({ purchaserLegalName, purchaserAddress }).map((seg, i) =>
                                    seg.bold
                                        ? <strong key={i} style={{ color: colors.text }}>{seg.text}</strong>
                                        : <React.Fragment key={i}>{seg.text}</React.Fragment>
                                )}
                            </p>
                        ) : isLOI ? (
                            <p className="text-justify">
                                This {shortFormDocumentName} sets forth the terms by which <strong style={{ color: colors.text }}>{purchaserLegalName}</strong> (&quot;Purchaser&quot;){purchaserAddress ? ` located at ${purchaserAddress}` : ""} and <strong style={{ color: colors.text }}>ANC Sports Enterprises, LLC</strong> (&quot;ANC&quot;) located at 2 Manhattanville Road, Suite 402, Purchase, NY 10577 (collectively, the &quot;Parties&quot;) agree that ANC will provide the display system and related services described below for the <strong style={{ color: colors.text }}>{details?.proposalName || (details as any)?.clientName || receiver?.name || "project"}</strong>{venueLabel ? <> at <strong style={{ color: colors.text }}>{venueLabel}</strong></> : null}.
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

            {/* Prompt 58: Custom Proposal Notes — now renders in NotesSection (after pricing, before payment) */}

            {/* ════════════════════════════════════════════════════════════
                CHANGE ORDER MODE — info block → DOW table → totals → payment/sig
               ════════════════════════════════════════════════════════════ */}
            {isCO ? (
                <>
                    <ChangeOrderInfoBlock />
                    {showPricingTables && (
                        <div className="px-6">
                            <SectionHeader title="Description of Work" />
                            <ChangeOrderDescriptionOfWork />
                        </div>
                    )}
                    {showFreeformTables && freeformTables.length > 0 && <FreeformTablesSection />}
                    {showChangeOrderTotals && <ChangeOrderTotalsBlock />}
                    {showNotes && (
                        <div className="px-6">
                            <NotesSection />
                        </div>
                    )}
                    {shouldRenderPaymentTerms && (
                        <div className="px-6">
                            <PaymentTermsSection />
                        </div>
                    )}
                    {shouldRenderSignatureBlock && (
                        <div className="px-6 break-inside-avoid">
                            <SignatureBlock />
                        </div>
                    )}
                    <div className="px-6">
                        <HybridFooter />
                    </div>
                </>
            ) : /* ════════════════════════════════════════════════════════════
                LOI MODE — Natalia's required page structure (Prompt 41)
                Structure A (master table): Intro → Summary → Payment/Sig → Breakdown → Specs
                Structure B (no master):    Intro → Breakdown → Payment/Sig → Specs
               ════════════════════════════════════════════════════════════ */
            isLOI ? (
                masterTableIndex !== null ? (
                    /* ── Structure A: Business/Legal → THE KICK → Technical ── */
                    <>
                        {/* ═══ BUSINESS (Page 1): Pricing Summary + Detail Breakdown ═══ */}
                        {showPricingTables && <MasterTableSummarySection />}
                        {showPricingTables && shouldPushPricingToNewPage && (
                            <>
                                <PageBreak />
                                <ContinuationPageHeader />
                            </>
                        )}
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
                        {showFreeformTables && freeformTables.length > 0 && <FreeformTablesSection />}

                        {/* ═══ LEGAL (Page 2): Notes → Payment Terms → Signatures ═══ */}
                        <PageBreak />
                        <ContinuationPageHeader />
                        {showNotes && (
                            <div className="px-6">
                                <NotesSection />
                            </div>
                        )}
                        {shouldRenderPaymentTerms && (
                            <div className="px-6">
                                <PaymentTermsSection />
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
                                <PdfSpecsTable data={data} showSOW={showScopeOfWork} headingMode="exhibit" />
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
                        {showResponsibilityMatrix && respMatrix && respMatrix.categories.filter(c => c.items?.length > 0).length > 0 && (
                            <>
                                <PageBreak />
                                <ContinuationPageHeader />
                                <RespMatrixSOW />
                            </>
                        )}

                        {/* T&C Exhibit — CONTRACT mode only */}
                        {isContract && tcConfig && (
                            <>
                                <PageBreak />
                                <ContinuationPageHeader />
                                <PdfTermsAndConditions colors={colors} config={tcConfig} />
                            </>
                        )}

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
                        {showFreeformTables && freeformTables.length > 0 && <FreeformTablesSection />}

                        {/* Then: Notes → Payment Terms → Signature Block */}
                        {showNotes && (
                            <div className="px-6">
                                <NotesSection />
                            </div>
                        )}
                        {shouldRenderPaymentTerms && (
                            <div className="px-6">
                                <PaymentTermsSection />
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
                                <PdfSpecsTable data={data} showSOW={showScopeOfWork} headingMode="exhibit" />
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
                        {showResponsibilityMatrix && respMatrix && respMatrix.categories.filter(c => c.items?.length > 0).length > 0 && (
                            <>
                                <PageBreak />
                                <ContinuationPageHeader />
                                <RespMatrixSOW />
                            </>
                        )}

                        {/* T&C Exhibit — CONTRACT mode only */}
                        {isContract && tcConfig && (
                            <>
                                <PageBreak />
                                <ContinuationPageHeader />
                                <PdfTermsAndConditions colors={colors} config={tcConfig} />
                            </>
                        )}

                        <div className="px-6">
                            <HybridFooter />
                        </div>
                    </>
                )
            ) : (
                /* Budget / Proposal order: Header → Intro → Pricing → Grand Total → Notes → Specs → Exhibit A */
                <>
                    {/* Page break before pricing detail if needed */}
                    {showPricingTables && shouldPushPricingToNewPage && <PageBreak />}
                    {showPricingTables && shouldPushPricingToNewPage && <ContinuationPageHeader />}

                    {/* Master table (project grand total) — on TOP before detail tables */}
                    {showPricingTables && masterTableIndex !== null && <MasterTableSummarySection />}

                    {/* Pricing tables (individual display breakdowns) */}
                    {showPricingTables && (
                        <div className="px-6">
                            <PricingSection />
                        </div>
                    )}
                    {showFreeformTables && freeformTables.length > 0 && <FreeformTablesSection />}

                    {showNotes && (
                        <div className="px-6">
                            <NotesSection />
                        </div>
                    )}
                    {(showSpecifications || showExhibitA) && screens.length > 0 && (
                        <>
                            <PageBreak />
                            <ContinuationPageHeader />
                            <PdfSpecsTable data={data} showSOW={showScopeOfWork} headingMode="plain" />
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
                    {showResponsibilityMatrix && respMatrix && respMatrix.categories.filter(c => c.items?.length > 0).length > 0 && (
                        <>
                            <PageBreak />
                            <ContinuationPageHeader />
                            <RespMatrixSOW />
                        </>
                    )}

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

                    {/* T&C Exhibit — CONTRACT mode only */}
                    {isContract && tcConfig && (
                        <>
                            <PageBreak />
                            <ContinuationPageHeader />
                            <PdfTermsAndConditions colors={colors} config={tcConfig} />
                        </>
                    )}

                    <div className="px-6">
                        <HybridFooter />
                    </div>
                </>
            )}
            </div>
        </ProposalLayout>
    );
};

export default ProposalTemplate5;
