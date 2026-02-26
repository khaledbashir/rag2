"use client";

/**
 * RevisionRadarPanel — Upload two Excel files (original + revised),
 * compare them section-by-section, see dollar impact at a glance.
 */

import React, { useState, useCallback, useRef } from "react";
import {
  X,
  Upload,
  ArrowRightLeft,
  ChevronDown,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  Minus,
  Plus,
  Trash2,
  Loader2,
  AlertCircle,
} from "lucide-react";
import type { DeltaResult, DeltaSection, DeltaRow } from "@/services/revision/deltaScanner";

interface RevisionRadarPanelProps {
  open: boolean;
  onClose: () => void;
}

const fmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const pctFmt = (v: number | null) => (v === null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`);

export default function RevisionRadarPanel({ open, onClose }: RevisionRadarPanelProps) {
  const [originalFile, setOriginalFile] = useState<File | null>(null);
  const [revisedFile, setRevisedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DeltaResult | null>(null);
  const origRef = useRef<HTMLInputElement>(null!);
  const revRef = useRef<HTMLInputElement>(null!);

  const handleCompare = useCallback(async () => {
    if (!originalFile || !revisedFile) return;
    setLoading(true);
    setError(null);

    try {
      const form = new FormData();
      form.append("original", originalFile);
      form.append("revised", revisedFile);

      const res = await fetch("/api/revision/compare", { method: "POST", body: form });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Comparison failed");
      }

      setResult(data.result);
    } catch (err: any) {
      setError(err.message || "Failed to compare files");
    } finally {
      setLoading(false);
    }
  }, [originalFile, revisedFile]);

  const handleReset = useCallback(() => {
    setOriginalFile(null);
    setRevisedFile(null);
    setResult(null);
    setError(null);
  }, []);

  if (!open) return null;

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="shrink-0 px-5 py-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ArrowRightLeft className="w-4 h-4 text-amber-500" />
          <span className="text-sm font-semibold">Revision Radar</span>
          <span className="text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 px-1.5 py-0.5 rounded-full font-medium">
            Delta Scanner
          </span>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {!result ? (
          <UploadStep
            originalFile={originalFile}
            revisedFile={revisedFile}
            onOriginalChange={setOriginalFile}
            onRevisedChange={setRevisedFile}
            origRef={origRef}
            revRef={revRef}
            loading={loading}
            error={error}
            onCompare={handleCompare}
          />
        ) : (
          <ResultsView result={result} onReset={handleReset} />
        )}
      </div>
    </div>
  );
}

// ============================================================================
// UPLOAD STEP
// ============================================================================

function UploadStep({
  originalFile,
  revisedFile,
  onOriginalChange,
  onRevisedChange,
  origRef,
  revRef,
  loading,
  error,
  onCompare,
}: {
  originalFile: File | null;
  revisedFile: File | null;
  onOriginalChange: (f: File | null) => void;
  onRevisedChange: (f: File | null) => void;
  origRef: React.RefObject<HTMLInputElement>;
  revRef: React.RefObject<HTMLInputElement>;
  loading: boolean;
  error: string | null;
  onCompare: () => void;
}) {
  return (
    <div className="p-5 space-y-4">
      <p className="text-xs text-muted-foreground">
        Upload the original and revised cost analysis Excel files. The system will diff their
        Budget Summary sheets section-by-section.
      </p>

      {/* Original file */}
      <FileDropBox
        label="Original (Base)"
        file={originalFile}
        onFileChange={onOriginalChange}
        inputRef={origRef}
        color="blue"
      />

      <div className="flex items-center justify-center">
        <ArrowRightLeft className="w-4 h-4 text-muted-foreground" />
      </div>

      {/* Revised file */}
      <FileDropBox
        label="Revised (Addendum)"
        file={revisedFile}
        onFileChange={onRevisedChange}
        inputRef={revRef}
        color="amber"
      />

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-xs">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <button
        onClick={onCompare}
        disabled={!originalFile || !revisedFile || loading}
        className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#1C1C1C] text-white rounded-lg text-sm font-medium hover:bg-[#1C1C1C]/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Comparing...
          </>
        ) : (
          <>
            <ArrowRightLeft className="w-4 h-4" />
            Compare Files
          </>
        )}
      </button>
    </div>
  );
}

function FileDropBox({
  label,
  file,
  onFileChange,
  inputRef,
  color,
}: {
  label: string;
  file: File | null;
  onFileChange: (f: File | null) => void;
  inputRef: React.RefObject<HTMLInputElement>;
  color: "blue" | "amber";
}) {
  const borderColor = color === "blue" ? "border-blue-300 dark:border-blue-700" : "border-amber-300 dark:border-amber-700";
  const bgColor = color === "blue" ? "bg-blue-50 dark:bg-blue-950/20" : "bg-amber-50 dark:bg-amber-950/20";
  const textColor = color === "blue" ? "text-blue-600" : "text-amber-600";

  return (
    <div
      className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors hover:bg-accent/20 ${
        file ? borderColor : "border-border"
      } ${file ? bgColor : ""}`}
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0] || null;
          onFileChange(f);
        }}
      />
      <div className="flex items-center justify-center gap-2">
        {file ? (
          <>
            <Upload className={`w-4 h-4 ${textColor}`} />
            <div className="text-left">
              <p className={`text-xs font-medium ${textColor}`}>{label}</p>
              <p className="text-[10px] text-muted-foreground truncate max-w-[200px]">
                {file.name}
              </p>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onFileChange(null);
              }}
              className="ml-auto text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </>
        ) : (
          <div>
            <Upload className="w-5 h-5 text-muted-foreground mx-auto mb-1" />
            <p className="text-xs font-medium">{label}</p>
            <p className="text-[10px] text-muted-foreground">Click to upload .xlsx</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// RESULTS VIEW
// ============================================================================

function ResultsView({ result, onReset }: { result: DeltaResult; onReset: () => void }) {
  return (
    <div className="divide-y divide-border">
      {/* Summary banner */}
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Grand Total Impact</span>
          <button
            onClick={onReset}
            className="text-[10px] text-muted-foreground hover:text-foreground underline"
          >
            Compare again
          </button>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <SummaryCard label="Original" value={result.oldGrandTotal} />
          <SummaryCard label="Revised" value={result.newGrandTotal} />
          <SummaryCard
            label="Delta"
            value={result.grandTotalDelta}
            delta
            pct={result.grandTotalPctChange}
          />
        </div>
        <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
          <span>{result.totalSections} sections</span>
          <span>{result.changedSections} changed</span>
          {result.addedSections > 0 && (
            <span className="text-emerald-600">+{result.addedSections} added</span>
          )}
          {result.removedSections > 0 && (
            <span className="text-red-600">{result.removedSections} removed</span>
          )}
          <span>{result.totalRowChanges} row changes</span>
        </div>
      </div>

      {/* Sections */}
      {result.sections.map((sec, i) => (
        <SectionDelta key={i} section={sec} />
      ))}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  delta,
  pct,
}: {
  label: string;
  value: number;
  delta?: boolean;
  pct?: number | null;
}) {
  const isPositive = value > 0;
  const isNegative = value < 0;

  return (
    <div className="p-2.5 rounded-lg bg-accent/30">
      <p className="text-[10px] text-muted-foreground mb-1">{label}</p>
      <p
        className={`text-sm font-bold ${
          delta
            ? isPositive
              ? "text-red-600"
              : isNegative
                ? "text-emerald-600"
                : "text-foreground"
            : "text-foreground"
        }`}
      >
        {delta && value > 0 ? "+" : ""}
        {fmt.format(value)}
      </p>
      {pct !== undefined && pct !== null && (
        <p className="text-[10px] text-muted-foreground">{pctFmt(pct)}</p>
      )}
    </div>
  );
}

function SectionDelta({ section }: { section: DeltaSection }) {
  const [expanded, setExpanded] = useState(section.changeType !== "unchanged");

  const icon =
    section.changeType === "added" ? (
      <Plus className="w-3 h-3 text-emerald-500" />
    ) : section.changeType === "removed" ? (
      <Trash2 className="w-3 h-3 text-red-500" />
    ) : section.delta > 0 ? (
      <TrendingUp className="w-3 h-3 text-red-500" />
    ) : section.delta < 0 ? (
      <TrendingDown className="w-3 h-3 text-emerald-500" />
    ) : (
      <Minus className="w-3 h-3 text-muted-foreground" />
    );

  const bgClass =
    section.changeType === "added"
      ? "bg-emerald-50/50 dark:bg-emerald-950/10"
      : section.changeType === "removed"
        ? "bg-red-50/50 dark:bg-red-950/10"
        : "";

  return (
    <div className={bgClass}>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 px-4 py-3 hover:bg-accent/20 transition-colors"
      >
        {expanded ? (
          <ChevronDown className="w-3 h-3 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-3 h-3 text-muted-foreground" />
        )}
        {icon}
        <span className="text-xs font-medium flex-1 text-left truncate">{section.sectionName}</span>
        <span
          className={`text-xs font-semibold ${
            section.delta > 0
              ? "text-red-600"
              : section.delta < 0
                ? "text-emerald-600"
                : "text-muted-foreground"
          }`}
        >
          {section.delta !== 0 ? `${section.delta > 0 ? "+" : ""}${fmt.format(section.delta)}` : "No change"}
        </span>
      </button>

      {expanded && (
        <div className="px-4 pb-3 space-y-0.5">
          {section.rows.map((row, i) => (
            <RowDelta key={i} row={row} />
          ))}
          {/* Section totals */}
          <div className="flex items-center justify-between pt-2 mt-2 border-t border-border/50">
            <span className="text-[10px] text-muted-foreground">Section Total</span>
            <div className="flex items-center gap-4 text-[10px]">
              <span className="text-muted-foreground">{fmt.format(section.oldTotal)}</span>
              <span className="text-foreground font-medium">{fmt.format(section.newTotal)}</span>
              <span
                className={`font-semibold ${
                  section.delta > 0 ? "text-red-600" : section.delta < 0 ? "text-emerald-600" : ""
                }`}
              >
                {section.delta !== 0 ? `${section.delta > 0 ? "+" : ""}${fmt.format(section.delta)}` : "—"}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RowDelta({ row }: { row: DeltaRow }) {
  const bgMap = {
    added: "bg-emerald-50 dark:bg-emerald-950/20",
    removed: "bg-red-50 dark:bg-red-950/20 opacity-60",
    changed: "bg-amber-50 dark:bg-amber-950/20",
    unchanged: "",
  };

  return (
    <div
      className={`flex items-center gap-2 px-3 py-1.5 rounded text-[11px] ${bgMap[row.changeType]}`}
    >
      <span
        className={`flex-1 truncate ${
          row.changeType === "removed" ? "line-through text-muted-foreground" : ""
        }`}
      >
        {row.label}
      </span>
      {row.changeType !== "unchanged" ? (
        <div className="flex items-center gap-3 shrink-0">
          {row.changeType !== "added" && (
            <span className="text-muted-foreground">{fmt.format(row.oldValue)}</span>
          )}
          {row.changeType !== "removed" && (
            <span className="font-medium">{fmt.format(row.newValue)}</span>
          )}
          <span
            className={`font-semibold min-w-[70px] text-right ${
              row.delta > 0
                ? "text-red-600"
                : row.delta < 0
                  ? "text-emerald-600"
                  : "text-muted-foreground"
            }`}
          >
            {row.delta > 0 ? "+" : ""}
            {fmt.format(row.delta)}
          </span>
        </div>
      ) : (
        <span className="text-muted-foreground shrink-0">{fmt.format(row.newValue)}</span>
      )}
    </div>
  );
}
