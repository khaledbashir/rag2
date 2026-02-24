"use client";

import { useFieldArray, useFormContext, useWatch } from "react-hook-form";
import {
    Upload,
    FileSpreadsheet,
    Sparkles,
    Shield,
    Zap,
    CheckCircle2,
    AlertTriangle,
    FileText,
    FileSearch,
    Settings2,
    RefreshCw,
    Plus,
    ArrowLeftRight,
    PenTool,
    ExternalLink,
} from "lucide-react";
import { useProposalContext } from "@/contexts/ProposalContext";
import { FEATURES } from "@/lib/featureFlags";
import { useState, useEffect } from "react";
import { useWizard } from "react-use-wizard";
import ExcelGridViewer from "@/app/components/ExcelGridViewer";
import ScreensGridEditor from "@/app/components/proposal/form/ScreensGridEditor";
import ActivityLog from "@/app/components/proposal/ActivityLog";
import BriefMePanel from "@/app/components/proposal/intelligence/BriefMePanel";
import { AiWand, FormInput } from "@/app/components";
import AgentSearchAnimation, { type AgentSearchPhase } from "@/app/components/reusables/AgentSearchAnimation";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ModeSelector, { type WorkflowMode } from "@/app/components/proposal/form/wizard/ModeSelector";
import RfpIngestion from "@/app/components/proposal/form/wizard/RfpIngestion";
import { isModeUnselected, isMirrorMode as checkMirrorMode } from "@/lib/modeDetection";

const Step1Ingestion = () => {
    const {
        importANCExcel,
        excelImportLoading,
        excelPreview,
        excelPreviewLoading,
        excelValidationOk,
        excelDiagnostics,
        uploadRfpDocument,
        rfpDocuments,
        deleteRfpDocument,
        aiWorkspaceSlug,
    } = useProposalContext();

    const { getValues, watch, control, setValue } = useFormContext();
    const { nextStep } = useWizard();
    const { fields: screenFields, append: appendScreen } = useFieldArray({
        control,
        name: "details.screens",
    });
    const proposalId = watch("details.proposalId");
    const [address, city, zipCode] = watch(["receiver.address", "receiver.city", "receiver.zipCode"]);
    const [rfpUploading, setRfpUploading] = useState(false);
    const [showDetails, setShowDetails] = useState(!excelPreview);
    const [searchPhase, setSearchPhase] = useState<AgentSearchPhase>("idle");
    const [briefPanelOpen, setBriefPanelOpen] = useState(false);
    const [hasBrief, setHasBrief] = useState(false);
    const addressFieldsEmpty = !address?.toString().trim() && !city?.toString().trim() && !zipCode?.toString().trim();

    // Mode detection
    const details = useWatch({ name: "details", control });
    const modeUnselected = isModeUnselected(details);
    const mirrorMode = checkMirrorMode(details);
    const [modeJustSelected, setModeJustSelected] = useState(false);
    const [rfpMode, setRfpMode] = useState(false);

    const handleModeSelect = (_mirror: boolean, _mode?: WorkflowMode) => {
        setModeJustSelected(true);
    };

    const handleSwitchMode = () => {
        const newMode = !mirrorMode;
        setValue("details.mirrorMode", newMode, { shouldDirty: true });
        setValue("details.calculationMode", newMode ? "MIRROR" : "INTELLIGENCE", { shouldDirty: true });
    };

    // Auto-collapse details when Excel is loaded ONLY if required fields are filled
    useEffect(() => {
        if (excelPreview) {
            const { details, receiver } = getValues();
            const hasRequiredFields = details?.proposalName && receiver?.name;
            if (hasRequiredFields) {
                setShowDetails(false);
            } else {
                setShowDetails(true);
            }
        }
    }, [excelPreview, getValues]);

    // Mode gate: show selector for new projects with no mode chosen
    if (modeUnselected && !modeJustSelected && !excelPreview) {
        return <ModeSelector onSelect={handleModeSelect} />;
    }

    // RFP mode: full-screen extraction flow (replaces the normal form)
    if (rfpMode) {
        return <RfpIngestion onComplete={() => setRfpMode(false)} />;
    }

    return (
        <div className="h-full flex flex-col bg-background/20">
            {/* Minimalist Header / Toolbar */}
            <div className="shrink-0 border-b border-border bg-background/80 backdrop-blur-md px-6 py-4 flex items-center justify-between">
                <div>
                    <h1 className="text-lg font-semibold text-foreground tracking-tight flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-brand-blue shadow-[0_0_8px_rgba(59,130,246,0.5)]"></span>
                        {mirrorMode ? "Import" : "Setup"}
                    </h1>
                    {mirrorMode && !excelPreview && (
                        <p className="text-muted-foreground text-xs mt-0.5">
                            Drop your Excel here or upload to get started
                        </p>
                    )}
                    {!mirrorMode && (
                        <p className="text-muted-foreground text-xs mt-0.5">
                            Add screens and configure your project
                        </p>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setShowDetails(!showDetails)}
                        className={cn(
                            "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border",
                            showDetails
                                ? "bg-muted text-foreground border-border"
                                : "bg-transparent text-muted-foreground border-transparent hover:bg-muted/50",
                        )}
                    >
                        <Settings2 className="w-3.5 h-3.5" />
                        {showDetails ? "Hide Details" : "Project Details"}
                    </button>

                    {excelPreview && (
                        <button
                            onClick={() => setBriefPanelOpen(true)}
                            className={cn(
                                "relative flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold text-white cursor-pointer transition-all",
                                "bg-gradient-to-r from-blue-500 to-indigo-500",
                                "shadow-md hover:shadow-lg hover:brightness-110",
                                !hasBrief && "shadow-[0_0_14px_rgba(99,102,241,0.45)]",
                            )}
                        >
                            <Sparkles className={cn("w-4 h-4", !hasBrief && "animate-pulse")} />
                            <span>Brief Me</span>
                            {hasBrief && (
                                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-background shadow-[0_0_6px_rgba(52,211,153,0.5)]" />
                            )}
                        </button>
                    )}

                    {excelPreview && (
                        <label className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-brand-blue/10 text-brand-blue border border-brand-blue/20 text-xs font-medium cursor-pointer hover:bg-brand-blue/20 transition-all">
                            <RefreshCw
                                className={cn(
                                    "w-3.5 h-3.5",
                                    excelImportLoading && "animate-spin",
                                )}
                            />
                            <span>Replace Excel</span>
                            <input
                                type="file"
                                className="hidden"
                                accept=".xlsx, .xls"
                                onChange={async (e) => {
                                    const file = e.target.files?.[0];
                                    if (file) await importANCExcel(file);
                                }}
                            />
                        </label>
                    )}

                    {/* Mode Switch */}
                    <button
                        type="button"
                        onClick={handleSwitchMode}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground border border-transparent hover:border-border hover:bg-muted/50 transition-all"
                    >
                        <ArrowLeftRight className="w-3.5 h-3.5" />
                        {mirrorMode ? "Switch to Build from Scratch" : "Switch to Upload Excel"}
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-hidden flex flex-col">
                <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
                    {/* Collapsible Project Details */}
                    {showDetails && (
                        <div className="animate-in slide-in-from-top-2 duration-300">
                            <AgentSearchAnimation phase={searchPhase} className="p-5 bg-muted/30">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                    <FormInput
                                        vertical
                                        name="details.proposalName"
                                        label="Project Name"
                                        placeholder="e.g., WVU Athletics LED Upgrade"
                                        className="bg-background border-input focus:border-brand-blue/50 transition-colors"
                                    />
                                    <FormInput
                                        vertical
                                        name="receiver.name"
                                        label="Client Name"
                                        placeholder="e.g., WVU Athletics"
                                        className="bg-background border-input focus:border-brand-blue/50 transition-colors"
                                        rightElement={
                                            <AiWand
                                                fieldName="receiver.name"
                                                targetFields={[
                                                    "receiver.address",
                                                    "receiver.city",
                                                    "receiver.zipCode",
                                                    "details.venue",
                                                ]}
                                                proposalId={proposalId}
                                                onSearchStateChange={setSearchPhase}
                                                showIdlePulse={addressFieldsEmpty}
                                            />
                                        }
                                    />
                                    <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-4 gap-4">
                                        <div className="md:col-span-2">
                                            <FormInput
                                                vertical
                                                name="receiver.address"
                                                label="Address"
                                                placeholder="Street address"
                                                className="bg-background border-input"
                                            />
                                        </div>
                                        <FormInput
                                            vertical
                                            name="receiver.city"
                                            label="City"
                                            placeholder="City"
                                            className="bg-background border-input"
                                        />
                                        <FormInput
                                            vertical
                                            name="receiver.zipCode"
                                            label="Zip"
                                            placeholder="Zip code"
                                            className="bg-background border-input"
                                        />
                                    </div>
                                </div>
                            </AgentSearchAnimation>
                        </div>
                    )}

                    {/* Main Content Area — Mode Conditional */}
                    {mirrorMode ? (
                        /* ═══ MIRROR MODE ═══ */
                        !excelPreview ? (
                            /* Mirror: Empty State — Excel Upload */
                            <div className="flex items-center justify-center min-h-[500px] w-full">
                                <div className="w-full max-w-lg">
                                    <div className="group relative rounded-2xl border border-border bg-card hover:bg-muted/50 hover:border-brand-blue/30 transition-all duration-300 flex flex-col items-center justify-center text-center p-8 cursor-pointer border-dashed min-h-[420px]">
                                        <input
                                            type="file"
                                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                            accept=".xlsx, .xls"
                                            onChange={async (e) => {
                                                const file = e.target.files?.[0];
                                                if (file) await importANCExcel(file);
                                            }}
                                        />
                                        <div className="w-16 h-16 rounded-2xl bg-brand-blue/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300 shadow-[0_0_30px_rgba(59,130,246,0.1)]">
                                            <FileSpreadsheet className="w-8 h-8 text-brand-blue" />
                                        </div>
                                        <h3 className="text-xl font-bold text-foreground mb-2">
                                            Upload Excel Estimate
                                        </h3>
                                        <p className="text-muted-foreground text-sm max-w-xs">
                                            Drag and drop your standard .xlsx file here to generate a branded PDF.
                                        </p>
                                        {excelImportLoading && (
                                            <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-20 rounded-2xl">
                                                <div className="flex flex-col items-center gap-3">
                                                    <Zap className="w-6 h-6 text-brand-blue animate-pulse" />
                                                    <span className="text-brand-blue font-medium text-sm">Processing Excel...</span>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ) : (
                            /* Mirror: Preview Mode — Excel + History tabs (NO Screen Editor) */
                            <div className="flex flex-col h-full space-y-4">
                                <div className="flex items-center justify-between px-1">
                                    <div className="flex flex-col gap-2">
                                        <div className="flex items-center gap-4">
                                            <div
                                                className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-full border ${excelDiagnostics?.totalOk ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : excelDiagnostics?.errors?.length ? "bg-red-500/10 border-red-500/20 text-red-400" : excelValidationOk ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : "bg-amber-500/10 border-amber-500/20 text-amber-400"}`}
                                            >
                                                {excelDiagnostics?.totalOk || (!excelDiagnostics && excelValidationOk) ? (
                                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                                ) : (
                                                    <AlertTriangle className="w-3.5 h-3.5" />
                                                )}
                                                <span className="font-medium">
                                                    {excelDiagnostics?.errors?.length
                                                        ? "Parse Errors"
                                                        : excelDiagnostics?.warnings?.length
                                                          ? "Parsed with Warnings"
                                                          : excelDiagnostics?.totalOk
                                                            ? "Excel Validated"
                                                            : excelValidationOk
                                                              ? "Excel Validated"
                                                              : "Validation Issues"}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="text-[10px] text-muted-foreground font-mono">
                                            {excelPreview.fileName}
                                        </div>
                                        {excelDiagnostics && (excelDiagnostics.errors.length > 0 || excelDiagnostics.warnings.length > 0) && (
                                            <div className="space-y-1">
                                                {excelDiagnostics.errors.map((err, i) => (
                                                    <div key={`err-${i}`} className="flex items-start gap-2 text-xs px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400">
                                                        <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                                                        <span>{err}</span>
                                                    </div>
                                                ))}
                                                {excelDiagnostics.warnings.map((warn, i) => (
                                                    <div key={`warn-${i}`} className="flex items-start gap-2 text-xs px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400">
                                                        <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                                                        <span>{warn}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="rounded-2xl border border-border bg-card/30 overflow-hidden">
                                    <Tabs defaultValue="excel">
                                        <div className="px-4 py-3 border-b border-border/70 flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className="flex flex-col">
                                                    <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Workbook</span>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-xs font-semibold text-foreground truncate max-w-[320px]">{excelPreview.fileName}</span>
                                                        {/* Google Sheet Link Button */}
                                                        <div className="flex items-center gap-1">
                                                            <input
                                                                type="url"
                                                                placeholder="Paste Google Sheet URL"
                                                                value={watch("details.googleSheetUrl") || ""}
                                                                onChange={(e) => setValue("details.googleSheetUrl", e.target.value, { shouldDirty: true })}
                                                                className="w-[140px] h-6 text-[10px] px-2 py-1 bg-muted/50 border border-border rounded-md text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-brand-blue/50"
                                                            />
                                                            {watch("details.googleSheetUrl") && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        const url = getValues("details.googleSheetUrl");
                                                                        if (url) window.open(url, "_blank");
                                                                    }}
                                                                    className="p-1 rounded-md hover:bg-brand-blue/10 text-brand-blue hover:text-brand-blue/80 transition-colors"
                                                                    title="Open in Google Sheets"
                                                                >
                                                                    <ExternalLink className="w-3.5 h-3.5" />
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                            <TabsList className="bg-muted/40">
                                                <TabsTrigger value="excel">Excel</TabsTrigger>
                                                <TabsTrigger value="activity">History</TabsTrigger>
                                            </TabsList>
                                        </div>
                                        <TabsContent value="excel" className="m-0 h-full data-[state=inactive]:hidden">
                                            <div className="h-[620px] max-h-[72vh] min-h-[400px] overflow-hidden flex flex-col">
                                                <ExcelGridViewer />
                                            </div>
                                        </TabsContent>
                                        <TabsContent value="activity" className="m-0 h-full data-[state=inactive]:hidden">
                                            <div className="h-[620px] max-h-[72vh] min-h-[400px] overflow-hidden flex flex-col">
                                                <ActivityLog proposalId={proposalId} />
                                            </div>
                                        </TabsContent>
                                    </Tabs>
                                </div>
                            </div>
                        )
                    ) : (
                        /* ═══ INTELLIGENCE MODE ═══ */
                        <div className="flex flex-col h-full space-y-4">
                            {/* Start Blank / Import from RFP toggle */}
                            <div className="flex items-center gap-1 p-1 rounded-lg bg-muted/40 w-fit">
                                <button
                                    type="button"
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-background text-foreground shadow-sm"
                                >
                                    <PenTool className="w-3.5 h-3.5" />
                                    Start Blank
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setRfpMode(true)}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                                >
                                    <FileSearch className="w-3.5 h-3.5" />
                                    Import from RFP
                                </button>
                            </div>

                            <div className="flex items-center justify-between px-1">
                                <div className="flex items-center gap-2">
                                    <span className="text-xs font-semibold text-foreground">
                                        {screenFields.length} screen{screenFields.length !== 1 ? "s" : ""}
                                    </span>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => {
                                        appendScreen({
                                            name: "",
                                            productType: "",
                                            zoneComplexity: "standard",
                                            zoneSize: "small",
                                            widthFt: 0,
                                            heightFt: 0,
                                            quantity: 1,
                                            pitchMm: 10,
                                            costPerSqFt: 120,
                                            desiredMargin: 0.25,
                                            hiddenFromSpecs: false,
                                            isReplacement: false,
                                            useExistingStructure: false,
                                            includeSpareParts: false,
                                            isManualLineItem: false,
                                        });
                                    }}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-blue/10 text-brand-blue border border-brand-blue/20 text-xs font-medium hover:bg-brand-blue/20 transition-all"
                                >
                                    <Plus className="w-3.5 h-3.5" />
                                    Add Screen
                                </button>
                            </div>

                            <div className="rounded-2xl border border-border bg-card/30 overflow-hidden">
                                <Tabs defaultValue="screens">
                                    <div className="px-4 py-3 border-b border-border/70 flex items-center justify-between">
                                        <div className="flex flex-col">
                                            <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Screens</span>
                                            <span className="text-xs font-semibold text-foreground">Configure display specifications</span>
                                        </div>
                                        <TabsList className="bg-muted/40">
                                            <TabsTrigger value="screens">Screen Editor</TabsTrigger>
                                            <TabsTrigger value="activity">History</TabsTrigger>
                                        </TabsList>
                                    </div>
                                    <TabsContent value="screens" className="m-0 h-full data-[state=inactive]:hidden">
                                        <div className="h-[620px] max-h-[72vh] min-h-[400px] overflow-hidden flex flex-col">
                                            <ScreensGridEditor />
                                        </div>
                                    </TabsContent>
                                    <TabsContent value="activity" className="m-0 h-full data-[state=inactive]:hidden">
                                        <div className="h-[620px] max-h-[72vh] min-h-[400px] overflow-hidden flex flex-col">
                                            <ActivityLog proposalId={proposalId} />
                                        </div>
                                    </TabsContent>
                                </Tabs>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Brief Me Intelligence Panel */}
            <BriefMePanel
                open={briefPanelOpen}
                onClose={() => setBriefPanelOpen(false)}
                proposalId={proposalId}
                clientName={watch("receiver.name") || ""}
                address={[address, city, zipCode].filter(Boolean).join(", ")}
                screenCount={(watch("details.screens") as any[])?.length ?? 0}
                totalAmount={0}
                screenSummary={
                    ((watch("details.screens") as any[]) ?? []).map(
                        (s: any) => `${s.name || "Screen"} — ${s.widthFt || s.width || "?"}×${s.heightFt || s.height || "?"}ft`,
                    )
                }
                onBriefLoaded={setHasBrief}
            />
        </div>
    );
};

export default Step1Ingestion;
