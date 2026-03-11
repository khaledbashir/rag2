"use client";

import React, { useCallback, useState, useEffect, useRef } from "react";
import {
  UploadCloud,
  File as FileIcon,
  Loader2,
  AlertCircle,
  Clock,
  CheckCircle2,
  Eye,
  Sparkles,
  Monitor,
  Database,
  Filter,
  FileSpreadsheet,
  X,
  Zap,
  Layers,
} from "lucide-react";

export interface PipelineEvent {
  type: "stage" | "progress" | "warning" | "complete" | "error";
  stage?: string;
  message?: string;
  current?: number;
  total?: number;
  totalPages?: number;
  totalChars?: number;
  relevant?: number;
  noise?: number;
  led?: number;
  drawings?: number;
  tables?: number;
  specsFound?: number;
  result?: any;
}

interface UploadZoneProps {
  onUpload: (files: File[], bidFormFile?: File) => void;
  onExcelUpload?: (file: File) => void;
  isLoading: boolean;
  events: PipelineEvent[];
}

interface StageState {
  key: string;
  label: string;
  activeLabel: string;
  icon: typeof UploadCloud;
  status: "pending" | "active" | "done" | "error" | "warning";
  detail?: string;
  count?: string;
}

// ---------------------------------------------------------------------------
// Live stats — extracted from events
// ---------------------------------------------------------------------------

interface LiveStats {
  totalPages: number;
  relevantPages: number;
  noisePages: number;
  drawingPages: number;
  specsFound: number;
  tablesFound: number;
  annotationSpecs: number;
}

function extractStats(events: PipelineEvent[]): LiveStats {
  const stats: LiveStats = {
    totalPages: 0,
    relevantPages: 0,
    noisePages: 0,
    drawingPages: 0,
    specsFound: 0,
    tablesFound: 0,
    annotationSpecs: 0,
  };

  for (const e of events) {
    if (e.type === "stage") {
      if (e.totalPages) stats.totalPages = e.totalPages;
      if (e.relevant != null) stats.relevantPages = e.relevant;
      if (e.noise != null) stats.noisePages = e.noise;
      if (e.drawings != null) stats.drawingPages = e.drawings;
      if (e.specsFound != null) stats.specsFound = e.specsFound;
      if (e.tables != null) stats.tablesFound = e.tables;
      if ((e as any).annotationSpecs != null) stats.annotationSpecs = (e as any).annotationSpecs;
      // vision_done carries these as custom fields
      if ((e as any).visionPages != null) stats.drawingPages = (e as any).visionPages;
    }
    if (e.type === "complete" && e.result) {
      if (e.result.screens) stats.specsFound = e.result.screens.length;
      if (e.result.stats?.totalPages) stats.totalPages = e.result.stats.totalPages;
    }
  }

  return stats;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function UploadZone({ onUpload, onExcelUpload, isLoading, events }: UploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [fileName, setFileName] = useState<string | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const [bidFormFile, setBidFormFile] = useState<File | null>(null);
  const bidFormInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isLoading) {
      setElapsedSeconds(0);
      intervalRef.current = setInterval(() => setElapsedSeconds((p) => p + 1), 1000);
    } else {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isLoading]);

  const stages: StageState[] = buildStages(events);
  const stats = extractStats(events);

  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); if (!isLoading) setIsDragging(true); }, [isLoading]);
  const handleDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); }, []);

  const validateAndUpload = (files: File[]) => {
    setError(null);
    const pdfFiles = files.filter((f) => f.type === "application/pdf" || f.name.endsWith(".pdf"));
    const excelFiles = files.filter((f) => f.name.endsWith(".xlsx") || f.name.endsWith(".xls"));

    if (pdfFiles.length === 0 && excelFiles.length > 0) {
      if (onExcelUpload) {
        setFileName(excelFiles[0].name);
        onExcelUpload(excelFiles[0]);
      } else {
        setBidFormFile(excelFiles[0]);
      }
      return;
    }

    if (pdfFiles.length === 0) { setError("Drop a PDF file (RFP) to get started."); return; }
    if (pdfFiles.some((f) => f.size > 2000 * 1024 * 1024)) { setError("Files must be under 2GB."); return; }
    setFileName(pdfFiles.length === 1 ? pdfFiles[0].name : `${pdfFiles.length} files`);
    const attachedBidForm = excelFiles[0] || bidFormFile || undefined;
    onUpload(pdfFiles, attachedBidForm);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    if (isLoading) return;
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) validateAndUpload(files);
  }, [isLoading]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) validateAndUpload(Array.from(e.target.files));
  };

  const formatTime = (s: number) => { const m = Math.floor(s / 60); return m > 0 ? `${m}m ${s % 60}s` : `${s}s`; };

  const latestMessage = [...events].reverse().find((e) => e.message)?.message || "Initializing pipeline...";
  const isComplete = events.some((e) => e.type === "complete");
  const hasError = events.some((e) => e.type === "error");
  const activeStageIdx = stages.findIndex((s) => s.status === "active");
  const completedCount = stages.filter((s) => s.status === "done").length;
  const overallPercent = isComplete ? 100 : Math.round((completedCount / stages.length) * 100 + (activeStageIdx >= 0 ? 10 : 0));

  // =========================================================================
  // UPLOAD STATE (not loading)
  // =========================================================================

  if (!isLoading) {
    return (
      <div className="w-full max-w-3xl mx-auto mt-8 space-y-5">
        {/* Drop zone */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`relative border-2 border-dashed rounded-2xl transition-all duration-300 p-12 ${
            isDragging
              ? "border-[#0A52EF] bg-[#0A52EF]/5 scale-[1.01] shadow-[0_0_40px_rgba(10,82,239,0.1)]"
              : "border-border hover:border-[#0A52EF]/40 hover:bg-muted/20"
          }`}
        >
          <input
            type="file"
            accept="application/pdf,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            multiple
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            onChange={handleFileChange}
          />
          <div className="flex flex-col items-center justify-center space-y-4">
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-all duration-300 ${
              isDragging ? "bg-[#0A52EF] shadow-[0_0_30px_rgba(10,82,239,0.3)]" : "bg-[#0A52EF]/10"
            }`}>
              <UploadCloud className={`w-8 h-8 transition-colors ${isDragging ? "text-white" : "text-[#0A52EF]"}`} />
            </div>
            <div className="text-center">
              <h3 className="text-lg font-semibold text-foreground">Drop your RFP here</h3>
              <p className="text-sm text-muted-foreground mt-1.5 max-w-md">
                Project manuals, spec books, bid documents — drop any PDF or Excel and we&apos;ll extract every LED display spec.
              </p>
            </div>
            <div className="flex gap-2 text-[11px] text-muted-foreground">
              {[
                { icon: FileIcon, label: "PDF up to 2GB" },
                { icon: FileSpreadsheet, label: "Excel (.xlsx)" },
                { icon: Sparkles, label: "Auto-extract" },
                { icon: Monitor, label: "LED specs" },
              ].map((item, i) => (
                <span key={i} className="bg-muted/80 px-2.5 py-1 rounded-md flex items-center gap-1.5">
                  <item.icon className="w-3 h-3" /> {item.label}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Bid form attachment */}
        <div className="flex items-center justify-center gap-3">
          {bidFormFile ? (
            <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
              <FileSpreadsheet className="w-4 h-4 text-amber-600" />
              <span className="text-sm text-amber-800 dark:text-amber-300">{bidFormFile.name}</span>
              <button onClick={() => setBidFormFile(null)} className="ml-1 p-0.5 hover:bg-amber-200/50 rounded">
                <X className="w-3 h-3 text-amber-600" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => bidFormInputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 border border-dashed border-border rounded-lg transition-colors"
            >
              <FileSpreadsheet className="w-4 h-4" />
              Have a bid form? Attach it here
            </button>
          )}
          <input
            ref={bidFormInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) setBidFormFile(f); e.target.value = ""; }}
            className="hidden"
          />
        </div>

        {/* Pipeline preview */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { icon: Database, label: "Extract text", desc: "Every page scanned" },
            { icon: Filter, label: "Filter noise", desc: "Keep LED pages only" },
            { icon: Eye, label: "Read drawings", desc: "Document AI + Vision" },
            { icon: Sparkles, label: "Extract specs", desc: "Displays, sizes, pitch" },
          ].map((step, i) => (
            <div key={i} className="flex flex-col items-center text-center px-2 py-3 rounded-xl bg-muted/30 border border-border/50">
              <step.icon className="w-4 h-4 text-muted-foreground mb-1.5" />
              <span className="text-[11px] font-medium text-foreground">{step.label}</span>
              <span className="text-[10px] text-muted-foreground mt-0.5">{step.desc}</span>
            </div>
          ))}
        </div>

        {error && (
          <div className="p-4 border border-destructive/50 bg-destructive/10 text-destructive rounded-lg flex items-start gap-3">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <div className="text-sm">{error}</div>
          </div>
        )}
      </div>
    );
  }

  // =========================================================================
  // PROCESSING STATE — the redesigned pipeline view
  // =========================================================================

  return (
    <div className="w-full max-w-4xl mx-auto mt-6 space-y-5">
      {/* Main processing card — dark, present, alive */}
      <div className={`relative rounded-2xl overflow-hidden transition-all duration-500 ${
        isComplete
          ? "bg-emerald-950/90 dark:bg-emerald-950/80 shadow-[0_0_60px_rgba(16,185,129,0.08)]"
          : hasError
            ? "bg-red-950/90 dark:bg-red-950/80"
            : "bg-slate-950/95 dark:bg-slate-950/90 shadow-[0_0_80px_rgba(10,82,239,0.06)]"
      }`}>
        {/* Subtle animated gradient overlay */}
        {!isComplete && !hasError && (
          <div
            className="absolute inset-0 opacity-[0.03]"
            style={{
              background: "linear-gradient(135deg, #0A52EF 0%, transparent 50%, #0A52EF 100%)",
              backgroundSize: "400% 400%",
              animation: "gradientShift 8s ease infinite",
            }}
          />
        )}

        <div className="relative z-10 p-6 sm:p-8">
          {/* Header row: filename + timer */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3 min-w-0">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                isComplete ? "bg-emerald-500/20" : hasError ? "bg-red-500/20" : "bg-[#0A52EF]/20"
              }`}>
                {isComplete ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                ) : hasError ? (
                  <AlertCircle className="w-5 h-5 text-red-400" />
                ) : (
                  <Zap className="w-5 h-5 text-[#0A52EF] animate-pulse" />
                )}
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-white truncate">
                  {isComplete ? "Analysis Complete" : hasError ? "Pipeline Error" : "Analyzing Document"}
                </h3>
                {fileName && (
                  <p className="text-xs text-white/40 truncate mt-0.5">{fileName}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-white/30 font-mono tabular-nums shrink-0">
              <Clock className="w-3 h-3" />
              {formatTime(elapsedSeconds)}
            </div>
          </div>

          {/* Overall progress bar */}
          <div className="mb-6">
            <div className="h-1 bg-white/[0.06] rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ease-out ${
                  isComplete ? "bg-emerald-500" : hasError ? "bg-red-500" : "bg-[#0A52EF]"
                }`}
                style={{ width: `${overallPercent}%` }}
              />
            </div>
          </div>

          {/* Live status message */}
          <div className="mb-6">
            <p className={`text-sm font-medium ${
              isComplete ? "text-emerald-300" : hasError ? "text-red-300" : "text-white/80"
            }`}>
              {latestMessage}
            </p>
          </div>

          {/* Pipeline stages — horizontal stepper */}
          <div className="flex items-start gap-1 mb-6">
            {stages.map((stage, idx) => {
              const Icon = stage.icon;
              const isActive = stage.status === "active";
              const isDone = stage.status === "done";
              const isErr = stage.status === "error";
              const isWarn = stage.status === "warning";
              const isPending = stage.status === "pending";

              return (
                <React.Fragment key={stage.key}>
                  {idx > 0 && (
                    <div className="flex-shrink-0 pt-4 px-0.5">
                      <div className={`w-4 h-[2px] rounded-full transition-all duration-500 ${
                        isDone || (stages[idx - 1]?.status === "done") ? "bg-emerald-500/60" : "bg-white/[0.06]"
                      }`} />
                    </div>
                  )}
                  <div className={`flex-1 min-w-0 rounded-xl px-3 py-3 transition-all duration-500 ${
                    isActive ? "bg-[#0A52EF]/10 ring-1 ring-[#0A52EF]/20" :
                    isDone ? "bg-emerald-500/[0.06]" :
                    isErr ? "bg-red-500/10" :
                    isWarn ? "bg-amber-500/10" :
                    "bg-white/[0.02]"
                  }`}>
                    {/* Icon + status indicator */}
                    <div className="flex items-center gap-2 mb-1.5">
                      {isDone ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      ) : isActive ? (
                        <Loader2 className="w-3.5 h-3.5 text-[#0A52EF] animate-spin shrink-0" />
                      ) : isErr ? (
                        <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                      ) : isWarn ? (
                        <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      ) : (
                        <Icon className="w-3.5 h-3.5 text-white/20 shrink-0" />
                      )}
                      <span className={`text-[11px] font-semibold truncate ${
                        isActive ? "text-[#0A52EF]" :
                        isDone ? "text-emerald-400/80" :
                        isErr ? "text-red-400/80" :
                        isWarn ? "text-amber-400/80" :
                        "text-white/20"
                      }`}>
                        {isActive ? stage.activeLabel : stage.label}
                      </span>
                    </div>

                    {/* Count / detail */}
                    {stage.count && (
                      <p className={`text-[10px] font-mono tabular-nums truncate ${
                        isDone ? "text-emerald-400/60" :
                        isActive ? "text-[#0A52EF]/70" :
                        "text-white/20"
                      }`}>
                        {stage.count}
                      </p>
                    )}
                    {isActive && stage.detail && (
                      <p className="text-[10px] text-white/30 truncate mt-0.5">
                        {stage.detail}
                      </p>
                    )}
                  </div>
                </React.Fragment>
              );
            })}
          </div>

          {/* Live stats grid — appears after first data */}
          {(stats.totalPages > 0 || stats.specsFound > 0) && (
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              <StatPill label="Pages" value={stats.totalPages} show={stats.totalPages > 0} />
              <StatPill label="Relevant" value={stats.relevantPages} show={stats.relevantPages > 0} accent="emerald" />
              <StatPill label="Filtered" value={stats.noisePages} show={stats.noisePages > 0} />
              <StatPill label="Drawings" value={stats.drawingPages} show={stats.drawingPages > 0} accent="blue" />
              <StatPill label="Tables" value={stats.tablesFound} show={stats.tablesFound > 0} />
              <StatPill
                label="LED Specs"
                value={stats.specsFound}
                show={stats.specsFound > 0}
                accent="primary"
                highlight
              />
            </div>
          )}
        </div>
      </div>

      {/* Annotation badge — when Document AI finds specs directly */}
      {stats.annotationSpecs > 0 && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-[#0A52EF]/5 border border-[#0A52EF]/20 rounded-xl">
          <Layers className="w-4 h-4 text-[#0A52EF]" />
          <span className="text-xs text-[#0A52EF] font-medium">
            Mistral Document AI extracted {stats.annotationSpecs} specs directly from drawings
          </span>
        </div>
      )}

      {/* Gradient animation keyframes */}
      <style jsx>{`
        @keyframes gradientShift {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
      `}</style>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stat pill — small counter in the live stats grid
// ---------------------------------------------------------------------------

function StatPill({
  label,
  value,
  show,
  accent,
  highlight,
}: {
  label: string;
  value: number;
  show: boolean;
  accent?: "emerald" | "blue" | "primary";
  highlight?: boolean;
}) {
  if (!show) {
    return (
      <div className="rounded-lg bg-white/[0.02] px-3 py-2">
        <p className="text-[10px] text-white/15 mb-0.5">{label}</p>
        <p className="text-sm font-mono text-white/10">--</p>
      </div>
    );
  }

  const accentColor = accent === "emerald" ? "text-emerald-400"
    : accent === "blue" ? "text-blue-400"
    : accent === "primary" ? "text-[#0A52EF]"
    : "text-white/60";

  const bgColor = highlight ? "bg-[#0A52EF]/[0.08] ring-1 ring-[#0A52EF]/20" : "bg-white/[0.03]";

  return (
    <div className={`rounded-lg px-3 py-2 transition-all duration-500 ${bgColor}`}>
      <p className="text-[10px] text-white/30 mb-0.5">{label}</p>
      <p className={`text-sm font-bold font-mono tabular-nums ${accentColor}`}>
        {value.toLocaleString()}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Build stages from SSE events
// ---------------------------------------------------------------------------

function buildStages(events: PipelineEvent[]): StageState[] {
  const stages: StageState[] = [
    { key: "upload",  label: "Upload",     activeLabel: "Uploading...",         icon: UploadCloud, status: "pending" },
    { key: "ocr",     label: "Text OCR",   activeLabel: "Extracting text...",   icon: Database,    status: "pending" },
    { key: "triage",  label: "Classify",   activeLabel: "Classifying pages...", icon: Filter,      status: "pending" },
    { key: "vision",  label: "Vision",     activeLabel: "Reading drawings...",  icon: Eye,         status: "pending" },
    { key: "extract", label: "Extract",    activeLabel: "Extracting specs...",  icon: Sparkles,    status: "pending" },
  ];

  let currentActive: string | null = null;

  for (const event of events) {
    if (event.type === "stage") {
      const s = event.stage || "";

      if (s === "uploading") {
        currentActive = "upload";
      } else if (s === "uploaded") {
        markDone(stages, "upload");
      } else if (s === "reading" || s === "ocr") {
        markDone(stages, "upload");
        currentActive = "ocr";
      } else if (s === "ocr_done") {
        markDone(stages, "ocr");
        const st = stages.find((x) => x.key === "ocr");
        if (st && event.totalPages) st.count = `${event.totalPages.toLocaleString()} pages`;
      } else if (s === "triaging") {
        markDone(stages, "ocr");
        currentActive = "triage";
      } else if (s === "triaged") {
        markDone(stages, "triage");
        const st = stages.find((x) => x.key === "triage");
        if (st && event.relevant != null && event.noise != null) {
          st.count = `${event.relevant} kept`;
        }
      } else if (s === "processing_text" || s === "vision") {
        markDone(stages, "triage");
        currentActive = "vision";
      } else if (s === "vision_done") {
        markDone(stages, "vision");
        const st = stages.find((x) => x.key === "vision");
        if (st) {
          const parts: string[] = [];
          if ((event as any).textPages != null) parts.push(`${(event as any).textPages} text`);
          if ((event as any).visionPages != null && (event as any).visionPages > 0) parts.push(`${(event as any).visionPages} vision`);
          if ((event as any).annotationSpecs != null && (event as any).annotationSpecs > 0) parts.push(`${(event as any).annotationSpecs} AI specs`);
          if (parts.length > 0) st.count = parts.join(" + ");
        }
      } else if (s === "extracting") {
        markDone(stages, "vision");
        currentActive = "extract";
      } else if (s === "extracted") {
        markDone(stages, "extract");
        const st = stages.find((x) => x.key === "extract");
        if (st && event.specsFound != null) {
          st.count = `${event.specsFound} displays`;
        }
      } else if (s === "provisioning_workspace") {
        markDone(stages, "extract");
      }
    }

    if (event.type === "warning") {
      if (currentActive === "vision") {
        const st = stages.find((x) => x.key === "vision");
        if (st) { st.status = "warning"; st.detail = event.message; }
      }
    }

    if (event.type === "progress") {
      const stageKey = event.stage || "";
      const keyMap: Record<string, string> = { vision: "vision", ocr: "ocr", extracting: "extract" };
      const mappedKey = keyMap[stageKey] || stageKey;
      const st = stages.find((x) => x.key === mappedKey);
      if (st) {
        if (event.current != null && event.total != null) {
          st.count = `${event.current}/${event.total}`;
        }
        st.detail = event.message;
      }
    }

    if (event.type === "complete") {
      stages.forEach((st) => { st.status = "done"; });
      const st = stages.find((x) => x.key === "extract");
      if (st && event.result?.screens) st.count = `${event.result.screens.length} displays`;
      return stages;
    }

    if (event.type === "error") {
      if (currentActive) {
        const st = stages.find((x) => x.key === currentActive);
        if (st) { st.status = "error"; st.detail = event.message; }
      }
    }
  }

  if (currentActive) {
    const st = stages.find((x) => x.key === currentActive);
    if (st && st.status !== "done" && st.status !== "error" && st.status !== "warning") {
      st.status = "active";
    }
  }

  return stages;
}

function markDone(stages: StageState[], key: string) {
  const s = stages.find((x) => x.key === key);
  if (s && s.status !== "error" && s.status !== "warning") s.status = "done";
}
