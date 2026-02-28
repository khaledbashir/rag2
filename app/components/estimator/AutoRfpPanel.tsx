"use client";

/**
 * Auto-RFP Response Panel
 *
 * AI reads the RFP, extracts every screen requirement, matches products,
 * and pre-fills the estimator. Shows extracted screens for review before applying.
 */

import React, { useState, useCallback, useEffect } from "react";
import {
    X, Loader2, CheckCircle2, AlertTriangle, FileSearch,
    Monitor, MapPin, Ruler, Cpu, ChevronDown, ChevronUp,
    Check, Trash2, Zap,
} from "lucide-react";
import type { EstimatorAnswers } from "./questions";

// ============================================================================
// TYPES (mirrors server types)
// ============================================================================

interface ExtractedScreen {
    name: string;
    location: string;
    widthFt: number;
    heightFt: number;
    pixelPitchMm: number | null;
    environment: "indoor" | "outdoor";
    quantity: number;
    brightness: number | null;
    serviceType: string | null;
    notes: string | null;
    confidence: number;
}

interface MatchReportEntry {
    screenName: string;
    requestedPitch: number | null;
    requestedEnv: string;
    matchedProductId: string;
    matchedProductName: string;
    fitScore: number;
    matchConfidence: "high" | "low" | "none";
    pitchDelta: number;
}

interface ExtractedProject {
    clientName: string | null;
    projectName: string | null;
    venue: string | null;
    location: string | null;
    isOutdoor: boolean;
    isUnion: boolean;
}

interface AutoRfpResponse {
    ok: boolean;
    error?: string;
    project?: ExtractedProject;
    screens?: ExtractedScreen[];
    estimatorAnswers?: EstimatorAnswers;
    matchReport?: MatchReportEntry[];
    extractionMethod?: string;
}

// ============================================================================
// EXTRACTION PROGRESS (multi-stage indicator)
// ============================================================================

const EXTRACTION_STAGES = [
    { id: "upload", label: "Uploading PDF", description: "Sending document to AI workspace", delayMs: 0 },
    { id: "embed", label: "Embedding", description: "Indexing document for AI retrieval", delayMs: 4000 },
    { id: "read", label: "Reading RFP", description: "AI is scanning for Division 11, display schedules, specs", delayMs: 8000 },
    { id: "extract", label: "Extracting Screens", description: "Identifying screen requirements, quantities, dimensions", delayMs: 14000 },
    { id: "match", label: "Matching Products", description: "Finding best product matches from ANC catalog", delayMs: 20000 },
] as const;

function ExtractionProgress({ uploading }: { uploading: boolean }) {
    const [activeStage, setActiveStage] = useState(0);
    const [elapsed, setElapsed] = useState(0);

    useEffect(() => {
        const start = Date.now();
        const timer = setInterval(() => {
            const ms = Date.now() - start;
            setElapsed(ms);
            const nextStage = EXTRACTION_STAGES.findIndex((s, i) =>
                i > activeStage && ms < s.delayMs
            );
            const current = nextStage === -1
                ? EXTRACTION_STAGES.length - 1
                : Math.max(0, nextStage - 1);
            setActiveStage(current);
        }, 500);
        return () => clearInterval(timer);
    }, []);

    return (
        <div className="p-6 flex flex-col gap-5">
            {/* Progress bar */}
            <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                <div
                    className="h-full bg-[#0A52EF] rounded-full transition-all duration-1000 ease-out"
                    style={{ width: `${Math.min(95, ((activeStage + 1) / EXTRACTION_STAGES.length) * 100)}%` }}
                />
            </div>

            {/* Stages */}
            <div className="space-y-2">
                {EXTRACTION_STAGES.map((stage, idx) => {
                    const isActive = idx === activeStage;
                    const isDone = idx < activeStage;
                    const isPending = idx > activeStage;

                    return (
                        <div
                            key={stage.id}
                            className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-300 ${
                                isActive ? "bg-[#0A52EF]/5 border border-[#0A52EF]/20" :
                                isDone ? "opacity-60" : "opacity-30"
                            }`}
                        >
                            <div className="w-5 h-5 flex items-center justify-center shrink-0">
                                {isDone && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                                {isActive && <Loader2 className="w-4 h-4 text-[#0A52EF] animate-spin" />}
                                {isPending && <div className="w-2 h-2 rounded-full bg-muted-foreground/30" />}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className={`text-xs font-medium ${isActive ? "text-foreground" : "text-muted-foreground"}`}>
                                    {stage.label}
                                </p>
                                {isActive && (
                                    <p className="text-[10px] text-muted-foreground mt-0.5">
                                        {stage.description}
                                    </p>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Timer */}
            <p className="text-[10px] text-muted-foreground text-center">
                {Math.floor(elapsed / 1000)}s elapsed — typically takes 15-30 seconds
            </p>
        </div>
    );
}

// ============================================================================
// COMPONENT
// ============================================================================

interface AutoRfpPanelProps {
    open: boolean;
    onClose: () => void;
    projectId?: string;
    onApply: (answers: EstimatorAnswers) => void;
}

type Phase = "input" | "extracting" | "review" | "error";

export default function AutoRfpPanel({ open, onClose, projectId, onApply }: AutoRfpPanelProps) {
    const [phase, setPhase] = useState<Phase>("input");
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<AutoRfpResponse | null>(null);
    const [excludedScreens, setExcludedScreens] = useState<Set<number>>(new Set());
    const [showDetails, setShowDetails] = useState<number | null>(null);

    const [uploading, setUploading] = useState(false);
    const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
    const [uploadWorkspaceSlug, setUploadWorkspaceSlug] = useState<string | null>(null);
    const [existingWorkspace, setExistingWorkspace] = useState<string | null>(null);
    const [checkingWorkspace, setCheckingWorkspace] = useState(false);

    // Input mode: workspace (from proposal) or direct text
    const [inputMode, setInputMode] = useState<"workspace" | "upload" | "text">(projectId ? "upload" : "text");
    const [directText, setDirectText] = useState("");
    const [workspaceSlug, setWorkspaceSlug] = useState("");

    // Auto-detect existing AI workspace on mount — if project already has
    // embedded RFP content (from PDF Filter or prior upload), skip upload
    // and go straight to extraction.
    const autoStartedRef = React.useRef(false);
    useEffect(() => {
        if (!open || !projectId || autoStartedRef.current) return;
        autoStartedRef.current = true;
        setCheckingWorkspace(true);

        fetch(`/api/projects/${projectId}/embedding-status`)
            .then((r) => r.ok ? r.json() : null)
            .then((data) => {
                if (data?.aiWorkspaceSlug && data?.embeddingStatus === "complete") {
                    setExistingWorkspace(data.aiWorkspaceSlug);
                    setInputMode("workspace");
                    // Auto-start extraction — workspace is ready
                    setPhase("extracting");
                    setError(null);
                    setResult(null);
                    fetch("/api/rfp/auto-response", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ proposalId: projectId }),
                    })
                        .then((r) => r.json())
                        .then((resp: AutoRfpResponse) => {
                            if (!resp.ok || !resp.estimatorAnswers) {
                                throw new Error(resp.error || "Extraction returned no results");
                            }
                            if (!resp.screens || resp.screens.length === 0) {
                                throw new Error("No screen requirements found in the RFP.");
                            }
                            setResult(resp);
                            setPhase("review");
                        })
                        .catch((err: any) => {
                            setError(err.message || "Auto-extraction failed");
                            setPhase("error");
                        });
                } else if (data?.aiWorkspaceSlug) {
                    // Workspace exists but embedding not complete yet
                    setExistingWorkspace(data.aiWorkspaceSlug);
                    setInputMode("workspace");
                }
            })
            .catch(() => { /* non-critical */ })
            .finally(() => setCheckingWorkspace(false));
    }, [open, projectId]);

    const handleUploadFile = useCallback(async (file: File) => {
        if (!file) return;
        if (!file.name.toLowerCase().endsWith(".pdf")) {
            throw new Error("Only PDF files are supported for RFP upload");
        }
        if (!projectId) {
            throw new Error("This estimate is not linked to a saved project yet. Open /estimator (not a draft preview) and try again.");
        }

        setUploading(true);
        setUploadedFileName(file.name);
        setUploadWorkspaceSlug(null);

        const form = new FormData();
        form.append("file", file);
        form.append("proposalId", projectId);

        const res = await fetch("/api/rfp/upload", {
            method: "POST",
            body: form,
        });

        const data = await res.json();
        if (!res.ok || !data?.ok) {
            throw new Error(data?.error || `Upload failed (${res.status})`);
        }

        if (!data.workspaceSlug) {
            throw new Error("Upload succeeded but no workspaceSlug returned. Check AnythingLLM configuration.");
        }

        setUploadWorkspaceSlug(String(data.workspaceSlug));
        return String(data.workspaceSlug);
    }, [projectId]);

    const handleExtract = useCallback(async () => {
        setPhase("extracting");
        setError(null);
        setResult(null);
        setExcludedScreens(new Set());

        const runExtraction = async (body: any) => {
            const res = await fetch("/api/rfp/auto-response", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });

            const data: AutoRfpResponse = await res.json();

            if (!data.ok || !data.estimatorAnswers) {
                throw new Error(data.error || "Extraction returned no results");
            }

            if (!data.screens || data.screens.length === 0) {
                throw new Error("No screen requirements found in the RFP. The document may not contain LED display specifications.");
            }

            setResult(data);
            setPhase("review");
        };

        try {
            const body: any = {};
            if (inputMode === "upload") {
                // If user uploaded, we prefer the upload-created workspaceSlug.
                if (uploadWorkspaceSlug) {
                    body.workspaceSlug = uploadWorkspaceSlug;
                } else if (projectId) {
                    body.proposalId = projectId;
                } else {
                    throw new Error("No project available for upload mode");
                }
            } else if (inputMode === "workspace") {
                if (projectId) {
                    body.proposalId = projectId;
                } else if (workspaceSlug) {
                    body.workspaceSlug = workspaceSlug;
                } else {
                    throw new Error("No proposal or workspace specified");
                }
            } else {
                if (!directText.trim()) throw new Error("Paste RFP text to extract from");
                body.text = directText.trim();
            }

            await runExtraction(body);
        } catch (err: any) {
            setError(err.message || "Extraction failed");
            setPhase("error");
        }
    }, [inputMode, projectId, workspaceSlug, directText, uploadWorkspaceSlug]);

    const handleDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setError(null);
        const file = e.dataTransfer.files?.[0];
        if (!file) return;
        try {
            setPhase("extracting");
            const slug = await handleUploadFile(file);
            await (async () => {
                const res = await fetch("/api/rfp/auto-response", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ workspaceSlug: slug }),
                });
                const data: AutoRfpResponse = await res.json();
                if (!data.ok || !data.estimatorAnswers) {
                    throw new Error(data.error || "Extraction returned no results");
                }
                if (!data.screens || data.screens.length === 0) {
                    throw new Error("No screen requirements found in the RFP. The document may not contain LED display specifications.");
                }
                setResult(data);
                setPhase("review");
            })();
        } catch (err: any) {
            setError(err.message || "Upload failed");
            setPhase("error");
        } finally {
            setUploading(false);
        }
    }, [handleUploadFile]);

    const handleFilePick = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file) return;
        try {
            setPhase("extracting");
            const slug = await handleUploadFile(file);
            const res = await fetch("/api/rfp/auto-response", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ workspaceSlug: slug }),
            });
            const data: AutoRfpResponse = await res.json();
            if (!data.ok || !data.estimatorAnswers) {
                throw new Error(data.error || "Extraction returned no results");
            }
            if (!data.screens || data.screens.length === 0) {
                throw new Error("No screen requirements found in the RFP. The document may not contain LED display specifications.");
            }
            setResult(data);
            setPhase("review");
        } catch (err: any) {
            setError(err.message || "Upload failed");
            setPhase("error");
        } finally {
            setUploading(false);
        }
    }, [handleUploadFile]);

    const handleApply = useCallback(() => {
        if (!result?.estimatorAnswers) return;

        // Filter out excluded screens
        const filtered = { ...result.estimatorAnswers };
        filtered.displays = filtered.displays.filter((_, i) => !excludedScreens.has(i));

        onApply(filtered);
        onClose();
    }, [result, excludedScreens, onApply, onClose]);

    const toggleScreen = useCallback((idx: number) => {
        setExcludedScreens(prev => {
            const next = new Set(prev);
            if (next.has(idx)) next.delete(idx);
            else next.add(idx);
            return next;
        });
    }, []);

    if (!open) return null;

    const screens = result?.screens || [];
    const matchReport = result?.matchReport || [];
    const project = result?.project;
    const activeCount = (result?.estimatorAnswers?.displays.length || 0) - excludedScreens.size;

    return (
        <div className="flex flex-col h-full overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
                <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-[#0A52EF]" />
                    <h2 className="text-sm font-semibold">Auto-RFP Response</h2>
                </div>
                <button onClick={onClose} className="p-1 rounded hover:bg-muted transition-colors">
                    <X className="w-4 h-4 text-muted-foreground" />
                </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
                {/* ═══ INPUT PHASE ═══ */}
                {phase === "input" && checkingWorkspace && (
                    <div className="p-8 flex flex-col items-center justify-center gap-3 text-center">
                        <Loader2 className="w-6 h-6 text-[#0A52EF] animate-spin" />
                        <p className="text-xs text-muted-foreground">Checking for existing RFP data...</p>
                    </div>
                )}
                {phase === "input" && !checkingWorkspace && (
                    <div className="p-4 space-y-4">
                        <p className="text-xs text-muted-foreground">
                            AI reads the RFP, extracts every screen requirement, matches products from the catalog,
                            and pre-fills the estimator. Review before accepting.
                        </p>

                        {/* Input mode tabs */}
                        <div className="flex gap-1 bg-muted/50 rounded p-0.5">
                            {projectId && (
                                <button
                                    onClick={() => setInputMode("upload")}
                                    className={`flex-1 px-3 py-1.5 rounded text-xs font-medium transition-all ${
                                        inputMode === "upload"
                                            ? "bg-background shadow-sm text-foreground"
                                            : "text-muted-foreground hover:text-foreground"
                                    }`}
                                >
                                    Upload PDF
                                </button>
                            )}
                            {projectId && (
                                <button
                                    onClick={() => setInputMode("workspace")}
                                    className={`flex-1 px-3 py-1.5 rounded text-xs font-medium transition-all ${
                                        inputMode === "workspace"
                                            ? "bg-background shadow-sm text-foreground"
                                            : "text-muted-foreground hover:text-foreground"
                                    }`}
                                >
                                    From This Project
                                </button>
                            )}
                            <button
                                onClick={() => setInputMode("workspace")}
                                className={`flex-1 px-3 py-1.5 rounded text-xs font-medium transition-all ${
                                    inputMode === "workspace" && !projectId
                                        ? "bg-background shadow-sm text-foreground"
                                        : projectId ? "" : "text-muted-foreground hover:text-foreground"
                                }`}
                                style={{ display: projectId ? "none" : undefined }}
                            >
                                Workspace
                            </button>
                            <button
                                onClick={() => setInputMode("text")}
                                className={`flex-1 px-3 py-1.5 rounded text-xs font-medium transition-all ${
                                    inputMode === "text"
                                        ? "bg-background shadow-sm text-foreground"
                                        : "text-muted-foreground hover:text-foreground"
                                }`}
                            >
                                Paste Text
                            </button>
                        </div>

                        {inputMode === "upload" && (
                            <div className="space-y-2">
                                <div
                                    onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                                    onDrop={handleDrop}
                                    className="border-2 border-dashed border-border rounded-lg p-6 text-center bg-muted/20 hover:bg-muted/30 transition-colors"
                                >
                                    <p className="text-sm font-medium text-foreground">Drag & drop the RFP PDF here</p>
                                    <p className="text-xs text-muted-foreground mt-1">We upload it, embed it to AnythingLLM, then auto-extract screens.</p>
                                    <div className="mt-3">
                                        <label className="inline-flex items-center justify-center px-3 py-2 rounded bg-[#0A52EF] text-white text-xs font-medium cursor-pointer hover:bg-[#0A52EF]/90 transition-colors">
                                            Choose PDF
                                            <input type="file" accept="application/pdf" className="hidden" onChange={handleFilePick} />
                                        </label>
                                    </div>
                                    {(uploadedFileName || uploadWorkspaceSlug) && (
                                        <p className="text-[10px] text-muted-foreground mt-3">
                                            {uploadedFileName ? `Last upload: ${uploadedFileName}` : ""}
                                            {uploadWorkspaceSlug ? ` · Workspace: ${uploadWorkspaceSlug}` : ""}
                                        </p>
                                    )}
                                </div>
                                <p className="text-[10px] text-muted-foreground">
                                    This attaches to the current estimate project and creates/uses its AnythingLLM workspace.
                                </p>
                            </div>
                        )}

                        {inputMode === "workspace" && !projectId && (
                            <div>
                                <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium block mb-1">
                                    AnythingLLM Workspace Slug
                                </label>
                                <input
                                    type="text"
                                    value={workspaceSlug}
                                    onChange={e => setWorkspaceSlug(e.target.value)}
                                    placeholder="e.g. ravens-stadium-rfp-abc123"
                                    className="w-full px-3 py-2 text-sm border border-border rounded bg-background focus:ring-1 focus:ring-[#0A52EF]/30 focus:border-[#0A52EF]/50 outline-none"
                                />
                            </div>
                        )}

                        {inputMode === "workspace" && projectId && (
                            <div className="bg-[#0A52EF]/5 border border-[#0A52EF]/15 rounded p-3">
                                <p className="text-xs text-[#0A52EF]">
                                    {existingWorkspace
                                        ? `RFP content already embedded in workspace "${existingWorkspace}". Click below to extract screen requirements.`
                                        : "Will extract from the RFP documents embedded in this project\u0027s AnythingLLM workspace."}
                                </p>
                            </div>
                        )}

                        {inputMode === "text" && (
                            <div>
                                <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium block mb-1">
                                    Paste RFP Text (Division 11 / Display Schedule sections)
                                </label>
                                <textarea
                                    value={directText}
                                    onChange={e => setDirectText(e.target.value)}
                                    placeholder="Paste the relevant RFP sections here. Focus on Division 11, Display Schedule, or any sections listing LED display requirements..."
                                    rows={12}
                                    className="w-full px-3 py-2 text-xs font-mono border border-border rounded bg-background focus:ring-1 focus:ring-[#0A52EF]/30 focus:border-[#0A52EF]/50 outline-none resize-y"
                                />
                                <p className="text-[10px] text-muted-foreground mt-1">
                                    {directText.length > 0 ? `${directText.length.toLocaleString()} characters` : ""}
                                </p>
                            </div>
                        )}

                        <button
                            onClick={handleExtract}
                            disabled={(inputMode === "text" && !directText.trim()) || uploading}
                            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[#0A52EF] text-white rounded text-sm font-medium hover:bg-[#0A52EF]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSearch className="w-4 h-4" />}
                            {uploading ? "Uploading..." : "Extract Screen Requirements"}
                        </button>
                    </div>
                )}

                {/* ═══ EXTRACTING PHASE ═══ */}
                {phase === "extracting" && (
                    <ExtractionProgress uploading={uploading} />
                )}

                {/* ═══ ERROR PHASE ═══ */}
                {phase === "error" && (
                    <div className="p-4 space-y-4">
                        <div className="bg-destructive/5 border border-destructive/20 rounded p-4">
                            <div className="flex items-start gap-2">
                                <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                                <div>
                                    <p className="text-sm font-medium text-destructive">Extraction Failed</p>
                                    <p className="text-xs text-destructive/80 mt-1">{error}</p>
                                </div>
                            </div>
                        </div>
                        <button
                            onClick={() => setPhase("input")}
                            className="w-full px-4 py-2 border border-border rounded text-sm hover:bg-muted transition-colors"
                        >
                            Try Again
                        </button>
                    </div>
                )}

                {/* ═══ REVIEW PHASE ═══ */}
                {phase === "review" && result && (
                    <div className="space-y-0">
                        {/* Project summary */}
                        {project && (
                            <div className="px-4 py-3 border-b border-border bg-muted/30">
                                <div className="flex items-center gap-4 text-xs">
                                    {project.clientName && (
                                        <span><strong className="text-foreground">{project.clientName}</strong></span>
                                    )}
                                    {project.venue && (
                                        <span className="flex items-center gap-1 text-muted-foreground">
                                            <MapPin className="w-3 h-3" />
                                            {project.venue}
                                        </span>
                                    )}
                                    {project.location && (
                                        <span className="text-muted-foreground">{project.location}</span>
                                    )}
                                </div>
                                {project.projectName && (
                                    <p className="text-[10px] text-muted-foreground mt-1">{project.projectName}</p>
                                )}
                            </div>
                        )}

                        {/* Stats strip */}
                        <div className="px-4 py-2.5 border-b border-border flex items-center gap-4 text-xs">
                            <span className="flex items-center gap-1">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                                <strong className="text-foreground">{screens.length}</strong> screens extracted
                            </span>
                            <span className="text-muted-foreground">
                                <strong className="text-foreground">{activeCount}</strong> selected
                            </span>
                            <span className="text-muted-foreground text-[10px]">
                                {result.extractionMethod === "ai-workspace" ? "From workspace" : "From text"}
                            </span>
                        </div>

                        {/* Screen list */}
                        <div className="divide-y divide-border">
                            {matchReport.map((match, idx) => {
                                const screen = screens.find(s =>
                                    match.screenName === s.name || match.screenName.startsWith(s.name)
                                ) || screens[Math.min(idx, screens.length - 1)];
                                const excluded = excludedScreens.has(idx);
                                const expanded = showDetails === idx;

                                return (
                                    <div
                                        key={idx}
                                        className={`transition-colors ${excluded ? "opacity-40" : ""}`}
                                    >
                                        <div className="flex items-center gap-3 px-4 py-2.5">
                                            {/* Checkbox */}
                                            <button
                                                onClick={() => toggleScreen(idx)}
                                                className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-colors ${
                                                    excluded
                                                        ? "border-border bg-muted"
                                                        : "border-[#0A52EF] bg-[#0A52EF] text-white"
                                                }`}
                                            >
                                                {!excluded && <Check className="w-3 h-3" />}
                                            </button>

                                            {/* Screen info */}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <Monitor className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                                    <span className="text-xs font-medium text-foreground truncate">
                                                        {match.screenName}
                                                    </span>
                                                    {screen?.confidence != null && (
                                                        <span className={`text-[9px] px-1 py-0.5 rounded font-medium ${
                                                            screen.confidence >= 0.85
                                                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                                                : screen.confidence >= 0.6
                                                                ? "bg-amber-50 text-amber-700 border border-amber-200"
                                                                : "bg-red-50 text-red-700 border border-red-200"
                                                        }`}>
                                                            {Math.round(screen.confidence * 100)}%
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-3 mt-0.5 text-[10px] text-muted-foreground">
                                                    {screen && screen.widthFt > 0 && (
                                                        <span className="flex items-center gap-0.5">
                                                            <Ruler className="w-2.5 h-2.5" />
                                                            {screen.widthFt}&apos; × {screen.heightFt}&apos;
                                                        </span>
                                                    )}
                                                    {screen?.pixelPitchMm && (
                                                        <span>{screen.pixelPitchMm}mm</span>
                                                    )}
                                                    {match.matchConfidence === "none" ? (
                                                        <span className="flex items-center gap-0.5 text-destructive font-medium">
                                                            <Cpu className="w-2.5 h-2.5" />
                                                            No confident match — manual selection required
                                                        </span>
                                                    ) : (
                                                        <>
                                                            <span className="flex items-center gap-0.5">
                                                                <Cpu className="w-2.5 h-2.5" />
                                                                {match.matchedProductName}
                                                            </span>
                                                            {match.matchConfidence === "low" && (
                                                                <span className="text-amber-600">±{match.pitchDelta.toFixed(1)}mm</span>
                                                            )}
                                                            {match.fitScore < 80 && (
                                                                <span className="text-amber-600">fit: {match.fitScore}%</span>
                                                            )}
                                                        </>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Expand */}
                                            <button
                                                onClick={() => setShowDetails(expanded ? null : idx)}
                                                className="p-1 text-muted-foreground hover:text-foreground rounded"
                                            >
                                                {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                            </button>
                                        </div>

                                        {/* Expanded details */}
                                        {expanded && screen && (
                                            <div className="px-4 pb-3 ml-8">
                                                <div className="grid grid-cols-2 gap-2 text-[10px]">
                                                    <div>
                                                        <span className="text-muted-foreground">Location: </span>
                                                        <span className="text-foreground">{screen.location || "—"}</span>
                                                    </div>
                                                    <div>
                                                        <span className="text-muted-foreground">Environment: </span>
                                                        <span className="text-foreground">{screen.environment}</span>
                                                    </div>
                                                    <div>
                                                        <span className="text-muted-foreground">Brightness: </span>
                                                        <span className="text-foreground">{screen.brightness ? `${screen.brightness} nits` : "—"}</span>
                                                    </div>
                                                    <div>
                                                        <span className="text-muted-foreground">Service: </span>
                                                        <span className="text-foreground">{screen.serviceType || "—"}</span>
                                                    </div>
                                                    <div>
                                                        <span className="text-muted-foreground">Matched Product: </span>
                                                        {match.matchConfidence === "none" ? (
                                                            <span className="text-destructive font-medium">No confident match</span>
                                                        ) : (
                                                            <span className="text-foreground font-mono">{match.matchedProductId}</span>
                                                        )}
                                                    </div>
                                                    <div>
                                                        <span className="text-muted-foreground">Fit Score: </span>
                                                        <span className={`font-medium ${match.fitScore >= 80 ? "text-emerald-600" : match.fitScore >= 50 ? "text-amber-600" : "text-red-600"}`}>
                                                            {match.fitScore}%
                                                        </span>
                                                    </div>
                                                </div>
                                                {screen.notes && (
                                                    <p className="mt-1.5 text-[10px] text-muted-foreground italic">
                                                        {screen.notes}
                                                    </p>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>

            {/* Footer actions */}
            {phase === "review" && (
                <div className="shrink-0 px-4 py-3 border-t border-border bg-background flex items-center justify-between">
                    <button
                        onClick={() => setPhase("input")}
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                        ← Re-extract
                    </button>
                    <button
                        onClick={handleApply}
                        disabled={activeCount === 0}
                        className="flex items-center gap-1.5 px-4 py-2 bg-[#0A52EF] text-white rounded text-xs font-medium hover:bg-[#0A52EF]/90 transition-colors disabled:opacity-50"
                    >
                        <Zap className="w-3.5 h-3.5" />
                        Apply {activeCount} Display{activeCount !== 1 ? "s" : ""} to Estimator
                    </button>
                </div>
            )}
        </div>
    );
}
