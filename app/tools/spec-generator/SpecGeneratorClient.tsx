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
type GeneratorMode = "product-data" | "ajp-bid-form";

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
  const [mode, setMode] = useState<GeneratorMode>("product-data");
  const [templateFile, setTemplateFile] = useState<File | null>(null);
  const [costFile, setCostFile] = useState<File | null>(null);
  const [vendorFile, setVendorFile] = useState<File | null>(null);
  const [ajpBidFormFile, setAjpBidFormFile] = useState<File | null>(null);
  const [ajpSpecFile, setAjpSpecFile] = useState<File | null>(null);
  const [ajpStatus, setAjpStatus] = useState<"idle" | "processing" | "ready">("idle");
  const [ajpSummary, setAjpSummary] = useState<string | null>(null);
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
  const ajpBidFormInputRef = useRef<HTMLInputElement>(null);
  const ajpSpecInputRef = useRef<HTMLInputElement>(null);

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

  const handleAjpDrop = useCallback(
    (type: "bidForm" | "spec") => (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (!file || !/\.xlsx?$/i.test(file.name)) return;
      if (type === "bidForm") setAjpBidFormFile(file);
      else setAjpSpecFile(file);
      setAjpStatus("idle");
      setAjpSummary(null);
      setError(null);
    },
    []
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

  const handleAjpGenerate = useCallback(async () => {
    if (!ajpBidFormFile || !ajpSpecFile) return;

    setAjpStatus("processing");
    setAjpSummary(null);
    setError(null);

    try {
      const analyzeFormData = new FormData();
      analyzeFormData.append("file", ajpSpecFile);
      const analyzeRes = await fetch("/api/rfp/analyze/excel", {
        method: "POST",
        body: analyzeFormData,
      });

      if (!analyzeRes.ok) {
        const errData = await analyzeRes.json().catch(() => null);
        throw new Error(errData?.error || `Spec workbook analysis failed (${analyzeRes.status})`);
      }

      const analyzeData = await analyzeRes.json();
      const analysisId = analyzeData?.result?.id;
      if (!analysisId) {
        throw new Error("Spec workbook analysis did not return an analysis ID.");
      }

      const fillFormData = new FormData();
      fillFormData.append("analysisId", analysisId);
      fillFormData.append("bidForm", ajpBidFormFile);

      const fillRes = await fetch("/api/rfp/pipeline/fill-bid-form", {
        method: "POST",
        body: fillFormData,
      });

      if (!fillRes.ok) {
        const errData = await fillRes.json().catch(() => null);
        throw new Error(errData?.error || `Bid form fill failed (${fillRes.status})`);
      }

      const matches = JSON.parse(fillRes.headers.get("X-Bid-Form-Matches") || "[]");
      const totalBlocks = fillRes.headers.get("X-Bid-Form-Total-Blocks") || "0";
      const unmatchedBlocks = JSON.parse(fillRes.headers.get("X-Bid-Form-Unmatched-Blocks") || "[]");
      const unmatchedScreens = JSON.parse(fillRes.headers.get("X-Bid-Form-Unmatched-Screens") || "[]");
      const blob = await fillRes.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const fallbackName = ajpBidFormFile.name.replace(/\.xlsx?$/i, "") + "_FILLED.xlsx";
      link.href = url;
      link.download = fillRes.headers.get("Content-Disposition")?.split("filename=")[1]?.replace(/"/g, "") || fallbackName;
      link.click();
      URL.revokeObjectURL(url);

      setAjpStatus("ready");
      setAjpSummary(
        `${matches.length}/${totalBlocks} sections filled` +
          (unmatchedBlocks.length || unmatchedScreens.length
            ? `, ${unmatchedBlocks.length} unmatched sections, ${unmatchedScreens.length} unmatched displays`
            : ", no unmatched items")
      );
    } catch (err: any) {
      setAjpStatus("idle");
      setError(err.message || "Failed to generate filled bid form");
    }
  }, [ajpBidFormFile, ajpSpecFile]);

  // ─── Reset ──────────────────────────────────────────────────────────────

  const handleReset = useCallback(() => {
    setPhase("upload");
    setTemplateFile(null);
    setCostFile(null);
    setVendorFile(null);
    setAjpBidFormFile(null);
    setAjpSpecFile(null);
    setAjpStatus("idle");
    setAjpSummary(null);
    setVendorSpecs(null);
    setParsedData(null);
    setWorkbookData(null);
    setEditedCells({});
    setActiveStage(0);
    setError(null);
  }, []);

  const handleModeChange = useCallback((nextMode: GeneratorMode) => {
    setMode(nextMode);
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
              <p className="text-xs text-muted-foreground">
                Product data forms and AJP bid-form prefill
              </p>
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
        <div className="max-w-5xl mx-auto px-6 py-14">
          <div className="mx-auto mb-10 grid w-full max-w-xl grid-cols-2 rounded-lg border border-border bg-muted/30 p-1">
            <button
              type="button"
              onClick={() => handleModeChange("product-data")}
              className={`
                rounded-md px-4 py-2 text-sm font-medium transition-colors
                ${mode === "product-data"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
                }
              `}
            >
              Product Data Forms
            </button>
            <button
              type="button"
              onClick={() => handleModeChange("ajp-bid-form")}
              className={`
                rounded-md px-4 py-2 text-sm font-medium transition-colors
                ${mode === "ajp-bid-form"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
                }
              `}
            >
              AJP Bid Form
            </button>
          </div>

          {mode === "ajp-bid-form" ? (
            <div className="mx-auto max-w-3xl">
              <div className="mb-10 text-center">
                <h2 className="mb-2 text-2xl font-bold">Prefill AJP Bid Form</h2>
                <p className="text-muted-foreground">
                  Use this when you have a priced/spec Excel and an AJP bid-form workbook.
                </p>
              </div>

              <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2">
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleAjpDrop("bidForm")}
                  onClick={() => ajpBidFormInputRef.current?.click()}
                  className={`
                    relative cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-all
                    ${ajpBidFormFile
                      ? "border-emerald-500/50 bg-emerald-500/5 dark:bg-emerald-950/20"
                      : "border-border bg-card hover:border-primary/50 hover:bg-muted/30"
                    }
                  `}
                >
                  <input
                    ref={ajpBidFormInputRef}
                    type="file"
                    accept=".xlsx,.xls"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setAjpBidFormFile(file);
                        setAjpStatus("idle");
                        setAjpSummary(null);
                        setError(null);
                      }
                    }}
                  />
                  {ajpBidFormFile ? (
                    <>
                      <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-emerald-500" />
                      <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">{ajpBidFormFile.name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {(ajpBidFormFile.size / 1024).toFixed(0)} KB
                      </p>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setAjpBidFormFile(null);
                          setAjpStatus("idle");
                          setAjpSummary(null);
                        }}
                        className="absolute right-3 top-3 rounded-full p-1 hover:bg-muted"
                      >
                        <X className="h-4 w-4 text-muted-foreground" />
                      </button>
                    </>
                  ) : (
                    <>
                      <FileSpreadsheet className="mx-auto mb-3 h-10 w-10 text-primary" />
                      <p className="mb-1 text-sm font-medium">AJP Bid Form</p>
                      <p className="text-xs text-muted-foreground">
                        The blank AJP workbook that needs its vendor/spec fields filled.
                      </p>
                      <p className="mt-3 text-xs text-muted-foreground/60">
                        Drag & drop or click to browse
                      </p>
                    </>
                  )}
                </div>

                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleAjpDrop("spec")}
                  onClick={() => ajpSpecInputRef.current?.click()}
                  className={`
                    relative cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-all
                    ${ajpSpecFile
                      ? "border-emerald-500/50 bg-emerald-500/5 dark:bg-emerald-950/20"
                      : "border-border bg-card hover:border-primary/50 hover:bg-muted/30"
                    }
                  `}
                >
                  <input
                    ref={ajpSpecInputRef}
                    type="file"
                    accept=".xlsx,.xls"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setAjpSpecFile(file);
                        setAjpStatus("idle");
                        setAjpSummary(null);
                        setError(null);
                      }
                    }}
                  />
                  {ajpSpecFile ? (
                    <>
                      <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-emerald-500" />
                      <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">{ajpSpecFile.name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {(ajpSpecFile.size / 1024).toFixed(0)} KB
                      </p>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setAjpSpecFile(null);
                          setAjpStatus("idle");
                          setAjpSummary(null);
                        }}
                        className="absolute right-3 top-3 rounded-full p-1 hover:bg-muted"
                      >
                        <X className="h-4 w-4 text-muted-foreground" />
                      </button>
                    </>
                  ) : (
                    <>
                      <Table className="mx-auto mb-3 h-10 w-10 text-amber-500" />
                      <p className="mb-1 text-sm font-medium">Priced / Spec Excel</p>
                      <p className="text-xs text-muted-foreground">
                        The ANC pricing workbook with the LED Cost Sheet or spec data.
                      </p>
                      <p className="mt-3 text-xs text-muted-foreground/60">
                        Drag & drop or click to browse
                      </p>
                    </>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-blue-200 bg-blue-50/80 p-5 text-sm text-blue-950">
                <div className="mb-2 flex items-center gap-2 font-semibold">
                  <CheckCircle2 className="h-4 w-4 text-blue-600" />
                  How to run it
                </div>
                <ol className="list-inside list-decimal space-y-1 text-blue-900/80">
                  <li>Open the upload screen.</li>
                  <li>Drop both Excel files into the main upload box together.</li>
                  <li>Open the analysis actions page and choose Generate Filled Bid Form.</li>
                </ol>
              </div>

              <div className="mt-8 text-center">
                <button
                  type="button"
                  onClick={handleAjpGenerate}
                  disabled={!ajpBidFormFile || !ajpSpecFile || ajpStatus === "processing"}
                  className={`
                    inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold transition-all
                    ${ajpBidFormFile && ajpSpecFile && ajpStatus !== "processing"
                      ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/90"
                      : "cursor-not-allowed bg-muted text-muted-foreground"
                    }
                  `}
                >
                  {ajpStatus === "processing" ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Download className="h-5 w-5" />
                  )}
                  {ajpStatus === "processing" ? "Generating Filled Bid Form" : "Generate Filled AJP Bid Form"}
                </button>
                {!ajpBidFormFile || !ajpSpecFile ? (
                  <p className="mt-2 text-xs text-muted-foreground/70">
                    Upload both Excel files to continue
                  </p>
                ) : ajpSummary ? (
                  <p className="mt-2 text-xs text-emerald-600 dark:text-emerald-400">
                    {ajpSummary}
                  </p>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground/70">
                    Downloads the filled workbook when processing finishes
                  </p>
                )}
              </div>
            </div>
          ) : (
            <>
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
                accept=".xlsx,.xls,.pdf,.docx,.doc"
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
                    Excel, PDF, or Word template with your layout
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
            </>
          )}
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
