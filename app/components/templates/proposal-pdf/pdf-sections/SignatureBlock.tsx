import React from "react";
import type { TemplateColors } from "./types";

interface SignatureBlockProps {
    colors: TemplateColors;
    receiverName?: string;
    signatureBlockText?: string;
}

const DEFAULT_SIGNATURE_BLOCK_TEXT =
    "Please sign below to indicate Purchaser's agreement to purchase the Display System as described herein and to authorize ANC to commence production. If, for any reason, Purchaser terminates this Agreement prior to the completion of the work, ANC will immediately cease all work and Purchaser will pay ANC for any work performed, work in progress, and materials purchased, if any. This document will be considered binding on both parties; however, it will be followed by a formal agreement containing standard contract language, including terms of liability, indemnification, and warranty. Payment is due within thirty (30) days of ANC's invoice(s).";

const SignatureBlock = ({ colors, receiverName, signatureBlockText }: SignatureBlockProps) => (
    <div data-preview-section="signature" className="mt-4 break-inside-avoid" style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
        <div className="text-[10px] leading-snug text-justify mb-3 break-inside-avoid" style={{ color: colors.textMuted }}>
            {(signatureBlockText || "").trim() || DEFAULT_SIGNATURE_BLOCK_TEXT}
        </div>
        <h4 className="font-bold text-[10px] uppercase mb-3 border-b-2 pb-0.5 break-inside-avoid" style={{ borderColor: colors.text, color: colors.text }}>
            Agreed To And Accepted:
        </h4>
        <div className="grid grid-cols-2 gap-4 break-inside-avoid">
            {[
                { title: "ANC Sports Enterprises, LLC", subtitle: "Seller" },
                { title: receiverName || "Purchaser", subtitle: "Purchaser" }
            ].map((party, idx) => (
                <div key={idx} className="space-y-2 break-inside-avoid">
                    <div className="break-inside-avoid">
                        <div className="font-bold text-[10px]" style={{ color: colors.primary }}>{party.title}</div>
                        <div className="text-[9px]" style={{ color: colors.textMuted }}>{party.subtitle}</div>
                    </div>
                    <div className="break-inside-avoid">
                        <div className="text-[9px] uppercase tracking-wide mb-0.5" style={{ color: colors.textMuted }}>Signature</div>
                        <div className="h-6 border-b-2" style={{ borderColor: colors.border }} />
                    </div>
                    <div className="grid grid-cols-2 gap-3 break-inside-avoid">
                        <div className="break-inside-avoid">
                            <div className="text-[9px] uppercase tracking-wide mb-0.5" style={{ color: colors.textMuted }}>Name</div>
                            <div className="h-5 border-b" style={{ borderColor: colors.border }} />
                        </div>
                        <div className="break-inside-avoid">
                            <div className="text-[9px] uppercase tracking-wide mb-0.5" style={{ color: colors.textMuted }}>Date</div>
                            <div className="h-5 border-b" style={{ borderColor: colors.border }} />
                        </div>
                    </div>
                </div>
            ))}
        </div>
    </div>
);

export default SignatureBlock;
