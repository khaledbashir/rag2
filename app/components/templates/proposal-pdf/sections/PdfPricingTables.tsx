import React from "react";
import { formatCurrency, sanitizeNitsForDisplay, stripDensityAndHDRFromSpecText, formatNumberWithCommas, normalizePitch } from "@/lib/helpers";
import { computeTableTotals } from "@/lib/pricingMath";
import type { PricingTable } from "@/types/pricing";
import type { PdfColors, PdfTemplateSpacing } from "./shared";

interface PdfPricingTablesProps {
    colors: PdfColors;
    spacing: PdfTemplateSpacing;
    currency: "CAD" | "USD" | "GBP" | "EUR";
    isLandscape: boolean;
    isSharedView: boolean;
    mirrorMode: boolean;
    masterTableIndex: number | null;
    pricingDocument: any;
    details: any;
    screens: any[];
    internalAudit: any;
    descriptionOverrides: Record<string, string>;
    priceOverrides: Record<string, number>;
    screenNameMap: Record<string, string>;
    colHeaderLeft: string;
    colHeaderRight: string;
}

// ============================================================================
// HELPERS (moved from parent — used only by PricingSection)
// ============================================================================

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

const formatPitchMm = (value: any): string => {
    const corrected = normalizePitch(value);
    if (!Number.isFinite(corrected) || corrected <= 0) return "";
    return corrected < 2 ? corrected.toFixed(2) : corrected.toFixed(corrected % 1 === 0 ? 0 : 2);
};

const buildDescription = (screen: any) => {
    const heightFt = screen?.heightFt ?? screen?.height;
    const widthFt = screen?.widthFt ?? screen?.width;
    const pitchMm = screen?.pitchMm ?? screen?.pixelPitch;
    const brightness = screen?.brightnessNits ?? screen?.brightness;
    const parts: string[] = [];
    if (heightFt && widthFt && Number.isFinite(Number(heightFt)) && Number(heightFt) > 0 && Number.isFinite(Number(widthFt)) && Number(widthFt) > 0) {
        parts.push(`${Number(heightFt).toFixed(1)}' × ${Number(widthFt).toFixed(1)}'`);
    }
    const formattedPitch = formatPitchMm(pitchMm);
    if (formattedPitch) parts.push(`${formattedPitch}mm pitch`);
    if (brightness && Number(brightness) > 0) parts.push(`${formatNumberWithCommas(brightness)} Brightness`);
    return parts.join(" · ");
};

const stripQtyFromDescription = (text: string): string => {
    if (!text) return "";
    return text
        .replace(/\s*\(QTY\s*\d+\)/gi, "")
        .replace(/\s*QTY\s*\d+\s*$/gi, "")
        .replace(/\s+-\s*QTY\s*\d+/gi, "")
        .trim();
};

// ============================================================================
// COMPONENT
// ============================================================================

const PdfPricingTables = ({
    colors, spacing, currency, isLandscape, isSharedView, mirrorMode,
    masterTableIndex, pricingDocument, details, screens, internalAudit,
    descriptionOverrides, priceOverrides, screenNameMap, colHeaderLeft, colHeaderRight,
}: PdfPricingTablesProps) => {
    const { pricingTableGap, tableRowHeight, rowPaddingY } = spacing;
    const softCostItems = internalAudit?.softCostItems || [];
    const pricingTables = (pricingDocument?.tables || []) as any[];
    const tableHeaderOverrides = ((details as any)?.tableHeaderOverrides || {}) as Record<string, string>;
    const showHiddenRows = (details as any)?.showHiddenRows === true;

    // Mirror Mode: render each table with full item detail
    if (pricingTables.length > 0) {
        const detailTables = pricingTables
            .map((table: any, origIdx: number) => ({ table, origIdx }))
            .filter(({ origIdx }) => origIdx !== masterTableIndex);

        // Render a single detail table card (reused in both portrait and landscape)
        const renderDetailTable = ({ table, origIdx }: { table: any; origIdx: number }) => {
            const tableName = (table?.name ?? "").toString().trim();
            const tableId = table?.id;
            const override = tableId ? tableHeaderOverrides[tableId] : undefined;
            // In Mirror Mode, use the exact Excel table name (screenNameMap can transform it incorrectly).
            // screenNameMap is only useful in Intelligence Mode where screens have custom display names.
            const resolvedName = mirrorMode ? tableName : (screenNameMap[tableName] || tableName);
            const label = (override || resolvedName || "Section").toString().replace(/[\u00A0\u200B\u200C\u200D\uFEFF]/g, ' ').trim();
            const items = (table?.items || []) as any[];
            // Fix 5: Only include alternates that have actual content (non-empty description AND non-zero price)
            const alternates = ((table?.alternates || []) as any[]).filter((alt: any) => {
                const desc = (alt?.description || "").toString().trim();
                const price = Number(alt?.priceDifference ?? alt?.price ?? 0);
                // Also filter out hidden alternates
                if (!showHiddenRows && alt?.isHidden) return false;
                return desc.length > 0 && Math.abs(price) >= 0.01;
            });
            // Centralized round-then-sum via pricingMath.ts
            const detailTotals = computeTableTotals(table as PricingTable, priceOverrides, descriptionOverrides);
            const { subtotal, taxLabel, tax: taxAmount, bond, grandTotal } = detailTotals;

            // Skip entire table if ALL items + alternates are hidden
            if (!showHiddenRows) {
                const visibleItems = items.filter((item: any) => {
                    if (item.isHidden) return false;
                    const itemPrice = detailTotals.items.find((ri: any) => ri.originalIndex === items.indexOf(item));
                    return !!itemPrice;
                });
                if (visibleItems.length === 0 && alternates.length === 0) return null;
            }

            return (
                <div data-preview-section="pricing" key={tableId || `table-${origIdx}`} className="break-inside-avoid" style={{ pageBreakInside: 'avoid', breakInside: 'avoid', marginTop: `${pricingTableGap}px` }}>
                    <div className="rounded-lg border overflow-hidden" style={{ borderColor: colors.border }}>
                        {/* Table header — text + thin blue underline */}
                        <div
                            className="grid grid-cols-12 px-3 py-1 text-[14px] font-semibold uppercase tracking-wider border-b-2 break-inside-avoid"
                            style={{ borderColor: colors.primary, color: colors.primaryDark, background: 'transparent', breakAfter: 'avoid', pageBreakAfter: 'avoid' }}
                        >
                            <div className="col-span-8">{label.toUpperCase()}</div>
                            <div className="col-span-4 text-right">PRICING{currency !== "USD" ? ` (${currency})` : ""}</div>
                        </div>

                        {/* Line items — pre-filtered by computeTableTotals, but render using original items for zebra striping */}
                        {items.map((item: any, idx: number) => {
                            const itemPrice = detailTotals.items.find(ri => ri.originalIndex === idx);
                            if (!itemPrice) return null; // filtered out by computeTableTotals ($0 items)
                            if (item.isHidden && !showHiddenRows) return null; // respect Excel hidden rows
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
                                    <div className="col-span-8 pr-2 text-[14px]" style={{ color: colors.text }}>
                                        {itemPrice.description}
                                    </div>
                                    <div className="col-span-4 text-right font-semibold text-[14px] whitespace-nowrap" style={{ color: colors.primaryDark }}>
                                        {itemPrice.textValue
                                            ? <span style={{ color: colors.text }}>{itemPrice.textValue.toUpperCase()}</span>
                                            : itemPrice.isIncluded
                                            ? <span style={{ color: colors.text }}>INCLUDED</span>
                                            : formatCurrency(itemPrice.price, currency)}
                                    </div>
                                </div>
                            );
                        })}

                        {/* Footer: Subtotal / Tax / Bond / Grand Total */}
                        <div className="border-t-2" style={{ borderColor: colors.border }}>
                            {Math.abs(subtotal) >= 0.01 && subtotal !== grandTotal && (
                                <div className="grid grid-cols-12 px-3 py-1 text-[14px] font-bold" style={{ color: colors.text }}>
                                    <div className="col-span-8">SUBTOTAL</div>
                                    <div className="col-span-4 text-right">{formatCurrency(subtotal, currency)}</div>
                                </div>
                            )}
                            {/* Show tax row when subtotal is visible — even $0 — for uniformity */}
                            {(Math.abs(taxAmount) >= 0.01 || (Math.abs(subtotal) >= 0.01 && subtotal !== grandTotal)) && (
                                <div className="grid grid-cols-12 px-3 py-1 text-[14px]" style={{ color: colors.textMuted }}>
                                    <div className="col-span-8">{taxLabel || "Tax"}</div>
                                    <div className="col-span-4 text-right">{formatCurrency(taxAmount, currency)}</div>
                                </div>
                            )}
                            {Math.abs(bond) >= 0.01 && (
                                <div className="grid grid-cols-12 px-3 py-1 text-[14px]" style={{ color: colors.textMuted }}>
                                    <div className="col-span-8">BOND</div>
                                    <div className="col-span-4 text-right">{formatCurrency(bond, currency)}</div>
                                </div>
                            )}
                            <div
                                className="grid grid-cols-12 px-3 py-1.5 border-t break-inside-avoid"
                                style={{ borderColor: colors.primary, background: colors.primaryLight }}
                            >
                                <div className="col-span-8 font-bold text-[14px] uppercase tracking-wide" style={{ color: colors.primaryDark }}>GRAND TOTAL</div>
                                <div className="col-span-4 text-right font-bold text-[13px]" style={{ color: colors.primaryDark }}>{formatCurrency(grandTotal, currency)}</div>
                            </div>
                        </div>
                    </div>

                    {/* Alternates — separate table AFTER grand total (mirrors Excel structure) */}
                    {alternates.length > 0 && (
                        <div className="mt-2 rounded-lg border overflow-hidden break-inside-avoid" style={{ borderColor: colors.border, pageBreakInside: 'avoid', breakInside: 'avoid' }}>
                            <div
                                className="grid grid-cols-12 px-3 py-1 text-[14px] font-semibold uppercase tracking-wider border-b-2 break-inside-avoid"
                                style={{ borderColor: colors.primary, color: colors.primaryDark, background: 'transparent' }}
                            >
                                <div className="col-span-8">ALTERNATES — ADD TO COST ABOVE</div>
                                <div className="col-span-4 text-right">PRICING{currency !== "USD" ? ` (${currency})` : ""}</div>
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
                                    <div className="col-span-8 pr-2 text-[14px]" style={{ color: colors.text }}>
                                        {(alt?.description || "Alternate").toString()}
                                    </div>
                                    <div className="col-span-4 text-right font-semibold text-[14px] whitespace-nowrap" style={{ color: colors.primaryDark }}>
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

                {/* Document total: only when a master table IS selected (rendered via MasterTableSummary).
                   When user picks "None (no master table)", no aggregated total — mirrors Excel exactly. */}
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
                    className="grid grid-cols-12 px-3 py-1 text-[14px] font-semibold uppercase tracking-wider border-b-2 break-inside-avoid"
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
                            <div className="font-bold text-[14px] tracking-wide uppercase leading-tight" style={{ color: colors.text }}>
                                {item.name}
                            </div>
                            {/* Line 2: Specs - allow wrapping, compact */}
                            {item.description && (
                                <div className="text-[14px] leading-tight" style={{ color: colors.textMuted }}>
                                    {item.description}
                                </div>
                            )}
                        </div>
                        <div className="col-span-4 text-right font-bold text-[13px] whitespace-nowrap" style={{ color: colors.primaryDark }}>
                            {formatCurrency(item.price, Math.abs(Number(item.price)) < 0.01 ? "—" : undefined, currency)}
                        </div>
                    </div>
                ))}

                {/* PROJECT TOTAL = sum of primary items only (alternates excluded) */}
                <div
                    className="grid grid-cols-12 px-3 py-1.5 border-t-2 break-inside-avoid"
                    style={{ borderColor: colors.border, background: colors.white }}
                >
                    <div className="col-span-8 font-bold text-[14px] uppercase tracking-wide" style={{ color: colors.text }}>
                        Project Total{currency === "CAD" ? " (CAD)" : ""}
                    </div>
                    <div className="col-span-4 text-right font-bold text-[13px]" style={{ color: colors.text }}>
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
                            <div className="col-span-12 text-[14px] font-bold uppercase tracking-widest" style={{ color: colors.textMuted }}>
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
                                    <div className="text-[14px] tracking-wide uppercase italic" style={{ color: colors.textMuted }}>
                                        {item.name}
                                    </div>
                                    {item.description && (
                                        <div className="text-[14px] leading-none italic" style={{ color: colors.textMuted }}>
                                            {item.description}
                                        </div>
                                    )}
                                </div>
                                <div className="col-span-4 text-right text-[13px] whitespace-nowrap italic" style={{ color: colors.textMuted }}>
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

export default PdfPricingTables;
