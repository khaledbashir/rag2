"use client";

import React, { useState, useCallback, useRef } from "react";
import {
  FileSpreadsheet,
  Table,
  Upload,
  Download,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
  X,
  RefreshCw,
  FileText,
  HelpCircle,
} from "lucide-react";
import WorkbookShell from "@/app/components/reusables/WorkbookShell";
import { buildSpecWorkbook } from "@/services/specsheet/specFormBuilder";
import type { WorkbookData } from "@/app/components/reusables/workbookTypes";
import type { FilledDisplay, TemplateField } from "@/app/api/spec-generator/parse/route";

// ─── Types ──────────────────────────────────────────────────────────────────

type Phase = "upload" | "processing" | "preview";

interface ParsedData {
  displays: FilledDisplay[];
  templateFields: TemplateField[];
  stats: { total: number; matched: number; defaults: number; warnings: string[] };
  projectName: string;
}

// ─── Processing stages ──────────────────────────────────────────────────────

const STAGES = [
  { key: "template", label: "Reading template layout" },
  { key: "costsheet", label: "Parsing LED Cost Sheet" },
  { key: "matching", label: "Matching products from catalog" },
  { key: "filling", label: "Filling spec fields" },
  { key: "preview", label: "Building preview" },
];

// ═════════════════════════════════════════════════════════════════════════════
// Component
// ═════════════════════════════════════════════════════════════════════════════

export default function SpecGeneratorClient() {
  const [phase, setPhase] = useState<Phase>("upload");
  const [templateFile, setTemplateFile] = useState<File | null>(null);
  const [costFile, setCostFile] = useState<File | null>(null);
  const [vendorFile, setVendorFile] = useState<File | null>(null);
  const [vendorSpecs, setVendorSpecs] = useState<any>(null);
  const [parsedData, setParsedData] = useState<ParsedData | null>(null);
  const [workbookData, setWorkbookData] = useState<WorkbookData | null>(null);
  const [editedCells, setEditedCells] = useState<Record<string, string>>({});
  const [activeStage, setActiveStage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const templateInputRef = useRef<HTMLInputElement>(null);
  const costInputRef = useRef<HTMLInputElement>(null);
  const vendorInputRef = useRef<HTMLInputElement>(null);

  // ─── Upload handlers ────────────────────────────────────────────────────

  const handleFileSelect = useCallback(
    (type: "template" | "cost" | "vendor", file: File) => {
      if (type === "template") setTemplateFile(file);
      else if (type === "cost") setCostFile(file);
      else { setVendorFile(file); setVendorSpecs(null); }
      setError(null);
    },
    []
  );

  const handleDrop = useCallback(
    (type: "template" | "cost" | "vendor") => (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (type === "vendor" && file && /\.pdf$/i.test(file.name)) {
        handleFileSelect(type, file);
      } else if (file && /\.(xlsx?|csv)$/i.test(file.name)) {
        handleFileSelect(type, file);
      }
    },
    [handleFileSelect]
  );

  // ─── Generate ───────────────────────────────────────────────────────────

  const handleGenerate = useCallback(async () => {
    if (!templateFile || !costFile) return;

    setPhase("processing");
    setActiveStage(0);
    setError(null);
    setEditedCells({});

    try {
      // Step 1: If vendor PDF provided, parse it first
      let parsedVendorSpecs: any = null;
      if (vendorFile) {
        const vendorFormData = new FormData();
        vendorFormData.append("file", vendorFile);
        const vendorRes = await fetch("/api/vendor/parse", {
          method: "POST",
          body: vendorFormData,
        });
        if (vendorRes.ok) {
          const vendorData = await vendorRes.json();
          parsedVendorSpecs = vendorData.specs || vendorData;
          setVendorSpecs(parsedVendorSpecs);
        }
      }

      // Simulate stage progression while waiting for API
      const stageInterval = setInterval(() => {
        setActiveStage((prev) => Math.min(prev + 1, STAGES.length - 2));
      }, 800);

      const formData = new FormData();
      formData.append("template", templateFile);
      formData.append("costAnalysis", costFile);
      if (parsedVendorSpecs) {
        formData.append("vendorSpecs", JSON.stringify(parsedVendorSpecs));
      }

      const response = await fetch("/api/spec-generator/parse", {
        method: "POST",
        body: formData,
      });

      clearInterval(stageInterval);

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Failed to parse files");
      }

      const data: ParsedData = await response.json();
      setParsedData(data);

      // Build WorkbookData for preview
      setActiveStage(STAGES.length - 1);
      const wb = buildSpecWorkbook(data.displays, data.templateFields, data.projectName);
      setWorkbookData(wb);

      setTimeout(() => setPhase("preview"), 500);
    } catch (err: any) {
      setError(err.message || "An error occurred");
      setPhase("upload");
    }
  }, [templateFile, costFile, vendorFile]);

  // ─── Download ───────────────────────────────────────────────────────────

  const handleDownload = useCallback(async () => {
    if (!parsedData) return;
    setExporting(true);

    try {
      const formData = new FormData();
      // Attach the original template file for clone-and-fill
      if (templateFile) {
        formData.append("template", templateFile);
      }
      // Attach display data as JSON blob (include editedCells for memory save)
      formData.append("data", JSON.stringify({
        displays: parsedData.displays,
        templateFields: parsedData.templateFields,
        projectName: parsedData.projectName,
        editedCells: Object.keys(editedCells).length > 0 ? editedCells : undefined,
      }));

      const response = await fetch("/api/spec-generator/download", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) throw new Error("Download failed");

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${parsedData.projectName || "ANC"}_Product_Data_Forms.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setExporting(false);
    }
  }, [parsedData, templateFile, editedCells]);

  // ─── Reset ──────────────────────────────────────────────────────────────

  const handleReset = useCallback(() => {
    setPhase("upload");
    setTemplateFile(null);
    setCostFile(null);
    setVendorFile(null);
    setVendorSpecs(null);
    setParsedData(null);
    setWorkbookData(null);
    setEditedCells({});
    setActiveStage(0);
    setError(null);
  }, []);

  // ═════════════════════════════════════════════════════════════════════════
  // Render
  // ═════════════════════════════════════════════════════════════════════════

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <div className="border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FileSpreadsheet className="w-6 h-6 text-primary" />
            <div>
              <h1 className="text-lg font-semibold">Spec Generator</h1>
              <p className="text-xs text-muted-foreground">Product Data Form Automation</p>
            </div>
          </div>

          {phase === "preview" && (
            <div className="flex items-center gap-3">
              <button
                onClick={handleReset}
                className="flex items-center gap-2 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                New Upload
              </button>
              <button
                onClick={handleDownload}
                disabled={exporting}
                className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                {exporting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                Download .xlsx
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="max-w-7xl mx-auto px-6 mt-4">
          <div className="flex items-center gap-3 px-4 py-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
            <button onClick={() => setError(null)} className="ml-auto">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Upload Phase */}
      {phase === "upload" && (
        <div className="max-w-4xl mx-auto px-6 py-16">
          <div className="text-center mb-12">
            <h2 className="text-2xl font-bold mb-2">Upload Your Files</h2>
            <p className="text-muted-foreground">
              Upload the blank template + cost analysis, and optionally a vendor spec PDF
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            {/* Template Upload */}
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop("template")}
              onClick={() => templateInputRef.current?.click()}
              className={`
                relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all
                ${templateFile
                  ? "border-emerald-500/50 bg-emerald-500/5 dark:bg-emerald-950/20"
                  : "border-border hover:border-primary/50 hover:bg-muted/30"
                }
              `}
            >
              <input
                ref={templateInputRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileSelect("template", file);
                }}
              />
              {templateFile ? (
                <>
                  <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
                  <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">{templateFile.name}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {(templateFile.size / 1024).toFixed(0)} KB
                  </p>
                  <button
                    onClick={(e) => { e.stopPropagation(); setTemplateFile(null); }}
                    className="absolute top-3 right-3 p-1 rounded-full hover:bg-muted"
                  >
                    <X className="w-4 h-4 text-muted-foreground" />
                  </button>
                </>
              ) : (
                <>
                  <FileSpreadsheet className="w-10 h-10 text-primary mx-auto mb-3" />
                  <p className="text-sm font-medium mb-1">Blank Product Data Form</p>
                  <p className="text-xs text-muted-foreground">
                    The empty form template with your layout
                  </p>
                  <p className="text-xs text-muted-foreground/60 mt-3">
                    Drag & drop or click to browse
                  </p>
                </>
              )}
            </div>

            {/* Cost Analysis Upload */}
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop("cost")}
              onClick={() => costInputRef.current?.click()}
              className={`
                relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all
                ${costFile
                  ? "border-emerald-500/50 bg-emerald-500/5 dark:bg-emerald-950/20"
                  : "border-border hover:border-primary/50 hover:bg-muted/30"
                }
              `}
            >
              <input
                ref={costInputRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileSelect("cost", file);
                }}
              />
              {costFile ? (
                <>
                  <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
                  <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">{costFile.name}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {(costFile.size / 1024).toFixed(0)} KB
                  </p>
                  <button
                    onClick={(e) => { e.stopPropagation(); setCostFile(null); }}
                    className="absolute top-3 right-3 p-1 rounded-full hover:bg-muted"
                  >
                    <X className="w-4 h-4 text-muted-foreground" />
                  </button>
                </>
              ) : (
                <>
                  <Table className="w-10 h-10 text-amber-500 mx-auto mb-3" />
                  <p className="text-sm font-medium mb-1">Cost Analysis Workbook</p>
                  <p className="text-xs text-muted-foreground">
                    Excel with LED Cost Sheet tab
                  </p>
                  <p className="text-xs text-muted-foreground/60 mt-3">
                    Drag & drop or click to browse
                  </p>
                </>
              )}
            </div>

            {/* Vendor PDF Upload (Optional) */}
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop("vendor")}
              onClick={() => vendorInputRef.current?.click()}
              className={`
                relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all
                ${vendorFile
                  ? "border-emerald-500/50 bg-emerald-500/5 dark:bg-emerald-950/20"
                  : "border-border hover:border-primary/50 hover:bg-muted/30"
                }
              `}
            >
              <input
                ref={vendorInputRef}
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileSelect("vendor", file);
                }}
              />
              {vendorFile ? (
                <>
                  <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
                  <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">{vendorFile.name}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {(vendorFile.size / 1024).toFixed(0)} KB
                  </p>
                  <button
                    onClick={(e) => { e.stopPropagation(); setVendorFile(null); setVendorSpecs(null); }}
                    className="absolute top-3 right-3 p-1 rounded-full hover:bg-muted"
                  >
                    <X className="w-4 h-4 text-muted-foreground" />
                  </button>
                </>
              ) : (
                <>
                  <FileText className="w-10 h-10 text-violet-500 mx-auto mb-3" />
                  <p className="text-sm font-medium mb-1">Vendor Spec PDF</p>
                  <p className="text-xs text-muted-foreground">
                    Optional — LG brochure, spec sheet, etc.
                  </p>
                  <p className="text-xs text-muted-foreground/60 mt-3">
                    Drag & drop or click to browse
                  </p>
                </>
              )}
            </div>
          </div>

          {/* Generate button */}
          <div className="text-center">
            <button
              onClick={handleGenerate}
              disabled={!templateFile || !costFile}
              className={`
                inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold transition-all
                ${templateFile && costFile
                  ? "bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20"
                  : "bg-muted text-muted-foreground cursor-not-allowed"
                }
              `}
            >
              <Upload className="w-5 h-5" />
              Generate Spec Sheets
            </button>
            {(!templateFile || !costFile) && (
              <p className="text-xs text-muted-foreground/60 mt-2">
                Upload both files to continue
              </p>
            )}
          </div>
        </div>
      )}

      {/* Processing Phase */}
      {phase === "processing" && (
        <div className="max-w-xl mx-auto px-6 py-20">
          <div className="text-center mb-10">
            <Loader2 className="w-10 h-10 text-primary mx-auto mb-4 animate-spin" />
            <h2 className="text-xl font-bold mb-1">Generating Spec Sheets</h2>
            <p className="text-sm text-muted-foreground">
              {templateFile?.name} + {costFile?.name}
            </p>
          </div>

          <div className="space-y-3">
            {STAGES.map((stage, i) => {
              const isDone = i < activeStage;
              const isActive = i === activeStage;

              return (
                <div
                  key={stage.key}
                  className={`
                    flex items-center gap-3 px-4 py-3 rounded-lg transition-all
                    ${isDone ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : ""}
                    ${isActive ? "bg-primary/10 text-primary" : ""}
                    ${!isDone && !isActive ? "text-muted-foreground/50" : ""}
                  `}
                >
                  {isDone ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                  ) : isActive ? (
                    <Loader2 className="w-5 h-5 text-primary animate-spin shrink-0" />
                  ) : (
                    <div className="w-5 h-5 rounded-full border border-border shrink-0" />
                  )}
                  <span className="text-sm">{stage.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Preview Phase */}
      {phase === "preview" && parsedData && workbookData && (
        <div className="max-w-7xl mx-auto px-6 py-6">
          {/* Stats bar */}
          <div className="flex flex-wrap gap-4 mb-6">
            <StatBadge
              label="Total Displays"
              value={parsedData.stats.total}
              color="blue"
            />
            <StatBadge
              label="Matched"
              value={parsedData.stats.matched}
              color="green"
            />
            {parsedData.stats.defaults > 0 && (
              <StatBadge
                label="Defaults Used"
                value={parsedData.stats.defaults}
                color="amber"
              />
            )}
            {(() => {
              const unknownCount = parsedData.displays.reduce(
                (sum, d) => sum + (d.unknownFields?.length || 0), 0
              );
              return unknownCount > 0 ? (
                <StatBadge
                  label="Unknown Fields"
                  value={unknownCount}
                  color="amber"
                />
              ) : null;
            })()}
            {parsedData.stats.warnings.length > 0 && (
              <StatBadge
                label="Warnings"
                value={parsedData.stats.warnings.length}
                color="red"
              />
            )}
            {Object.keys(editedCells).length > 0 && (
              <StatBadge
                label="Edited"
                value={Object.keys(editedCells).length}
                color="blue"
              />
            )}
          </div>

          {/* Warnings */}
          {parsedData.stats.warnings.length > 0 && (
            <div className="mb-4 px-4 py-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
              <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 text-sm font-medium mb-2">
                <AlertTriangle className="w-4 h-4" />
                Warnings
              </div>
              <ul className="text-xs text-amber-700 dark:text-amber-300/80 space-y-1">
                {parsedData.stats.warnings.map((w, i) => (
                  <li key={i}>- {w}</li>
                ))}
              </ul>
            </div>
          )}

          {/* WorkbookShell */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <WorkbookShell
              data={workbookData}
              editable={true}
              onCellEdit={(sheetIdx, rowIdx, colIdx, newValue) => {
                const cellKey = `${sheetIdx}:${rowIdx}:${colIdx}`;
                setEditedCells(prev => ({ ...prev, [cellKey]: newValue }));
                // Update workbook data with visual indicator + tab badge
                setWorkbookData(prev => {
                  if (!prev) return prev;
                  const updated = structuredClone(prev);
                  const cell = updated.sheets[sheetIdx]?.rows[rowIdx]?.cells[colIdx];
                  if (cell) {
                    cell.value = newValue;
                    cell.className = "ring-1 ring-blue-400 bg-blue-50 dark:bg-blue-900/20";
                  }
                  // Count edits per sheet for tab badges
                  const allEdited = { ...editedCells, [cellKey]: newValue };
                  for (let s = 0; s < updated.sheets.length; s++) {
                    const count = Object.keys(allEdited).filter(k => k.startsWith(`${s}:`)).length;
                    updated.sheets[s].badge = count > 0 ? count : undefined;
                  }
                  return updated;
                });
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function StatBadge({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: "blue" | "green" | "amber" | "red";
}) {
  const colors = {
    blue: "bg-primary/10 text-primary border-primary/20",
    green: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
    amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
    red: "bg-destructive/10 text-destructive border-destructive/20",
  };

  return (
    <div className={`flex items-center gap-2 px-4 py-2 rounded-lg border ${colors[color]}`}>
      <span className="text-2xl font-bold">{value}</span>
      <span className="text-xs">{label}</span>
    </div>
  );
}
