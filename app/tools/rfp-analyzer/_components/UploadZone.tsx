"use client";

import React, { useCallback, useState, useEffect, useRef } from "react";
import {
  UploadCloud,
  File as FileIcon,
  Loader2,
  AlertCircle,
  Clock,
  CheckCircle2,
  Brain,
  Eye,
  Sparkles,
  Monitor,
  Database,
  Filter,
  FileSpreadsheet,
  X,
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
  icon: typeof UploadCloud;
  status: "pending" | "active" | "done" | "error" | "warning";
  detail?: string;
  count?: string;
}

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

  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); if (!isLoading) setIsDragging(true); }, [isLoading]);
  const handleDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); }, []);

  const validateAndUpload = (files: File[]) => {
    setError(null);
    // Separate PDFs from Excel bid forms
    const pdfFiles = files.filter((f) => f.type === "application/pdf" || f.name.endsWith(".pdf"));
    const excelFiles = files.filter((f) => f.name.endsWith(".xlsx") || f.name.endsWith(".xls"));

    // If only Excel dropped — analyze it directly as starting point
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
    // Pass bid form if one was attached (from drop or prior selection)
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

  const latestMessage = [...events].reverse().find((e) => e.message)?.message || "Starting...";

  return (
    <div className="w-full max-w-3xl mx-auto mt-8 space-y-6">
      {/* Drop zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative border-2 border-dashed rounded-xl transition-all ${
          isLoading ? "border-primary/30 bg-primary/5 cursor-not-allowed p-8"
          : isDragging ? "border-primary bg-primary/5 scale-[1.01] p-12"
          : "border-border hover:border-primary/50 hover:bg-muted/30 p-12"
        }`}
      >
        {!isLoading && (
          <input
            type="file"
            accept="application/pdf,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            multiple
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            onChange={handleFileChange}
          />
        )}
        <div className="flex flex-col items-center justify-center space-y-4">
          {isLoading ? (
            <div className="flex flex-col items-center w-full max-w-lg">
              <Loader2 className="w-10 h-10 mb-3 animate-spin text-primary" />
              {fileName && <p className="text-xs text-muted-foreground mb-2 truncate max-w-xs">{fileName}</p>}

              {/* Current action */}
              <p className="text-sm text-primary font-medium mb-4 text-center">{latestMessage}</p>

              {/* Elapsed time */}
              <div className="flex items-center gap-1 text-xs text-muted-foreground mb-5">
                <Clock className="w-3 h-3" />
                {formatTime(elapsedSeconds)}
              </div>

              {/* Pipeline stages */}
              <div className="flex flex-col gap-1.5 w-full">
                {stages.map((stage) => {
                  const Icon = stage.icon;
                  return (
                    <div
                      key={stage.key}
                      className={`flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm transition-all duration-300 ${
                        stage.status === "active" ? "bg-primary/10 text-primary font-medium"
                        : stage.status === "done" ? "text-foreground/70"
                        : stage.status === "error" ? "text-destructive/70"
                        : stage.status === "warning" ? "text-amber-600/70"
                        : "text-muted-foreground/30"
                      }`}
                    >
                      {stage.status === "done" ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                      ) : stage.status === "active" ? (
                        <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                      ) : stage.status === "error" ? (
                        <AlertCircle className="w-4 h-4 shrink-0" />
                      ) : stage.status === "warning" ? (
                        <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
                      ) : (
                        <Icon className="w-4 h-4 shrink-0" />
                      )}
                      <span className="flex-1">{stage.label}</span>
                      {stage.count && (
                        <span className={`text-xs font-mono ${stage.status === "done" ? "text-emerald-500" : "text-primary"}`}>
                          {stage.count}
                        </span>
                      )}
                      {stage.detail && (
                        <span className="text-xs text-muted-foreground truncate max-w-[200px]">{stage.detail}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <>
              <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center">
                <UploadCloud className="w-7 h-7 text-primary" />
              </div>
              <div className="text-center">
                <h3 className="text-lg font-semibold text-foreground">Drop your RFP here</h3>
                <p className="text-sm text-muted-foreground mt-1.5 max-w-md">
                  Project manuals, spec books, bid documents — drop any PDF or Excel file and we&apos;ll pull out every LED display spec automatically.
                </p>
              </div>
              <div className="flex gap-2 text-[11px] text-muted-foreground">
                <span className="bg-muted/80 px-2.5 py-1 rounded-md flex items-center gap-1.5">
                  <FileIcon className="w-3 h-3" /> PDF up to 2GB
                </span>
                <span className="bg-muted/80 px-2.5 py-1 rounded-md flex items-center gap-1.5">
                  <FileSpreadsheet className="w-3 h-3" /> Excel (.xlsx)
                </span>
                <span className="bg-muted/80 px-2.5 py-1 rounded-md flex items-center gap-1.5">
                  <Sparkles className="w-3 h-3" /> Auto-extract
                </span>
                <span className="bg-muted/80 px-2.5 py-1 rounded-md flex items-center gap-1.5">
                  <Monitor className="w-3 h-3" /> LED extraction
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Optional bid form attachment */}
      {!isLoading && (
        <div className="flex items-center justify-center gap-3">
          {bidFormFile ? (
            <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
              <FileSpreadsheet className="w-4 h-4 text-amber-600" />
              <span className="text-sm text-amber-800 dark:text-amber-300">{bidFormFile.name}</span>
              <button
                onClick={() => setBidFormFile(null)}
                className="ml-1 p-0.5 hover:bg-amber-200/50 rounded"
              >
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
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) setBidFormFile(f);
              e.target.value = "";
            }}
            className="hidden"
          />
        </div>
      )}

      {/* What happens after upload — pipeline preview */}
      {!isLoading && (
        <div className="grid grid-cols-4 gap-3">
          {[
            { icon: FileIcon, label: "Extract text", desc: "Every page scanned" },
            { icon: Filter, label: "Filter noise", desc: "Keep LED pages only" },
            { icon: Eye, label: "Read drawings", desc: "Vision OCR on diagrams" },
            { icon: Sparkles, label: "Extract specs", desc: "Displays, sizes, pitch" },
          ].map((step, i) => (
            <div key={i} className="flex flex-col items-center text-center px-2 py-3 rounded-lg bg-muted/30 border border-border/50">
              <step.icon className="w-4 h-4 text-muted-foreground mb-1.5" />
              <span className="text-[11px] font-medium text-foreground">{step.label}</span>
              <span className="text-[10px] text-muted-foreground mt-0.5">{step.desc}</span>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="p-4 border border-destructive/50 bg-destructive/10 text-destructive rounded-lg flex items-start gap-3">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <div className="text-sm">{error}</div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Build stages from SSE events — matches route.ts event names exactly
// ---------------------------------------------------------------------------

function buildStages(events: PipelineEvent[]): StageState[] {
  const stages: StageState[] = [
    { key: "upload",    label: "Upload received",                       icon: UploadCloud, status: "pending" },
    { key: "ocr",       label: "Text extraction (pdftotext)",           icon: Database,    status: "pending" },
    { key: "triage",    label: "Page triage & classification",          icon: Filter,      status: "pending" },
    { key: "vision",    label: "Processing pages (text + vision OCR)",  icon: Eye,         status: "pending" },
    { key: "extract",   label: "Pulling LED specs & requirements",      icon: Monitor,     status: "pending" },
  ];

  let currentActive: string | null = null;

  for (const event of events) {
    if (event.type === "stage") {
      const s = event.stage || "";

      // Upload phase
      if (s === "uploading") {
        currentActive = "upload";
      } else if (s === "uploaded") {
        markDone(stages, "upload");
      }

      // Kreuzberg OCR
      else if (s === "reading" || s === "ocr") {
        markDone(stages, "upload");
        currentActive = "ocr";
      } else if (s === "ocr_done") {
        markDone(stages, "ocr");
        const st = stages.find((x) => x.key === "ocr");
        if (st) {
          if (event.totalPages) st.count = `${event.totalPages} pages`;
        }
      }

      // Triage
      else if (s === "triaging") {
        markDone(stages, "ocr");
        currentActive = "triage";
      } else if (s === "triaged") {
        markDone(stages, "triage");
        const st = stages.find((x) => x.key === "triage");
        if (st && event.relevant != null && event.noise != null) {
          st.count = `${event.relevant} kept, ${event.noise} filtered`;
        }
      }

      // Text pages + drawing vision
      else if (s === "processing_text") {
        markDone(stages, "triage");
        currentActive = "vision";
      } else if (s === "vision") {
        markDone(stages, "triage");
        currentActive = "vision";
      } else if (s === "vision_done") {
        markDone(stages, "vision");
        const st = stages.find((x) => x.key === "vision");
        if (st) {
          const parts: string[] = [];
          if ((event as any).textPages != null) parts.push(`${(event as any).textPages} text`);
          if ((event as any).visionPages != null && (event as any).visionPages > 0) parts.push(`${(event as any).visionPages} drawings`);
          if (event.tables != null && event.tables > 0) parts.push(`${event.tables} tables`);
          if (parts.length > 0) st.count = parts.join(", ");
        }
      }

      // AI extraction
      else if (s === "extracting") {
        markDone(stages, "vision");
        currentActive = "extract";
      } else if (s === "extracted") {
        markDone(stages, "extract");
        const st = stages.find((x) => x.key === "extract");
        if (st && event.specsFound != null) {
          st.count = `${event.specsFound} displays`;
        }
      }
    }

    // Warnings (e.g. Mistral OCR fallback)
    if (event.type === "warning") {
      if (currentActive === "vision") {
        const st = stages.find((x) => x.key === "vision");
        if (st) { st.status = "warning"; st.detail = event.message; }
      }
    }

    // Progress updates — show current/total for per-page processing
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

    // Complete — all done
    if (event.type === "complete") {
      stages.forEach((st) => { st.status = "done"; });
      const st = stages.find((x) => x.key === "extract");
      if (st && event.result?.screens) st.count = `${event.result.screens.length} displays`;
      return stages;
    }

    // Error
    if (event.type === "error") {
      if (currentActive) {
        const st = stages.find((x) => x.key === currentActive);
        if (st) { st.status = "error"; st.detail = event.message; }
      }
    }
  }

  // Set active stage
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
