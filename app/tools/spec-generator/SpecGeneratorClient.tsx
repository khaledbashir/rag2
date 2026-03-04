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
  const [parsedData, setParsedData] = useState<ParsedData | null>(null);
  const [workbookData, setWorkbookData] = useState<WorkbookData | null>(null);
  const [activeStage, setActiveStage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const templateInputRef = useRef<HTMLInputElement>(null);
  const costInputRef = useRef<HTMLInputElement>(null);

  // ─── Upload handlers ────────────────────────────────────────────────────

  const handleFileSelect = useCallback(
    (type: "template" | "cost", file: File) => {
      if (type === "template") setTemplateFile(file);
      else setCostFile(file);
      setError(null);
    },
    []
  );

  const handleDrop = useCallback(
    (type: "template" | "cost") => (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file && /\.(xlsx?|csv)$/i.test(file.name)) {
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

    try {
      // Simulate stage progression while waiting for API
      const stageInterval = setInterval(() => {
        setActiveStage((prev) => Math.min(prev + 1, STAGES.length - 2));
      }, 800);

      const formData = new FormData();
      formData.append("template", templateFile);
      formData.append("costAnalysis", costFile);

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
  }, [templateFile, costFile]);

  // ─── Download ───────────────────────────────────────────────────────────

  const handleDownload = useCallback(async () => {
    if (!parsedData) return;
    setExporting(true);

    try {
      const response = await fetch("/api/spec-generator/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displays: parsedData.displays,
          templateFields: parsedData.templateFields,
          projectName: parsedData.projectName,
        }),
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
  }, [parsedData]);

  // ─── Reset ──────────────────────────────────────────────────────────────

  const handleReset = useCallback(() => {
    setPhase("upload");
    setTemplateFile(null);
    setCostFile(null);
    setParsedData(null);
    setWorkbookData(null);
    setActiveStage(0);
    setError(null);
  }, []);

  // ═════════════════════════════════════════════════════════════════════════
  // Render
  // ═════════════════════════════════════════════════════════════════════════

  return (
    <div className="min-h-screen bg-[#0B1120] text-white">
      {/* Header */}
      <div className="border-b border-white/10 bg-[#0B1120]/80 backdrop-blur-sm sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FileSpreadsheet className="w-6 h-6 text-blue-400" />
            <div>
              <h1 className="text-lg font-semibold">Spec Generator</h1>
              <p className="text-xs text-gray-400">Product Data Form Automation</p>
            </div>
          </div>

          {phase === "preview" && (
            <div className="flex items-center gap-3">
              <button
                onClick={handleReset}
                className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-400 hover:text-white transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                New Upload
              </button>
              <button
                onClick={handleDownload}
                disabled={exporting}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
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
          <div className="flex items-center gap-3 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
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
            <p className="text-gray-400">
              Upload the blank Product Data Form template and the Cost Analysis workbook
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            {/* Template Upload */}
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop("template")}
              onClick={() => templateInputRef.current?.click()}
              className={`
                relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all
                ${templateFile
                  ? "border-green-500/50 bg-green-500/5"
                  : "border-white/20 hover:border-blue-400/50 hover:bg-white/[0.02]"
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
                  <CheckCircle2 className="w-10 h-10 text-green-400 mx-auto mb-3" />
                  <p className="text-sm font-medium text-green-300">{templateFile.name}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {(templateFile.size / 1024).toFixed(0)} KB
                  </p>
                  <button
                    onClick={(e) => { e.stopPropagation(); setTemplateFile(null); }}
                    className="absolute top-3 right-3 p-1 rounded-full hover:bg-white/10"
                  >
                    <X className="w-4 h-4 text-gray-500" />
                  </button>
                </>
              ) : (
                <>
                  <FileSpreadsheet className="w-10 h-10 text-blue-400 mx-auto mb-3" />
                  <p className="text-sm font-medium mb-1">Blank Product Data Form</p>
                  <p className="text-xs text-gray-500">
                    The empty form template with your layout
                  </p>
                  <p className="text-xs text-gray-600 mt-3">
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
                  ? "border-green-500/50 bg-green-500/5"
                  : "border-white/20 hover:border-blue-400/50 hover:bg-white/[0.02]"
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
                  <CheckCircle2 className="w-10 h-10 text-green-400 mx-auto mb-3" />
                  <p className="text-sm font-medium text-green-300">{costFile.name}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {(costFile.size / 1024).toFixed(0)} KB
                  </p>
                  <button
                    onClick={(e) => { e.stopPropagation(); setCostFile(null); }}
                    className="absolute top-3 right-3 p-1 rounded-full hover:bg-white/10"
                  >
                    <X className="w-4 h-4 text-gray-500" />
                  </button>
                </>
              ) : (
                <>
                  <Table className="w-10 h-10 text-amber-400 mx-auto mb-3" />
                  <p className="text-sm font-medium mb-1">Cost Analysis Workbook</p>
                  <p className="text-xs text-gray-500">
                    Excel with LED Cost Sheet tab
                  </p>
                  <p className="text-xs text-gray-600 mt-3">
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
                  ? "bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/20"
                  : "bg-white/5 text-gray-500 cursor-not-allowed"
                }
              `}
            >
              <Upload className="w-5 h-5" />
              Generate Spec Sheets
            </button>
            {(!templateFile || !costFile) && (
              <p className="text-xs text-gray-600 mt-2">
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
            <Loader2 className="w-10 h-10 text-blue-400 mx-auto mb-4 animate-spin" />
            <h2 className="text-xl font-bold mb-1">Generating Spec Sheets</h2>
            <p className="text-sm text-gray-400">
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
                    ${isDone ? "bg-green-500/10 text-green-300" : ""}
                    ${isActive ? "bg-blue-500/10 text-blue-300" : ""}
                    ${!isDone && !isActive ? "text-gray-600" : ""}
                  `}
                >
                  {isDone ? (
                    <CheckCircle2 className="w-5 h-5 text-green-400 shrink-0" />
                  ) : isActive ? (
                    <Loader2 className="w-5 h-5 text-blue-400 animate-spin shrink-0" />
                  ) : (
                    <div className="w-5 h-5 rounded-full border border-gray-700 shrink-0" />
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
            {parsedData.stats.warnings.length > 0 && (
              <StatBadge
                label="Warnings"
                value={parsedData.stats.warnings.length}
                color="red"
              />
            )}
          </div>

          {/* Warnings */}
          {parsedData.stats.warnings.length > 0 && (
            <div className="mb-4 px-4 py-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
              <div className="flex items-center gap-2 text-amber-400 text-sm font-medium mb-2">
                <AlertTriangle className="w-4 h-4" />
                Warnings
              </div>
              <ul className="text-xs text-amber-300/80 space-y-1">
                {parsedData.stats.warnings.map((w, i) => (
                  <li key={i}>- {w}</li>
                ))}
              </ul>
            </div>
          )}

          {/* WorkbookShell */}
          <div className="bg-[#111827] border border-white/10 rounded-xl overflow-hidden">
            <WorkbookShell data={workbookData} />
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
    blue: "bg-blue-500/10 text-blue-300 border-blue-500/20",
    green: "bg-green-500/10 text-green-300 border-green-500/20",
    amber: "bg-amber-500/10 text-amber-300 border-amber-500/20",
    red: "bg-red-500/10 text-red-300 border-red-500/20",
  };

  return (
    <div className={`flex items-center gap-2 px-4 py-2 rounded-lg border ${colors[color]}`}>
      <span className="text-2xl font-bold">{value}</span>
      <span className="text-xs">{label}</span>
    </div>
  );
}
