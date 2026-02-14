import React from "react";
import type { TemplateColors, TemplateSpacing } from "./types";
import SectionHeader from "./SectionHeader";
import type { RespMatrix, RespMatrixCategory } from "@/types/pricing";

interface RespMatrixSOWProps {
    colors: TemplateColors;
    spacing: TemplateSpacing;
    respMatrix: RespMatrix | null;
}

const RespMatrixSOW = ({ colors, spacing, respMatrix }: RespMatrixSOWProps) => {
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
        <div data-preview-section="exhibit-a" className="px-6" style={{ pageBreakBefore: 'always', breakBefore: 'page' }}>
            <SectionHeader title="Exhibit B — Statement of Work" colors={colors} spacing={spacing} />
            <div className="border rounded overflow-hidden break-inside-avoid" style={{ borderColor: colors.border, pageBreakInside: 'avoid', breakInside: 'avoid' }}>
                {nonEmptyCategories.map((cat, catIdx) => {
                    const sectionType = respMatrix.format === "short"
                        ? "paragraph"
                        : respMatrix.format === "long"
                            ? "table"
                            : categorizeSection(cat);

                    return (
                        <div key={catIdx}>
                            {/* Category header — text + thin blue underline */}
                            <div
                                className="grid grid-cols-12 px-4 py-1 text-[9px] font-semibold uppercase tracking-wider border-b-2 break-inside-avoid"
                                style={{ borderColor: colors.primary, color: colors.primaryDark, background: 'transparent' }}
                            >
                                <div className={sectionType === "table" ? "col-span-8" : "col-span-12"}>{cat.name}</div>
                                {sectionType === "table" && (
                                    <>
                                        <div className="col-span-2 text-center">ANC</div>
                                        <div className="col-span-2 text-center">PURCHASER</div>
                                    </>
                                )}
                            </div>
                            {/* Items */}
                            {sectionType === "table" ? (
                                cat.items.map((item, idx) => (
                                    <div
                                        key={idx}
                                        className="grid grid-cols-12 px-3 py-0.5 text-[8px] border-b items-start"
                                        style={{ borderColor: colors.borderLight, background: idx % 2 === 1 ? colors.surface : colors.white }}
                                    >
                                        <div className="col-span-8 leading-snug pr-2" style={{ color: colors.text }}>{item.description}</div>
                                        <div className="col-span-2 text-center font-medium" style={{ color: colors.text }}>
                                            {item.anc && !isIncludeStatement(item.anc) && item.anc.toUpperCase() !== "NA" ? item.anc : ""}
                                        </div>
                                        <div className="col-span-2 text-center font-medium" style={{ color: colors.text }}>
                                            {item.purchaser && item.purchaser.toUpperCase() !== "EDITABLE" ? item.purchaser : ""}
                                        </div>
                                    </div>
                                ))
                            ) : (
                                cat.items.filter(item => isIncludeStatement(item.anc)).map((item, idx) => (
                                    <div
                                        key={idx}
                                        className="px-3 py-0.5 text-[8px] leading-snug border-b"
                                        style={{ borderColor: colors.borderLight, color: colors.text, background: idx % 2 === 1 ? colors.surface : colors.white }}
                                    >
                                        {item.description}
                                    </div>
                                ))
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default RespMatrixSOW;
