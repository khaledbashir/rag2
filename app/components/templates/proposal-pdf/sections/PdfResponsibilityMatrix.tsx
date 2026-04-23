import React from "react";
import type { RespMatrix, RespMatrixCategory } from "@/types/pricing";
import type { PdfColors } from "./shared";

interface SectionHeaderProps {
    title: string;
    colors: PdfColors;
}

const SectionHeader = ({ title, colors }: SectionHeaderProps) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
        <div style={{ width: '3px', height: '14px', borderRadius: '1px', background: colors.primary, flexShrink: 0 }} />
        <div>
            <span className="text-[14px] font-bold uppercase tracking-wider" style={{ color: colors.primaryDark }}>{title}</span>
        </div>
    </div>
);

interface PdfResponsibilityMatrixProps {
    colors: PdfColors;
    respMatrix: RespMatrix | null;
}

const PdfResponsibilityMatrix = ({ colors, respMatrix }: PdfResponsibilityMatrixProps) => {
    if (!respMatrix || !respMatrix.categories || respMatrix.categories.length === 0) return null;
    // Filter out categories with no actual items to prevent empty page generation
    const nonEmptyCategories = respMatrix.categories.filter(cat => cat.items && cat.items.length > 0);
    if (nonEmptyCategories.length === 0) return null;

    const isIncludeStatement = (anc: string) => {
        const upper = anc.toUpperCase().trim();
        return upper === "INCLUDE STATEMENT" || upper === "INCLUDED STATEMENT";
    };
    const isXMark = (val: string) => val.trim().toUpperCase().startsWith("X");

    const categorizeSection = (cat: RespMatrixCategory): "table" | "paragraph" => {
        const xItems = cat.items.filter(i => isXMark(i.anc) || isXMark(i.purchaser));
        const includeItems = cat.items.filter(i => isIncludeStatement(i.anc));
        return xItems.length >= includeItems.length ? "table" : "paragraph";
    };

    return (
        <div data-preview-section="exhibit-a" className="px-6">
            <SectionHeader title="Exhibit B — Statement of Work" colors={colors} />
            <table className="w-full text-[12px] border-collapse" style={{ borderColor: colors.border, border: `1px solid ${colors.border}`, pageBreakInside: 'auto', fontFamily: "Arial, Helvetica, sans-serif" }}>
                <colgroup>
                    <col style={{ width: "66%" }} />
                    <col style={{ width: "17%" }} />
                    <col style={{ width: "17%" }} />
                </colgroup>
                <tbody>
                    {nonEmptyCategories.map((cat, catIdx) => {
                        const sectionType = respMatrix.format === "short"
                            ? "paragraph"
                            : respMatrix.format === "long"
                                ? "table"
                                : categorizeSection(cat);

                        return (
                            <React.Fragment key={catIdx}>
                                {/* Category header row */}
                                <tr style={{ borderBottom: `2px solid ${colors.primary}`, pageBreakInside: 'avoid', breakInside: 'avoid' }}>
                                    <td
                                        colSpan={sectionType === "table" ? 1 : 3}
                                        className="text-[13px] font-semibold uppercase tracking-wider"
                                        style={{ padding: '4px 16px', color: colors.primaryDark, background: 'transparent' }}
                                    >
                                        {cat.name}
                                    </td>
                                    {sectionType === "table" && (
                                        <>
                                            <td className="text-[13px] font-semibold uppercase tracking-wider text-center" style={{ padding: '4px 8px', color: colors.primaryDark }}>ANC</td>
                                            <td className="text-[13px] font-semibold uppercase tracking-wider text-center" style={{ padding: '4px 8px', color: colors.primaryDark }}>PURCHASER</td>
                                        </>
                                    )}
                                </tr>
                                {/* Items */}
                                {sectionType === "table" ? (
                                    cat.items.map((item, idx) => (
                                        <tr
                                            key={idx}
                                            style={{
                                                borderBottom: `1px solid ${colors.borderLight}`,
                                                background: idx % 2 === 1 ? colors.surface : colors.white,
                                            }}
                                        >
                                            <td className="leading-snug" style={{ padding: '2px 12px', color: colors.text }}>
                                                <div style={{ orphans: 3, widows: 3 }}>{item.description}</div>
                                            </td>
                                            <td className="text-center font-medium" style={{ padding: '2px 8px', color: colors.text }}>
                                                {item.anc && !isIncludeStatement(item.anc) && item.anc.toUpperCase() !== "NA" ? item.anc : ""}
                                            </td>
                                            <td className="text-center font-medium" style={{ padding: '2px 8px', color: colors.text }}>
                                                {item.purchaser && item.purchaser.toUpperCase() !== "EDITABLE" ? item.purchaser : ""}
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    cat.items.filter(item => isIncludeStatement(item.anc)).map((item, idx) => (
                                        <tr
                                            key={idx}
                                            style={{
                                                borderBottom: `1px solid ${colors.borderLight}`,
                                                background: idx % 2 === 1 ? colors.surface : colors.white,
                                                pageBreakInside: 'auto',
                                                breakInside: 'auto',
                                            }}
                                        >
                                            <td colSpan={3} className="leading-snug" style={{ padding: '2px 12px', color: colors.text }}>
                                                <div style={{ orphans: 3, widows: 3 }}>{item.description}</div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </React.Fragment>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
};

export default PdfResponsibilityMatrix;
