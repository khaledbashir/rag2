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
  ArrowRight,
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
  const completedCount = stages.filter((s) => s.status === "done").length;
  const overallPercent = isComplete ? 100 : Math.round((completedCount / stages.length) * 100 + (stages.some(s => s.status === "active") ? 10 : 0));

  // =========================================================================
  // UPLOAD STATE (not loading)
  // =========================================================================

  if (!isLoading) {
    return (
      <div className="w-full max-w-3xl mx-auto mt-8 space-y-6">
        {/* Hero drop zone */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`relative rounded-2xl transition-all duration-300 overflow-hidden ${
            isDragging
              ? "ring-2 ring-[#0A52EF] shadow-[0_0_40px_rgba(10,82,239,0.12)]"
              : "ring-1 ring-gray-200 hover:ring-[#0A52EF]/40 hover:shadow-lg"
          }`}
        >
          {/* Top accent bar */}
          <div className="h-1 bg-gradient-to-r from-[#0A52EF] via-[#0A52EF]/60 to-[#0A52EF]/20" />

          <input
            type="file"
            accept="application/pdf,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            multiple
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
            onChange={handleFileChange}
          />

          <div className={`px-10 py-14 transition-colors duration-300 ${
            isDragging ? "bg-[#0A52EF]/[0.03]" : "bg-white"
          }`}>
            <div className="flex flex-col items-center justify-center space-y-5">
              <div className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-all duration-300 ${
                isDragging
                  ? "bg-[#0A52EF] shadow-lg shadow-[#0A52EF]/20 scale-110"
                  : "bg-[#0A52EF]/[0.07]"
              }`}>
                <UploadCloud className={`w-7 h-7 transition-colors ${isDragging ? "text-white" : "text-[#0A52EF]"}`} />
              </div>

              <div className="text-center space-y-2">
                <h3 className="text-xl font-semibold text-gray-900">Drop your RFP here</h3>
                <p className="text-sm text-gray-500 max-w-sm leading-relaxed">
                  Project manuals, spec books, bid documents — drop any PDF and we&apos;ll extract every LED display spec automatically.
                </p>
              </div>

              <button className="mt-1 px-5 py-2.5 bg-[#0A52EF] text-white text-sm font-medium rounded-lg hover:bg-[#0A52EF]/90 transition-colors shadow-sm pointer-events-none">
                Select Files
              </button>

              <div className="flex gap-3 mt-2">
                {[
                  { icon: FileIcon, label: "PDF up to 2GB" },
                  { icon: FileSpreadsheet, label: "Excel (.xlsx)" },
                  { icon: Sparkles, label: "AI extraction" },
                ].map((item, i) => (
                  <span key={i} className="flex items-center gap-1.5 text-[11px] text-gray-400 bg-gray-50 px-3 py-1.5 rounded-full">
                    <item.icon className="w-3 h-3" /> {item.label}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Bid form attachment */}
        <div className="flex items-center justify-center">
          {bidFormFile ? (
            <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 border border-amber-200 rounded-lg">
              <FileSpreadsheet className="w-4 h-4 text-amber-600" />
              <span className="text-sm text-amber-800">{bidFormFile.name}</span>
              <button onClick={() => setBidFormFile(null)} className="ml-1 p-0.5 hover:bg-amber-200/50 rounded">
                <X className="w-3 h-3 text-amber-600" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => bidFormInputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2 text-sm text-gray-400 hover:text-gray-600 hover:bg-gray-50 border border-dashed border-gray-200 rounded-lg transition-colors"
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

        {/* Pipeline preview steps */}
        <div className="flex items-center justify-center gap-2">
          {[
            { icon: Database, label: "OCR scan" },
            { icon: Filter, label: "Filter pages" },
            { icon: Eye, label: "Read drawings" },
            { icon: Sparkles, label: "Extract specs" },
          ].map((step, i) => (
            <React.Fragment key={i}>
              {i > 0 && <ArrowRight className="w-3 h-3 text-gray-300 shrink-0" />}
              <div className="flex items-center gap-1.5 text-xs text-gray-500 bg-gray-50 px-3 py-1.5 rounded-lg">
                <step.icon className="w-3.5 h-3.5 text-gray-400" />
                {step.label}
              </div>
            </React.Fragment>
          ))}
        </div>

        {error && (
          <div className="p-4 border border-red-200 bg-red-50 text-red-700 rounded-lg flex items-start gap-3">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <div className="text-sm">{error}</div>
          </div>
        )}
      </div>
    );
  }

  // =========================================================================
  // PROCESSING STATE — light theme, alive pipeline
  // =========================================================================

  return (
    <div className="w-full max-w-4xl mx-auto mt-6 space-y-4">
      {/* Main processing card — white, clean, professional */}
      <div className={`relative rounded-2xl overflow-hidden transition-all duration-500 bg-white ring-1 ${
        isComplete
          ? "ring-emerald-200 shadow-[0_4px_30px_rgba(16,185,129,0.08)]"
          : hasError
            ? "ring-red-200 shadow-[0_4px_30px_rgba(239,68,68,0.08)]"
            : "ring-gray-200 shadow-[0_4px_40px_rgba(10,82,239,0.06)]"
      }`}>
        {/* Top accent bar — animated when processing */}
        <div className="h-1 relative overflow-hidden bg-gray-100">
          <div
            className={`h-full rounded-full transition-all duration-700 ease-out ${
              isComplete ? "bg-emerald-500" : hasError ? "bg-red-500" : "bg-[#0A52EF]"
            }`}
            style={{ width: `${overallPercent}%` }}
          />
          {!isComplete && !hasError && (
            <div
              className="absolute inset-0 h-full opacity-30"
              style={{
                background: "linear-gradient(90deg, transparent 0%, #0A52EF 50%, transparent 100%)",
                backgroundSize: "200% 100%",
                animation: "shimmer 2s ease-in-out infinite",
              }}
            />
          )}
        </div>

        <div className="p-6 sm:p-8">
          {/* Header row: filename + timer */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3 min-w-0">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                isComplete ? "bg-emerald-50" : hasError ? "bg-red-50" : "bg-[#0A52EF]/[0.07]"
              }`}>
                {isComplete ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                ) : hasError ? (
                  <AlertCircle className="w-5 h-5 text-red-500" />
                ) : (
                  <Zap className="w-5 h-5 text-[#0A52EF] animate-pulse" />
                )}
              </div>
              <div className="min-w-0">
                <h3 className={`text-sm font-semibold truncate ${
                  isComplete ? "text-emerald-700" : hasError ? "text-red-700" : "text-gray-900"
                }`}>
                  {isComplete ? "Analysis Complete" : hasError ? "Pipeline Error" : "Analyzing Document"}
                </h3>
                {fileName && (
                  <p className="text-xs text-gray-400 truncate mt-0.5">{fileName}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-gray-400 font-mono tabular-nums shrink-0">
              <Clock className="w-3 h-3" />
              {formatTime(elapsedSeconds)}
            </div>
          </div>

          {/* Live status message */}
          <div className="mb-6">
            <p className={`text-sm font-medium ${
              isComplete ? "text-emerald-600" : hasError ? "text-red-600" : "text-gray-600"
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

              return (
                <React.Fragment key={stage.key}>
                  {idx > 0 && (
                    <div className="flex-shrink-0 pt-4 px-0.5">
                      <div className={`w-4 h-[2px] rounded-full transition-all duration-500 ${
                        isDone || (stages[idx - 1]?.status === "done") ? "bg-emerald-400" : "bg-gray-200"
                      }`} />
                    </div>
                  )}
                  <div className={`flex-1 min-w-0 rounded-xl px-3 py-3 transition-all duration-500 ${
                    isActive ? "bg-[#0A52EF]/[0.04] ring-1 ring-[#0A52EF]/20" :
                    isDone ? "bg-emerald-50/60" :
                    isErr ? "bg-red-50" :
                    isWarn ? "bg-amber-50" :
                    "bg-gray-50/60"
                  }`}>
                    <div className="flex items-center gap-2 mb-1.5">
                      {isDone ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      ) : isActive ? (
                        <Loader2 className="w-3.5 h-3.5 text-[#0A52EF] animate-spin shrink-0" />
                      ) : isErr ? (
                        <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                      ) : isWarn ? (
                        <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      ) : (
                        <Icon className="w-3.5 h-3.5 text-gray-300 shrink-0" />
                      )}
                      <span className={`text-[11px] font-semibold truncate ${
                        isActive ? "text-[#0A52EF]" :
                        isDone ? "text-emerald-600" :
                        isErr ? "text-red-600" :
                        isWarn ? "text-amber-600" :
                        "text-gray-300"
                      }`}>
                        {isActive ? stage.activeLabel : stage.label}
                      </span>
                    </div>

                    {stage.count && (
                      <p className={`text-[10px] font-mono tabular-nums truncate ${
                        isDone ? "text-emerald-500/70" :
                        isActive ? "text-[#0A52EF]/60" :
                        "text-gray-300"
                      }`}>
                        {stage.count}
                      </p>
                    )}
                    {isActive && stage.detail && (
                      <p className="text-[10px] text-gray-400 truncate mt-0.5">
                        {stage.detail}
                      </p>
                    )}
                  </div>
                </React.Fragment>
              );
            })}
          </div>

          {/* Live stats grid */}
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

      {/* Annotation badge */}
      {stats.annotationSpecs > 0 && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-[#0A52EF]/[0.04] border border-[#0A52EF]/15 rounded-xl">
          <Layers className="w-4 h-4 text-[#0A52EF]" />
          <span className="text-xs text-[#0A52EF] font-medium">
            Document AI extracted {stats.annotationSpecs} specs directly from drawings
          </span>
        </div>
      )}

      {/* Shimmer animation */}
      <style jsx>{`
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
      `}</style>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stat pill — light theme
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
      <div className="rounded-lg bg-gray-50 px-3 py-2">
        <p className="text-[10px] text-gray-300 mb-0.5">{label}</p>
        <p className="text-sm font-mono text-gray-200">--</p>
      </div>
    );
  }

  const accentColor = accent === "emerald" ? "text-emerald-600"
    : accent === "blue" ? "text-[#0A52EF]"
    : accent === "primary" ? "text-[#0A52EF]"
    : "text-gray-700";

  const bgColor = highlight
    ? "bg-[#0A52EF]/[0.05] ring-1 ring-[#0A52EF]/15"
    : "bg-gray-50";

  return (
    <div className={`rounded-lg px-3 py-2 transition-all duration-500 ${bgColor}`}>
      <p className="text-[10px] text-gray-400 mb-0.5">{label}</p>
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
  // Check if OpenClaw is handling this (simplified UX)
  const isDirectAI = events.some((e) =>
    (e as any).extractionSource === "openclaw" ||
    (e as any).extractionSource === "gemini" ||
    (e as any).extractionSource === "glm5" ||
    (e.message && (e.message.includes("AI agent") || e.message.includes("Analyzing PDF with AI")))
  );

  const stages: StageState[] = isDirectAI
    ? [
        { key: "upload",  label: "Upload",   activeLabel: "Uploading...",       icon: UploadCloud, status: "pending" },
        { key: "extract", label: "Analyze",  activeLabel: "AI analyzing PDF...", icon: Sparkles,    status: "pending" },
      ]
    : [
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
        if (!isDirectAI) currentActive = "ocr";
      } else if (s === "ocr_done") {
        if (!isDirectAI) markDone(stages, "ocr");
        const st = stages.find((x) => x.key === "ocr");
        if (st && event.totalPages) st.count = `${event.totalPages.toLocaleString()} pages`;
      } else if (s === "triaging") {
        if (!isDirectAI) { markDone(stages, "ocr"); currentActive = "triage"; }
      } else if (s === "triaged") {
        if (!isDirectAI) {
          markDone(stages, "triage");
          const st = stages.find((x) => x.key === "triage");
          if (st && event.relevant != null && event.noise != null) {
            st.count = `${event.relevant} kept`;
          }
        }
      } else if (s === "processing_text" || s === "vision") {
        if (!isDirectAI) { markDone(stages, "triage"); currentActive = "vision"; }
      } else if (s === "vision_done") {
        if (!isDirectAI) {
          markDone(stages, "vision");
          const st = stages.find((x) => x.key === "vision");
          if (st) {
            const parts: string[] = [];
            if ((event as any).textPages != null) parts.push(`${(event as any).textPages} text`);
            if ((event as any).visionPages != null && (event as any).visionPages > 0) parts.push(`${(event as any).visionPages} vision`);
            if ((event as any).annotationSpecs != null && (event as any).annotationSpecs > 0) parts.push(`${(event as any).annotationSpecs} AI specs`);
            if (parts.length > 0) st.count = parts.join(" + ");
          }
        }
      } else if (s === "extracting") {
        markDone(stages, "upload");
        if (!isDirectAI) markDone(stages, "vision");
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
