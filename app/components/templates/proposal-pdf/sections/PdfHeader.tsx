import React from "react";
import LogoSelectorServer from "@/app/components/reusables/LogoSelectorServer";
import type { PdfColors } from "./shared";

interface PdfHeaderProps {
    colors: PdfColors;
    contentPaddingX: number;
    headerToIntroGap: number;
    docLabel: string;
    proposalName: string;
    clientName: string;
    date?: string;
}

const PdfHeader = ({ colors, contentPaddingX, headerToIntroGap, docLabel, proposalName, clientName, date }: PdfHeaderProps) => (
    <div data-preview-section="header" className="flex justify-between items-center pt-2 pb-1 border-b break-inside-avoid" style={{ borderColor: colors.border, background: 'transparent', marginBottom: `${headerToIntroGap}px`, paddingLeft: `${contentPaddingX}px`, paddingRight: `${contentPaddingX}px` }}>
        <LogoSelectorServer theme="light" width={84} height={42} className="p-0" />
        <div className="text-right break-inside-avoid" style={{ background: 'transparent' }}>
            <div className="text-[12px] uppercase tracking-widest font-semibold" style={{ color: colors.primary, background: 'transparent' }}>{docLabel}</div>
            <h1 className="text-[16px] font-bold mt-0.5" style={{ color: colors.text, background: 'transparent' }}>{proposalName || clientName || "Client Name"}</h1>
            {date && <div className="text-[12px] mt-0.5" style={{ color: colors.textMuted, background: 'transparent' }}>{date}</div>}
        </div>
    </div>
);

export default PdfHeader;
