"use client";

import React, { useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { useWizard } from "react-use-wizard";
import { Share2, Loader2, CheckCircle2, FileSpreadsheet, Save, ChevronDown, FileText, Receipt, FileSignature, ExternalLink, Shield, FileEdit, FileCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import LogoSelector from "@/app/components/reusables/LogoSelector";
import SaveIndicator from "@/app/components/reusables/SaveIndicator";
import WizardStepper from "@/app/components/proposal/form/wizard/WizardProgress";
import TemplateSelector from "@/app/components/proposal/form/TemplateSelector";
import { useProposalContext } from "@/contexts/ProposalContext";
import { ProposalType } from "@/types";
import { cn } from "@/lib/utils";
import { analyzeGaps, calculateCompletionRate } from "@/lib/gap-analysis";
import { toast } from "@/components/ui/use-toast";
import type { AutoSaveStatus } from "@/lib/useAutoSave";
import { ThemeToggle } from "@/app/components/ThemeToggle";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";

interface StudioHeaderProps {
    saveStatus: AutoSaveStatus;
    initialData?: any;
    excelImportLoading: boolean;
    onImportExcel: (file: File) => void;
    onExportPdf: () => void;
    /** When "new", show "Create project first" banner and Save Draft (creates project). */
    projectId?: string;
    /** When set, render a "View in CRM" deep-link pill that opens the matching Twenty Opportunity. */
    twentyOpportunityId?: string;
}

export function StudioHeader({
    saveStatus,
    initialData,
    excelImportLoading,
    onImportExcel,
    onExportPdf,
    projectId,
    twentyOpportunityId,
}: StudioHeaderProps) {
    const wizard = useWizard();
    const { control, getValues } = useFormContext<ProposalType>();
    const { excelValidationOk, exportAudit, saveDraft, headerType, setHeaderType } = useProposalContext();
    const [savingDraft, setSavingDraft] = useState(false);
    const isNewProject = !projectId || projectId === "new";

    // Watch form values for real-time gap analysis
    const formValues = useWatch({ control });

    // Check for Empty/Reset State to ensure correct completion rate
    const isDefaultClient = !formValues?.receiver?.name || formValues?.receiver?.name === "Client Name";
    const isNoScreens = (formValues?.details?.screens || []).length === 0;
    const isNoProjectName = !formValues?.details?.proposalName;
    const isEmptyState = isDefaultClient && isNoScreens && isNoProjectName;

    const gaps = analyzeGaps(formValues);
    // If empty state, force 0% completion instead of 100% (since gaps is empty array)
    const completionRate = isEmptyState ? 0 : calculateCompletionRate(gaps.length, gaps);

    const handleShare = async () => {
        const projectId = getValues("details.proposalId");
        if (!projectId || projectId === "new") {
            toast({
                title: "Save Project First",
                description: "You must save the project before generating a share link.",
                variant: "destructive"
            });
            return;
        }

        try {
            const response = await fetch(`/api/projects/${projectId}/share`, {
                method: "POST"
            });
            const data = await response.json();

            if (data.shareUrl) {
                await navigator.clipboard.writeText(data.shareUrl);
                toast({
                    title: "Share Link Copied",
                    description: "The professional 'Ferrari-grade' link is now in your clipboard.",
                });
            }
        } catch (e) {
            toast({
                title: "Share Failed",
                description: "Could not generate share link. Please try again.",
                variant: "destructive"
            });
        }
    };

    const handleSaveDraft = async () => {
        setSavingDraft(true);
        try {
            const result = await saveDraft();
            if (result.created && result.projectId) {
                toast({ title: "Project created", description: "Redirecting to your saved project…" });
                // Context already does router.push
            } else if (result.error) {
                toast({ title: "Save failed", description: result.error, variant: "destructive" });
            } else {
                // REQ-UserFeedback: Explicit success feedback for updates
                toast({ title: "Draft saved!", description: "Your changes have been saved." });
            }
        } finally {
            setSavingDraft(false);
        }
    };

    return (
        <div className="flex-1 w-full flex items-center justify-between px-6 md:px-8 gap-4 bg-background border-b border-border transition-colors duration-300">
            {/* Logo & Health Score */}
            <div className="flex items-center shrink-0 gap-4 flex-1">
                <LogoSelector width={110} height={40} className="p-0" />

                <div className="hidden md:block h-8 w-px bg-border mx-1" />

                <div className="hidden md:flex items-center gap-2">
                    {completionRate > 0 && (
                    <span
                        className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-[10px] font-bold text-primary uppercase tracking-widest border border-primary/20 shadow-[0_0_15px_rgba(10,82,239,0.05)]"
                        title="Percentage of required proposal fields filled (from Excel or form)"
                    >
                        <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                        {Math.round(completionRate)}% filled
                    </span>
                    )}
                    {excelValidationOk && (
                        <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide">
                            <CheckCircle2 className="w-3 h-3" />
                            Excel Verified
                        </span>
                    )}
                    {twentyOpportunityId && (
                        <a
                            href={`https://crm.ancsports.net/object/opportunity/${twentyOpportunityId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-md bg-[#0A52EF]/10 px-2.5 py-1 text-[10px] font-semibold text-[#0A52EF] dark:text-[#7FA8FF] uppercase tracking-wide hover:bg-[#0A52EF]/20 transition-colors"
                            title="Open this proposal's opportunity in Twenty CRM"
                        >
                            <ExternalLink className="w-3 h-3" />
                            View in CRM
                        </a>
                    )}
                </div>
            </div>

            {/* Wizard Stepper (center-aligned) */}
            <div className="flex-1 flex justify-center max-w-xl hidden lg:flex">
                <WizardStepper wizard={wizard} />
            </div>

            {/* Right Actions - Global Controls */}
            <div className="flex items-center gap-2 shrink-0 flex-1 justify-end">
                <ThemeToggle />

                {/* Template Selector */}
                <TemplateSelector />

                {/* Document Mode Dropdown: Clean dropdown instead of big buttons */}
                <Popover>
                    <PopoverTrigger asChild>
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-8 px-3 gap-2 border-border/50 hover:bg-muted/50"
                        >
                            {headerType === "BUDGET" && (
                                <>
                                    <FileText className="w-3.5 h-3.5 text-amber-500" />
                                    <span className="text-xs font-medium">Budget</span>
                                </>
                            )}
                            {headerType === "PROPOSAL" && (
                                <>
                                    <Receipt className="w-3.5 h-3.5 text-[#0A52EF]" />
                                    <span className="text-xs font-medium">Proposal</span>
                                </>
                            )}
                            {headerType === "LOI" && (
                                <>
                                    <FileSignature className="w-3.5 h-3.5 text-emerald-500" />
                                    <span className="text-xs font-medium">Short Form</span>
                                </>
                            )}
                            {headerType === "CONTRACT" && (
                                <>
                                    <Shield className="w-3.5 h-3.5 text-indigo-500" />
                                    <span className="text-xs font-medium">Contract</span>
                                </>
                            )}
                            {headerType === "CHANGE_ORDER" && (
                                <>
                                    <FileEdit className="w-3.5 h-3.5 text-rose-500" />
                                    <span className="text-xs font-medium">Change Order</span>
                                </>
                            )}
                            {headerType === "SERVICE_CONTRACT" && (
                                <>
                                    <FileCheck className="w-3.5 h-3.5 text-teal-600" />
                                    <span className="text-xs font-medium">Service Contract</span>
                                </>
                            )}
                            {headerType === "SERVICE_PROPOSAL" && (
                                <>
                                    <FileCheck className="w-3.5 h-3.5 text-cyan-600" />
                                    <span className="text-xs font-medium">Service Proposal</span>
                                </>
                            )}
                            <ChevronDown className="w-3 h-3 text-muted-foreground" />
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-56 p-2">
                        <button
                            onClick={() => setHeaderType("BUDGET")}
                            className={cn(
                                "w-full flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors",
                                headerType === "BUDGET" ? "bg-amber-500/10" : "hover:bg-muted/50"
                            )}
                        >
                            <FileText className="w-4 h-4 text-amber-500" />
                            <div className="flex-1 text-left">
                                <div className="font-semibold text-sm">Budget</div>
                                <div className="text-xs text-muted-foreground">Estimate only</div>
                            </div>
                            {headerType === "BUDGET" && (
                                <div className="w-2 h-2 rounded-full bg-amber-500" />
                            )}
                        </button>
                        <button
                            onClick={() => setHeaderType("PROPOSAL")}
                            className={cn(
                                "w-full flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors",
                                headerType === "PROPOSAL" ? "bg-blue-500/10" : "hover:bg-muted/50"
                            )}
                        >
                            <Receipt className="w-4 h-4 text-[#0A52EF]" />
                            <div className="flex-1 text-left">
                                <div className="font-semibold text-sm">Proposal</div>
                                <div className="text-xs text-muted-foreground">Formal quote</div>
                            </div>
                            {headerType === "PROPOSAL" && (
                                <div className="w-2 h-2 rounded-full bg-[#0A52EF]" />
                            )}
                        </button>
                        <button
                            onClick={() => setHeaderType("LOI")}
                            className={cn(
                                "w-full flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors",
                                headerType === "LOI" ? "bg-emerald-500/10" : "hover:bg-muted/50"
                            )}
                        >
                            <FileSignature className="w-4 h-4 text-emerald-500" />
                            <div className="flex-1 text-left">
                                <div className="font-semibold text-sm">Short Form</div>
                                <div className="text-xs text-muted-foreground">Agreement</div>
                            </div>
                            {headerType === "LOI" && (
                                <div className="w-2 h-2 rounded-full bg-emerald-500" />
                            )}
                        </button>
                        <button
                            onClick={() => setHeaderType("CONTRACT")}
                            className={cn(
                                "w-full flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors",
                                headerType === "CONTRACT" ? "bg-indigo-500/10" : "hover:bg-muted/50"
                            )}
                        >
                            <Shield className="w-4 h-4 text-indigo-500" />
                            <div className="flex-1 text-left">
                                <div className="font-semibold text-sm">Contract</div>
                                <div className="text-xs text-muted-foreground">Short form with terms</div>
                            </div>
                            {headerType === "CONTRACT" && (
                                <div className="w-2 h-2 rounded-full bg-indigo-500" />
                            )}
                        </button>
                        <button
                            onClick={() => setHeaderType("CHANGE_ORDER")}
                            className={cn(
                                "w-full flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors",
                                headerType === "CHANGE_ORDER" ? "bg-rose-500/10" : "hover:bg-muted/50"
                            )}
                        >
                            <FileEdit className="w-4 h-4 text-rose-500" />
                            <div className="flex-1 text-left">
                                <div className="font-semibold text-sm">Change Order</div>
                                <div className="text-xs text-muted-foreground">Amend existing contract</div>
                            </div>
                            {headerType === "CHANGE_ORDER" && (
                                <div className="w-2 h-2 rounded-full bg-rose-500" />
                            )}
                        </button>
                        <button
                            onClick={() => setHeaderType("SERVICE_PROPOSAL")}
                            className={cn(
                                "w-full flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors",
                                headerType === "SERVICE_PROPOSAL" ? "bg-cyan-500/10" : "hover:bg-muted/50"
                            )}
                        >
                            <FileCheck className="w-4 h-4 text-cyan-600" />
                            <div className="flex-1 text-left">
                                <div className="font-semibold text-sm">Service Proposal</div>
                                <div className="text-xs text-muted-foreground">Service offer — precedes the contract</div>
                            </div>
                            {headerType === "SERVICE_PROPOSAL" && (
                                <div className="w-2 h-2 rounded-full bg-cyan-600" />
                            )}
                        </button>
                        <button
                            onClick={() => setHeaderType("SERVICE_CONTRACT")}
                            className={cn(
                                "w-full flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors",
                                headerType === "SERVICE_CONTRACT" ? "bg-teal-500/10" : "hover:bg-muted/50"
                            )}
                        >
                            <FileCheck className="w-4 h-4 text-teal-600" />
                            <div className="flex-1 text-left">
                                <div className="font-semibold text-sm">Service Contract</div>
                                <div className="text-xs text-muted-foreground">Maintenance / service agreement</div>
                            </div>
                            {headerType === "SERVICE_CONTRACT" && (
                                <div className="w-2 h-2 rounded-full bg-teal-600" />
                            )}
                        </button>
                    </PopoverContent>
                </Popover>

                <SaveIndicator
                    status={saveStatus}
                    lastSavedAt={initialData?.lastSavedAt ? new Date(initialData.lastSavedAt) : undefined}
                />

                {/* Save Draft - Smaller button */}
                {isNewProject ? (
                    <Button
                        size="sm"
                        onClick={handleSaveDraft}
                        disabled={savingDraft}
                        className="h-8 px-3 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-medium"
                    >
                        {savingDraft ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
                        <span className="hidden sm:inline">Save</span>
                    </Button>
                ) : (
                    <Button
                        size="sm"
                        variant="outline"
                        className="h-8 px-3 text-xs font-medium"
                        onClick={handleSaveDraft}
                        disabled={savingDraft}
                    >
                        {savingDraft ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    </Button>
                )}

                {/* Share & Audit - Compact dropdown menu */}
                <Popover>
                    <PopoverTrigger asChild>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2 text-muted-foreground hover:text-foreground"
                        >
                            <Share2 className="w-4 h-4" />
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-48 p-2">
                        <button
                            onClick={handleShare}
                            className="w-full flex items-center gap-2 p-2 rounded-lg cursor-pointer hover:bg-muted/50 transition-colors text-left"
                        >
                            <Share2 className="w-4 h-4 text-primary" />
                            <span className="text-sm">Share Link</span>
                        </button>
                        <button
                            onClick={exportAudit}
                            className="w-full flex items-center gap-2 p-2 rounded-lg cursor-pointer hover:bg-muted/50 transition-colors text-left"
                        >
                            <FileSpreadsheet className="w-4 h-4 text-emerald-500" />
                            <span className="text-sm">Export Audit</span>
                        </button>
                    </PopoverContent>
                </Popover>
            </div>
        </div>
    );
}
