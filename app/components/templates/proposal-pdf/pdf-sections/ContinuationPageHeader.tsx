import React from "react";
import type { TemplateColors } from "./types";

interface ContinuationPageHeaderProps {
    colors: TemplateColors;
    purchaserName: string;
    proposalName?: string;
}

const ContinuationPageHeader = ({ colors, purchaserName, proposalName }: ContinuationPageHeaderProps) => {
    const label = proposalName
        ? `${purchaserName} — ${proposalName}`.toUpperCase()
        : purchaserName.toUpperCase();
    return (
        <div
            className="text-center py-1 text-[8px] font-semibold uppercase tracking-widest border-b-2 break-inside-avoid mb-2"
            style={{ borderColor: colors.primary, color: colors.primaryDark, background: 'transparent' }}
        >
            {label}
        </div>
    );
};

export default ContinuationPageHeader;
