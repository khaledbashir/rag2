import React from "react";
import type { TemplateColors } from "./types";
import SectionHeader from "./SectionHeader";
import type { TemplateSpacing } from "./types";

interface PaymentTermsSectionProps {
    colors: TemplateColors;
    spacing: TemplateSpacing;
    customPaymentTerms?: string;
}

const PaymentTermsSection = ({ colors, spacing, customPaymentTerms }: PaymentTermsSectionProps) => {
    const defaultTerms = "50% on Deposit\n40% on Mobilization\n10% on Substantial Completion";
    const raw = (customPaymentTerms?.trim() || defaultTerms).toString();
    const lines = raw.split(/\r?\n|,/g).map((l: string) => l.trim()).filter(Boolean);
    if (lines.length === 0) return null;
    return (
        <div data-preview-section="payment-terms" className="mt-2">
            <SectionHeader title="Payment Terms" colors={colors} spacing={spacing} />
            <div className="rounded-lg p-3 text-[10px] leading-snug" style={{ background: colors.surface, color: colors.textMuted }}>
                {lines.map((line: string, idx: number) => <div key={idx}>{line}</div>)}
            </div>
        </div>
    );
};

export default PaymentTermsSection;
