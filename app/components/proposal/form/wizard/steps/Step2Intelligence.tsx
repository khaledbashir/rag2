"use client";

import { useState, useEffect, useMemo } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { Calculator, Info, ChevronDown, ChevronUp, RotateCcw, Tv, EyeOff, Eye } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Screens } from "@/app/components";
import PricingTableEditor from "@/app/components/proposal/form/sections/PricingTableEditor";
import SchedulePreview from "@/app/components/proposal/form/sections/SchedulePreview";
import { Badge } from "@/components/ui/badge";
import { useProposalContext } from "@/contexts/ProposalContext";
import { SOWGeneratorPanel } from "@/app/components/proposal/SOWGeneratorPanel";
import { FreeformTableBuilder } from "./FreeformTableBuilder";
import type { ProposalType } from "@/types";

const Step2Intelligence = () => {
    const { aiWorkspaceSlug } = useProposalContext();
    const { control, setValue, getValues, register, watch } = useFormContext();
    const watchedScreens = useWatch({
        name: "details.screens",
        control
    });
    const screens = useMemo(() => (Array.isArray(watchedScreens) ? watchedScreens : []), [watchedScreens]);
    const details = useWatch({ name: "details", control });
    const ntpDate = useWatch({ name: "details.ntpDate", control });
    const mirrorModeFlag = useWatch({ name: "details.mirrorMode", control });
    const pricingDocument = useWatch({ name: "details.pricingDocument" as any, control });
    const mirrorMode =
        mirrorModeFlag === true || ((pricingDocument as any)?.tables?.length ?? 0) > 0;
    const screenCount = screens.length;
    const hasData = aiWorkspaceSlug || screenCount > 0;
    const [originalScreenDetails, setOriginalScreenDetails] = useState<Record<string, { displayName: string; brightness: number | string | "" }>>({});

    // Intelligence section collapsed by default
    const [showIntelligence, setShowIntelligence] = useState(false);

    useEffect(() => {
        if (!Array.isArray(screens) || screens.length === 0) return;

        setOriginalScreenDetails((prev) => {
            const next = { ...prev };
            (screens as any[]).forEach((screen: any, idx: number) => {
                const key = screen?.id ? `id:${screen.id}` : `idx:${idx}`;
                if (next[key]) return;

                const originalDisplayName = (
                    screen?.externalName ||
                    screen?.name ||
                    `Screen ${idx + 1}`
                ).toString().trim();
                const originalBrightness = screen?.brightnessNits ?? screen?.nits ?? screen?.brightness ?? "";

                next[key] = {
                    displayName: originalDisplayName,
                    brightness: originalBrightness,
                };
            });
            return next;
        });
    }, [screens]);

    if (mirrorMode) {
        // ═══ MIRROR MODE: Configure ═══
        // Pricing editor first (most important), then doc mode, custom text, brightness per screen
        return (
            <div className="h-full flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                {/* Pricing Line Items — primary editing surface for Mirror Mode */}
                <PricingTableEditor />

                {/* Free-form pricing tables — build pricing from scratch, alongside the mirrored tables */}
                <FreeformTableBuilder />

                {/* Brightness Editor — minimal per-screen brightness input */}
                {screenCount > 0 && (
                    <div className="flex flex-col gap-3 px-4 py-3 rounded-lg border border-border bg-card/50">
                        <div className="flex items-center justify-between gap-3">
                            <div className="flex items-start gap-2">
                                <Tv className="w-4 h-4 text-muted-foreground mt-0.5" />
                                <div className="space-y-0.5">
                                    <h4 className="text-sm font-semibold text-foreground">
                                        Screen Details for Exhibit A
                                        {(() => {
                                            const hiddenCount = (screens as any[]).filter((s: any) => s?.hiddenFromSpecs).length;
                                            return hiddenCount > 0 ? (
                                                <span className="ml-2 text-[11px] font-normal text-amber-600">
                                                    ({hiddenCount} hidden)
                                                </span>
                                            ) : null;
                                        })()}
                                    </h4>
                                    <p className="text-xs text-muted-foreground">Edit display names and brightness for the specs table</p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => {
                                    (screens as any[]).forEach((screen: any, idx: number) => {
                                        const key = screen?.id ? `id:${screen.id}` : `idx:${idx}`;
                                        const original = originalScreenDetails[key];
                                        const originalBrightness = original?.brightness ?? "";
                                        setValue(`details.screens.${idx}.customDisplayName` as any, "", { shouldDirty: true, shouldValidate: true });
                                        setValue(`details.screens.${idx}.brightness` as any, originalBrightness, { shouldDirty: true, shouldValidate: true });
                                        setValue(`details.screens.${idx}.hiddenFromSpecs` as any, false, { shouldDirty: true, shouldValidate: true });
                                    });
                                }}
                                className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
                            >
                                <RotateCcw className="w-3.5 h-3.5" />
                                Reset All
                            </button>
                        </div>

                        <div className="space-y-3">
                            <div className="hidden md:grid md:grid-cols-[minmax(0,1fr)_10rem_auto_auto] gap-3 px-1">
                                <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Display Name</span>
                                <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Brightness (nits)</span>
                                <span />
                                <span />
                            </div>

                            {(screens as any[]).map((screen: any, idx: number) => {
                                const key = screen?.id ? `id:${screen.id}` : `idx:${idx}`;
                                const original = originalScreenDetails[key];
                                const fallbackName = (original?.displayName || screen?.externalName || screen?.name || `Screen ${idx + 1}`).toString();
                                const customDisplayName = (screen?.customDisplayName || "").toString();
                                const currentDisplayName = customDisplayName.trim() !== "" ? customDisplayName : fallbackName;
                                const isNameEdited = customDisplayName.trim() !== "" && customDisplayName.trim() !== fallbackName.trim();
                                const isHidden = screen?.hiddenFromSpecs === true;

                                return (
                                    <div key={key} className={`rounded-md border p-3 transition-colors ${isHidden ? "border-border/40 bg-muted/30 opacity-50" : "border-border/70 bg-background/40"}`}>
                                        <div className="flex flex-col md:grid md:grid-cols-[minmax(0,1fr)_10rem_auto_auto] gap-2 md:gap-3 items-start">
                                            <input
                                                type="text"
                                                value={currentDisplayName}
                                                disabled={isHidden}
                                                onChange={(e) => {
                                                    const nextValue = e.target.value;
                                                    const normalized = nextValue.trim();
                                                    const shouldClearOverride = normalized === "" || normalized === fallbackName.trim();
                                                    setValue(
                                                        `details.screens.${idx}.customDisplayName` as any,
                                                        shouldClearOverride ? "" : nextValue,
                                                        { shouldDirty: true, shouldValidate: true }
                                                    );
                                                }}
                                                className={`w-full h-9 px-3 text-sm border rounded-md focus:ring-1 focus:ring-[#0A52EF] focus:outline-none ${isHidden ? "bg-muted text-muted-foreground line-through border-border/50" : "bg-background border-input"}`}
                                            />
                                            <input
                                                type="number"
                                                placeholder="e.g., 6000"
                                                value={screen?.brightness ?? ""}
                                                disabled={isHidden}
                                                onChange={(e) => {
                                                    const nextValue = e.target.value;
                                                    setValue(
                                                        `details.screens.${idx}.brightness` as any,
                                                        nextValue === "" ? "" : Number(nextValue),
                                                        { shouldDirty: true, shouldValidate: true }
                                                    );
                                                }}
                                                className={`w-full h-9 px-3 text-sm border rounded-md focus:ring-1 focus:ring-[#0A52EF] focus:outline-none ${isHidden ? "bg-muted text-muted-foreground border-border/50" : "bg-background border-input"}`}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const originalBrightness = original?.brightness ?? "";
                                                    setValue(`details.screens.${idx}.customDisplayName` as any, "", { shouldDirty: true, shouldValidate: true });
                                                    setValue(`details.screens.${idx}.brightness` as any, originalBrightness, { shouldDirty: true, shouldValidate: true });
                                                }}
                                                className="inline-flex items-center justify-center h-9 w-9 rounded-md border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
                                                title="Reset this screen"
                                                aria-label="Reset this screen"
                                            >
                                                <RotateCcw className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setValue(
                                                        `details.screens.${idx}.hiddenFromSpecs` as any,
                                                        !isHidden,
                                                        { shouldDirty: true, shouldValidate: true }
                                                    );
                                                }}
                                                className={`inline-flex items-center justify-center h-9 w-9 rounded-md border transition-colors ${isHidden ? "border-amber-300 text-amber-500 hover:text-amber-600 hover:border-amber-400 bg-amber-50" : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"}`}
                                                title={isHidden ? "Show in specs table" : "Hide from specs table"}
                                                aria-label={isHidden ? "Show in specs table" : "Hide from specs table"}
                                            >
                                                {isHidden ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                                            </button>
                                        </div>

                                        {isNameEdited && !isHidden && (
                                            <p className="mt-2 text-[11px] text-muted-foreground truncate">
                                                Original: {fallbackName}
                                            </p>
                                        )}
                                        {isHidden && (
                                            <p className="mt-2 text-[11px] text-amber-600">
                                                Hidden from Exhibit A specs table
                                            </p>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {screenCount === 0 && (
                    <div className="flex flex-col gap-2 px-4 py-3 rounded-lg border border-dashed border-border bg-card/30">
                        <div className="flex items-start gap-2">
                            <Tv className="w-4 h-4 text-muted-foreground mt-0.5" />
                            <div className="space-y-0.5">
                                <h4 className="text-sm font-semibold text-foreground">
                                    Screen Details for Exhibit A
                                </h4>
                                <p className="text-xs text-muted-foreground">
                                    No screens detected in your Excel. Display names and brightness for the specs table are edited here once screens are added. Edit pricing rows above; section headers, descriptions, and totals come from your Excel and can be renamed inline in the Pricing Line Items table.
                                </p>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    // ═══ INTELLIGENCE MODE: Configure ═══
    // Screen cards, SOW, doc mode (no master table, no column headers)
    return (
        <div className="h-full flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Collapsible Intelligence Briefing */}
            {hasData && (
                <div className="border border-border rounded-lg overflow-hidden">
                    <button
                        type="button"
                        onClick={() => setShowIntelligence(!showIntelligence)}
                        className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors"
                    >
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-foreground">Screen Configuration</span>
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-brand-blue/30 text-brand-blue">
                                {screenCount} screen{screenCount !== 1 ? "s" : ""}
                            </Badge>
                        </div>
                        {showIntelligence ? (
                            <ChevronUp className="w-4 h-4 text-muted-foreground" />
                        ) : (
                            <ChevronDown className="w-4 h-4 text-muted-foreground" />
                        )}
                    </button>

                    {showIntelligence && (
                        <div className="p-4 bg-card border-t border-border animate-in fade-in slide-in-from-top-2 duration-200">
                            <p className="text-sm text-foreground leading-relaxed">
                                {aiWorkspaceSlug ? (
                                    <>Analyzed uploaded documents and extracted <strong>{screenCount} video screens</strong>.</>
                                ) : (
                                    <>Detected <strong>{screenCount} screen configurations</strong> in your draft.</>
                                )}
                            </p>
                            <p className="text-xs text-muted-foreground mt-2">
                                Edit screens below to customize specifications and pricing.
                            </p>
                        </div>
                    )}
                </div>
            )}

            {/* AI-Generated SOW Panel - Intelligence Mode only */}
            <SOWGeneratorPanel />

            {/* Main Screens Card */}
            <Card className="bg-card/50 border-border flex-1 flex flex-col overflow-hidden">
                <CardHeader className="pb-3 shrink-0 border-b border-border">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-brand-blue/20">
                                <Calculator className="w-5 h-5 text-brand-blue" />
                            </div>
                            <div>
                                <CardTitle className="text-foreground text-base">Screen Configurations</CardTitle>
                                <CardDescription className="text-muted-foreground text-xs">Define specs for the display system</CardDescription>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground bg-muted px-2 py-1 rounded border border-border">
                            <Info className="w-3 h-3" />
                            Auto-syncing to PDF
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="flex-1 overflow-y-auto p-0">
                    <div className="p-6">
                        <Screens />
                    </div>
                </CardContent>
            </Card>

            {/* Free-form pricing tables — build pricing from scratch */}
            <FreeformTableBuilder />

            {ntpDate && (
                <SchedulePreview />
            )}
        </div>
    );
};

export default Step2Intelligence;
