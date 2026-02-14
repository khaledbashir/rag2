import React from "react";
import type { TemplateColors, TemplateSpacing } from "./types";

interface SectionHeaderProps {
    title: string;
    subtitle?: string;
    colors: TemplateColors;
    spacing: TemplateSpacing;
}

const SectionHeader = ({ title, subtitle, colors, spacing }: SectionHeaderProps) => (
    <div className="break-inside-avoid" style={{ breakAfter: 'avoid', marginTop: `${Math.max(6, spacing.sectionSpacing - 4)}px`, marginBottom: `${Math.max(8, spacing.sectionSpacing - 2)}px` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: '3px', height: '12px', borderRadius: '1px', background: colors.primary, flexShrink: 0 }} />
            <h2 className="text-[10px] font-semibold tracking-wider uppercase"
                style={{ color: colors.primaryDark, margin: 0 }}
            >
                {title}
            </h2>
        </div>
        {subtitle && <p className="text-[8px] mt-0.5" style={{ color: colors.textMuted, marginLeft: '9px' }}>{subtitle}</p>}
    </div>
);

export default SectionHeader;
