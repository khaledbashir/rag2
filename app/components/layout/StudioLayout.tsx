"use client";

import React, { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { FEATURES } from "@/lib/featureFlags";
import { BrandSlashes } from "@/app/components/reusables/BrandGraphics";
import { LayoutDashboard, MessageSquare, Table } from "lucide-react";
import ModeToggle from "@/app/components/reusables/ModeToggle";
import { IntelligenceSidebar } from "@/app/components/proposal/IntelligenceSidebar";

interface StudioLayoutProps {
    /** Header content (Logo | Stepper | Actions) */
    header: React.ReactNode;
    /** Content for the Form */
    formContent: React.ReactNode;
    /** Content for the AI Room */
    aiContent?: React.ReactNode;
    /** Content for the Audit View */
    auditContent?: React.ReactNode;
    /** Hide audit navigation and panel */
    showAudit?: boolean;
    /** Content for the PDF Anchor (right pane) */
    pdfContent: React.ReactNode;
}

export type ViewMode = "form" | "ai" | "audit";

/**
 * StudioLayout - ANC Command Center (V2 - Vertical Navigation)
 */
export function StudioLayout({
    header,
    formContent,
    aiContent,
    auditContent,
    pdfContent,
    showAudit = true,
}: StudioLayoutProps) {
    const [viewMode, setViewMode] = useState<ViewMode>("form");
    const [isHealthSidebarVisible, setIsHealthSidebarVisible] = useState(false);

    // When Intelligence mode is disabled, stay on form if user was on ai
    useEffect(() => {
        if (!FEATURES.INTELLIGENCE_MODE && viewMode === "ai") setViewMode("form");
    }, [viewMode]);

    useEffect(() => {
        if (!showAudit && viewMode === "audit") setViewMode("form");
    }, [showAudit, viewMode]);

    const navItems = [
        { id: "form", icon: LayoutDashboard, label: "Edit Proposal" },
        ...(showAudit ? [{ id: "audit", icon: Table, label: "Pricing Breakdown" }] : []),
    ];

    return (
        <div className="proposal-layout h-screen w-screen overflow-hidden flex flex-col bg-background text-foreground transition-[margin-right] duration-300 ease-out">
            {/* Top Nav - Branding & Wizard Progress */}
            <header className="h-20 shrink-0 border-b border-border bg-background/80 backdrop-blur-md flex flex-col z-50">
                {header}
            </header>

            <div className="flex-1 overflow-hidden flex flex-col">
                {/* View switcher tab bar */}
                <div className="shrink-0 flex items-center gap-1 px-4 py-2 border-b border-border bg-background/80">
                    <ModeToggle
                        mode={viewMode === "ai" ? "ai" : "form"}
                        onChange={(m) => setViewMode(m as ViewMode)}
                        isCollapsed={false}
                        showIntelligence={FEATURES.INTELLIGENCE_MODE}
                    />
                    {navItems.map((item) => {
                        const Icon = item.icon;
                        const isActive = viewMode === item.id;
                        return (
                            <button
                                key={item.id}
                                onClick={() => setViewMode(item.id as ViewMode)}
                                className={cn(
                                    "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                                    isActive
                                        ? "bg-brand-blue text-white shadow-sm"
                                        : "text-muted-foreground hover:text-foreground hover:bg-accent"
                                )}
                            >
                                <Icon className="w-3.5 h-3.5" />
                                {item.label}
                            </button>
                        );
                    })}
                </div>

                {/* THE STUDIO GRID (50/50 Split) */}
                <main className="flex-1 overflow-hidden grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                    {/* THE HUB (Left Pane: 50vw) */}
                    <section className="relative min-w-0 flex flex-col overflow-hidden bg-background/40 border-r border-border anc-slash-bg">
                        {/* Stacked Panels with CSS Visibility Toggle */}
                        <div className="flex-1 flex overflow-hidden">
                            <div className="flex-1 relative overflow-hidden">
                                {/* Drafting Form Panel */}
                                <div
                                    className={cn(
                                        "absolute inset-0 overflow-y-auto custom-scrollbar transition-opacity duration-300",
                                        viewMode === "form" ? "opacity-100 z-10" : "opacity-0 z-0 pointer-events-none"
                                    )}
                                >
                                    <div className="min-h-full animate-in fade-in slide-in-from-left-4 duration-150">
                                        {formContent}
                                    </div>
                                </div>

                                {/* Intelligence Engine Panel (AI Chat) */}
                                <div
                                    className={cn(
                                        "absolute inset-0 overflow-y-auto custom-scrollbar transition-opacity duration-300",
                                        viewMode === "ai" ? "opacity-100 z-10" : "opacity-0 z-0 pointer-events-none"
                                    )}
                                >
                                    <div className="min-h-full animate-in fade-in slide-in-from-left-4 duration-150 p-6">
                                        {aiContent || (
                                            <div className="h-full flex flex-col items-center justify-center text-center p-8 bg-muted/20 rounded-2xl border border-border border-dashed">
                                                <MessageSquare className="w-12 h-12 text-muted-foreground mb-4" />
                                                <h3 className="text-base font-semibold text-foreground">AI Context Initializing</h3>
                                                <p className="text-sm text-muted-foreground mt-2 max-w-xs">Connecting to AnythingLLM Strategic Node...</p>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Financial Audit Panel (Margin Analysis / Pricing Breakdown) */}
                                <div
                                    className={cn(
                                        "absolute inset-0 flex flex-col min-h-0 overflow-hidden transition-opacity duration-300",
                                        viewMode === "audit" ? "opacity-100 z-10" : "opacity-0 z-0 pointer-events-none"
                                    )}
                                >
                                    <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar animate-in fade-in slide-in-from-left-4 duration-150 p-6">
                                        {auditContent || (
                                            <div className="h-full flex flex-col items-center justify-center text-center p-8 bg-muted/20 rounded-2xl border border-border border-dashed">
                                                <Table className="w-12 h-12 text-muted-foreground mb-4" />
                                                <h3 className="text-base font-semibold text-foreground">No Audit Data</h3>
                                                <p className="text-sm text-muted-foreground mt-2 max-w-xs">Finalize your technical specifications to activate the Financial Audit.</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* REQ-26: Project Health Sidebar */}
                            {viewMode === "form" && (
                                <IntelligenceSidebar
                                    isVisible={isHealthSidebarVisible}
                                    onToggle={() => setIsHealthSidebarVisible(!isHealthSidebarVisible)}
                                />
                            )}
                        </div>
                    </section>

                    {/* THE ANCHOR (Right Pane: 50vw) */}
                    <section className="relative min-w-0 bg-muted/30 overflow-hidden flex flex-col">
                        <div className="flex-1 overflow-y-auto p-3 md:p-5 lg:p-8 custom-scrollbar flex items-start justify-center">
                            {/* Brand Signature Slashes in background */}
                            <BrandSlashes
                                className="absolute -top-20 -right-20 pointer-events-none transition-opacity duration-1000"
                                width={600}
                                height={600}
                                opacity={0.05}
                                count={12}
                            />

                            <div className="relative z-10 w-full min-w-0">
                                {pdfContent}
                            </div>
                        </div>

                        {/* Footer Status for PDF */}
                        <div className="h-9 border-t border-border bg-background/80 backdrop-blur-sm flex items-center justify-between px-6 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                            <span className="flex items-center gap-2">
                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                Live Preview Engine
                            </span>
                            <span className="text-muted-foreground/60">ANC IDENTITY PROTECTION ACTIVE</span>
                        </div>
                    </section>
                </main>
            </div>
        </div>
    );
}

export default StudioLayout;
