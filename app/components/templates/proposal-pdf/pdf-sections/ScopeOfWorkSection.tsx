import React from "react";
import type { TemplateColors, TemplateSpacing } from "./types";
import SectionHeader from "./SectionHeader";

interface ScopeOfWorkSectionProps {
    colors: TemplateColors;
    spacing: TemplateSpacing;
    scopeOfWorkText?: string;
}

const ScopeOfWorkSection = ({ colors, spacing, scopeOfWorkText }: ScopeOfWorkSectionProps) => (
    <div className="mt-2">
        <SectionHeader title="Scope of Work" colors={colors} spacing={spacing} />
        <div className="text-[10px] leading-snug whitespace-pre-wrap" style={{ color: colors.text }}>
            {scopeOfWorkText || "No scope of work specified."}
        </div>
    </div>
);

export default ScopeOfWorkSection;
