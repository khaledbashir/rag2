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
import PageBreak from "@/app/components/templates/proposal-pdf/PageBreak";

// Section sub-components
import PdfHeader from "./sections/PdfHeader";
import PdfPricingTables from "./sections/PdfPricingTables";
import PdfSpecsTable from "./sections/PdfSpecsTable";
import PdfResponsibilityMatrix from "./sections/PdfResponsibilityMatrix";
import PdfSignatureBlock from "./sections/PdfSignatureBlock";
import PdfTermsAndConditions from "./sections/PdfTermsAndConditions";
import { MasterTableSummary, LOISummaryTable } from "./sections/PdfProjectSummary";
import type { PdfColors, PdfTemplateSpacing } from "./sections/shared";

// Helpers
import { formatCurrency } from "@/lib/helpers";
import { resolveDocumentMode } from "@/lib/documentMode";
import {
    DOCUMENT_MODES,
} from "@/services/rfp/productCatalog";
import type { DocumentMode as CatalogDocumentMode } from "@/services/rfp/productCatalog";

// Types
import { ProposalType } from "@/types";
import { RespMatrix } from "@/types/pricing";

interface ProposalTemplate5Props extends ProposalType {
    forceWhiteLogo?: boolean;
    screens?: any[];
    isSharedView?: boolean;
}

const DEFAULT_SIGNATURE_BLOCK_TEXT = "This agreement constitutes the entire understanding between the parties and supersedes all prior agreements. Any modifications must be in writing and signed by both parties.";

const ProposalTemplate5 = (data: ProposalTemplate5Props) => {
    const { sender, receiver, details, forceWhiteLogo, screens: screensProp, isSharedView = false } = data;
    const screens = screensProp || details?.screens || [];
    const internalAudit = details?.internalAudit as any;

    const documentMode = resolveDocumentMode(details);
    const catalogMode = documentMode.toLowerCase() as CatalogDocumentMode;
    const docModeConfig = DOCUMENT_MODES[catalogMode] || DOCUMENT_MODES.proposal;
    const docLabel = docModeConfig.headerText;
    const isLOI = documentMode === "LOI" || documentMode === "CONTRACT";
    const isContract = documentMode === "CONTRACT";

    // T&C exhibit config — only renders for CONTRACT mode when toggle is on
    const showTc = (details as any)?.showTermsAndConditions ?? true;
    const tcConfig = (isContract && showTc) ? {
        purchaserName: (details as any)?.purchaserLegalName || receiver?.name || "Purchaser",
        warrantyYears: (details as any)?.tcWarrantyYears ?? 5,
        includeLaborWarranty: (details as any)?.tcIncludeLaborWarranty ?? true,
        includeMaterialsWarranty: (details as any)?.tcIncludeMaterialsWarranty ?? true,
        includeCms: (details as any)?.tcIncludeCms ?? false,
        includeGraphics: (details as any)?.tcIncludeGraphics ?? false,
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
    const showIntroText = (details as any)?.showIntroText ?? true;
    const showCompanyFooter = (details as any)?.showCompanyFooter ?? true;
    const generatedSchedule = (details as any)?.generatedSchedule;
    const generatedScheduleTasks = Array.isArray(generatedSchedule?.tasks) ? generatedSchedule.tasks : [];
    const hasGeneratedSchedule = !mirrorMode && generatedScheduleTasks.length > 0;
    const showExhibitA = (details as any)?.showExhibitA ?? false;
    const showResponsibilityMatrix = (details as any)?.showResponsibilityMatrix ?? true;
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

    // Payment Terms Section
    const PaymentTermsSection = () => {
        // FR-4.3: Use custom payment terms if provided, otherwise use default
        const defaultTerms = "50% on Deposit\n40% on Mobilization\n10% on Substantial Completion";
        const raw = (customPaymentTerms?.trim() || defaultTerms).toString();
        const lines = raw.split(/\r?\n|,/g).map((l: string) => l.trim()).filter(Boolean);
        if (lines.length === 0) return null;
        return (
            <div data-preview-section="payment-terms" className="mt-2">
                <SectionHeader title="Payment Terms" />
                <div className="rounded-lg p-3 text-[14px] leading-snug" style={{ background: colors.surface, color: colors.textMuted }}>
                    {lines.map((line: string, idx: number) => <div key={idx}>{line}</div>)}
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
                <div className="rounded-lg p-3 text-[14px] leading-snug whitespace-pre-wrap" style={{ background: colors.surface, color: colors.text }}>
                    {notesText}
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
    const ContinuationPageHeader = () => (
        <div className="pb-2 mb-4 border-b-2" style={{ borderColor: colors.primary }}>
            <div className="text-[14px] font-semibold" style={{ color: colors.textMuted }}>
                {purchaserName} • {details?.proposalName || "Proposal"}
            </div>
        </div>
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
                        ) : isLOI ? (
                            <p className="text-justify">
                                This Sales Quotation will set forth the terms by which <strong style={{ color: colors.text }}>{purchaserLegalName}</strong> (&quot;Purchaser&quot;){purchaserAddress ? ` located at ${purchaserAddress}` : ""} and <strong style={{ color: colors.text }}>ANC Sports Enterprises, LLC</strong> (&quot;ANC&quot;) located at 2 Manhattanville Road, Suite 402, Purchase, NY 10577 (collectively, the &quot;Parties&quot;) agree that ANC will provide following LED Display and services (the &quot;Display System&quot;) described below for the <strong style={{ color: colors.text }}>{details?.proposalName || (details as any)?.clientName || receiver?.name || "project"}</strong>.
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
                LOI MODE — Natalia's required page structure (Prompt 41)
                Structure A (master table): Intro → Summary → Payment/Sig → Breakdown → Specs
                Structure B (no master):    Intro → Breakdown → Payment/Sig → Specs
               ════════════════════════════════════════════════════════════ */}
            {isLOI ? (
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
