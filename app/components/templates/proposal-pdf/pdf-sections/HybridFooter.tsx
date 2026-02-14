import React from "react";
import type { TemplateColors } from "./types";

interface HybridFooterProps {
    colors: TemplateColors;
}

const HybridFooter = ({ colors }: HybridFooterProps) => (
    <div className="mt-4 pt-2 border-t break-inside-avoid" style={{ borderColor: colors.border }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="text-[9px] font-semibold tracking-wide" style={{ color: colors.primary }}>
                www.anc.com
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {[...Array(3)].map((_, i) => (
                    <div
                        key={i}
                        style={{ width: '3px', height: '12px', borderRadius: '1px', background: colors.primary, opacity: 0.4, transform: 'skewX(-12deg)' }}
                    />
                ))}
            </div>
        </div>
    </div>
);

export default HybridFooter;
