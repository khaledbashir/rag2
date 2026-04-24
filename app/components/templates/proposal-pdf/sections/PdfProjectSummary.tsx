import React from "react";
import { formatCurrency } from "@/lib/helpers";
import { computeTableTotals, resolveExchangeRate } from "@/lib/pricingMath";
import type { PricingTable } from "@/types/pricing";
import type { PdfColors } from "./shared";

interface SectionHeaderProps {
    title: string;
    subtitle?: string;
    colors: PdfColors;
}

const SectionHeader = ({ title, subtitle, colors }: SectionHeaderProps) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: subtitle ? '4px' : '8px' }}>
        <div style={{ width: '3px', height: '14px', borderRadius: '1px', background: colors.primary, flexShrink: 0 }} />
        <div>
            <span className="text-[14px] font-bold uppercase tracking-wider" style={{ color: colors.primaryDark }}>{title}</span>
            {subtitle && <div className="text-[14px] mt-0.5" style={{ color: colors.textMuted }}>{subtitle}</div>}
        </div>
    </div>
);

// ============================================================================
// LOI Summary Table — shows project grand total before detailed pricing
// ============================================================================

interface LOISummaryTableProps {
    colors: PdfColors;
    currency: "CAD" | "USD" | "GBP" | "EUR";
    exchangeRate?: number;
    total: number;
}

export const LOISummaryTable = ({ colors, currency, exchangeRate, total }: LOISummaryTableProps) => {
    const fx = resolveExchangeRate(exchangeRate);
    const converted = total * fx;
    return (
        <div data-preview-section="pricing" className="px-6 mt-2 break-inside-avoid" style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
            <SectionHeader title="Project Summary" colors={colors} />
            <div className="rounded-lg border overflow-hidden" style={{ borderColor: colors.border }}>
                <div
                    className="grid grid-cols-12 px-4 py-1.5 break-inside-avoid"
                    style={{ borderColor: colors.primary, background: colors.primaryLight }}
                >
                    <div className="col-span-8 font-bold text-[13px] uppercase tracking-wide" style={{ color: colors.primaryDark }}>
                        Project Grand Total
                    </div>
                    <div className="col-span-4 text-right font-bold text-[15px]" style={{ color: colors.primaryDark }}>
                        {formatCurrency(converted, Math.abs(converted) < 0.01 ? "—" : undefined, currency)}
                    </div>
                </div>
            </div>
        </div>
    );
};

// ============================================================================
// Master Table Summary — renders the designated "Project Grand Total" table
// ============================================================================

interface MasterTableSummaryProps {
    colors: PdfColors;
    currency: "CAD" | "USD" | "GBP" | "EUR";
    exchangeRate?: number;
    masterTable: any;
    tableHeaderOverrides: Record<string, string>;
    screenNameMap: Record<string, string>;
    descriptionOverrides: Record<string, string>;
    priceOverrides: Record<string, number>;
    colHeaderLeft: string;
    colHeaderRight: string;
}

export const MasterTableSummary = ({
    colors, currency, exchangeRate, masterTable, tableHeaderOverrides, screenNameMap,
    descriptionOverrides, priceOverrides, colHeaderLeft, colHeaderRight,
}: MasterTableSummaryProps) => {
    if (!masterTable) return null;
    const fx = resolveExchangeRate(exchangeRate);

    const tableName = (masterTable?.name ?? "").toString().trim();
    const tableId = masterTable?.id;
    const override = tableId ? tableHeaderOverrides[tableId] : undefined;
    // Use exact Excel table name (don't let screenNameMap transform it)
    const label = (override ?? tableName ?? "Project Total").toString().trim();

    const rows = (masterTable?.items || masterTable?.rows || []) as any[];
    const masterTotals = computeTableTotals(masterTable as PricingTable, priceOverrides, descriptionOverrides, fx);
    const { subtotal, tax, bond, grandTotal } = masterTotals;

    return (
        <div data-preview-section="pricing" className="px-6 mt-4 break-inside-avoid" style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                <div style={{ width: '3px', height: '12px', borderRadius: '1px', background: colors.primary, flexShrink: 0 }} />
                <span className="text-[14px] font-bold uppercase tracking-wider" style={{ color: colors.primaryDark }}>Project Pricing</span>
            </div>
            <div className="rounded-lg border overflow-hidden" style={{ borderColor: colors.border }}>
                {/* Clean header — text + thin blue underline (no background fill) */}
                <div
                    className="grid grid-cols-12 px-3 py-1 text-[14px] font-semibold uppercase tracking-wider border-b-2 break-inside-avoid"
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
                    const rawPrice = priceOverrides[`${tableId}:${idx}`] !== undefined ? priceOverrides[`${tableId}:${idx}`] : origPrice;
                    const price = rawPrice * fx;
                    const textValue = row?.textValue
                        ? String(row.textValue).toUpperCase()
                        : row?.isIncluded
                            ? "INCLUDED"
                            : row?.isExcluded
                                ? "EXCLUDED"
                                : null;
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
                            <div className="col-span-8 font-bold text-[14px] tracking-wide uppercase" style={{ color: colors.text }}>
                                {desc.toUpperCase()}
                            </div>
                            <div className="col-span-4 text-right font-bold text-[13px] whitespace-nowrap" style={{ color: colors.primaryDark }}>
                                {textValue || formatCurrency(price, Math.abs(price) < 0.01 ? "—" : undefined, currency)}
                            </div>
                        </div>
                    );
                })}

                {/* Subtotal */}
                {rows.length > 0 && Math.abs(subtotal) >= 0.01 && subtotal !== grandTotal && (
                    <div className="grid grid-cols-12 px-3 py-1 border-t break-inside-avoid" style={{ borderColor: colors.border }}>
                        <div className="col-span-8 font-bold text-[14px] uppercase tracking-wide" style={{ color: colors.textMuted }}>Subtotal</div>
                        <div className="col-span-4 text-right font-bold text-[13px]" style={{ color: colors.text }}>
                            {formatCurrency(subtotal, currency)}
                        </div>
                    </div>
                )}

                {/* Tax */}
                {Math.abs(tax) >= 0.01 && (
                    <div className="grid grid-cols-12 px-3 py-1 border-t break-inside-avoid" style={{ borderColor: colors.borderLight }}>
                        <div className="col-span-8 text-[14px] uppercase tracking-wide" style={{ color: colors.textMuted }}>Tax</div>
                        <div className="col-span-4 text-right text-[13px]" style={{ color: colors.text }}>
                            {formatCurrency(tax, currency)}
                        </div>
                    </div>
                )}

                {/* Bond */}
                {Math.abs(bond) >= 0.01 && (
                    <div className="grid grid-cols-12 px-3 py-1 border-t break-inside-avoid" style={{ borderColor: colors.borderLight }}>
                        <div className="col-span-8 text-[14px] uppercase tracking-wide" style={{ color: colors.textMuted }}>Performance Bond</div>
                        <div className="col-span-4 text-right text-[13px]" style={{ color: colors.text }}>
                            {formatCurrency(bond, currency)}
                        </div>
                    </div>
                )}

                {/* Grand Total */}
                <div
                    className="grid grid-cols-12 px-3 py-1 border-t-2 break-inside-avoid"
                    style={{ borderColor: colors.primary, background: colors.primaryLight }}
                >
                    <div className="col-span-8 font-bold text-[14px] uppercase tracking-wide" style={{ color: colors.primaryDark }}>
                        {label.toUpperCase()}{currency === "CAD" ? " (CAD)" : ""}
                    </div>
                    <div className="col-span-4 text-right font-bold text-[13px]" style={{ color: colors.primaryDark }}>
                        {formatCurrency(grandTotal, Math.abs(grandTotal) < 0.01 ? "—" : undefined, currency)}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default MasterTableSummary;
