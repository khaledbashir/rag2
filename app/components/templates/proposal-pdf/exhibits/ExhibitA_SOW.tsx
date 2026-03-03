import React from "react";
import { formatNumberWithCommas } from "@/lib/helpers";
import { generateSOWContent, SOWOptions } from "@/lib/sowTemplate";
import { RiskAwareSOWGenerator } from "@/services/sow/sowGenerator";
import { ProposalType } from "@/types";

interface ExhibitAProps {
    data: ProposalType;
}

const ExhibitA_SOW = ({ data }: ExhibitAProps) => {
    const { details, receiver } = data;
    const screens = details?.screens || [];

    const loc = (details?.location || "").toLowerCase();
    const name = (details?.proposalName || "").toLowerCase();
    const isMorgantown = loc.includes("morgantown") || loc.includes("wvu") || loc.includes("puskar") ||
        name.includes("morgantown") || name.includes("wvu") || name.includes("puskar");

    // Build RFP text for AI risk scanning
    const rfpText = `
        ${details?.venue || ""} ${details?.location || ""} ${details?.proposalName || ""}
        ${details?.additionalNotes || ""}
        ${screens.map((s: any) => `${s.name || ""} ${s.environment || ""} ${s.serviceType || ""}`).join(" ")}
    `.toLowerCase();

    // Scan for AI-detected risks
    const riskScan = RiskAwareSOWGenerator.scanForRiskKeywords(rfpText);

    // Generate AI-enhanced SOW content
    const projectContext = {
        venue: details?.venue || "Project Site",
        clientName: details?.location || "Client",
        displayCount: screens.length
    };
    
    const aiGeneratedSOW = RiskAwareSOWGenerator.generateRiskAwareSOW(rfpText, projectContext);

    // Traditional SOW options (fallback/enhancement)
    const sowOptions: SOWOptions = {
        documentType: (details as any).documentType || "BUDGET",
        isOutdoor: screens.some((s: any) => s.isOutdoor || s.environment === "OUTDOOR") || riskScan.hasOutdoorRequirement,
        includeUnionLabor: (details as any).includeUnionLabor || (details as any).isUnionLabor || riskScan.hasUnionRequirement,
        includeSpareParts: (details as any).includeSpareParts,
        atticStockMentioned: (details as any).atticStockMentioned || (details?.additionalNotes || "").toLowerCase().includes("attic stock"),
        isMorgantown,
        structuralTonnage: (details as any).structuralTonnage || (details as any).metadata?.structuralTonnage,
        signalSupport: (details as any).signalSupport || (details as any).metadata?.signalSupport,
        rossCarbonite: (details as any).rossCarbonite || (details as any).metadata?.rossCarbonite,
        vdcpSupport: (details as any).vdcpSupport || (details as any).metadata?.vdcpSupport,
        projectSpecificNotes: details?.additionalNotes,
        clientName: receiver?.name,
        projectLocation: details?.location
    };

    const sowSections = generateSOWContent(sowOptions);

    // Group sections by category for WVU compliance
    const designSections = sowSections.filter(s => s.category === "DESIGN");
    const constructionSections = sowSections.filter(s => s.category === "CONSTRUCTION");
    const constraintSections = sowSections.filter(s => s.category === "CONSTRAINTS");
    const otherSections = sowSections.filter(s => !s.category || s.category === "OTHER");

    // AI-generated sections take precedence if available
    const hasAIGeneratedContent = aiGeneratedSOW.designServices || aiGeneratedSOW.constructionLogistics;

    return (
        <div className="pt-4">
            <div className="text-center mb-4">
                <h2 className="text-sm font-bold text-[#0A52EF] uppercase tracking-wider">Exhibit B</h2>
                <h3 className="text-[13px] font-semibold text-[#002C73] uppercase tracking-widest">Statement of Work</h3>
            </div>

            {/* AI-Generated Risk Detection Banner */}
            {(riskScan.hasUnionRequirement || riskScan.hasOutdoorRequirement || riskScan.hasLiquidatedDamages) && (
                <div className="mb-8 p-4 bg-[#0A52EF]/5 border border-[#0A52EF]/20 rounded-xl">
                    <h4 className="text-[12px] font-bold text-[#0A52EF] uppercase tracking-wider mb-2">
                        AI-Detected RFP Requirements
                    </h4>
                    <div className="flex flex-wrap gap-2">
                        {riskScan.hasUnionRequirement && (
                            <span className="inline-flex items-center px-2 py-1 rounded text-[12px] font-medium bg-amber-100 text-amber-800">
                                ⚡ Union Labor Required
                            </span>
                        )}
                        {riskScan.hasOutdoorRequirement && (
                            <span className="inline-flex items-center px-2 py-1 rounded text-[12px] font-medium bg-[#0A52EF]/10 text-[#0A52EF]">
                                🌤️ Outdoor/IP65 Rated
                            </span>
                        )}
                        {riskScan.hasLiquidatedDamages && (
                            <span className="inline-flex items-center px-2 py-1 rounded text-[12px] font-medium bg-red-100 text-red-800">
                                ⏰ Liquidated Damages Apply
                            </span>
                        )}
                    </div>
                </div>
            )}

            {/* NOTE: Technical Specifications are rendered in the main SPECIFICATIONS section */}
            {/* This exhibit focuses on Scope of Work details */}

            {/* 1. DESIGN SERVICES - AI-Enhanced */}
            {(designSections.length > 0 || hasAIGeneratedContent) && (
                <div className="mb-6">
                    <h4 className="text-[12px] font-semibold bg-transparent text-[#002C73] py-1 px-0 mb-4 uppercase tracking-wider border-b-2 border-[#0A52EF]">1. Design & Engineering Services</h4>
                    <div className="space-y-6 px-2">
                        {/* AI-Generated Design Services */}
                        {aiGeneratedSOW.designServices && (
                            <div>
                                <h5 className="text-[12px] font-bold text-[#0A52EF] border-b border-gray-100 pb-1 mb-2 uppercase tracking-wider flex items-center gap-2">
                                    Design Services
                                    <span className="text-[10px] px-1.5 py-0.5 bg-[#0A52EF]/10 text-[#0A52EF] rounded">AI-Generated</span>
                                </h5>
                                <p className="text-[13px] leading-relaxed text-gray-700 whitespace-pre-wrap text-justify">{aiGeneratedSOW.designServices}</p>
                            </div>
                        )}
                        
                        {/* Traditional Design Sections */}
                        {designSections.map((section, idx) => (
                            <div key={idx}>
                                <h5 className="text-[12px] font-bold text-[#0A52EF] border-b border-gray-100 pb-1 mb-2 uppercase tracking-wider">{section.title}</h5>
                                <p className="text-[13px] leading-relaxed text-gray-700 whitespace-pre-wrap text-justify">{section.content}</p>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* 2. CONSTRUCTION SERVICES - AI-Enhanced */}
            {(constructionSections.length > 0 || hasAIGeneratedContent) && (
                <div className="mb-6">
                    <h4 className="text-[12px] font-semibold bg-transparent text-[#002C73] py-1 px-0 mb-4 uppercase tracking-wider border-b-2 border-[#0A52EF]">2. Construction & Technical Logistics</h4>
                    <div className="space-y-6 px-2">
                        {/* AI-Generated Construction Logistics */}
                        {aiGeneratedSOW.constructionLogistics && (
                            <div>
                                <h5 className="text-[12px] font-bold text-[#0A52EF] border-b border-gray-100 pb-1 mb-2 uppercase tracking-wider flex items-center gap-2">
                                    Construction Logistics
                                    <span className="text-[10px] px-1.5 py-0.5 bg-[#0A52EF]/10 text-[#0A52EF] rounded">AI-Generated</span>
                                </h5>
                                <p className="text-[13px] leading-relaxed text-gray-700 whitespace-pre-wrap text-justify">{aiGeneratedSOW.constructionLogistics}</p>
                            </div>
                        )}
                        
                        {/* Traditional Construction Sections */}
                        {constructionSections.map((section, idx) => (
                            <div key={idx}>
                                <h5 className="text-[12px] font-bold text-[#0A52EF] border-b border-gray-100 pb-1 mb-2 uppercase tracking-wider">{section.title}</h5>
                                <p className="text-[13px] leading-relaxed text-gray-700 whitespace-pre-wrap text-justify">{section.content}</p>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* 3. PROJECT CONSTRAINTS - AI-Enhanced */}
            {(constraintSections.length > 0 || aiGeneratedSOW.constraints) && (
                <div className="mb-6">
                    <h4 className="text-[12px] font-semibold bg-transparent text-[#002C73] py-1 px-0 mb-4 uppercase tracking-wider border-b-2 border-[#0A52EF]">3. Project Constraints & Compliance</h4>

                    {/* Venue Specific Dates (REQ-47) - Integrated into Constraints */}
                    {(details?.venue === "Milan Puskar Stadium" || details?.venue === "WVU Coliseum") && (
                        <div className="mb-6 p-4 bg-gray-50 border border-gray-200 rounded-xl break-inside-avoid">
                            <h5 className="text-[12px] font-bold text-gray-900 uppercase mb-3 border-b border-gray-300 pb-1">Site Logistics & Liquidated Damages</h5>
                            <div className="grid grid-cols-2 gap-4 text-[12px]">
                                <div>
                                    <span className="font-bold text-gray-500 uppercase">Substantial Completion:</span>
                                    <p className="text-brand-blue font-bold">
                                        {details?.venue === 'Milan Puskar Stadium' ? 'July 30, 2020' : 'August 28, 2020'}
                                    </p>
                                </div>
                                <div>
                                    <span className="font-bold text-gray-500 uppercase">Liquidated Damages:</span>
                                    <p className="text-red-600 font-bold">
                                        {details?.venue === 'Milan Puskar Stadium' ? '$2,500 per day' : '$5,000 per day'}
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="space-y-6 px-2">
                        {/* AI-Generated Constraints */}
                        {aiGeneratedSOW.constraints && (
                            <div>
                                <h5 className="text-[12px] font-bold text-[#0A52EF] border-b border-gray-100 pb-1 mb-2 uppercase tracking-wider flex items-center gap-2">
                                    Project Constraints
                                    <span className="text-[10px] px-1.5 py-0.5 bg-[#0A52EF]/10 text-[#0A52EF] rounded">AI-Generated</span>
                                </h5>
                                <p className="text-[13px] leading-relaxed text-gray-700 whitespace-pre-wrap text-justify">{aiGeneratedSOW.constraints}</p>
                            </div>
                        )}

                        {constraintSections.map((section, idx) => (
                            <div key={idx}>
                                <h5 className="text-[12px] font-bold text-[#0A52EF] border-b border-gray-100 pb-1 mb-2 uppercase tracking-wider">{section.title}</h5>
                                <p className="text-[13px] leading-relaxed text-gray-700 whitespace-pre-wrap text-justify">{section.content}</p>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* OTHER / GENERAL */}
            {
                otherSections.length > 0 && (
                    <div className="mb-6">
                        <div className="space-y-6 px-2">
                            {otherSections.map((section, idx) => (
                                <div key={idx}>
                                    <h5 className="text-[13px] font-bold text-gray-900 border-b border-gray-100 pb-1 mb-2 uppercase tracking-wider">{section.title}</h5>
                                    <p className="text-[13px] leading-relaxed text-gray-700 whitespace-pre-wrap text-justify">{section.content}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                )
            }
        </div >
    );
};

export default ExhibitA_SOW;
