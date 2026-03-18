"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useProposalContext } from "@/contexts/ProposalContext";
import { useFormContext } from "react-hook-form";
import {
    Eye,
    CheckCircle2,
    Clock,
    Calendar,
    FileSpreadsheet,
    Shield,
    AlertTriangle,
    Zap,
    Download,
    Play,
    Pause,
    RefreshCw,
    Columns,
    MessageSquare,
    Check,
    FileText,
    FileCheck,
    FileSignature,
    ChevronRight,
    ChevronDown,
    PenLine
} from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { TextEditorPanel } from "@/app/components";
import SchedulePreview from "@/app/components/proposal/form/sections/SchedulePreview";
import { formatCurrency } from "@/lib/helpers";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import ExcelGridViewer from "@/app/components/ExcelGridViewer";
import { FEATURES } from "@/lib/featureFlags";
import type { ProposalType } from "@/types";

const PREVIEW_SECTION_CONTROL_MAP: Record<string, string> = {
    header: "template-control-header-to-intro-gap",
    intro: "template-control-intro-to-body-gap",
    pricing: "template-control-pricing-box-gap",
    "exhibit-a": "template-control-exhibit-a-title-gap",
    "payment-terms": "template-control-section-spacing",
    notes: "template-control-section-spacing",
    signature: "template-control-section-spacing",
    schedule: "template-control-section-spacing",
};

type VisualBuilderSnapshot = {
    densityPreset?: "compact" | "balanced" | "airy";
    contentPaddingX: number;
    headerToIntroGap: number;
    introToBodyGap: number;
    sectionSpacing: number;
    pricingTableGap: number;
    tableRowHeight: number;
    exhibitAHeaderGap: number;
    fontSizePt: number;
    accentColor: string;
    autoPushLargeTables: boolean;
    tableSplitThreshold: number;
    slash: {
        width: number;
        height: number;
        count: number;
        opacity: number;
        top: number;
        right: number;
    };
};

const BUILTIN_STYLE_PRESETS: Array<{ key: string; label: string; value: Partial<VisualBuilderSnapshot> }> = [
    {
        key: "natalia-tight",
        label: "Natalia Tight",
        value: {
            densityPreset: "compact",
            contentPaddingX: 22,
            headerToIntroGap: 12,
            introToBodyGap: 12,
            sectionSpacing: 10,
            pricingTableGap: 10,
            tableRowHeight: 22,
            exhibitAHeaderGap: 14,
            fontSizePt: 14,
            tableSplitThreshold: 14,
        },
    },
    {
        key: "client-airy",
        label: "Client Airy",
        value: {
            densityPreset: "airy",
            contentPaddingX: 28,
            headerToIntroGap: 26,
            introToBodyGap: 28,
            sectionSpacing: 24,
            pricingTableGap: 24,
            tableRowHeight: 30,
            exhibitAHeaderGap: 34,
            fontSizePt: 15,
            tableSplitThreshold: 18,
        },
    },
    {
        key: "print-safe",
        label: "Print Safe",
        value: {
            densityPreset: "balanced",
            contentPaddingX: 24,
            headerToIntroGap: 18,
            introToBodyGap: 18,
            sectionSpacing: 16,
            pricingTableGap: 16,
            tableRowHeight: 24,
            exhibitAHeaderGap: 24,
            fontSizePt: 14,
            autoPushLargeTables: true,
            tableSplitThreshold: 13,
        },
    },
];

const BASE_VISUAL_DEFAULTS: VisualBuilderSnapshot = {
    densityPreset: "balanced",
    contentPaddingX: 24,
    headerToIntroGap: 16,
    introToBodyGap: 16,
    sectionSpacing: 16,
    pricingTableGap: 16,
    tableRowHeight: 24,
    exhibitAHeaderGap: 24,
    fontSizePt: 14,
    accentColor: "#0A52EF",
    autoPushLargeTables: false,
    tableSplitThreshold: 14,
    slash: {
        width: 68,
        height: 86,
        count: 5,
        opacity: 0.1,
        top: 2,
        right: 2,
    },
};

const normalizeVisualSnapshot = (config: Record<string, any>, defaults: VisualBuilderSnapshot): VisualBuilderSnapshot => ({
    densityPreset: (config?.densityPreset || defaults.densityPreset || "balanced") as "compact" | "balanced" | "airy",
    contentPaddingX: Number(config?.contentPaddingX ?? defaults.contentPaddingX),
    headerToIntroGap: Number(config?.headerToIntroGap ?? defaults.headerToIntroGap),
    introToBodyGap: Number(config?.introToBodyGap ?? defaults.introToBodyGap),
    sectionSpacing: Number(config?.sectionSpacing ?? defaults.sectionSpacing),
    pricingTableGap: Number(config?.pricingTableGap ?? defaults.pricingTableGap),
    tableRowHeight: Number(config?.tableRowHeight ?? defaults.tableRowHeight),
    exhibitAHeaderGap: Number(config?.exhibitAHeaderGap ?? defaults.exhibitAHeaderGap),
    fontSizePt: Number(config?.fontSizePt ?? defaults.fontSizePt),
    accentColor: (config?.accentColor || defaults.accentColor).toString(),
    autoPushLargeTables: Boolean(config?.autoPushLargeTables ?? defaults.autoPushLargeTables),
    tableSplitThreshold: Number(config?.tableSplitThreshold ?? defaults.tableSplitThreshold),
    slash: {
        width: Number(config?.slash?.width ?? defaults.slash.width),
        height: Number(config?.slash?.height ?? defaults.slash.height),
        count: Number(config?.slash?.count ?? defaults.slash.count),
        opacity: Number(config?.slash?.opacity ?? defaults.slash.opacity),
        top: Number(config?.slash?.top ?? defaults.slash.top),
        right: Number(config?.slash?.right ?? defaults.slash.right),
    },
});

const Step4Export = () => {
    const {
        generatePdf,
        generatePdfViaJsreport,
        downloadPdf,
        downloadBundlePdfs,
        previewPdfInTab,
        exportAudit,
        pdfUrl,
        proposalPdfLoading,
        pdfGenerationProgress,
        pdfBatchProgress,
        excelPreview,
        importedExcelFile,
        downloadImportedExcel,
        excelSourceData,
        verificationManifest,
        verificationExceptions,
        isGatekeeperLocked,
        unverifiedAiFields,
        headerType,
        setHeaderType,
    } = useProposalContext();
    const { watch, getValues, setValue } = useFormContext<ProposalType>();
    const [exporting, setExporting] = useState(false);
    const [sowExporting, setSowExporting] = useState(false);
    const [verificationLoading, setVerificationLoading] = useState(false);
    const [verificationResponse, setVerificationResponse] = useState<any | null>(null);
    const [verificationError, setVerificationError] = useState<string | null>(null);
    const [focusedRow, setFocusedRow] = useState<number | null>(null);
    const [playIndex, setPlayIndex] = useState<number>(-1);
    const [isPlaying, setIsPlaying] = useState(false);
    const [changeRequestsLoading, setChangeRequestsLoading] = useState(false);
    const [changeRequests, setChangeRequests] = useState<any[]>([]);    // State for toggling sections
    const [isVerificationExpanded, setIsVerificationExpanded] = useState(true);
    const [isTextEditOpen, setIsTextEditOpen] = useState(true);
    const [isVisualBuilderOpen, setIsVisualBuilderOpen] = useState(false);
    const [isScheduleOpen, setIsScheduleOpen] = useState(false);
    const [builderHistory, setBuilderHistory] = useState<VisualBuilderSnapshot[]>([]);
    const [builderHistoryIndex, setBuilderHistoryIndex] = useState(-1);
    const [selectedStylePresetKey, setSelectedStylePresetKey] = useState("");
    const [newPresetName, setNewPresetName] = useState("");
    const suppressHistoryRef = useRef(false);

    // Get proposal data
    const screens = watch("details.screens") || [];
    const internalAudit = watch("details.internalAudit");
    const proposalName = watch("details.proposalName") || "Untitled Proposal";
    const proposalId = watch("details.proposalId");
    const totalValue = internalAudit?.totals?.finalClientTotal || 0;
    const lastSaved = watch("details.updatedAt");
    const mirrorModeFlag = watch("details.mirrorMode");
    const pricingDocument = watch("details.pricingDocument" as any);
    const mirrorMode =
        mirrorModeFlag === true || ((pricingDocument as any)?.tables?.length ?? 0) > 0;
    const watchedTemplateConfig = watch("details.templateConfig" as any);
    const templateConfig = useMemo(() => (watchedTemplateConfig || {}) as Record<string, any>, [watchedTemplateConfig]);
    const visualDefaults = BASE_VISUAL_DEFAULTS;

    const mergeVisualSnapshotIntoConfig = (snapshot: VisualBuilderSnapshot, base: Record<string, any>) => ({
        ...base,
        ...snapshot,
        slash: {
            ...(base?.slash || {}),
            ...snapshot.slash,
        },
    });

    const applyVisualSnapshot = (snapshot: VisualBuilderSnapshot, options?: { suppressHistory?: boolean }) => {
        if (options?.suppressHistory) {
            suppressHistoryRef.current = true;
        }
        const merged = mergeVisualSnapshotIntoConfig(snapshot, templateConfig);
        setValue("details.templateConfig" as any, merged as any, { shouldDirty: true });
    };

    const setTemplateConfigValue = (path: string, value: any) => {
        setValue(path as any, value, { shouldDirty: true });
    };

    const applyDensityPreset = (preset: "compact" | "balanced" | "airy") => {
        const map = {
            compact: { headerToIntroGap: 10, introToBodyGap: 10, sectionSpacing: 10, pricingTableGap: 10, tableRowHeight: 20, exhibitAHeaderGap: 14, fontSizePt: 13 },
            balanced: { headerToIntroGap: 16, introToBodyGap: 16, sectionSpacing: 16, pricingTableGap: 16, tableRowHeight: 24, exhibitAHeaderGap: 24, fontSizePt: 14 },
            airy: { headerToIntroGap: 26, introToBodyGap: 28, sectionSpacing: 24, pricingTableGap: 24, tableRowHeight: 30, exhibitAHeaderGap: 34, fontSizePt: 15 },
        } as const;
        const next = map[preset];
        applyVisualSnapshot({
            ...currentVisualSnapshot,
            densityPreset: preset,
            headerToIntroGap: next.headerToIntroGap,
            introToBodyGap: next.introToBodyGap,
            sectionSpacing: next.sectionSpacing,
            pricingTableGap: next.pricingTableGap,
            tableRowHeight: next.tableRowHeight,
            exhibitAHeaderGap: next.exhibitAHeaderGap,
            fontSizePt: next.fontSizePt,
        });
    };

    const currentVisualSnapshot = useMemo(() => normalizeVisualSnapshot(templateConfig, visualDefaults), [templateConfig, visualDefaults]);
    const historyIndexRef = useRef(-1);
    const lastHistoryFingerprintRef = useRef("");

    useEffect(() => {
        historyIndexRef.current = builderHistoryIndex;
    }, [builderHistoryIndex]);

    useEffect(() => {
        const fingerprint = JSON.stringify(currentVisualSnapshot);
        if (!fingerprint) return;
        if (suppressHistoryRef.current) {
            suppressHistoryRef.current = false;
            lastHistoryFingerprintRef.current = fingerprint;
            return;
        }
        if (fingerprint === lastHistoryFingerprintRef.current) return;

        const currentIndex = historyIndexRef.current;
        setBuilderHistory((prev) => {
            const base = currentIndex >= 0 ? prev.slice(0, currentIndex + 1) : [];
            const next = [...base, currentVisualSnapshot];
            const capped = next.length > 80 ? next.slice(next.length - 80) : next;
            const nextIndex = capped.length - 1;
            historyIndexRef.current = nextIndex;
            setBuilderHistoryIndex(nextIndex);
            lastHistoryFingerprintRef.current = fingerprint;
            return capped;
        });
    }, [currentVisualSnapshot]);

    const undoVisualBuilder = () => {
        if (builderHistoryIndex <= 0) return;
        const target = builderHistory[builderHistoryIndex - 1];
        if (!target) return;
        setBuilderHistoryIndex((prev) => Math.max(0, prev - 1));
        applyVisualSnapshot(target, { suppressHistory: true });
    };

    const redoVisualBuilder = () => {
        if (builderHistoryIndex < 0 || builderHistoryIndex >= builderHistory.length - 1) return;
        const target = builderHistory[builderHistoryIndex + 1];
        if (!target) return;
        setBuilderHistoryIndex((prev) => Math.min(builderHistory.length - 1, prev + 1));
        applyVisualSnapshot(target, { suppressHistory: true });
    };

    useEffect(() => {
        if (!proposalId) return;
        let cancelled = false;
        (async () => {
            try {
                setChangeRequestsLoading(true);
                const res = await fetch(`/api/projects/${proposalId}/change-requests`, { cache: "no-store" as any });
                const json = await res.json().catch(() => null);
                if (cancelled) return;
                setChangeRequests(Array.isArray(json?.items) ? json.items : []);
            } catch {
            } finally {
                if (!cancelled) setChangeRequestsLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [proposalId]);

    useEffect(() => {
        const handlePreviewFocus = (evt: Event) => {
            const custom = evt as CustomEvent<{ section?: string }>;
            const section = (custom.detail?.section || "").toLowerCase().trim();
            const controlId = PREVIEW_SECTION_CONTROL_MAP[section];
            if (!controlId) return;
            const target = document.getElementById(controlId);
            if (!target) return;
            target.scrollIntoView({ behavior: "smooth", block: "center" });
            target.classList.add("ring-2", "ring-brand-blue/50", "rounded-md");
            window.setTimeout(() => {
                target.classList.remove("ring-2", "ring-brand-blue/50", "rounded-md");
            }, 900);
        };
        window.addEventListener("anc-focus-control", handlePreviewFocus as EventListener);
        return () => window.removeEventListener("anc-focus-control", handlePreviewFocus as EventListener);
    }, []);

    const updateChangeRequestStatus = async (requestId: string, status: "OPEN" | "RESOLVED") => {
        if (!proposalId) return;
        const res = await fetch(`/api/projects/${proposalId}/change-requests`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ requestId, status, resolvedBy: "natalia" }),
        });
        if (!res.ok) return;
        const json = await res.json().catch(() => null);
        const updated = json?.item;
        if (!updated?.id) return;
        setChangeRequests((prev) => prev.map((it) => (it.id === updated.id ? updated : it)));
    };

    const screenCount = screens.length;
    // In Mirror Mode, screens come from Excel and may use width/height instead of widthFt/heightFt
    const hasErrors = screens.some((s: any) => {
        const w = s.widthFt ?? s.width;
        const h = s.heightFt ?? s.height;
        return !w || !h || !s.name;
    });
    const allScreensValid = mirrorMode ? screenCount > 0 : (screenCount > 0 && !hasErrors);
    const hasOptionPlaceholder = screens.some((s: any) => {
        const name = (s?.name ?? "").toString().trim().toUpperCase();
        const w = Number(s?.widthFt ?? s?.width ?? 0);
        const h = Number(s?.heightFt ?? s?.height ?? 0);
        return name.includes("OPTION") && (w <= 0 || h <= 0);
    });

    const effectiveVerification = verificationResponse?.verification ?? null;
    const effectiveManifest = effectiveVerification?.manifest ?? verificationManifest ?? null;
    const effectiveExceptions = useMemo(() => effectiveVerification?.exceptions ?? verificationExceptions ?? [], [effectiveVerification, verificationExceptions]);
    const effectiveReport = effectiveVerification?.report ?? null;
    const reconciliation = effectiveManifest?.reconciliation ?? null;

    const mirrorBlockingIssues = useMemo(() => {
        const issues: Array<{ id: string; label: string }> = [];
        // pricingDocument stored in DB means data was already parsed — skip session-only checks
        const hasPricingDoc = (pricingDocument as any)?.tables?.length > 0;
        if (!excelPreview && !hasPricingDoc) issues.push({ id: "no-excel", label: "No Excel imported" });
        if (excelPreview && !excelSourceData && !hasPricingDoc) issues.push({ id: "no-excel-source", label: "Excel source data missing" });
        if (excelPreview && !allScreensValid) issues.push({ id: "invalid-screens", label: "Screens have missing dimensions" });
        if (hasOptionPlaceholder) issues.push({ id: "option-row", label: "OPTION placeholder row detected" });
        if (!internalAudit && !hasPricingDoc) issues.push({ id: "no-audit", label: "Internal audit not computed" });
        const rec = reconciliation;
        if (!rec && !hasPricingDoc) issues.push({ id: "no-reconciliation", label: "Verification not run" });
        if (rec && rec.isMatch === false) issues.push({ id: "variance", label: "Totals do not match Excel" });
        if (effectiveExceptions.length > 0) {
            const criticalExceptions = effectiveExceptions.filter((ex: any) =>
                ex.severity === 'CRITICAL' || ex.category === 'DATA_INTEGRITY'
            );
            if (criticalExceptions.length > 0) {
                issues.push({ id: "exceptions", label: `${criticalExceptions.length} critical exceptions found` });
            }
        }
        if (isGatekeeperLocked) {
            issues.push({ id: "gatekeeper", label: `Unverified AI Data (${unverifiedAiFields.length})` });
        }
        return issues;
    }, [allScreensValid, effectiveExceptions, excelPreview, excelSourceData, hasOptionPlaceholder, internalAudit, pricingDocument, reconciliation, isGatekeeperLocked, unverifiedAiFields]);

    const isMirrorReadyToExport = mirrorBlockingIssues.length === 0;
    // Mirror PDF only needs pricing tables — screen dimensions are for audit workbook, not the PDF
    const isPdfPreviewBlocked = mirrorMode
        ? isGatekeeperLocked
        : !allScreensValid || isGatekeeperLocked;
    const pricingTables = useMemo(() => (((pricingDocument as any)?.tables || []) as any[]), [pricingDocument]);

    // Detect if any responsibility matrix data actually exists (Mirror or Intelligence)
    const hasRespMatrixData = useMemo(() => {
        const mirrorMatrix = (pricingDocument as any)?.respMatrix;
        if (mirrorMatrix?.categories?.some((c: any) => c.items?.length > 0)) return true;
        const intelMatrix = watch("details.responsibilityMatrix" as any);
        if (intelMatrix?.categories?.some((c: any) => c.items?.length > 0)) return true;
        return false;
    }, [pricingDocument, watch]);

    // Auto-detect master table (roll-up / summary table) on first load
    const masterTableIndex = watch("details.masterTableIndex" as any);
    useEffect(() => {
        if (pricingTables.length > 0 && masterTableIndex == null) {
            const rollUpRegex = /\b(total|roll.?up|summary|project\s+grand|grand\s+total|project\s+total|cost\s+summary|pricing\s+summary)\b/i;
            const matchIdx = pricingTables.findIndex((t: any) => rollUpRegex.test(((t as any)?.name || "").toString()));
            if (matchIdx >= 0) {
                setValue("details.masterTableIndex" as any, matchIdx, { shouldDirty: false });
            }
        }
    }, [pricingTables, masterTableIndex, setValue]);

    const tableSplitThreshold = Number(templateConfig?.tableSplitThreshold ?? visualDefaults.tableSplitThreshold);
    const pricingSplitRisk = useMemo(() => {
        if (pricingTables.length === 0) return null;
        const evaluated = pricingTables.map((table: any) => {
            const items = Array.isArray(table?.items) ? table.items : [];
            const alternates = Array.isArray(table?.alternates) ? table.alternates : [];
            const longRows = items.filter((row: any) => ((row?.description || "").toString().length > 88)).length;
            const estimatedRows = items.length + alternates.length + 4 + Math.min(3, longRows);
            return {
                id: table?.id || table?.name || "table",
                name: (table?.name || "Section").toString(),
                estimatedRows,
            };
        });
        if (evaluated.length === 0) return null;
        const largest = evaluated.reduce((top, current) => current.estimatedRows > top.estimatedRows ? current : top);
        return {
            ...largest,
            threshold: tableSplitThreshold,
            atRisk: largest.estimatedRows > tableSplitThreshold,
        };
    }, [pricingTables, tableSplitThreshold]);

    const userStylePresets = useMemo(
        () => ((templateConfig?.userStylePresets || []) as Array<{ id: string; name: string; snapshot: VisualBuilderSnapshot }>),
        [templateConfig?.userStylePresets]
    );
    const stylePresetOptions = useMemo(() => {
        const user = userStylePresets.map((preset) => ({ key: `user:${preset.id}`, label: preset.name, value: preset.snapshot }));
        return [...BUILTIN_STYLE_PRESETS, ...user];
    }, [userStylePresets]);

    const applyStylePreset = (presetKey: string) => {
        if (!presetKey) return;
        const found = stylePresetOptions.find((preset) => preset.key === presetKey);
        if (!found) return;
        applyVisualSnapshot({
            ...currentVisualSnapshot,
            ...found.value,
            slash: {
                ...currentVisualSnapshot.slash,
                ...(found.value?.slash || {}),
            },
        });
    };

    const saveCurrentAsPreset = () => {
        const name = newPresetName.trim();
        if (!name) return;
        const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40) || `preset-${Date.now()}`;
        const existing = userStylePresets.find((preset) => preset.id === id);
        const nextPreset = { id, name, snapshot: currentVisualSnapshot };
        const nextPresets = existing
            ? userStylePresets.map((preset) => preset.id === id ? nextPreset : preset)
            : [...userStylePresets, nextPreset];
        setTemplateConfigValue("details.templateConfig.userStylePresets", nextPresets);
        setSelectedStylePresetKey(`user:${id}`);
        setNewPresetName("");
    };

    const deleteSelectedPreset = () => {
        if (!selectedStylePresetKey.startsWith("user:")) return;
        const id = selectedStylePresetKey.replace("user:", "");
        const next = userStylePresets.filter((preset) => preset.id !== id);
        setTemplateConfigValue("details.templateConfig.userStylePresets", next);
        setSelectedStylePresetKey("");
    };

    // Helper functions to generate helpful error messages
    const getDownloadBundleErrorMessage = () => {
        if (mirrorMode) {
            if (!isMirrorReadyToExport && mirrorBlockingIssues.length > 0) {
                return `Blocked: ${mirrorBlockingIssues.map(i => i.label).join(", ")}`;
            }
        } else {
            if (isGatekeeperLocked && unverifiedAiFields.length > 0) {
                return `Verify ${unverifiedAiFields.length} more field${unverifiedAiFields.length !== 1 ? 's' : ''} to export`;
            }
            if (!allScreensValid) {
                const missingFields = screens.filter((s: any) => !s.widthFt || !s.heightFt || !s.name);
                if (missingFields.length > 0) {
                    return `${missingFields.length} screen${missingFields.length !== 1 ? 's' : ''} missing dimensions or name`;
                }
                return "Add screens with dimensions to export";
            }
        }
        return undefined;
    };

    const getExcelOnlyErrorMessage = () => {
        if (isGatekeeperLocked && unverifiedAiFields.length > 0) {
            return `Verify ${unverifiedAiFields.length} more field${unverifiedAiFields.length !== 1 ? 's' : ''} to export`;
        }
        if (mirrorMode && !isMirrorReadyToExport && mirrorBlockingIssues.length > 0) {
            return `Blocked: ${mirrorBlockingIssues.map(i => i.label).join(", ")}`;
        }
        return undefined;
    };

    const getPdfOnlyErrorMessage = () => {
        if (isGatekeeperLocked && unverifiedAiFields.length > 0) {
            return `Verify ${unverifiedAiFields.length} more field${unverifiedAiFields.length !== 1 ? 's' : ''} to export`;
        }
        if (mirrorMode) {
            if (!allScreensValid) {
                return "Screens missing dimensions or name";
            }
            if (hasOptionPlaceholder) {
                return "OPTION placeholder row detected";
            }
            if (!internalAudit) {
                return "Internal audit not computed";
            }
        } else {
            if (!allScreensValid) {
                const missingFields = screens.filter((s: any) => !s.widthFt || !s.heightFt || !s.name);
                if (missingFields.length > 0) {
                    return `${missingFields.length} screen${missingFields.length !== 1 ? 's' : ''} missing dimensions or name`;
                }
                return "Add screens with dimensions to export";
            }
        }
        return undefined;
    };

    const getOriginalExcelErrorMessage = () => {
        if (!importedExcelFile) {
            return "Original uploaded Excel is unavailable in this session. Re-upload the workbook to download the exact source file.";
        }
        return undefined;
    };

    const handleGlobalExport = async () => {
        const isBlocked = mirrorMode ? !isMirrorReadyToExport : (!allScreensValid || isGatekeeperLocked);
        if (isBlocked) return;
        setExporting(true);
        try {
            // Download 4 separate files: Audit Excel + Budget/Proposal/LOI PDFs
            await downloadBundlePdfs();
        } finally {
            setTimeout(() => setExporting(false), 2000);
        }
    };

    const handleInstallSOW = async () => {
        setSowExporting(true);
        try {
            const formData = getValues();
            const formScreens = formData.details?.screens || [];
            const pDoc = (formData.details as any)?.pricingDocument;
            const tables = pDoc?.tables || [];

            const displays = (formScreens as any[]).map((s: any, i: number) => {
                const table = tables[i] || tables.find((t: any) =>
                    t.name && s.name && t.name.toLowerCase().includes(s.name.toLowerCase())
                );
                return {
                    name: s.name || s.screenName || `Display ${i + 1}`,
                    widthFt: Number(s.widthFt || s.width || 0),
                    heightFt: Number(s.heightFt || s.height || 0),
                    pixelPitch: Number(s.pixelPitch || s.pitchMm || 0),
                    quantity: Number(s.quantity || 1),
                    environment: (s.environment || "Indoor") as "Indoor" | "Outdoor",
                    structureType: s.structureType || "wall",
                    installPrice: table?.grandTotal || 0,
                };
            });

            const payload = {
                projectName: formData.details?.proposalName || "Untitled Project",
                clientName: (formData as any).receiver?.name || "Client",
                venue: (formData.details as any)?.venue || formData.details?.proposalName || "",
                date: new Date().toISOString().split("T")[0],
                displays,
                includeElectrical: true,
                includeStructural: true,
                currency: pDoc?.currency || "USD",
            };

            const res = await fetch("/api/sow/generate-installation", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            if (!res.ok) throw new Error(await res.text());

            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${payload.projectName} - Installation SOW.docx`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error("Installation SOW export failed:", err);
        } finally {
            setSowExporting(false);
        }
    };

    const ensurePdfPreview = async () => {
        if (proposalPdfLoading) return;
        if (pdfUrl) return;
        await generatePdf(getValues());
    };

    const canRunVerification = !!(proposalId && excelSourceData && internalAudit);

    const runVerification = async () => {
        if (!proposalId) {
            setVerificationError("Save the project first to enable verification.");
            return;
        }
        if (!excelSourceData) {
            setVerificationError("Import an Estimator Excel file first (Setup step).");
            return;
        }
        if (!internalAudit) {
            setVerificationError("Add screens with dimensions first (Configure step).");
            return;
        }
        setVerificationError(null);
        setVerificationLoading(true);
        try {
            const excelData = {
                ...excelSourceData,
                proposalId,
                fileName: excelPreview?.fileName || excelSourceData.fileName,
            };
            const res = await fetch("/api/proposals/verify", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    proposalId,
                    excelData,
                    internalAudit,
                    options: { enableAutoFix: true },
                }),
            });
            if (!res.ok) {
                throw new Error(await res.text());
            }
            const data = await res.json();
            setVerificationResponse(data);
        } catch (e) {
            setVerificationResponse(null);
            setVerificationError(e instanceof Error ? e.message : "Verification failed");
        } finally {
            setVerificationLoading(false);
        }
    };

    const playbackItems = useMemo(() => {
        const manifest = effectiveManifest;
        if (!manifest?.perScreen || !Array.isArray(manifest.perScreen)) return [];

        const perScreen = manifest.perScreen;
        const needsAttention = perScreen
            .map((s: any) => {
                const variance = Number(s?.variance?.finalTotal ?? 0);
                const absVariance = Math.abs(variance);
                return { screen: s, absVariance, variance };
            })
            .filter((x: any) => x.absVariance > 0.01)
            .sort((a: any, b: any) => b.absVariance - a.absVariance);

        const items = needsAttention.length > 0 ? needsAttention : perScreen.map((screen: any) => ({ screen, absVariance: 0, variance: 0 }));
        return items.map((x: any) => ({
            name: x.screen?.name ?? "Unnamed Screen",
            rowIndex: Number(x.screen?.rowIndex ?? 0),
            variance: x.variance,
            absVariance: x.absVariance,
        }));
    }, [effectiveManifest]);

    const highlightedRows = useMemo(() => {
        if (playIndex < 0 || playIndex >= playbackItems.length) return [];
        const rowIndex1 = playbackItems[playIndex]?.rowIndex;
        if (!rowIndex1 || !Number.isFinite(rowIndex1)) return [];
        return [rowIndex1 - 1];
    }, [playIndex, playbackItems]);

    useEffect(() => {
        if (!isPlaying) return;
        if (playbackItems.length === 0) return;
        const t = setTimeout(() => {
            setPlayIndex((prev) => {
                const next = prev < 0 ? 0 : prev + 1;
                if (next >= playbackItems.length) {
                    setIsPlaying(false);
                    return prev;
                }
                return next;
            });
        }, 900);
        return () => clearTimeout(t);
    }, [isPlaying, playbackItems.length, playIndex]);

    useEffect(() => {
        if (highlightedRows.length === 0) return;
        setFocusedRow(highlightedRows[0]);
    }, [highlightedRows]);

    return (
        <TooltipProvider>
            <div className="h-full flex flex-col p-8 max-w-5xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
                {/* Phase 4 Header */}
                <div className="flex flex-col items-center text-center mb-12">
                    <div className="w-16 h-16 rounded-2xl bg-brand-blue/10 flex items-center justify-center mb-6 relative group">
                        <div className="absolute inset-0 bg-brand-blue/20 rounded-2xl blur-xl group-hover:blur-2xl transition-all" />
                        <Zap className="w-8 h-8 text-brand-blue relative z-10" />
                    </div>

                    <h2 className="text-3xl font-bold text-foreground tracking-tight mb-2">Review & Export</h2>
                    <p className="text-muted-foreground text-sm max-w-md font-medium">
                        Final review of your proposal. Verify data accuracy and export professional documents.
                    </p>
                </div>

                {Number(totalValue) === 0 && screens.length > 0 && (
                    <div className="mb-6 rounded-xl border border-amber-600/30 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-4 py-3 flex items-center gap-3">
                        <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
                        <div>
                            <div className="font-semibold text-amber-700 dark:text-amber-200">Data Mapping Failed: Pricing not found</div>
                            <div className="text-xs text-muted-foreground mt-0.5">Project total has no value yet. Check Excel mapping or screen pricing in the Math step.</div>
                        </div>
                    </div>
                )}

                {mirrorMode && (
                    <Card className="bg-card/40 border border-border/60 overflow-hidden mb-10">
                        <CardHeader className="border-b border-border/60">
                            <div className="flex items-start justify-between gap-4">
                                <div className="min-w-0">
                                    <CardTitle className="text-xs font-bold text-muted-foreground uppercase tracking-[0.2em]">
                                        Mirror Mode Flight Checklist
                                    </CardTitle>
                                    <CardDescription className="text-xs text-muted-foreground">
                                        Export unlocks only when all gates pass (Master Truth).
                                    </CardDescription>
                                </div>
                                <div className={cn(
                                    "shrink-0 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-widest",
                                    isMirrorReadyToExport
                                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                                        : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-200"
                                )}>
                                    {isMirrorReadyToExport ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                                    {isMirrorReadyToExport ? "Good To Go" : "Blocked"}
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="p-4">
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                                <div className={cn(
                                    "rounded-xl border px-4 py-3",
                                    excelPreview && excelSourceData ? "border-emerald-500/20 bg-emerald-500/5" : "border-border bg-card/30"
                                )}>
                                    <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">1) Ingest</div>
                                    <div className="mt-2 text-sm font-semibold text-foreground">Excel Imported</div>
                                    <div className="mt-1 text-[11px] text-muted-foreground">
                                        {excelPreview?.fileName ? excelPreview.fileName : "Upload estimator Excel"}
                                    </div>
                                </div>
                                <div className={cn(
                                    "rounded-xl border px-4 py-3",
                                    allScreensValid && !hasOptionPlaceholder ? "border-emerald-500/20 bg-emerald-500/5" : "border-border bg-card/30"
                                )}>
                                    <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">2) Populate</div>
                                    <div className="mt-2 text-sm font-semibold text-foreground">Screens Valid</div>
                                    <div className="mt-1 text-[11px] text-muted-foreground">
                                        {hasOptionPlaceholder ? "OPTION row detected" : `${screenCount} screens`}
                                    </div>
                                </div>
                                <div className={cn(
                                    "rounded-xl border px-4 py-3",
                                    internalAudit ? "border-emerald-500/20 bg-emerald-500/5" : "border-border bg-card/30"
                                )}>
                                    <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">3) Audit</div>
                                    <div className="mt-2 text-sm font-semibold text-foreground">Math Ready</div>
                                    <div className="mt-1 text-[11px] text-muted-foreground">
                                        {internalAudit?.totals?.finalClientTotal ? formatCurrency(Number(internalAudit.totals.finalClientTotal)) : "Compute internal audit"}
                                    </div>
                                </div>
                                <div className={cn(
                                    "rounded-xl border px-4 py-3",
                                    isMirrorReadyToExport ? "border-emerald-500/20 bg-emerald-500/5" : "border-border bg-card/30"
                                )}>
                                    <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">4) Export</div>
                                    <div className="mt-2 text-sm font-semibold text-foreground">Verified</div>
                                    <div className="mt-1 text-[11px] text-muted-foreground">
                                        {reconciliation?.isMatch ? "Totals match Excel" : "Run verification"}
                                    </div>
                                </div>
                            </div>

                            <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-3">
                                <div className={cn(
                                    "rounded-xl border px-4 py-3",
                                    reconciliation?.isMatch ? "border-emerald-500/20 bg-emerald-500/5" : "border-border bg-card/30"
                                )}>
                                    <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Layer 1</div>
                                    <div className="mt-2 text-sm font-semibold text-foreground">Excel ↔ Audit</div>
                                    <div className="mt-1 text-[11px] text-muted-foreground">
                                        {reconciliation?.isMatch ? "Match" : "Not verified"}
                                    </div>
                                </div>
                                <div className={cn(
                                    "rounded-xl border px-4 py-3",
                                    pdfUrl && internalAudit ? "border-emerald-500/20 bg-emerald-500/5" : "border-border bg-card/30"
                                )}>
                                    <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Layer 2</div>
                                    <div className="mt-2 text-sm font-semibold text-foreground">PDF ↔ Internal Audit</div>
                                    <div className="mt-1 text-[11px] text-muted-foreground">
                                        {pdfUrl && internalAudit ? "Ready" : "Generate PDF + Audit"}
                                    </div>
                                </div>
                                <div className={cn(
                                    "rounded-xl border px-4 py-3",
                                    effectiveVerification?.roundingCompliance?.isCompliant ? "border-emerald-500/20 bg-emerald-500/5" : "border-border bg-card/30"
                                )}>
                                    <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Layer 3</div>
                                    <div className="mt-2 text-sm font-semibold text-foreground">Rounding</div>
                                    <div className="mt-1 text-[11px] text-muted-foreground">
                                        {effectiveVerification?.roundingCompliance?.isCompliant ? "Compliant" : "Not checked"}
                                    </div>
                                </div>
                                <div className={cn(
                                    "rounded-xl border px-4 py-3",
                                    (playbackItems?.length ?? 0) > 0 ? "border-emerald-500/20 bg-emerald-500/5" : "border-border bg-card/30"
                                )}>
                                    <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Layer 4</div>
                                    <div className="mt-2 text-sm font-semibold text-foreground">Line‑By‑Line Scan</div>
                                    <div className="mt-1 text-[11px] text-muted-foreground">
                                        {(playbackItems?.length ?? 0) > 0 ? "Available" : "Run verification"}
                                    </div>
                                </div>
                            </div>

                            {!isMirrorReadyToExport && mirrorBlockingIssues.length > 0 && (
                                <div className="mt-4 rounded-xl border border-amber-600/30 dark:border-amber-500/20 bg-amber-50 dark:bg-amber-500/5 px-4 py-3">
                                    <div className="text-[10px] font-bold uppercase tracking-widest text-amber-700 dark:text-amber-200">Blocked Because</div>
                                    <div className="mt-2 flex flex-wrap gap-2">
                                        {mirrorBlockingIssues.slice(0, 6).map((it) => (
                                            <Badge key={it.id} variant="outline" className="text-[10px] border-amber-600/30 dark:border-amber-500/20 text-amber-700 dark:text-amber-200">
                                                {it.label}
                                            </Badge>
                                        ))}
                                    </div>
                                    <div className="mt-3 flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={runVerification}
                                            className={cn(
                                                "px-3 py-2 rounded-xl border text-xs font-bold transition-all",
                                                verificationLoading
                                                    ? "border-border bg-card/40 text-muted-foreground cursor-not-allowed"
                                                    : "border-amber-600/40 bg-amber-500/10 text-amber-700 dark:text-amber-200 hover:bg-amber-500/15"
                                            )}
                                        >
                                            {verificationLoading ? "Verifying…" : <span className="inline-flex items-center gap-2"><RefreshCw className="w-4 h-4" />Run Verification</span>}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-12">
                    {/* Left Column: Summary & Status */}
                    <div className="lg:col-span-1 space-y-6">
                        <Card className="bg-card/50 border-border overflow-hidden relative">
                            {/* 55° Slash Decorative Pattern */}
                            <div className="absolute top-0 right-0 w-32 h-32 opacity-10 pointer-events-none overflow-hidden">
                                <div className="absolute top-0 right-0 w-full h-full transform rotate-[55deg] translate-x-8 -translate-y-8 bg-gradient-to-b from-brand-blue to-transparent" />
                            </div>

                            <CardHeader className="pb-4">
                                <CardTitle className="text-xs font-bold text-muted-foreground uppercase tracking-[0.2em]">Project Status</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <div>
                                    <h3 className="text-lg font-bold text-foreground mb-1 truncate">{proposalName}</h3>
                                    <div className="flex items-center gap-2">
                                        <Badge variant="outline" className="text-[10px] border-border text-muted-foreground font-bold uppercase tracking-widest">
                                            {screenCount} Screens
                                        </Badge>
                                        <Badge className="bg-brand-blue/10 text-brand-blue border-none text-[10px] font-bold uppercase tracking-widest">
                                            {formatCurrency(totalValue)}
                                        </Badge>
                                    </div>
                                </div>

                                <div className="space-y-3 pt-4 border-t border-border/50">
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="text-muted-foreground font-medium">Calculation Mode</span>
                                        <span className="text-foreground font-bold">{mirrorMode ? "Mirror Mode" : "Strategic AI"}</span>
                                    </div>
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="text-muted-foreground font-medium">Data Integrity</span>
                                        {allScreensValid ? (
                                            <span className="text-emerald-500 font-bold flex items-center gap-1">
                                                <CheckCircle2 className="w-3 h-3" /> Verified
                                            </span>
                                        ) : (
                                            <div className="flex flex-col items-end">
                                                <span className="text-amber-500 font-bold flex items-center gap-1">
                                                    <AlertTriangle className="w-3 h-3" /> Issues Found
                                                </span>
                                                <span className="text-[10px] text-amber-500/70">
                                                    Check screen dimensions
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        <div className="p-4 rounded-xl bg-card/30 border border-border flex items-center gap-3">
                            <Clock className="w-4 h-4 text-muted-foreground" />
                            <div className="flex flex-col">
                                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Last Vault Sync</span>
                                <span className="text-xs text-muted-foreground font-medium">{lastSaved ? new Date(lastSaved as any).toLocaleString() : "Pending sync..."}</span>
                            </div>
                        </div>
                    </div>

                    {/* Right Column: Global Export Action */}
                    <div className="lg:col-span-2 space-y-6">
                        <Card className="bg-card/40 border border-border/60 overflow-hidden">
                            <CardHeader className="pb-3">
                                <CardTitle className="text-xs font-bold text-muted-foreground uppercase tracking-[0.2em]">Document Mode</CardTitle>
                                <CardDescription className="text-xs text-muted-foreground">
                                    Select the output mode before generating/exporting PDF.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="pt-0">
                                <div className="grid grid-cols-4 gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setHeaderType("BUDGET")}
                                        className={cn(
                                            "flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors",
                                            headerType === "BUDGET"
                                                ? "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-200"
                                                : "border-border bg-card/40 text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                                        )}
                                    >
                                        <FileText className="w-3.5 h-3.5" />
                                        Budget
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setHeaderType("PROPOSAL")}
                                        className={cn(
                                            "flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors",
                                            headerType === "PROPOSAL"
                                                ? "border-brand-blue/50 bg-brand-blue/10 text-brand-blue"
                                                : "border-border bg-card/40 text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                                        )}
                                    >
                                        <FileCheck className="w-3.5 h-3.5" />
                                        Proposal
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setHeaderType("LOI")}
                                        className={cn(
                                            "flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors",
                                            headerType === "LOI"
                                                ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200"
                                                : "border-border bg-card/40 text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                                        )}
                                    >
                                        <FileSignature className="w-3.5 h-3.5" />
                                        LOI
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setHeaderType("CONTRACT")}
                                        className={cn(
                                            "flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors",
                                            headerType === "CONTRACT"
                                                ? "border-indigo-500/50 bg-indigo-500/10 text-indigo-700 dark:text-indigo-200"
                                                : "border-border bg-card/40 text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                                        )}
                                    >
                                        <Shield className="w-3.5 h-3.5" />
                                        Contract
                                    </button>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Document Config: Master Table + Page Layout */}
                        <Card className="bg-card/40 border border-border/60">
                            <CardContent className="py-3 px-4 space-y-4">
                                {/* Master Table Selector (Mirror Mode only) */}
                                {mirrorMode && pricingTables.length > 0 && (
                                    <div className="flex flex-col gap-1.5">
                                        <Label className="text-xs font-medium text-muted-foreground">Project Grand Total Table</Label>
                                        <Select
                                            value={String(watch("details.masterTableIndex" as any) ?? -1)}
                                            onValueChange={(val) => setValue("details.masterTableIndex" as any, parseInt(val, 10), { shouldDirty: true })}
                                        >
                                            <SelectTrigger className="w-full bg-card border-border text-sm text-foreground">
                                                <SelectValue placeholder="Select master table" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="-1">None (no master table)</SelectItem>
                                                {pricingTables.map((t: any, idx: number) => (
                                                    <SelectItem key={idx} value={String(idx)}>
                                                        {(t?.name || `Table ${idx + 1}`).toString().trim()}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <span className="text-[10px] text-muted-foreground">This table will appear at the top of the document as the Project Summary</span>
                                    </div>
                                )}

                                {/* Page Layout Selector */}
                                <div className="flex flex-col gap-1.5">
                                    <Label className="text-xs font-medium text-muted-foreground">Page Layout</Label>
                                    <Select
                                        value={(watch("details.pageLayout" as any)) || "portrait-letter"}
                                        onValueChange={(val) => setValue("details.pageLayout" as any, val, { shouldDirty: true })}
                                    >
                                        <SelectTrigger className="w-full bg-card border-border text-sm text-foreground">
                                            <SelectValue placeholder="Select page layout" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="portrait-letter">Portrait — Letter</SelectItem>
                                            <SelectItem value="portrait-legal">Portrait — Legal</SelectItem>
                                            <SelectItem value="portrait-a4">Portrait — A4</SelectItem>
                                            <SelectItem value="landscape-letter">Landscape — Letter</SelectItem>
                                            <SelectItem value="landscape-legal">Landscape — Legal</SelectItem>
                                            <SelectItem value="landscape-a4">Landscape — A4</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <span className="text-[10px] text-muted-foreground">
                                        {((watch("details.pageLayout" as any)) || "portrait-letter").startsWith("landscape")
                                            ? "Landscape: pricing sections render two per row"
                                            : "Standard single-column layout"}
                                    </span>
                                </div>
                            </CardContent>
                        </Card>

                        {/* NATALIA GATEKEEPER ADVISORY - Moved to top for visibility */}
                        {isGatekeeperLocked && (
                            <Card className="border-brand-blue/30 bg-brand-blue/5 overflow-hidden animate-in fade-in slide-in-from-top-2">
                                <CardHeader className="py-4 bg-brand-blue/10 border-b border-brand-blue/20">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2 text-brand-blue text-sm font-bold">
                                            <Shield className="w-4 h-4" />
                                            <span>NATALIA GATEKEEPER ACTIVE</span>
                                        </div>
                                        <Badge variant="outline" className="text-[10px] bg-brand-blue/20 border-brand-blue/30 text-brand-blue animate-pulse">
                                            {unverifiedAiFields.length} VERIFICATIONS PENDING
                                        </Badge>
                                    </div>
                                </CardHeader>
                                <CardContent className="p-4 space-y-4">
                                    <div className="flex items-start gap-3">
                                        <AlertTriangle className="w-5 h-5 text-brand-blue/70 shrink-0 mt-0.5" />
                                        <p className="text-xs text-muted-foreground leading-relaxed">
                                            Export capabilities are currently locked. The "Trust but Verify" mandate requires manual confirmation of all AI-generated fields before client release.
                                        </p>
                                    </div>

                                    <div className="grid grid-cols-2 gap-2 pl-8">
                                        {unverifiedAiFields.slice(0, 4).map(field => (
                                            <div key={field} className="flex items-center gap-2 p-2 rounded-lg bg-muted border border-border text-[10px] text-foreground font-medium">
                                                <div className="w-1.5 h-1.5 rounded-full bg-brand-blue animate-pulse" />
                                                {field.split('.').pop()?.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                                            </div>
                                        ))}
                                        {unverifiedAiFields.length > 4 && (
                                            <div className="flex items-center justify-center p-2 rounded-lg bg-card/50 border border-border/50 text-[10px] text-muted-foreground font-bold">
                                                +{unverifiedAiFields.length - 4} MORE
                                            </div>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        )}

                        {/* ─── Edit Document Text — collapsible, collapsed by default ─── */}
                        <Card className="bg-card/40 border border-border/60 overflow-hidden">
                            <CardHeader
                                className="border-b border-border/60 pb-3 cursor-pointer select-none"
                                onClick={() => setIsTextEditOpen(!isTextEditOpen)}
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <CardTitle className="text-sm font-bold text-foreground flex items-center gap-2 min-w-0">
                                        <PenLine className="w-4 h-4 text-brand-blue shrink-0" />
                                        <span className="truncate">Edit Document Text</span>
                                    </CardTitle>
                                    <ChevronDown className={cn(
                                        "w-4 h-4 text-muted-foreground transition-transform shrink-0",
                                        isTextEditOpen && "rotate-180"
                                    )} />
                                </div>
                                <CardDescription className="text-xs text-muted-foreground mt-1">
                                    PDF section toggles, notes, and custom text fields
                                </CardDescription>
                            </CardHeader>
                            {isTextEditOpen && (
                                <CardContent className="p-4 space-y-6">
                                    {/* Document Mode hint */}
                                    <p className="text-xs text-muted-foreground text-center">
                                        PDF sections are controlled by the <span className="text-foreground font-semibold">Document Mode</span> switcher in the toolbar above.
                                        <br />
                                        <span className="text-[10px]">Budget = estimate only • Proposal = formal quote • LOI = binding letter with signatures • Contract = full agreement with T&C</span>
                                    </p>

                                    {/* AI-Generated SOW Toggle - Intelligence Mode only */}
                                    {!mirrorMode && (
                                        <div className="rounded-xl border border-border/60 p-4">
                                            <div className="flex items-start gap-4">
                                                <div className="flex-1 min-w-0">
                                                    <Label htmlFor="showExhibitA" className="text-sm font-semibold text-foreground block mb-1">
                                                        Include AI-Generated Statement of Work
                                                    </Label>
                                                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                                                        Auto-generate Design Services and Construction Logistics sections based on RFP risks
                                                    </p>
                                                </div>
                                                <Switch
                                                    id="showExhibitA"
                                                    checked={watch("details.showExhibitA") || false}
                                                    onCheckedChange={(checked) => setValue("details.showExhibitA", checked)}
                                                    className="data-[state=checked]:bg-brand-blue shrink-0 mt-0.5"
                                                />
                                            </div>
                                            {watch("details.showExhibitA") && (
                                                <div className="mt-3 p-3 rounded-lg bg-brand-blue/5 border border-brand-blue/10">
                                                    <p className="text-[10px] text-brand-blue/80 leading-relaxed">
                                                        AI will scan for <strong>Union</strong>, <strong>Outdoor/IP65</strong>, and <strong>Liquidated Damages</strong> keywords to generate context-aware SOW clauses
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* PDF Section Toggles */}
                                    <Tabs defaultValue="budget" className="w-full">
                                        <TabsList className="grid w-full grid-cols-3">
                                            <TabsTrigger value="budget" className="flex items-center gap-1.5">
                                                <FileSpreadsheet className="w-3.5 h-3.5" />
                                                Budget
                                            </TabsTrigger>
                                            <TabsTrigger value="proposal" className="flex items-center gap-1.5">
                                                <FileText className="w-3.5 h-3.5" />
                                                Proposal
                                            </TabsTrigger>
                                            <TabsTrigger value="loi" className="flex items-center gap-1.5">
                                                <FileCheck className="w-3.5 h-3.5" />
                                                LOI
                                            </TabsTrigger>
                                        </TabsList>

                                        {/* Budget Tab */}
                                        <TabsContent value="budget" className="space-y-1 mt-4">
                                            <div className="flex items-start justify-between py-3 border-b border-border/30 gap-4">
                                                <div className="flex flex-col min-w-0">
                                                    <Label htmlFor="showSpecifications" className="text-sm font-semibold text-foreground block">Technical Specifications</Label>
                                                    <p className="text-[11px] text-muted-foreground leading-relaxed">Include detailed screen specifications</p>
                                                </div>
                                                <Switch id="showSpecifications" checked={watch("details.showSpecifications") ?? true} onCheckedChange={(checked) => setValue("details.showSpecifications", checked)} className="data-[state=checked]:bg-brand-blue shrink-0 mt-0.5" />
                                            </div>
                                            {(watch("details.showSpecifications") ?? true) && (
                                                <div className="flex items-center gap-2 py-2 pl-4 border-b border-border/30">
                                                    <span className="text-[11px] text-muted-foreground mr-1">Display:</span>
                                                    {(["condensed", "extended"] as const).map((mode) => (
                                                        <button
                                                            key={mode}
                                                            type="button"
                                                            onClick={() => setValue("details.specsDisplayMode" as any, mode)}
                                                            className={cn(
                                                                "px-2.5 py-1 rounded text-[11px] font-medium transition-colors",
                                                                (watch("details.specsDisplayMode" as any) || "extended") === mode
                                                                    ? "bg-brand-blue text-white"
                                                                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                                                            )}
                                                        >
                                                            {mode === "condensed" ? "Condensed" : "Extended"}
                                                        </button>
                                                    ))}
                                                    <span className="text-[10px] text-muted-foreground ml-1">
                                                        {(watch("details.specsDisplayMode" as any) || "extended") === "condensed" ? "Name, Dims, Qty" : "All columns"}
                                                    </span>
                                                </div>
                                            )}
                                            <div className="flex items-start justify-between py-3 border-b border-border/30 gap-4">
                                                <div className="flex flex-col min-w-0">
                                                    <Label htmlFor="showPricingTables" className="text-sm font-semibold text-foreground block">Pricing Tables</Label>
                                                    <p className="text-[11px] text-muted-foreground leading-relaxed">Include pricing breakdown in the PDF</p>
                                                </div>
                                                <Switch id="showPricingTables" checked={watch("details.showPricingTables") ?? true} onCheckedChange={(checked) => setValue("details.showPricingTables", checked)} className="data-[state=checked]:bg-brand-blue shrink-0 mt-0.5" />
                                            </div>
                                            <div className="flex items-start justify-between py-3 border-b border-border/30 gap-4">
                                                <div className="flex flex-col min-w-0">
                                                    <Label htmlFor="showNotes" className="text-sm font-semibold text-foreground block">Notes Section</Label>
                                                    <p className="text-[11px] text-muted-foreground leading-relaxed">Include additional notes in the PDF</p>
                                                </div>
                                                <Switch id="showNotes" checked={watch("details.showNotes") ?? true} onCheckedChange={(checked) => setValue("details.showNotes", checked)} className="data-[state=checked]:bg-brand-blue shrink-0 mt-0.5" />
                                            </div>
                                            <div className="flex items-start justify-between py-3 border-b border-border/30 gap-4">
                                                <div className="flex flex-col min-w-0">
                                                    <Label htmlFor="showScopeOfWork-budget" className="text-sm font-semibold text-foreground block">Scope of Work</Label>
                                                    <p className="text-[11px] text-muted-foreground leading-relaxed">Include Scope of Work text (Exhibit B)</p>
                                                </div>
                                                <Switch id="showScopeOfWork-budget" checked={watch("details.showScopeOfWork") || false} onCheckedChange={(checked) => setValue("details.showScopeOfWork", checked)} className="data-[state=checked]:bg-brand-blue shrink-0 mt-0.5" />
                                            </div>
                                            <div className="flex flex-col gap-2 py-3">
                                                <div className="flex items-start justify-between gap-4">
                                                    <div className="flex flex-col min-w-0">
                                                        <Label htmlFor="showRespMatrix-budget" className={cn("text-sm font-semibold block", hasRespMatrixData ? "text-foreground" : "text-muted-foreground")}>Responsibility Matrix</Label>
                                                        <p className="text-[11px] text-muted-foreground leading-relaxed">
                                                            {hasRespMatrixData ? "Include responsibility matrix table" : "No responsibility matrix found in imported file"}
                                                        </p>
                                                    </div>
                                                    <Switch id="showRespMatrix-budget" disabled={!hasRespMatrixData} checked={hasRespMatrixData ? (watch("details.showResponsibilityMatrix" as any) ?? true) : false} onCheckedChange={(checked) => setValue("details.showResponsibilityMatrix" as any, checked)} className="data-[state=checked]:bg-brand-blue shrink-0 mt-0.5" />
                                                </div>
                                                {hasRespMatrixData && (watch("details.showResponsibilityMatrix" as any) ?? true) && (
                                                    <div className="flex items-center gap-2 pl-1">
                                                        <span className="text-[11px] text-muted-foreground">Format:</span>
                                                        <Select value={watch("details.respMatrixFormatOverride" as any) || "auto"} onValueChange={(val) => setValue("details.respMatrixFormatOverride" as any, val, { shouldDirty: true })}>
                                                            <SelectTrigger className="h-7 w-[130px] text-[11px]"><SelectValue /></SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="auto">Auto-detect</SelectItem>
                                                                <SelectItem value="short">Short (paragraphs)</SelectItem>
                                                                <SelectItem value="long">Long (table)</SelectItem>
                                                                <SelectItem value="hybrid">Hybrid (mixed)</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                )}
                                            </div>
                                        </TabsContent>

                                        {/* Proposal Tab */}
                                        <TabsContent value="proposal" className="space-y-1 mt-4">
                                            <div className="flex items-center justify-between py-3 border-b border-border/30">
                                                <div className="flex flex-col">
                                                    <Label htmlFor="showSpecifications-proposal" className="text-sm font-semibold text-foreground">Technical Specifications</Label>
                                                    <p className="text-[11px] text-muted-foreground">Include detailed screen specifications</p>
                                                </div>
                                                <Switch id="showSpecifications-proposal" checked={watch("details.showSpecifications") ?? true} onCheckedChange={(checked) => setValue("details.showSpecifications", checked)} className="data-[state=checked]:bg-brand-blue" />
                                            </div>
                                            {(watch("details.showSpecifications") ?? true) && (
                                                <div className="flex items-center gap-2 py-2 pl-4 border-b border-border/30">
                                                    <span className="text-[11px] text-muted-foreground mr-1">Display:</span>
                                                    {(["condensed", "extended"] as const).map((mode) => (
                                                        <button
                                                            key={mode}
                                                            type="button"
                                                            onClick={() => setValue("details.specsDisplayMode" as any, mode)}
                                                            className={cn(
                                                                "px-2.5 py-1 rounded text-[11px] font-medium transition-colors",
                                                                (watch("details.specsDisplayMode" as any) || "extended") === mode
                                                                    ? "bg-brand-blue text-white"
                                                                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                                                            )}
                                                        >
                                                            {mode === "condensed" ? "Condensed" : "Extended"}
                                                        </button>
                                                    ))}
                                                    <span className="text-[10px] text-muted-foreground ml-1">
                                                        {(watch("details.specsDisplayMode" as any) || "extended") === "condensed" ? "Name, Dims, Qty" : "All columns"}
                                                    </span>
                                                </div>
                                            )}
                                            <div className="flex items-center justify-between py-3 border-b border-border/30">
                                                <div className="flex flex-col">
                                                    <Label htmlFor="showPricingTables-proposal" className="text-sm font-semibold text-foreground">Pricing Tables</Label>
                                                    <p className="text-[11px] text-muted-foreground">Include pricing breakdown in the PDF</p>
                                                </div>
                                                <Switch id="showPricingTables-proposal" checked={watch("details.showPricingTables") ?? true} onCheckedChange={(checked) => setValue("details.showPricingTables", checked)} className="data-[state=checked]:bg-brand-blue" />
                                            </div>
                                            <div className="flex items-center justify-between py-3 border-b border-border/30">
                                                <div className="flex flex-col">
                                                    <Label htmlFor="showPaymentTerms-proposal" className="text-sm font-semibold text-foreground">Payment Terms</Label>
                                                    <p className="text-[11px] text-muted-foreground">Include payment terms section</p>
                                                </div>
                                                <Switch id="showPaymentTerms-proposal" checked={watch("details.showPaymentTerms") ?? true} onCheckedChange={(checked) => setValue("details.showPaymentTerms", checked)} className="data-[state=checked]:bg-brand-blue" />
                                            </div>
                                            <div className="flex items-center justify-between py-3 border-b border-border/30">
                                                <div className="flex flex-col">
                                                    <Label htmlFor="showNotes-proposal" className="text-sm font-semibold text-foreground">Notes Section</Label>
                                                    <p className="text-[11px] text-muted-foreground">Include additional notes in the PDF</p>
                                                </div>
                                                <Switch id="showNotes-proposal" checked={watch("details.showNotes") ?? true} onCheckedChange={(checked) => setValue("details.showNotes", checked)} className="data-[state=checked]:bg-brand-blue" />
                                            </div>
                                            <div className="flex items-center justify-between py-3 border-b border-border/30">
                                                <div className="flex flex-col">
                                                    <Label htmlFor="showScopeOfWork-proposal" className="text-sm font-semibold text-foreground">Scope of Work</Label>
                                                    <p className="text-[11px] text-muted-foreground">Include Scope of Work text (Exhibit B)</p>
                                                </div>
                                                <Switch id="showScopeOfWork-proposal" checked={watch("details.showScopeOfWork") || false} onCheckedChange={(checked) => setValue("details.showScopeOfWork", checked)} className="data-[state=checked]:bg-brand-blue" />
                                            </div>
                                            <div className="flex flex-col gap-2 py-3">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex flex-col">
                                                        <Label htmlFor="showRespMatrix-proposal" className={cn("text-sm font-semibold", hasRespMatrixData ? "text-foreground" : "text-muted-foreground")}>Responsibility Matrix</Label>
                                                        <p className="text-[11px] text-muted-foreground">
                                                            {hasRespMatrixData ? "Include responsibility matrix table" : "No responsibility matrix found in imported file"}
                                                        </p>
                                                    </div>
                                                    <Switch id="showRespMatrix-proposal" disabled={!hasRespMatrixData} checked={hasRespMatrixData ? (watch("details.showResponsibilityMatrix" as any) ?? true) : false} onCheckedChange={(checked) => setValue("details.showResponsibilityMatrix" as any, checked)} className="data-[state=checked]:bg-brand-blue" />
                                                </div>
                                                {hasRespMatrixData && (watch("details.showResponsibilityMatrix" as any) ?? true) && (
                                                    <div className="flex items-center gap-2 pl-1">
                                                        <span className="text-[11px] text-muted-foreground">Format:</span>
                                                        <Select value={watch("details.respMatrixFormatOverride" as any) || "auto"} onValueChange={(val) => setValue("details.respMatrixFormatOverride" as any, val, { shouldDirty: true })}>
                                                            <SelectTrigger className="h-7 w-[130px] text-[11px]"><SelectValue /></SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="auto">Auto-detect</SelectItem>
                                                                <SelectItem value="short">Short (paragraphs)</SelectItem>
                                                                <SelectItem value="long">Long (table)</SelectItem>
                                                                <SelectItem value="hybrid">Hybrid (mixed)</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                )}
                                            </div>
                                        </TabsContent>

                                        {/* LOI Tab */}
                                        <TabsContent value="loi" className="space-y-1 mt-4">
                                            <div className="flex items-center justify-between py-3 border-b border-border/30">
                                                <div className="flex flex-col">
                                                    <Label htmlFor="showSpecifications-loi" className="text-sm font-semibold text-foreground">Technical Specifications</Label>
                                                    <p className="text-[11px] text-muted-foreground">Include detailed screen specifications</p>
                                                </div>
                                                <Switch id="showSpecifications-loi" checked={watch("details.showSpecifications") ?? true} onCheckedChange={(checked) => setValue("details.showSpecifications", checked)} className="data-[state=checked]:bg-brand-blue" />
                                            </div>
                                            {(watch("details.showSpecifications") ?? true) && (
                                                <div className="flex items-center gap-2 py-2 pl-4 border-b border-border/30">
                                                    <span className="text-[11px] text-muted-foreground mr-1">Display:</span>
                                                    {(["condensed", "extended"] as const).map((mode) => (
                                                        <button
                                                            key={mode}
                                                            type="button"
                                                            onClick={() => setValue("details.specsDisplayMode" as any, mode)}
                                                            className={cn(
                                                                "px-2.5 py-1 rounded text-[11px] font-medium transition-colors",
                                                                (watch("details.specsDisplayMode" as any) || "extended") === mode
                                                                    ? "bg-brand-blue text-white"
                                                                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                                                            )}
                                                        >
                                                            {mode === "condensed" ? "Condensed" : "Extended"}
                                                        </button>
                                                    ))}
                                                    <span className="text-[10px] text-muted-foreground ml-1">
                                                        {(watch("details.specsDisplayMode" as any) || "extended") === "condensed" ? "Name, Dims, Qty" : "All columns"}
                                                    </span>
                                                </div>
                                            )}
                                            <div className="flex items-center justify-between py-3 border-b border-border/30">
                                                <div className="flex flex-col">
                                                    <Label htmlFor="showPricingTables-loi" className="text-sm font-semibold text-foreground">Pricing Tables</Label>
                                                    <p className="text-[11px] text-muted-foreground">Include pricing breakdown in the PDF</p>
                                                </div>
                                                <Switch id="showPricingTables-loi" checked={watch("details.showPricingTables") ?? true} onCheckedChange={(checked) => setValue("details.showPricingTables", checked)} className="data-[state=checked]:bg-brand-blue" />
                                            </div>
                                            <div className="flex items-center justify-between py-3 border-b border-border/30">
                                                <div className="flex flex-col">
                                                    <Label htmlFor="showPaymentTerms-loi" className="text-sm font-semibold text-foreground">Payment Terms</Label>
                                                    <p className="text-[11px] text-muted-foreground">Include payment terms section</p>
                                                </div>
                                                <Switch id="showPaymentTerms-loi" checked={watch("details.showPaymentTerms") ?? true} onCheckedChange={(checked) => setValue("details.showPaymentTerms", checked)} className="data-[state=checked]:bg-brand-blue" />
                                            </div>
                                            <div className="flex items-center justify-between py-3 border-b border-border/30">
                                                <div className="flex flex-col">
                                                    <Label htmlFor="showSignatureBlock" className="text-sm font-semibold text-foreground">Signature Lines</Label>
                                                    <p className="text-[11px] text-muted-foreground">Include signature block for both parties</p>
                                                </div>
                                                <Switch id="showSignatureBlock" checked={watch("details.showSignatureBlock") ?? true} onCheckedChange={(checked) => setValue("details.showSignatureBlock", checked)} className="data-[state=checked]:bg-brand-blue" />
                                            </div>
                                            <div className="flex items-center justify-between py-3 border-b border-border/30">
                                                <div className="flex flex-col">
                                                    <Label htmlFor="showScopeOfWork" className="text-sm font-semibold text-foreground">Scope of Work</Label>
                                                    <p className="text-[11px] text-muted-foreground">Include custom Scope of Work text (Exhibit B)</p>
                                                </div>
                                                <Switch id="showScopeOfWork" checked={watch("details.showScopeOfWork") || false} onCheckedChange={(checked) => setValue("details.showScopeOfWork", checked)} className="data-[state=checked]:bg-brand-blue" />
                                            </div>
                                            <div className="flex flex-col gap-2 py-3 border-b border-border/30">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex flex-col">
                                                        <Label htmlFor="showRespMatrix-loi" className={cn("text-sm font-semibold", hasRespMatrixData ? "text-foreground" : "text-muted-foreground")}>Responsibility Matrix</Label>
                                                        <p className="text-[11px] text-muted-foreground">
                                                            {hasRespMatrixData ? "Include responsibility matrix table" : "No responsibility matrix found in imported file"}
                                                        </p>
                                                    </div>
                                                    <Switch id="showRespMatrix-loi" disabled={!hasRespMatrixData} checked={hasRespMatrixData ? (watch("details.showResponsibilityMatrix" as any) ?? true) : false} onCheckedChange={(checked) => setValue("details.showResponsibilityMatrix" as any, checked)} className="data-[state=checked]:bg-brand-blue" />
                                                </div>
                                                {hasRespMatrixData && (watch("details.showResponsibilityMatrix" as any) ?? true) && (
                                                    <div className="flex items-center gap-2 pl-1">
                                                        <span className="text-[11px] text-muted-foreground">Format:</span>
                                                        <Select value={watch("details.respMatrixFormatOverride" as any) || "auto"} onValueChange={(val) => setValue("details.respMatrixFormatOverride" as any, val, { shouldDirty: true })}>
                                                            <SelectTrigger className="h-7 w-[130px] text-[11px]"><SelectValue /></SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="auto">Auto-detect</SelectItem>
                                                                <SelectItem value="short">Short (paragraphs)</SelectItem>
                                                                <SelectItem value="long">Long (table)</SelectItem>
                                                                <SelectItem value="hybrid">Hybrid (mixed)</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex items-center justify-between py-3 border-b border-border/30">
                                                <div className="flex flex-col">
                                                    <Label htmlFor="showNotes-loi" className="text-sm font-semibold text-foreground">Notes Section</Label>
                                                    <p className="text-[11px] text-muted-foreground">Include additional notes in the PDF</p>
                                                </div>
                                                <Switch id="showNotes-loi" checked={watch("details.showNotes") ?? true} onCheckedChange={(checked) => setValue("details.showNotes", checked)} className="data-[state=checked]:bg-brand-blue" />
                                            </div>
                                            {/* T&C Exhibit toggle — CONTRACT mode only */}
                                            {headerType === "CONTRACT" && (
                                                <div className="flex items-center justify-between py-3">
                                                    <div className="flex flex-col">
                                                        <Label htmlFor="showTermsAndConditions" className="text-sm font-semibold text-foreground">Terms &amp; Conditions</Label>
                                                        <p className="text-[11px] text-muted-foreground">Include T&amp;C exhibit page (Exhibit C)</p>
                                                    </div>
                                                    <Switch id="showTermsAndConditions" checked={watch("details.showTermsAndConditions" as any) ?? true} onCheckedChange={(checked) => setValue("details.showTermsAndConditions" as any, checked, { shouldDirty: true })} className="data-[state=checked]:bg-brand-blue" />
                                                </div>
                                            )}
                                        </TabsContent>
                                    </Tabs>

                                    {/* Text Editor Panel */}
                                    <TextEditorPanel />
                                </CardContent>
                            )}
                        </Card>

                        <Card className="bg-card/40 border border-border/60 overflow-hidden">
                            <CardHeader
                                className="border-b border-border/60 pb-3 cursor-pointer select-none"
                                onClick={() => setIsVisualBuilderOpen(!isVisualBuilderOpen)}
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <CardTitle className="text-sm font-bold text-foreground">Template Visual Builder (V1)</CardTitle>
                                    <ChevronDown className={cn(
                                        "w-4 h-4 text-muted-foreground transition-transform shrink-0",
                                        isVisualBuilderOpen && "rotate-180"
                                    )} />
                                </div>
                                <CardDescription className="text-xs text-muted-foreground">
                                    Live PDF layout controls for spacing, accent color, and slash styling (applies to both Puppeteer + jsreport exports)
                                </CardDescription>
                            </CardHeader>
                            {isVisualBuilderOpen && (
                            <CardContent className="p-4 space-y-4">
                                <div className="flex items-center justify-between gap-2">
                                    <div className="text-[11px] text-muted-foreground">
                                        History: {Math.max(builderHistoryIndex + 1, 0)}/{builderHistory.length}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={undoVisualBuilder}
                                            disabled={builderHistoryIndex <= 0}
                                            className="px-2 py-1 rounded border border-border text-[11px] hover:bg-muted/60 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            Undo
                                        </button>
                                        <button
                                            type="button"
                                            onClick={redoVisualBuilder}
                                            disabled={builderHistoryIndex < 0 || builderHistoryIndex >= builderHistory.length - 1}
                                            className="px-2 py-1 rounded border border-border text-[11px] hover:bg-muted/60 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            Redo
                                        </button>
                                    </div>
                                </div>
                                <div className="rounded-lg border border-border/50 p-3">
                                    <div className="text-xs font-semibold text-foreground mb-2">Density Preset</div>
                                    <div className="flex flex-wrap gap-2">
                                        {[
                                            { key: "compact", label: "Compact" },
                                            { key: "balanced", label: "Balanced" },
                                            { key: "airy", label: "Airy" },
                                        ].map((preset) => (
                                            <button
                                                key={preset.key}
                                                type="button"
                                                onClick={() => applyDensityPreset(preset.key as "compact" | "balanced" | "airy")}
                                                className={cn(
                                                    "px-2.5 py-1.5 rounded text-xs font-semibold border transition-colors",
                                                    (templateConfig?.densityPreset || "balanced") === preset.key
                                                        ? "bg-brand-blue text-white border-brand-blue"
                                                        : "bg-background text-foreground border-border hover:bg-muted/60"
                                                )}
                                            >
                                                {preset.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div className="rounded-lg border border-border/50 p-3 space-y-2">
                                    <div className="text-xs font-semibold text-foreground">Saved Style Presets</div>
                                    <div className="flex items-center gap-2">
                                        <select
                                            value={selectedStylePresetKey}
                                            onChange={(e) => setSelectedStylePresetKey(e.target.value)}
                                            className="h-8 flex-1 rounded border border-border bg-background px-2 text-xs"
                                        >
                                            <option value="">Select preset</option>
                                            {stylePresetOptions.map((preset) => (
                                                <option key={preset.key} value={preset.key}>{preset.label}</option>
                                            ))}
                                        </select>
                                        <button
                                            type="button"
                                            onClick={() => applyStylePreset(selectedStylePresetKey)}
                                            disabled={!selectedStylePresetKey}
                                            className="h-8 px-2 rounded border border-border text-xs font-semibold hover:bg-muted/60 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            Apply
                                        </button>
                                        <button
                                            type="button"
                                            onClick={deleteSelectedPreset}
                                            disabled={!selectedStylePresetKey.startsWith("user:")}
                                            className="h-8 px-2 rounded border border-border text-xs font-semibold hover:bg-muted/60 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            Delete
                                        </button>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="text"
                                            value={newPresetName}
                                            onChange={(e) => setNewPresetName(e.target.value)}
                                            placeholder="Preset name"
                                            className="h-8 flex-1 rounded border border-border bg-background px-2 text-xs"
                                        />
                                        <button
                                            type="button"
                                            onClick={saveCurrentAsPreset}
                                            disabled={!newPresetName.trim()}
                                            className="h-8 px-2 rounded border border-border text-xs font-semibold hover:bg-muted/60 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            Save Current
                                        </button>
                                    </div>
                                </div>
                                {pricingSplitRisk && (
                                    <div className={cn(
                                        "rounded-lg border p-3 space-y-2",
                                        pricingSplitRisk.atRisk ? "border-amber-500/40 bg-amber-500/10" : "border-emerald-500/30 bg-emerald-500/10"
                                    )}>
                                        <div className="text-xs font-semibold text-foreground">
                                            Table Split Risk: {pricingSplitRisk.atRisk ? "At Risk" : "Stable"}
                                        </div>
                                        <div className="text-[11px] text-muted-foreground">
                                            Largest table: <span className="font-semibold text-foreground">{pricingSplitRisk.name}</span> ({pricingSplitRisk.estimatedRows} estimated rows, threshold {pricingSplitRisk.threshold})
                                        </div>
                                        <div className="flex items-center justify-between gap-4">
                                            <div className="flex flex-col">
                                                <Label htmlFor="autoPushLargeTables" className="text-xs font-semibold text-foreground">Auto-push large pricing tables to next page</Label>
                                                <p className="text-[10px] text-muted-foreground">Adds a page break before pricing when risk exceeds threshold.</p>
                                            </div>
                                            <Switch
                                                id="autoPushLargeTables"
                                                checked={Boolean(templateConfig?.autoPushLargeTables ?? visualDefaults.autoPushLargeTables)}
                                                onCheckedChange={(checked) => setTemplateConfigValue("details.templateConfig.autoPushLargeTables", checked)}
                                                className="data-[state=checked]:bg-brand-blue"
                                            />
                                        </div>
                                        <label className="text-xs font-medium text-foreground">
                                            <span className="flex items-center justify-between">
                                                <span>Split Threshold: {Number(templateConfig?.tableSplitThreshold ?? visualDefaults.tableSplitThreshold)} rows</span>
                                                <button type="button" onClick={() => setTemplateConfigValue("details.templateConfig.tableSplitThreshold", visualDefaults.tableSplitThreshold)} className="text-[10px] px-1.5 py-0.5 rounded border border-border hover:bg-muted/60 transition-colors">Reset</button>
                                            </span>
                                            <input
                                                type="range"
                                                min={10}
                                                max={26}
                                                value={Number(templateConfig?.tableSplitThreshold ?? visualDefaults.tableSplitThreshold)}
                                                onChange={(e) => setTemplateConfigValue("details.templateConfig.tableSplitThreshold", Number(e.target.value))}
                                                className="w-full mt-1 accent-[#0A52EF]"
                                            />
                                        </label>
                                    </div>
                                )}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <label id="template-control-content-padding" className="text-xs font-medium text-foreground">
                                        <span className="flex items-center justify-between">
                                            <span>Content Padding: {Number(templateConfig?.contentPaddingX ?? visualDefaults.contentPaddingX)}px</span>
                                            <button type="button" onClick={() => setTemplateConfigValue("details.templateConfig.contentPaddingX", visualDefaults.contentPaddingX)} className="text-[10px] px-1.5 py-0.5 rounded border border-border hover:bg-muted/60 transition-colors">Reset</button>
                                        </span>
                                        <input
                                            type="range"
                                            min={12}
                                            max={48}
                                            value={Number(templateConfig?.contentPaddingX ?? visualDefaults.contentPaddingX)}
                                            onChange={(e) => setTemplateConfigValue("details.templateConfig.contentPaddingX", Number(e.target.value))}
                                            className="w-full mt-1 accent-[#0A52EF]"
                                        />
                                    </label>
                                    <label id="template-control-header-to-intro-gap" className="text-xs font-medium text-foreground">
                                        <span className="flex items-center justify-between">
                                            <span>Header to Intro Gap: {Number(templateConfig?.headerToIntroGap ?? visualDefaults.headerToIntroGap)}px</span>
                                            <button type="button" onClick={() => setTemplateConfigValue("details.templateConfig.headerToIntroGap", visualDefaults.headerToIntroGap)} className="text-[10px] px-1.5 py-0.5 rounded border border-border hover:bg-muted/60 transition-colors">Reset</button>
                                        </span>
                                        <input
                                            type="range"
                                            min={4}
                                            max={64}
                                            value={Number(templateConfig?.headerToIntroGap ?? visualDefaults.headerToIntroGap)}
                                            onChange={(e) => setTemplateConfigValue("details.templateConfig.headerToIntroGap", Number(e.target.value))}
                                            className="w-full mt-1 accent-[#0A52EF]"
                                        />
                                    </label>
                                    <label id="template-control-intro-to-body-gap" className="text-xs font-medium text-foreground">
                                        <span className="flex items-center justify-between">
                                            <span>Intro to Body Gap: {Number(templateConfig?.introToBodyGap ?? visualDefaults.introToBodyGap)}px</span>
                                            <button type="button" onClick={() => setTemplateConfigValue("details.templateConfig.introToBodyGap", visualDefaults.introToBodyGap)} className="text-[10px] px-1.5 py-0.5 rounded border border-border hover:bg-muted/60 transition-colors">Reset</button>
                                        </span>
                                        <input
                                            type="range"
                                            min={4}
                                            max={72}
                                            value={Number(templateConfig?.introToBodyGap ?? visualDefaults.introToBodyGap)}
                                            onChange={(e) => setTemplateConfigValue("details.templateConfig.introToBodyGap", Number(e.target.value))}
                                            className="w-full mt-1 accent-[#0A52EF]"
                                        />
                                    </label>
                                    <label id="template-control-section-spacing" className="text-xs font-medium text-foreground">
                                        <span className="flex items-center justify-between">
                                            <span>Section Spacing: {Number(templateConfig?.sectionSpacing ?? visualDefaults.sectionSpacing)}px</span>
                                            <button type="button" onClick={() => setTemplateConfigValue("details.templateConfig.sectionSpacing", visualDefaults.sectionSpacing)} className="text-[10px] px-1.5 py-0.5 rounded border border-border hover:bg-muted/60 transition-colors">Reset</button>
                                        </span>
                                        <input
                                            type="range"
                                            min={6}
                                            max={36}
                                            value={Number(templateConfig?.sectionSpacing ?? visualDefaults.sectionSpacing)}
                                            onChange={(e) => setTemplateConfigValue("details.templateConfig.sectionSpacing", Number(e.target.value))}
                                            className="w-full mt-1 accent-[#0A52EF]"
                                        />
                                    </label>
                                    <label id="template-control-pricing-box-gap" className="text-xs font-medium text-foreground">
                                        <span className="flex items-center justify-between">
                                            <span>Pricing Box Gap: {Number(templateConfig?.pricingTableGap ?? visualDefaults.pricingTableGap)}px</span>
                                            <button type="button" onClick={() => setTemplateConfigValue("details.templateConfig.pricingTableGap", visualDefaults.pricingTableGap)} className="text-[10px] px-1.5 py-0.5 rounded border border-border hover:bg-muted/60 transition-colors">Reset</button>
                                        </span>
                                        <input
                                            type="range"
                                            min={6}
                                            max={36}
                                            value={Number(templateConfig?.pricingTableGap ?? visualDefaults.pricingTableGap)}
                                            onChange={(e) => setTemplateConfigValue("details.templateConfig.pricingTableGap", Number(e.target.value))}
                                            className="w-full mt-1 accent-[#0A52EF]"
                                        />
                                    </label>
                                    <label id="template-control-table-row-height" className="text-xs font-medium text-foreground">
                                        <span className="flex items-center justify-between">
                                            <span>Table Row Height: {Number(templateConfig?.tableRowHeight ?? visualDefaults.tableRowHeight)}px</span>
                                            <button type="button" onClick={() => setTemplateConfigValue("details.templateConfig.tableRowHeight", visualDefaults.tableRowHeight)} className="text-[10px] px-1.5 py-0.5 rounded border border-border hover:bg-muted/60 transition-colors">Reset</button>
                                        </span>
                                        <input
                                            type="range"
                                            min={20}
                                            max={40}
                                            value={Number(templateConfig?.tableRowHeight ?? visualDefaults.tableRowHeight)}
                                            onChange={(e) => setTemplateConfigValue("details.templateConfig.tableRowHeight", Number(e.target.value))}
                                            className="w-full mt-1 accent-[#0A52EF]"
                                        />
                                    </label>
                                    <label id="template-control-font-size" className="text-xs font-medium text-foreground">
                                        <span className="flex items-center justify-between">
                                            <span>Font Size: {Number(templateConfig?.fontSizePt ?? visualDefaults.fontSizePt)}pt</span>
                                            <button type="button" onClick={() => setTemplateConfigValue("details.templateConfig.fontSizePt", visualDefaults.fontSizePt)} className="text-[10px] px-1.5 py-0.5 rounded border border-border hover:bg-muted/60 transition-colors">Reset</button>
                                        </span>
                                        <input
                                            type="range"
                                            min={8}
                                            max={18}
                                            value={Number(templateConfig?.fontSizePt ?? visualDefaults.fontSizePt)}
                                            onChange={(e) => setTemplateConfigValue("details.templateConfig.fontSizePt", Number(e.target.value))}
                                            className="w-full mt-1 accent-[#0A52EF]"
                                        />
                                    </label>
                                    <label id="template-control-exhibit-a-title-gap" className="text-xs font-medium text-foreground">
                                        <span className="flex items-center justify-between">
                                            <span>Exhibit A Title Gap: {Number(templateConfig?.exhibitAHeaderGap ?? visualDefaults.exhibitAHeaderGap)}px</span>
                                            <button type="button" onClick={() => setTemplateConfigValue("details.templateConfig.exhibitAHeaderGap", visualDefaults.exhibitAHeaderGap)} className="text-[10px] px-1.5 py-0.5 rounded border border-border hover:bg-muted/60 transition-colors">Reset</button>
                                        </span>
                                        <input
                                            type="range"
                                            min={8}
                                            max={72}
                                            value={Number(templateConfig?.exhibitAHeaderGap ?? visualDefaults.exhibitAHeaderGap)}
                                            onChange={(e) => setTemplateConfigValue("details.templateConfig.exhibitAHeaderGap", Number(e.target.value))}
                                            className="w-full mt-1 accent-[#0A52EF]"
                                        />
                                    </label>
                                    <label className="text-xs font-medium text-foreground">
                                        <span className="flex items-center justify-between">
                                            <span>Accent Color</span>
                                            <button type="button" onClick={() => setTemplateConfigValue("details.templateConfig.accentColor", visualDefaults.accentColor)} className="text-[10px] px-1.5 py-0.5 rounded border border-border hover:bg-muted/60 transition-colors">Reset</button>
                                        </span>
                                        <div className="mt-1 flex items-center gap-2">
                                            <input
                                                type="color"
                                                value={(templateConfig?.accentColor || visualDefaults.accentColor).toString()}
                                                onChange={(e) => setTemplateConfigValue("details.templateConfig.accentColor", e.target.value)}
                                                className="h-8 w-12 rounded border border-border bg-transparent"
                                            />
                                            <input
                                                type="text"
                                                value={(templateConfig?.accentColor || visualDefaults.accentColor).toString()}
                                                onChange={(e) => setTemplateConfigValue("details.templateConfig.accentColor", e.target.value)}
                                                className="h-8 flex-1 rounded border border-border bg-background px-2 text-xs"
                                            />
                                        </div>
                                    </label>
                                </div>

                                <div className="pt-3 border-t border-border/40">
                                    <div className="text-xs font-semibold text-foreground mb-2">Header Slashes</div>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <label className="text-xs font-medium text-foreground">
                                            <span className="flex items-center justify-between">
                                                <span>Width: {Number(templateConfig?.slash?.width ?? visualDefaults.slash.width)}px</span>
                                                <button type="button" onClick={() => setTemplateConfigValue("details.templateConfig.slash.width", visualDefaults.slash.width)} className="text-[10px] px-1.5 py-0.5 rounded border border-border hover:bg-muted/60 transition-colors">Reset</button>
                                            </span>
                                            <input type="range" min={32} max={140} value={Number(templateConfig?.slash?.width ?? visualDefaults.slash.width)} onChange={(e) => setTemplateConfigValue("details.templateConfig.slash.width", Number(e.target.value))} className="w-full mt-1 accent-[#0A52EF]" />
                                        </label>
                                        <label className="text-xs font-medium text-foreground">
                                            <span className="flex items-center justify-between">
                                                <span>Height: {Number(templateConfig?.slash?.height ?? visualDefaults.slash.height)}px</span>
                                                <button type="button" onClick={() => setTemplateConfigValue("details.templateConfig.slash.height", visualDefaults.slash.height)} className="text-[10px] px-1.5 py-0.5 rounded border border-border hover:bg-muted/60 transition-colors">Reset</button>
                                            </span>
                                            <input type="range" min={40} max={160} value={Number(templateConfig?.slash?.height ?? visualDefaults.slash.height)} onChange={(e) => setTemplateConfigValue("details.templateConfig.slash.height", Number(e.target.value))} className="w-full mt-1 accent-[#0A52EF]" />
                                        </label>
                                        <label className="text-xs font-medium text-foreground">
                                            <span className="flex items-center justify-between">
                                                <span>Count: {Number(templateConfig?.slash?.count ?? visualDefaults.slash.count)}</span>
                                                <button type="button" onClick={() => setTemplateConfigValue("details.templateConfig.slash.count", visualDefaults.slash.count)} className="text-[10px] px-1.5 py-0.5 rounded border border-border hover:bg-muted/60 transition-colors">Reset</button>
                                            </span>
                                            <input type="range" min={2} max={10} value={Number(templateConfig?.slash?.count ?? visualDefaults.slash.count)} onChange={(e) => setTemplateConfigValue("details.templateConfig.slash.count", Number(e.target.value))} className="w-full mt-1 accent-[#0A52EF]" />
                                        </label>
                                        <label className="text-xs font-medium text-foreground">
                                            <span className="flex items-center justify-between">
                                                <span>Opacity: {Number(templateConfig?.slash?.opacity ?? visualDefaults.slash.opacity).toFixed(2)}</span>
                                                <button type="button" onClick={() => setTemplateConfigValue("details.templateConfig.slash.opacity", visualDefaults.slash.opacity)} className="text-[10px] px-1.5 py-0.5 rounded border border-border hover:bg-muted/60 transition-colors">Reset</button>
                                            </span>
                                            <input type="range" min={0.03} max={0.25} step={0.01} value={Number(templateConfig?.slash?.opacity ?? visualDefaults.slash.opacity)} onChange={(e) => setTemplateConfigValue("details.templateConfig.slash.opacity", Number(e.target.value))} className="w-full mt-1 accent-[#0A52EF]" />
                                        </label>
                                        <label className="text-xs font-medium text-foreground">
                                            <span className="flex items-center justify-between">
                                                <span>Top Offset: {Number(templateConfig?.slash?.top ?? visualDefaults.slash.top)}px</span>
                                                <button type="button" onClick={() => setTemplateConfigValue("details.templateConfig.slash.top", visualDefaults.slash.top)} className="text-[10px] px-1.5 py-0.5 rounded border border-border hover:bg-muted/60 transition-colors">Reset</button>
                                            </span>
                                            <input type="range" min={0} max={20} value={Number(templateConfig?.slash?.top ?? visualDefaults.slash.top)} onChange={(e) => setTemplateConfigValue("details.templateConfig.slash.top", Number(e.target.value))} className="w-full mt-1 accent-[#0A52EF]" />
                                        </label>
                                        <label className="text-xs font-medium text-foreground">
                                            <span className="flex items-center justify-between">
                                                <span>Right Offset: {Number(templateConfig?.slash?.right ?? visualDefaults.slash.right)}px</span>
                                                <button type="button" onClick={() => setTemplateConfigValue("details.templateConfig.slash.right", visualDefaults.slash.right)} className="text-[10px] px-1.5 py-0.5 rounded border border-border hover:bg-muted/60 transition-colors">Reset</button>
                                            </span>
                                            <input type="range" min={0} max={20} value={Number(templateConfig?.slash?.right ?? visualDefaults.slash.right)} onChange={(e) => setTemplateConfigValue("details.templateConfig.slash.right", Number(e.target.value))} className="w-full mt-1 accent-[#0A52EF]" />
                                        </label>
                                    </div>
                                </div>

                                <div className="pt-2 flex justify-end">
                                    <button
                                        type="button"
                                        onClick={() => applyVisualSnapshot(visualDefaults)}
                                        className="px-3 py-2 rounded-lg border border-border text-xs font-semibold text-foreground hover:bg-muted/60 transition-colors"
                                    >
                                        Reset Natalia Defaults
                                    </button>
                                </div>
                            </CardContent>
                            )}
                        </Card>

                        {/* ─── Spacer between text editing and export ─── */}
                        <div className="h-2" />

                        {!mirrorMode && (
                            <Card className="bg-card/40 border border-border/60 overflow-hidden">
                                <CardHeader
                                    className="border-b border-border/60 pb-3 cursor-pointer select-none"
                                    onClick={() => setIsScheduleOpen(!isScheduleOpen)}
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <CardTitle className="text-sm font-bold text-foreground flex items-center gap-2 min-w-0">
                                            <Calendar className="w-4 h-4 text-brand-blue shrink-0" />
                                            <span className="truncate">Schedule Review</span>
                                        </CardTitle>
                                        <ChevronDown className={cn(
                                            "w-4 h-4 text-muted-foreground transition-transform shrink-0",
                                            isScheduleOpen && "rotate-180"
                                        )} />
                                    </div>
                                    <CardDescription className="text-xs text-muted-foreground mt-1">
                                        Generated from NTP date and configured screen locations
                                    </CardDescription>
                                </CardHeader>
                                {isScheduleOpen && (
                                    <CardContent className="p-4">
                                        <SchedulePreview />
                                    </CardContent>
                                )}
                            </Card>
                        )}

                        {/* ─── Spacer between schedule and export ─── */}
                        <div className="h-2" />

                        {/* ─── EXPORT SUITE — Hero Section ─── */}
                        <Card className="bg-card/50 border-2 border-brand-blue/30 overflow-hidden shadow-[0_0_30px_rgba(10,82,239,0.08)]">
                            <CardContent className="p-0">
                                {(proposalPdfLoading || pdfGenerationProgress) && (
                                    <div className="px-6 py-3 border-b border-border/60 bg-muted/20">
                                        <div className="flex items-center justify-between text-[11px] font-semibold text-muted-foreground">
                                            <span>{pdfGenerationProgress?.label || "Generating PDF…"}</span>
                                            <span>{pdfGenerationProgress?.value ? `${pdfGenerationProgress.value}%` : ""}</span>
                                        </div>
                                        <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                                            <div
                                                className="h-full bg-brand-blue transition-[width] duration-300"
                                                style={{ width: `${pdfGenerationProgress?.value ?? 35}%` }}
                                            />
                                        </div>
                                    </div>
                                )}
                                {pdfBatchProgress && (
                                    <div className="px-6 py-3 border-b border-border/60 bg-muted/20">
                                        <div className="flex items-center justify-between text-[11px] font-semibold text-muted-foreground">
                                            <span>{`Generating ${pdfBatchProgress.current}/${pdfBatchProgress.total}: ${pdfBatchProgress.label}`}</span>
                                            <span>{`${Math.round((pdfBatchProgress.current / pdfBatchProgress.total) * 100)}%`}</span>
                                        </div>
                                        <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                                            <div
                                                className="h-full bg-brand-blue transition-[width] duration-300"
                                                style={{ width: `${(pdfBatchProgress.current / pdfBatchProgress.total) * 100}%` }}
                                            />
                                        </div>
                                    </div>
                                )}

                                {/* Hero Download Bundle */}
                                <div className="px-6 py-8 flex flex-col items-center text-center gap-4">
                                    <div className="w-14 h-14 rounded-2xl bg-brand-blue/10 flex items-center justify-center border border-brand-blue/20">
                                        <Zap className="w-7 h-7 text-brand-blue" />
                                    </div>
                                    <div>
                                        <h4 className="text-base font-bold text-foreground">Export Documents</h4>
                                        <p className="text-xs text-muted-foreground mt-1">Budget PDF, Proposal PDF, LOI PDF, and Internal Audit Excel</p>
                                    </div>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <button
                                                onClick={handleGlobalExport}
                                                disabled={(mirrorMode ? !isMirrorReadyToExport : (!allScreensValid || isGatekeeperLocked)) && !exporting}
                                                className={cn(
                                                    "w-full max-w-sm px-6 py-3 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2",
                                                    exporting
                                                        ? "bg-brand-blue text-white cursor-wait shadow-[0_0_20px_rgba(10,82,239,0.3)]"
                                                        : (mirrorMode ? !isMirrorReadyToExport : (!allScreensValid || isGatekeeperLocked))
                                                            ? "bg-muted text-muted-foreground cursor-not-allowed"
                                                            : "bg-brand-blue text-white hover:bg-brand-blue/90 shadow-[0_0_20px_rgba(10,82,239,0.3)] hover:shadow-[0_0_30px_rgba(10,82,239,0.5)]"
                                                )}
                                            >
                                                {exporting ? (
                                                    <>
                                                        <RefreshCw className="w-4 h-4 animate-spin" />
                                                        <span className="font-semibold">Generating...</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <Download className="w-4 h-4" />
                                                        Download Bundle
                                                        {isGatekeeperLocked && unverifiedAiFields.length > 0 && (
                                                            <span className="ml-1 text-[10px] opacity-75">
                                                                ({unverifiedAiFields.length} to verify)
                                                            </span>
                                                        )}
                                                    </>
                                                )}
                                            </button>
                                        </TooltipTrigger>
                                        {getDownloadBundleErrorMessage() && !exporting && (
                                            <TooltipContent side="top" className="max-w-xs">
                                                <p className="text-xs">{getDownloadBundleErrorMessage()}</p>
                                            </TooltipContent>
                                        )}
                                    </Tooltip>
                                </div>

                                {/* Individual Options */}
                                <div className="border-t border-border/60 grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-border/60">
                                    <div className="p-4 flex items-center justify-between hover:bg-card/40 transition-colors">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 rounded-lg bg-muted/50 text-muted-foreground">
                                                <FileSpreadsheet className="w-4 h-4" />
                                            </div>
                                            <div>
                                                <div className="text-xs font-bold text-zinc-900 dark:text-foreground">Excel Only</div>
                                                <div className="text-[10px] text-zinc-500 dark:text-muted-foreground">Audit Workbook</div>
                                            </div>
                                        </div>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <button
                                                    onClick={exportAudit}
                                                    disabled={(mirrorMode && !isMirrorReadyToExport) || isGatekeeperLocked}
                                                    className="p-2 hover:bg-muted text-muted-foreground hover:text-foreground rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    <Download className="w-4 h-4" />
                                                </button>
                                            </TooltipTrigger>
                                            {getExcelOnlyErrorMessage() && (
                                                <TooltipContent side="left" className="max-w-xs">
                                                    <p className="text-xs">{getExcelOnlyErrorMessage()}</p>
                                                </TooltipContent>
                                            )}
                                        </Tooltip>
                                    </div>

                                    <div className="p-4 flex items-center justify-between hover:bg-card/40 transition-colors">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 rounded-lg bg-muted/50 text-muted-foreground">
                                                <FileText className="w-4 h-4" />
                                            </div>
                                            <div>
                                                <div className="text-xs font-bold text-zinc-900 dark:text-foreground">Original Excel</div>
                                                <div className="text-[10px] text-zinc-500 dark:text-muted-foreground">Exact uploaded file</div>
                                            </div>
                                        </div>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <button
                                                    onClick={downloadImportedExcel}
                                                    disabled={!importedExcelFile}
                                                    className="p-2 hover:bg-muted text-muted-foreground hover:text-foreground rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    <Download className="w-4 h-4" />
                                                </button>
                                            </TooltipTrigger>
                                            {getOriginalExcelErrorMessage() && (
                                                <TooltipContent side="left" className="max-w-xs">
                                                    <p className="text-xs">{getOriginalExcelErrorMessage()}</p>
                                                </TooltipContent>
                                            )}
                                        </Tooltip>
                                    </div>

                                    <div className="p-4 flex items-center justify-between hover:bg-card/40 transition-colors">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 rounded-lg bg-muted/50 text-muted-foreground">
                                                <Eye className="w-4 h-4" />
                                            </div>
                                            <div>
                                                <div className="text-xs font-bold text-zinc-900 dark:text-foreground">PDF Only</div>
                                                <div className="text-[10px] text-zinc-500 dark:text-muted-foreground">Client Proposal</div>
                                            </div>
                                        </div>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <button
                                                    onClick={downloadPdf}
                                                    disabled={mirrorMode ? isPdfPreviewBlocked : (!allScreensValid || isGatekeeperLocked)}
                                                    className="p-2 hover:bg-muted text-muted-foreground hover:text-foreground rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    <Download className="w-4 h-4" />
                                                </button>
                                            </TooltipTrigger>
                                            {getPdfOnlyErrorMessage() && (
                                                <TooltipContent side="right" className="max-w-xs">
                                                    <p className="text-xs">{getPdfOnlyErrorMessage()}</p>
                                                </TooltipContent>
                                            )}
                                        </Tooltip>
                                    </div>

                                    <div className="p-4 flex items-center justify-between hover:bg-card/40 transition-colors border-t border-border/30">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 rounded-lg bg-purple-500/10 text-purple-500">
                                                <Zap className="w-4 h-4" />
                                            </div>
                                            <div>
                                                <div className="text-xs font-bold text-zinc-900 dark:text-foreground">jsreport PDF</div>
                                                <div className="text-[10px] text-zinc-500 dark:text-muted-foreground">Alternate Engine (Beta)</div>
                                            </div>
                                        </div>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <button
                                                    onClick={async () => {
                                                        await generatePdfViaJsreport(getValues());
                                                    }}
                                                    disabled={mirrorMode ? isPdfPreviewBlocked : (!allScreensValid || isGatekeeperLocked)}
                                                    className="p-2 hover:bg-purple-500/10 text-purple-500 hover:text-purple-600 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    <Download className="w-4 h-4" />
                                                </button>
                                            </TooltipTrigger>
                                            <TooltipContent side="right" className="max-w-xs">
                                                <p className="text-xs">Generate PDF via jsreport engine (deterministic rendering)</p>
                                            </TooltipContent>
                                        </Tooltip>
                                    </div>

                                    <div className="p-4 flex items-center justify-between hover:bg-card/40 transition-colors border-t border-border/30">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600">
                                                <FileSignature className="w-4 h-4" />
                                            </div>
                                            <div>
                                                <div className="text-xs font-bold text-zinc-900 dark:text-foreground">Install SOW</div>
                                                <div className="text-[10px] text-zinc-500 dark:text-muted-foreground">Subcontractor DOCX</div>
                                            </div>
                                        </div>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <button
                                                    onClick={handleInstallSOW}
                                                    disabled={sowExporting || screens.length === 0}
                                                    className="p-2 hover:bg-emerald-500/10 text-emerald-600 hover:text-emerald-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    {sowExporting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                                                </button>
                                            </TooltipTrigger>
                                            <TooltipContent side="right" className="max-w-xs">
                                                <p className="text-xs">{screens.length === 0 ? "Add screens first" : "Generate Installation Scope of Work (DOCX)"}</p>
                                            </TooltipContent>
                                        </Tooltip>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        {FEATURES.CLIENT_REQUESTS && (
                            <Card className="bg-card/40 border border-border/60 overflow-hidden">
                                <CardHeader className="border-b border-border/60 pb-3">
                                    <div className="flex items-center justify-between gap-3">
                                        <CardTitle className="text-sm font-bold text-foreground flex items-center gap-2">
                                            <MessageSquare className="w-4 h-4 text-brand-blue" />
                                            Client Requests
                                        </CardTitle>
                                        <Badge className="bg-muted/50 text-foreground border border-border">
                                            {changeRequests.filter((r: any) => r.status === "OPEN").length} open
                                        </Badge>
                                    </div>
                                </CardHeader>
                                <CardContent className="p-4">
                                    {changeRequestsLoading ? (
                                        <div className="text-xs text-muted-foreground">Loading…</div>
                                    ) : changeRequests.length === 0 ? (
                                        <div className="text-xs text-muted-foreground">
                                            No client change requests yet. Share link clients can submit requests from the portal.
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            {changeRequests.slice(0, 10).map((r: any) => (
                                                <div key={r.id} className="rounded-2xl border border-border bg-card/30 p-4">
                                                    <div className="flex items-start justify-between gap-4">
                                                        <div className="min-w-0 flex-1">
                                                            <div className="flex items-center gap-2">
                                                                {r.pinNumber != null && (
                                                                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-600 text-white text-[10px] font-bold shrink-0">
                                                                        {r.pinNumber}
                                                                    </span>
                                                                )}
                                                                <div className="text-xs font-bold text-foreground truncate">
                                                                    {r.requesterName}
                                                                    {r.requesterEmail ? (
                                                                        <span className="text-muted-foreground font-semibold"> • {r.requesterEmail}</span>
                                                                    ) : null}
                                                                </div>
                                                            </div>
                                                            {r.aiCategory && (
                                                                <Badge className="mt-1.5 bg-purple-500/10 text-purple-300 border border-purple-500/20 text-[10px]">
                                                                    {r.aiCategory}
                                                                </Badge>
                                                            )}
                                                            <div className="mt-1 text-[11px] text-muted-foreground">
                                                                {r.createdAt ? new Date(r.createdAt).toLocaleString() : ""}
                                                            </div>
                                                        </div>
                                                        {r.screenshotData && (
                                                            <Image
                                                                src={r.screenshotData}
                                                                alt="Context"
                                                                width={80}
                                                                height={56}
                                                                className="w-20 h-14 rounded-lg border border-border object-cover shrink-0"
                                                            />
                                                        )}
                                                        <div className="shrink-0 flex items-center gap-2">
                                                            {r.status === "RESOLVED" ? (
                                                                <Badge className="bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                                                                    Resolved
                                                                </Badge>
                                                            ) : (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => updateChangeRequestStatus(r.id, "RESOLVED")}
                                                                    className="px-3 py-2 rounded-xl text-[11px] font-bold border border-emerald-500/30 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/15 transition-colors inline-flex items-center gap-2"
                                                                >
                                                                    <Check className="w-4 h-4" />
                                                                    Mark Resolved
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="mt-3 text-xs text-foreground whitespace-pre-wrap">
                                                        {r.transcript || r.message}
                                                    </div>
                                                    {r.audioData && (
                                                        <div className="mt-2">
                                                            <audio controls preload="none" className="h-8 w-full [&::-webkit-media-controls-panel]:bg-card">
                                                                <source src={r.audioData} type="audio/webm" />
                                                            </audio>
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        )}

                    </div>
                </div>

                {FEATURES.VERIFICATION_STUDIO && (
                    <Card className="bg-card/40 border border-border/60 overflow-hidden">
                        <CardHeader className="border-b border-border/60 cursor-pointer" onClick={() => setIsVerificationExpanded(!isVerificationExpanded)}>
                            <div className="flex items-start justify-between gap-4">
                                <div className="min-w-0">
                                    <CardTitle className="text-sm font-bold text-foreground flex items-center gap-2">
                                        <Columns className="w-4 h-4 text-brand-blue" />
                                        Compare
                                        <ChevronRight className={cn(
                                            "w-4 h-4 text-muted-foreground transition-transform",
                                            isVerificationExpanded && "rotate-90"
                                        )} />
                                    </CardTitle>
                                    <CardDescription className="text-xs text-muted-foreground">
                                        Review Excel vs PDF and watch verification scan screen-by-screen.
                                    </CardDescription>
                                </div>
                                {isVerificationExpanded && <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                                    <button
                                        type="button"
                                        onClick={previewPdfInTab}
                                        disabled={mirrorMode && isPdfPreviewBlocked}
                                        title={mirrorMode && isPdfPreviewBlocked ? "Complete verification first" : "Open PDF preview in new tab"}
                                        className={cn(
                                            "px-3 py-2 rounded-xl border text-xs font-bold transition-all inline-flex items-center gap-2",
                                            (proposalPdfLoading || (mirrorMode && isPdfPreviewBlocked))
                                                ? "border-border bg-card/40 text-muted-foreground cursor-not-allowed"
                                                : "border-border bg-card/40 text-foreground hover:border-brand-blue/40 hover:text-foreground"
                                        )}
                                    >
                                        <Eye className="w-4 h-4" />
                                        {proposalPdfLoading ? "Generating…" : pdfUrl ? "Open Preview" : mirrorMode && isPdfPreviewBlocked ? "🔒 Blocked" : "Preview PDF"}
                                    </button>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <button
                                                type="button"
                                                onClick={runVerification}
                                                disabled={verificationLoading}
                                                className={cn(
                                                    "px-3 py-2 rounded-xl border text-xs font-bold transition-all",
                                                    verificationLoading
                                                        ? "border-border bg-card/40 text-muted-foreground cursor-not-allowed"
                                                        : !canRunVerification
                                                            ? "border-amber-500/40 bg-amber-500/10 text-amber-500 hover:bg-amber-500/20"
                                                            : "border-brand-blue/40 bg-brand-blue/10 text-brand-blue hover:bg-brand-blue/15"
                                                )}
                                            >
                                                {verificationLoading ? "Verifying…" : (
                                                    <span className="inline-flex items-center gap-2">
                                                        {!canRunVerification ? <AlertTriangle className="w-4 h-4" /> : <RefreshCw className="w-4 h-4" />}
                                                        {canRunVerification ? "Run Verification" : "Check Status"}
                                                    </span>
                                                )}
                                            </button>
                                        </TooltipTrigger>
                                        {!canRunVerification && (
                                            <TooltipContent side="bottom" className="bg-muted border-zinc-700 text-foreground text-xs max-w-xs">
                                                Click to see what data is missing for verification.
                                            </TooltipContent>
                                        )}
                                    </Tooltip>
                                    {/* Play Scan - Intelligence Mode only */}
                                    {!mirrorMode && (
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        if (isPlaying) {
                                                            setIsPlaying(false);
                                                            return;
                                                        }
                                                        setPlayIndex(-1);
                                                        setIsPlaying(true);
                                                    }}
                                                    disabled={playbackItems.length === 0}
                                                    className={cn(
                                                        "px-3 py-2 rounded-xl border text-xs font-bold transition-all",
                                                        playbackItems.length === 0
                                                            ? "border-border bg-card/40 text-muted-foreground cursor-not-allowed"
                                                            : isPlaying
                                                                ? "border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/15"
                                                                : "border-border bg-card/40 text-foreground hover:border-amber-500/40 hover:text-foreground"
                                                    )}
                                                >
                                                    {isPlaying ? <span className="inline-flex items-center gap-2"><Pause className="w-4 h-4" />Pause</span> : <span className="inline-flex items-center gap-2"><Play className="w-4 h-4" />Play Scan</span>}
                                                </button>
                                            </TooltipTrigger>
                                            {playbackItems.length === 0 && (
                                                <TooltipContent side="bottom" className="bg-muted border-zinc-700 text-foreground text-xs">
                                                    Run verification first to enable scan playback
                                                </TooltipContent>
                                            )}
                                        </Tooltip>
                                    )}
                                </div>}
                            </div>
                        </CardHeader>
                        {isVerificationExpanded && (
                            <CardContent className="p-4">
                                <Tabs defaultValue="studio">
                                    <TabsList className="bg-muted/40">
                                        <TabsTrigger value="studio">Data Inspection</TabsTrigger>
                                        <TabsTrigger value="results">Results</TabsTrigger>
                                    </TabsList>

                                    <TabsContent value="studio" className="mt-4">
                                        <div className="space-y-4">
                                            <div className="rounded-2xl border border-border bg-card/30 overflow-hidden">
                                                <div className="shrink-0 px-4 py-3 border-b border-border/70 flex items-center justify-between">
                                                    <div className="flex items-center gap-4">
                                                        <div className="flex flex-col">
                                                            <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Source</span>
                                                            <span className="text-xs font-semibold text-foreground">Excel Estimator</span>
                                                        </div>
                                                        <div className="h-4 w-px bg-muted" />
                                                        <div className="flex flex-col">
                                                            <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Output</span>
                                                            <span className="text-xs font-semibold text-brand-blue">Proposal PDF</span>
                                                        </div>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={previewPdfInTab}
                                                        disabled={mirrorMode && isPdfPreviewBlocked}
                                                        className={cn(
                                                            "text-[11px] font-bold text-brand-blue",
                                                            mirrorMode && isPdfPreviewBlocked ? "opacity-60 cursor-not-allowed" : "hover:text-brand-blue/90"
                                                        )}
                                                    >
                                                        Open PDF
                                                    </button>
                                                </div>
                                                <div className="h-[520px] max-h-[65vh] overflow-hidden">
                                                    <ExcelGridViewer
                                                        highlightedRows={highlightedRows}
                                                        focusedRow={focusedRow}
                                                        onFocusedRowChange={setFocusedRow}
                                                        editable
                                                        scanningRow={isPlaying ? (highlightedRows[0] ?? null) : null}
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        {playIndex >= 0 && playIndex < playbackItems.length && (
                                            <div className="mt-4 rounded-2xl border border-border bg-card/40 px-4 py-3 flex items-center justify-between gap-4">
                                                <div className="min-w-0">
                                                    <div className="text-xs font-bold text-foreground truncate">
                                                        Scanning: {playbackItems[playIndex]?.name}
                                                    </div>
                                                    <div className="text-[11px] text-muted-foreground">
                                                        Excel row {Number(playbackItems[playIndex]?.rowIndex || 0)} • Variance {formatCurrency(Number(playbackItems[playIndex]?.variance || 0))}
                                                    </div>
                                                </div>
                                                <div className="shrink-0 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                                                    {playIndex + 1}/{playbackItems.length}
                                                </div>
                                            </div>
                                        )}
                                    </TabsContent>

                                    <TabsContent value="results" className="mt-4">
                                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                                            <div className="lg:col-span-1 space-y-3">
                                                <div className="rounded-2xl border border-border bg-card/40 px-4 py-3">
                                                    <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Reconciliation</div>
                                                    {reconciliation ? (
                                                        <div className="mt-2 space-y-2 text-xs">
                                                            <div className="flex items-center justify-between">
                                                                <span className="text-muted-foreground">Excel Total</span>
                                                                <span className="text-foreground font-bold">{formatCurrency(reconciliation.sourceFinalTotal)}</span>
                                                            </div>
                                                            <div className="flex items-center justify-between">
                                                                <span className="text-muted-foreground">Natalia Total</span>
                                                                <span className="text-foreground font-bold">{formatCurrency(reconciliation.calculatedFinalTotal)}</span>
                                                            </div>
                                                            <div className="flex items-center justify-between">
                                                                <span className="text-muted-foreground">Variance</span>
                                                                <span className={cn("font-bold", reconciliation.isMatch ? "text-emerald-400" : "text-amber-300")}>
                                                                    {formatCurrency(reconciliation.variance)}
                                                                </span>
                                                            </div>
                                                            <div className="flex items-center justify-between">
                                                                <span className="text-muted-foreground">Match</span>
                                                                <span className={cn("font-bold", reconciliation.isMatch ? "text-emerald-400" : "text-amber-300")}>
                                                                    {reconciliation.matchType}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="mt-2 text-xs text-muted-foreground">Run verification to populate totals.</div>
                                                    )}
                                                </div>

                                                <div className="rounded-2xl border border-border bg-card/40 px-4 py-3">
                                                    <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Exceptions</div>
                                                    <div className="mt-2 text-xs text-muted-foreground font-semibold">
                                                        {effectiveExceptions.length} found
                                                    </div>
                                                </div>

                                                {verificationError && (
                                                    <div className="rounded-2xl border border-red-900/60 bg-red-950/40 px-4 py-3 text-xs text-red-200">
                                                        {verificationError}
                                                    </div>
                                                )}
                                            </div>

                                            <div className="lg:col-span-2 rounded-2xl border border-border bg-card/40 overflow-hidden">
                                                <div className="px-4 py-3 border-b border-border/70 flex items-center justify-between">
                                                    <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Findings</div>
                                                    {effectiveReport?.status && (
                                                        <div className={cn(
                                                            "text-[10px] font-bold uppercase tracking-widest",
                                                            effectiveReport.status === "VERIFIED"
                                                                ? "text-emerald-400"
                                                                : effectiveReport.status === "WARNING"
                                                                    ? "text-amber-300"
                                                                    : "text-red-400"
                                                        )}>
                                                            {effectiveReport.status}
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="max-h-[360px] overflow-auto custom-scrollbar">
                                                    {playbackItems.length === 0 ? (
                                                        <div className="px-4 py-6 text-sm text-muted-foreground">No per-screen data available yet.</div>
                                                    ) : (
                                                        <div className="divide-y divide-zinc-800/60">
                                                            {playbackItems.slice(0, 50).map((it: any, idx: number) => {
                                                                const variance = Number(it.variance || 0);
                                                                const row = Number(it.rowIndex || 0);
                                                                return (
                                                                    <button
                                                                        key={`${it.name}-${idx}`}
                                                                        type="button"
                                                                        onClick={() => {
                                                                            setIsPlaying(false);
                                                                            setPlayIndex(idx);
                                                                            if (row) setFocusedRow(row - 1);
                                                                        }}
                                                                        className="w-full text-left px-4 py-3 hover:bg-card/40 transition-colors"
                                                                    >
                                                                        <div className="flex items-center justify-between gap-4">
                                                                            <div className="min-w-0">
                                                                                <div className="text-sm font-semibold text-foreground truncate">{it.name}</div>
                                                                                <div className="text-[11px] text-muted-foreground">Excel row {row || "—"}</div>
                                                                            </div>
                                                                            <div className={cn(
                                                                                "text-xs font-bold",
                                                                                Math.abs(variance) <= 0.01 ? "text-emerald-400" : "text-amber-300"
                                                                            )}>
                                                                                {formatCurrency(variance)}
                                                                            </div>
                                                                        </div>
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </TabsContent>
                                </Tabs>
                            </CardContent>
                        )}
                    </Card>
                )}

            </div>
        </TooltipProvider>
    );
};

export default Step4Export;
