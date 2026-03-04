"use client";

import React, { useState, useCallback, useMemo } from "react";
import {
    FileText, Download, Loader2, Edit3, ChevronDown, ChevronUp,
    AlertTriangle, CheckCircle2, List, Layers, Sparkles, Zap,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { DisplaySpec } from "@/services/specsheet/formSheetParser";
import { MANUAL_ONLY_FIELDS, getModelKey } from "@/services/specsheet/formSheetParser";
import {
    autoFillAllGroups,
    autoFillToOverrides,
    type GroupAutoFill,
    type MemoryBank,
} from "@/services/specsheet/specAutoFill";

// ─── Field metadata ────────────────────────────────────────────────────────────

interface ManualFieldMeta {
    key: keyof DisplaySpec;
    label: string;
    placeholder?: string;
}

const MANUAL_FIELD_META: ManualFieldMeta[] = [
    // Dimensions — critical for custom displays where FORM may be empty
    { key: "specHeightFt",            label: "Overall Height (ft)",        placeholder: "e.g. 13.50" },
    { key: "specWidthFt",             label: "Overall Width (ft)",         placeholder: "e.g. 24.00" },
    { key: "specResolutionH",         label: "Resolution — Vertical (px)", placeholder: "e.g. 1052" },
    { key: "specResolutionW",         label: "Resolution — Horizontal (px)", placeholder: "e.g. 1871" },
    { key: "actualHeightFt",          label: "Physical Height (ft)",       placeholder: "e.g. 13.12" },
    { key: "actualWidthFt",           label: "Physical Width (ft)",        placeholder: "e.g. 24.61" },
    // Optical & electrical
    { key: "brightnessNits",          label: "Brightness (nits)",          placeholder: "e.g. 6000" },
    { key: "colorTemperatureK",       label: "Color Temperature",          placeholder: "e.g. 6500" },
    { key: "colorTempAdjustability",  label: "Color Temp Adjustability",   placeholder: "e.g. 3,200K–9,300K" },
    { key: "brightnessAdjustment",    label: "Brightness Adjustment",      placeholder: "e.g. 0–100%" },
    { key: "gradationMethod",         label: "Gradation Method",           placeholder: "e.g. 16-bit" },
    { key: "tonalGradation",          label: "Tonal Gradation",            placeholder: "e.g. 281 trillion colors" },
    { key: "typicalPowerW",           label: "Power — Avg (Watts)",        placeholder: "e.g. 3500" },
    { key: "maxPowerW",               label: "Power — Max (Watts)",        placeholder: "e.g. 7000" },
    { key: "voltageService",          label: "Voltage / Service / Phase",  placeholder: "e.g. 120V / 20A / Single Phase" },
    { key: "ventilationRequirements", label: "Ventilation Requirements",   placeholder: "e.g. Passive / Active" },
    { key: "panelWeightLbs",          label: "Display Weight (lbs)",       placeholder: "e.g. 5000" },
    { key: "ledLampModel",            label: "LED Lamp Die Make & Model",  placeholder: "e.g. Nationstar FC3528" },
    { key: "smdLedModel",             label: "3-in-1 SMD LED Make & Model",placeholder: "e.g. Nationstar FC3528RGB" },
];

// ─── Types ─────────────────────────────────────────────────────────────────────

interface SpecSheetButtonProps {
    file: File | null;
    venueName?: string;
    clientName?: string;
    clientAddress?: string;
}

type ModelGroupOverrides = Record<string, Partial<Record<keyof DisplaySpec, string>>>;

// ─── Helpers ───────────────────────────────────────────────────────────────────

function isMissing(d: DisplaySpec, field: keyof DisplaySpec, groupOverrides: ModelGroupOverrides): boolean {
    const override = (groupOverrides[getModelKey(d)] as any)?.[field];
    if (override && String(override).trim()) return false;
    const v = (d as any)[field];
    return !v || String(v).trim() === "";
}

function buildApiOverrides(
    displays: DisplaySpec[],
    groupOverrides: ModelGroupOverrides,
): Record<string, Record<string, string>> {
    const result: Record<string, Record<string, string>> = {};
    for (const d of displays) {
        const key = getModelKey(d);
        const dOverrides: Record<string, string> = {};
        for (const f of MANUAL_ONLY_FIELDS) {
            const override = (groupOverrides[key] as any)?.[f];
            const base = (d as any)[f];
            const val = (override && String(override).trim()) ? String(override).trim() : (base ? String(base).trim() : "");
            if (val) dOverrides[f as string] = val;
        }
        result[String(d.index)] = dOverrides;
    }
    return result;
}

// ─── Component ─────────────────────────────────────────────────────────────────

export default function SpecSheetButton({ file, venueName, clientName, clientAddress }: SpecSheetButtonProps) {
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [displays, setDisplays] = useState<DisplaySpec[]>([]);
    const [warnings, setWarnings] = useState<string[]>([]);
    const [projectName, setProjectName] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<"fill" | "review">("fill");
    const [expandedDisplay, setExpandedDisplay] = useState<number | null>(null);
    const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
    const [groupOverrides, setGroupOverrides] = useState<ModelGroupOverrides>({});
    const [autoFillMeta, setAutoFillMeta] = useState<Record<string, GroupAutoFill>>({});
    const [specFormat, setSpecFormat] = useState<"rfp-form" | "anc-branded">("rfp-form");

    // ── Derived ────────────────────────────────────────────────────────────────

    const modelGroups = useMemo(() => {
        if (displays.length === 0) return [];
        const groups: Record<string, {
            key: string;
            manufacturer: string;
            model: string;
            displayIndices: number[];
            displayNames: string[];
        }> = {};
        for (const d of displays) {
            const key = getModelKey(d);
            if (!groups[key]) {
                groups[key] = {
                    key,
                    manufacturer: d.manufacturer || "Unknown",
                    model: d.model || "Unknown",
                    displayIndices: [],
                    displayNames: [],
                };
            }
            groups[key].displayIndices.push(d.index);
            groups[key].displayNames.push(d.displayName || `Display ${d.index + 1}`);
        }
        return Object.values(groups);
    }, [displays]);

    const totalMissing = useMemo(() => {
        let count = 0;
        for (const g of modelGroups) {
            const rep = displays.find(d => d.index === g.displayIndices[0]);
            if (!rep) continue;
            for (const f of MANUAL_ONLY_FIELDS) {
                if (isMissing(rep, f, groupOverrides)) count++;
            }
        }
        return count;
    }, [modelGroups, displays, groupOverrides]);

    const groupsWithMissing = useMemo(
        () => modelGroups.filter(g => {
            const rep = displays.find(d => d.index === g.displayIndices[0]);
            if (!rep) return false;
            return MANUAL_ONLY_FIELDS.some(f => isMissing(rep, f, groupOverrides));
        }),
        [modelGroups, displays, groupOverrides],
    );

    // ── Handlers ───────────────────────────────────────────────────────────────

    const handleOpen = useCallback(async () => {
        if (!file) return;
        setOpen(true);
        setLoading(true);
        setError(null);
        setGroupOverrides({});
        setExpandedGroup(null);
        setExpandedDisplay(null);

        try {
            const formData = new FormData();
            formData.append("file", file);
            const res = await fetch("/api/specsheet/preview", { method: "POST", body: formData });
            const data = await res.json();
            if (!res.ok || data.error) {
                setError(data.error || `HTTP ${res.status}`);
                setDisplays([]);
                return;
            }
            const parsedDisplays: DisplaySpec[] = data.displays || [];
            setDisplays(parsedDisplays);
            setWarnings(data.warnings || []);
            setProjectName(data.projectName || "");
            setActiveTab("fill");

            // ── Recall saved memories from DB, then auto-fill ──
            if (parsedDisplays.length > 0) {
                let memoryBank: MemoryBank = {};
                try {
                    const groups = [...new Map(parsedDisplays.map(d => [
                        getModelKey(d),
                        { manufacturer: d.manufacturer, model: d.model, pitchMm: d.pixelPitch },
                    ])).values()];
                    const recallRes = await fetch("/api/specsheet/recall", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ groups }),
                    });
                    if (recallRes.ok) {
                        const recallData = await recallRes.json();
                        memoryBank = recallData.memories || {};
                    }
                } catch { /* recall is best-effort */ }

                const autoFills = autoFillAllGroups(parsedDisplays, memoryBank);
                setAutoFillMeta(autoFills);
                const preFilledOverrides = autoFillToOverrides(autoFills);
                setGroupOverrides(preFilledOverrides);

                // Auto-expand first group that still has missing fields after auto-fill
                const firstMissing = Object.values(autoFills).find(
                    (g) => g.filledCount < g.totalManualFields,
                );
                setExpandedGroup(
                    firstMissing?.modelKey ?? getModelKey(parsedDisplays[0]),
                );
            }
        } catch (err: any) {
            setError(err.message || String(err));
        } finally {
            setLoading(false);
        }
    }, [file]);

    const updateGroupField = useCallback((modelKey: string, field: keyof DisplaySpec, value: string) => {
        setGroupOverrides(prev => ({
            ...prev,
            [modelKey]: { ...(prev[modelKey] || {}), [field]: value },
        }));
    }, []);

    const handleGenerate = useCallback(async () => {
        if (!file || displays.length === 0) return;
        setGenerating(true);
        setError(null);
        try {
            const overrides = buildApiOverrides(displays, groupOverrides);
            const formData = new FormData();
            formData.append("file", file);
            formData.append("overrides", JSON.stringify(overrides));
            formData.append("format", specFormat);
            const meta: Record<string, string> = {};
            if (venueName) meta.venueName = venueName;
            if (clientName) meta.clientName = clientName;
            if (clientAddress) meta.clientAddress = clientAddress;
            if (Object.keys(meta).length > 0) formData.append("projectMeta", JSON.stringify(meta));
            const res = await fetch("/api/specsheet/generate", { method: "POST", body: formData });
            if (!res.ok) {
                const errData = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
                throw new Error(errData.error || errData.message || `Failed (${res.status})`);
            }
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${projectName || "Spec_Sheets"}_Performance_Standards.pdf`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            // ── Remember: save field values for future auto-fill ──
            try {
                const entries = modelGroups.map((g) => {
                    const rep = displays.find(d => d.index === g.displayIndices[0]);
                    const fields: Record<string, string> = {};
                    for (const f of MANUAL_ONLY_FIELDS) {
                        const override = (groupOverrides[g.key] as any)?.[f];
                        const base = rep ? (rep as any)[f] : "";
                        const val = (override && String(override).trim()) || (base ? String(base).trim() : "");
                        if (val) fields[f as string] = val;
                    }
                    return {
                        manufacturer: g.manufacturer,
                        model: g.model,
                        pitchMm: displays.find(d => d.index === g.displayIndices[0])?.pixelPitch ?? null,
                        fields,
                    };
                });
                fetch("/api/specsheet/remember", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ entries }),
                }).catch(() => { /* fire and forget */ });
            } catch { /* remember is best-effort */ }
        } catch (err: any) {
            setError(err.message || String(err));
        } finally {
            setGenerating(false);
        }
    }, [file, displays, groupOverrides, projectName, modelGroups, specFormat]);

    if (!file) return null;

    // ── Render ─────────────────────────────────────────────────────────────────

    return (
        <>
            <button
                type="button"
                onClick={handleOpen}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-xs font-medium hover:bg-indigo-500/20 transition-all"
            >
                <FileText className="w-3.5 h-3.5" />
                <span>Spec Sheets</span>
            </button>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="max-w-2xl max-h-[88vh] overflow-hidden flex flex-col bg-background border border-border p-0">
                    <DialogHeader className="sr-only">
                        <DialogTitle>Spec Sheet Generator</DialogTitle>
                    </DialogHeader>

                    {/* ── Header ── */}
                    <div className="shrink-0 px-5 pt-5 pb-0 border-b border-border">
                        <div className="flex items-center gap-2 mb-3">
                            <FileText className="w-4 h-4 text-indigo-400" />
                            <span className="text-sm font-semibold text-foreground">Generate Spec Sheets</span>
                            {!loading && displays.length > 0 && (
                                <span className="ml-auto text-[10px] text-muted-foreground">
                                    {displays.length} display{displays.length !== 1 ? "s" : ""}
                                    {projectName && <span className="font-medium text-foreground"> • {projectName}</span>}
                                </span>
                            )}
                        </div>

                        {!loading && displays.length > 0 && (
                            <div className="flex items-center gap-1 -mb-px">
                                <button
                                    type="button"
                                    onClick={() => setActiveTab("fill")}
                                    className={cn(
                                        "flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors",
                                        activeTab === "fill"
                                            ? "border-amber-400 text-amber-400"
                                            : "border-transparent text-muted-foreground hover:text-foreground",
                                    )}
                                >
                                    <Edit3 className="w-3 h-3" />
                                    Fill Missing Fields
                                    {totalMissing > 0 && (
                                        <span className="px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 text-[10px] font-bold">
                                            {totalMissing}
                                        </span>
                                    )}
                                    {totalMissing === 0 && displays.length > 0 && (
                                        <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                    )}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setActiveTab("review")}
                                    className={cn(
                                        "flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors",
                                        activeTab === "review"
                                            ? "border-indigo-400 text-indigo-400"
                                            : "border-transparent text-muted-foreground hover:text-foreground",
                                    )}
                                >
                                    <List className="w-3 h-3" />
                                    Review All Displays
                                </button>
                            </div>
                        )}
                    </div>

                    {/* ── Body ── */}
                    <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">

                        {loading && (
                            <div className="flex items-center justify-center py-16">
                                <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
                                <span className="ml-2 text-sm text-muted-foreground">Parsing FORM sheet…</span>
                            </div>
                        )}

                        {error && (
                            <div className="rounded-lg border border-red-500/30 bg-red-950/20 px-4 py-3 text-xs text-red-300 flex items-start gap-2">
                                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                                {error}
                            </div>
                        )}

                        {!loading && displays.length === 0 && !error && (
                            <div className="text-center py-16 text-muted-foreground text-sm">
                                No displays found in FORM sheet.
                                <br />
                                <span className="text-xs">Make sure the workbook has a &quot;Form&quot; tab.</span>
                            </div>
                        )}

                        {!loading && warnings.length > 0 && (
                            <div className="space-y-1">
                                {warnings.map((w, i) => (
                                    <div key={i} className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded px-3 py-1.5 flex items-center gap-2">
                                        <AlertTriangle className="w-3 h-3 shrink-0" />{w}
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* ══ TAB: Fill Missing Fields ══════════════════════════════════════ */}
                        {!loading && displays.length > 0 && activeTab === "fill" && (
                            <>
                                {/* Auto-fill summary banner */}
                                {(() => {
                                    const totalAutoFilled = Object.values(autoFillMeta).reduce((s, g) => s + g.filledCount, 0);
                                    const catalogMatches = Object.values(autoFillMeta).filter(g => g.matchConfidence === "exact" || g.matchConfidence === "pitch").length;
                                    if (totalAutoFilled > 0) {
                                        return (
                                            <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs">
                                                <Sparkles className="w-3.5 h-3.5 shrink-0 text-indigo-400" />
                                                <span>
                                                    <strong>{totalAutoFilled} field{totalAutoFilled !== 1 ? "s" : ""}</strong> auto-filled
                                                    {catalogMatches > 0 && <> from <strong>{catalogMatches} catalog match{catalogMatches !== 1 ? "es" : ""}</strong></>}
                                                    {catalogMatches === 0 && <> using environment defaults</>}
                                                    . Review and adjust as needed.
                                                </span>
                                            </div>
                                        );
                                    }
                                    return null;
                                })()}

                                {totalMissing === 0 ? (
                                    <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs">
                                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                                        All fields filled. Ready to generate.
                                    </div>
                                ) : (
                                    <div className="flex items-start gap-2 px-4 py-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs">
                                        <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                                        <span>
                                            <strong>{groupsWithMissing.length} model group{groupsWithMissing.length !== 1 ? "s" : ""}</strong> still have missing fields.
                                            Fill once — applies to all displays sharing that model.
                                        </span>
                                    </div>
                                )}

                                {/* One card per unique manufacturer+model */}
                                {modelGroups.map((g) => {
                                    const rep = displays.find(d => d.index === g.displayIndices[0]);
                                    if (!rep) return null;
                                    const missingCount = MANUAL_ONLY_FIELDS.filter(f => isMissing(rep, f, groupOverrides)).length;
                                    const isExpanded = expandedGroup === g.key;

                                    return (
                                        <div key={g.key} className={cn(
                                            "rounded-lg border overflow-hidden transition-colors",
                                            missingCount > 0 ? "border-amber-500/30" : "border-emerald-500/20",
                                        )}>
                                            {/* Group header */}
                                            <button
                                                type="button"
                                                onClick={() => setExpandedGroup(isExpanded ? null : g.key)}
                                                className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/40 transition-colors text-left"
                                            >
                                                <div className="flex items-center gap-3 min-w-0">
                                                    <div className={cn(
                                                        "w-7 h-7 rounded-lg flex items-center justify-center shrink-0",
                                                        missingCount > 0 ? "bg-amber-500/10" : "bg-emerald-500/10",
                                                    )}>
                                                        <Layers className={cn("w-3.5 h-3.5", missingCount > 0 ? "text-amber-400" : "text-emerald-400")} />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <div className="text-sm font-semibold text-foreground truncate flex items-center gap-2">
                                                            {g.manufacturer} — {g.model}
                                                            {autoFillMeta[g.key]?.matchedProduct && (
                                                                <span className="inline-flex items-center gap-1 text-[9px] font-medium text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded-full">
                                                                    <Zap className="w-2.5 h-2.5" />
                                                                    {autoFillMeta[g.key].matchConfidence === "exact" ? "Catalog Match" : "Near Match"}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="text-[10px] text-muted-foreground">
                                                            {g.displayIndices.length} display{g.displayIndices.length !== 1 ? "s" : ""}
                                                            {g.displayIndices.length <= 4
                                                                ? `: ${g.displayNames.join(", ")}`
                                                                : `: ${g.displayNames.slice(0, 3).join(", ")} +${g.displayIndices.length - 3} more`}
                                                            {autoFillMeta[g.key]?.matchedProduct && (
                                                                <span className="ml-1 text-indigo-400/70">→ {autoFillMeta[g.key].matchedProduct}</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2 shrink-0 ml-2">
                                                    {missingCount > 0 ? (
                                                        <span className="text-[10px] font-bold text-amber-400 bg-amber-500/15 px-2 py-0.5 rounded-full">
                                                            {missingCount} missing
                                                        </span>
                                                    ) : (
                                                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                                                    )}
                                                    {isExpanded
                                                        ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
                                                        : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                                                </div>
                                            </button>

                                            {/* Field inputs — only shown when expanded */}
                                            {isExpanded && (
                                                <div className="border-t border-border/60 px-4 py-3 bg-muted/10 space-y-2">
                                                    <p className="text-[10px] text-muted-foreground mb-3">
                                                        Values entered here apply to all {g.displayIndices.length} display{g.displayIndices.length !== 1 ? "s" : ""} using this model.
                                                    </p>
                                                    {MANUAL_FIELD_META.map((mf) => {
                                                        const currentOverride = (groupOverrides[g.key] as any)?.[mf.key] ?? "";
                                                        const baseVal = (rep as any)[mf.key] ?? "";
                                                        const displayVal = currentOverride || baseVal;
                                                        const missing = isMissing(rep, mf.key, groupOverrides);
                                                        const autoFilled = autoFillMeta[g.key]?.fields?.[mf.key];

                                                        return (
                                                            <div key={mf.key} className="flex items-center gap-2">
                                                                <label className={cn(
                                                                    "text-[10px] w-[168px] shrink-0 text-right leading-tight",
                                                                    missing ? "text-amber-400 font-medium" : "text-muted-foreground",
                                                                )}>
                                                                    {mf.label}
                                                                    {missing && <span className="ml-1 text-amber-400">*</span>}
                                                                </label>
                                                                <div className="flex-1 relative">
                                                                    <Input
                                                                        value={displayVal}
                                                                        onChange={(e) => updateGroupField(g.key, mf.key, e.target.value)}
                                                                        placeholder={mf.placeholder || "—"}
                                                                        className={cn(
                                                                            "h-7 text-xs transition-colors",
                                                                            missing
                                                                                ? "border-amber-500/50 bg-amber-500/5 placeholder:text-amber-500/40 focus-visible:ring-amber-500/30"
                                                                                : "",
                                                                            autoFilled && !missing
                                                                                ? "border-indigo-500/30 bg-indigo-500/5"
                                                                                : "",
                                                                        )}
                                                                    />
                                                                    {autoFilled && displayVal === autoFilled.value && (
                                                                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[8px] text-indigo-400/70 font-medium uppercase tracking-wider pointer-events-none">
                                                                            {autoFilled.source === "memory" ? "saved" : autoFilled.source === "catalog" ? "catalog" : "default"}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </>
                        )}

                        {/* ══ TAB: Review All Displays ══════════════════════════════════════ */}
                        {!loading && displays.length > 0 && activeTab === "review" && (
                            <>
                                {displays.map((d, idx) => {
                                    const missingCount = MANUAL_ONLY_FIELDS.filter(f => isMissing(d, f, groupOverrides)).length;
                                    const isExpanded = expandedDisplay === idx;

                                    return (
                                        <div key={idx} className="rounded-lg border border-border overflow-hidden">
                                            <button
                                                type="button"
                                                onClick={() => setExpandedDisplay(isExpanded ? null : idx)}
                                                className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/40 transition-colors text-left"
                                            >
                                                <div className="flex items-center gap-3 min-w-0">
                                                    <div className="w-7 h-7 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-400 text-xs font-bold shrink-0">
                                                        {idx + 1}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <div className="text-sm font-medium text-foreground truncate max-w-[340px]">
                                                            {d.displayName || `Display ${idx + 1}`}
                                                        </div>
                                                        <div className="text-[10px] text-muted-foreground">
                                                            {d.manufacturer} • {d.model}
                                                            {d.pixelPitch != null && ` • ${d.pixelPitch}mm`}
                                                            {d.specWidthFt && d.specHeightFt && ` • ${d.specWidthFt}′W × ${d.specHeightFt}′H`}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2 shrink-0 ml-2">
                                                    {missingCount > 0 && (
                                                        <span className="text-[10px] font-bold text-amber-400 bg-amber-500/15 px-2 py-0.5 rounded-full">
                                                            {missingCount} missing
                                                        </span>
                                                    )}
                                                    {isExpanded
                                                        ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
                                                        : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                                                </div>
                                            </button>

                                            {isExpanded && (
                                                <div className="border-t border-border px-4 py-3 bg-muted/10 space-y-3">
                                                    {/* Auto-filled stats */}
                                                    <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
                                                        {[
                                                            ["Resolution", d.totalResolutionW && d.totalResolutionH ? `${d.totalResolutionW.toLocaleString()} × ${d.totalResolutionH.toLocaleString()} px` : "—"],
                                                            ["Pixel Density", d.pixelDensityPerSqFt ? `${d.pixelDensityPerSqFt.toLocaleString()} px/sqft` : "—"],
                                                            ["Brightness", d.brightnessNits ? `${d.brightnessNits.toLocaleString()} nits` : "—"],
                                                            ["Max Power", d.maxPowerW ? `${d.maxPowerW.toLocaleString()} W` : "—"],
                                                            ["Weight", d.panelWeightLbs ? `${d.panelWeightLbs.toLocaleString()} lbs` : "—"],
                                                            ["Screens", d.numberOfScreens != null ? String(d.numberOfScreens) : "—"],
                                                        ].map(([label, val]) => (
                                                            <React.Fragment key={label}>
                                                                <div className="text-muted-foreground">{label}</div>
                                                                <div className="font-medium text-foreground">{val}</div>
                                                            </React.Fragment>
                                                        ))}
                                                    </div>

                                                    {/* Manual fields — read-only view showing what will be used */}
                                                    <div className="pt-2 border-t border-border/40">
                                                        <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-2">
                                                            Manual Fields (from model group)
                                                        </div>
                                                        <div className="grid grid-cols-1 gap-1">
                                                            {MANUAL_FIELD_META.map((mf) => {
                                                                const override = (groupOverrides[getModelKey(d)] as any)?.[mf.key] ?? "";
                                                                const base = (d as any)[mf.key] ?? "";
                                                                const val = override || base;
                                                                const missing = !val || String(val).trim() === "";
                                                                return (
                                                                    <div key={mf.key} className="flex items-center gap-2 text-xs">
                                                                        <span className={cn(
                                                                            "w-[168px] shrink-0 text-right text-[10px]",
                                                                            missing ? "text-amber-400" : "text-muted-foreground",
                                                                        )}>
                                                                            {mf.label}
                                                                        </span>
                                                                        <span className={cn(
                                                                            "font-medium",
                                                                            missing ? "text-amber-400/60 italic" : "text-foreground",
                                                                        )}>
                                                                            {val || "—"}
                                                                        </span>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </>
                        )}
                    </div>

                    {/* ── Footer ── */}
                    {!loading && displays.length > 0 && (
                        <div className="shrink-0 px-5 py-4 border-t border-border flex items-center justify-between gap-4">
                            <div className="flex items-center gap-3">
                                <div className="flex items-center gap-1 bg-muted/50 rounded-md p-0.5 border border-border/60">
                                    <button
                                        type="button"
                                        onClick={() => setSpecFormat("rfp-form")}
                                        className={cn(
                                            "px-2 py-1 rounded text-[10px] font-medium transition-colors",
                                            specFormat === "rfp-form"
                                                ? "bg-foreground text-background"
                                                : "text-muted-foreground hover:text-foreground",
                                        )}
                                    >
                                        RFP Form
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setSpecFormat("anc-branded")}
                                        className={cn(
                                            "px-2 py-1 rounded text-[10px] font-medium transition-colors",
                                            specFormat === "anc-branded"
                                                ? "bg-foreground text-background"
                                                : "text-muted-foreground hover:text-foreground",
                                        )}
                                    >
                                        ANC Branded
                                    </button>
                                </div>
                                <div className="text-xs text-muted-foreground">
                                    {totalMissing > 0
                                        ? <span className="text-amber-400">{totalMissing} field{totalMissing !== 1 ? "s" : ""} still missing — PDF will show blanks</span>
                                        : <span className="text-emerald-400">All fields filled • One page per display</span>
                                    }
                                </div>
                            </div>
                            <Button
                                onClick={handleGenerate}
                                disabled={generating}
                                className="bg-indigo-500 hover:bg-indigo-600 text-white shrink-0"
                            >
                                {generating ? (
                                    <><Loader2 className="w-4 h-4 animate-spin mr-2" />Generating…</>
                                ) : (
                                    <><Download className="w-4 h-4 mr-2" />Download PDF</>
                                )}
                            </Button>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </>
    );
}
