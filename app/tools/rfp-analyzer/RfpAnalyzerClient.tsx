"use client";

import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import UploadZone, { type PipelineEvent } from "./_components/UploadZone";
import PipelineCheckpoint from "./_components/PipelineCheckpoint";
import { buildRfpWorkbook } from "./_components/rfpWorkbookBuilder";
import WorkbookShell from "@/app/components/reusables/WorkbookShell";
import dynamic from "next/dynamic";

const PdfSplitPanel = dynamic(() => import("./_components/PdfSplitPanel"), { ssr: false });
import type { ExtractedLEDSpec, ExtractedRequirement } from "@/services/rfp/unified/types";
import {
  RefreshCcw,
  Monitor,
  FileText,
  CheckCircle2,
  Clock,
  MapPin,
  Building2,
  Download,
  Upload,
  DollarSign,
  FileSpreadsheet,
  AlertTriangle,
  Shield,
  Loader2,
  History,
  MessageSquare,
  ImageIcon,
  Plus,
  ToggleLeft,
  ToggleRight,
  RefreshCw,
  ChevronRight,
  ChevronDown,
  ArrowRight,
  Eye,
  EyeOff,
} from "lucide-react";

// ==========================================================================
// Types
// ==========================================================================

interface PageData {
  pageNumber: number;
  category: string;
  relevance: number;
  markdown: string;
  tables: Array<{ id: string; content: string; format: string }>;
  summary: string;
  thumbnail?: string;
  visionAnalyzed?: boolean;
}

interface IncompleteSpecUI {
  name: string;
  location: string;
  notes: string | null;
  sourcePages: number[];
  reason: string;
}

interface AnalysisResult {
  id: string | null;
  screens: ExtractedLEDSpec[];
  incompleteSpecs?: IncompleteSpecUI[];
  requirements?: ExtractedRequirement[];
  aiWorkspaceSlug?: string | null;
  pages?: PageData[];
  warnings?: string[];
  extractionFailed?: boolean;
  project: {
    clientName: string | null;
    projectName: string | null;
    venue: string | null;
    location: string | null;
    isOutdoor: boolean;
    isUnionLabor: boolean;
    bondRequired: boolean;
    specialRequirements: string[];
  };
  stats: {
    totalPages: number;
    relevantPages: number;
    noisePages: number;
    drawingPages: number;
    specsFound: number;
    processingTimeMs: number;
  };
  triage: Array<{
    pageNumber: number;
    category: string;
    relevance: number;
    isDrawing: boolean;
  }>;
}

interface PricingPreview {
  displays: Array<{
    name: string;
    location?: string;
    pixelPitch: number | null;
    areaSqFt: number;
    quantity: number;
    hardwareCost: number;
    processorCost?: number;
    shippingCost?: number;
    installCost?: number;
    structuralCost?: number;
    pmCost?: number;
    engCost?: number;
    totalCost: number;
    totalSellingPrice: number;
    blendedMarginPct: number;
    costSource: string;
    rateCardEstimate: number | null;
    matchedProduct: {
      manufacturer: string; model: string; pitch: number; fitScore: number;
      activeWidthFt?: number; activeHeightFt?: number;
      resolutionX?: number; resolutionY?: number;
    } | null;
    isCustom?: boolean;
  }>;
  summary: {
    totalCost: number;
    totalSellingPrice: number;
    totalMargin: number;
    blendedMarginPct: number;
    displayCount: number;
    quotedCount: number;
    rateCardCount: number;
  };
}

type Phase = "upload" | "processing" | "results";

// ==========================================================================
// Mismatch detection: compare PDF-extracted vs bid form specs
// ==========================================================================

interface SpecMismatch {
  displayName: string;
  field: string;
  pdfValue: string | number | null;
  bidFormValue: string | number | null;
  severity: "critical" | "warning";
}

function detectSpecMismatches(
  pdfSpecs: ExtractedLEDSpec[],
  bidFormSpecs: ExtractedLEDSpec[]
): SpecMismatch[] {
  const mismatches: SpecMismatch[] = [];

  for (const bfSpec of bidFormSpecs) {
    // Find matching PDF spec by name similarity
    const pdfMatch = pdfSpecs.find((ps) => {
      const bfTokens = new Set(bfSpec.name.toLowerCase().replace(/[^a-z0-9]/g, " ").trim().split(/\s+/).filter(t => t.length > 2));
      const pdfTokens = new Set(ps.name.toLowerCase().replace(/[^a-z0-9]/g, " ").trim().split(/\s+/).filter(t => t.length > 2));
      if (bfTokens.size === 0 || pdfTokens.size === 0) return false;
      let overlap = 0;
      for (const t of bfTokens) if (pdfTokens.has(t)) overlap++;
      return overlap / Math.max(bfTokens.size, pdfTokens.size) > 0.4;
    });
    if (!pdfMatch) continue;

    // Quantity mismatch (exact match required)
    if (pdfMatch.quantity !== bfSpec.quantity && pdfMatch.quantity > 0 && bfSpec.quantity > 0) {
      mismatches.push({
        displayName: bfSpec.name,
        field: "Quantity",
        pdfValue: pdfMatch.quantity,
        bidFormValue: bfSpec.quantity,
        severity: "critical",
      });
    }

    // Pixel pitch mismatch (tolerance ±0.3mm)
    if (pdfMatch.pixelPitchMm != null && bfSpec.pixelPitchMm != null) {
      if (Math.abs(pdfMatch.pixelPitchMm - bfSpec.pixelPitchMm) > 0.3) {
        mismatches.push({
          displayName: bfSpec.name,
          field: "Pixel Pitch",
          pdfValue: `${pdfMatch.pixelPitchMm}mm`,
          bidFormValue: `${bfSpec.pixelPitchMm}mm`,
          severity: "critical",
        });
      }
    }

    // Height mismatch (tolerance ±1ft)
    if (pdfMatch.heightFt != null && bfSpec.heightFt != null) {
      if (Math.abs(pdfMatch.heightFt - bfSpec.heightFt) > 1) {
        mismatches.push({
          displayName: bfSpec.name,
          field: "Height (ft)",
          pdfValue: pdfMatch.heightFt,
          bidFormValue: bfSpec.heightFt,
          severity: "warning",
        });
      }
    }

    // Width mismatch (tolerance ±1ft)
    if (pdfMatch.widthFt != null && bfSpec.widthFt != null) {
      if (Math.abs(pdfMatch.widthFt - bfSpec.widthFt) > 1) {
        mismatches.push({
          displayName: bfSpec.name,
          field: "Width (ft)",
          pdfValue: pdfMatch.widthFt,
          bidFormValue: bfSpec.widthFt,
          severity: "warning",
        });
      }
    }
  }

  return mismatches;
}

// ==========================================================================
// Main Component
// ==========================================================================

export default function RfpAnalyzerClient() {
  const { data: session } = useSession();
  const [phase, setPhase] = useState<Phase>("upload");
  const [events, setEvents] = useState<PipelineEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [fileInfo, setFileInfo] = useState<{ filename: string; pageCount: number; sizeMb: string } | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Pipeline step states
  const [downloading, setDownloading] = useState<string | null>(null);
  const [quoteImportResult, setQuoteImportResult] = useState<any>(null);
  const [pricingPreview, setPricingPreview] = useState<PricingPreview | null>(null);
  const [loadingPricing, setLoadingPricing] = useState(false);
  const [availableProducts, setAvailableProducts] = useState<Array<{ id: string; label: string; pitch: number; name: string }>>([]);
  const [resultsTab, setResultsTab] = useState<string>("displays");
  const [customTabs, setCustomTabs] = useState<Array<{ id: string; name: string; content: string }>>([]);
  const [drawingUpload, setDrawingUpload] = useState<{ uploading: boolean; results: Array<{ filename: string; pages: number }> }>({ uploading: false, results: [] });
  const [quotePreviewOpen, setQuotePreviewOpen] = useState(false);
  const [editableSpecs, setEditableSpecs] = useState<ExtractedLEDSpec[]>([]);
  // PDF split-panel viewer
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [pdfViewerPage, setPdfViewerPage] = useState<number | null>(null);
  const [showPdfPanel, setShowPdfPanel] = useState(false);
  // Document browser — category toggles for workspace embedding
  const [enabledCategories, setEnabledCategories] = useState<Set<string>>(new Set());
  const [reEmbedding, setReEmbedding] = useState(false);
  const [reEmbedResult, setReEmbedResult] = useState<string | null>(null);
  // Auto-save for spec edits
  const [autoSaveStatus, setAutoSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Retain uploaded files and session IDs for retry-after-failure
  const lastUploadedFiles = useRef<File[]>([]);
  const lastSessionData = useRef<{ sessionId: string; filename: string; mergeSessionIds?: string[] } | null>(null);
  // Bid form fill results (for workbook preview + results display)
  const bidFormInputRef = useRef<HTMLInputElement>(null);
  const [bidFormResult, setBidFormResult] = useState<{
    matches: Array<{ sheetName: string; displayName: string; matchedScreen: string; confidence: number; fieldsFilled: string[]; fieldsSkipped?: string[] }>;
    unmatchedBlocks: string[];
    unmatchedScreens: string[];
  } | null>(null);
  // Mismatch detection: original PDF vs bid form specs
  const [specMismatches, setSpecMismatches] = useState<Array<{
    displayName: string;
    field: string;
    pdfValue: string | number | null;
    bidFormValue: string | number | null;
    severity: "critical" | "warning";
  }>>([]);

  // Debounced auto-save: patches screens to DB 2s after last edit
  const autoSaveSpecs = useCallback((specs: ExtractedLEDSpec[], analysisId: string | null) => {
    if (!analysisId) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    setAutoSaveStatus("saving");
    autoSaveTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/rfp/analyses/${analysisId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ screens: specs }),
        });
        setAutoSaveStatus(res.ok ? "saved" : "error");
        // Reset "saved" indicator after 3s
        if (res.ok) setTimeout(() => setAutoSaveStatus("idle"), 3000);
      } catch {
        setAutoSaveStatus("error");
      }
    }, 2000);
  }, []);

  // ========================================================================
  // Product dropdown handler (must be defined before workbookData useMemo)
  // ========================================================================

  const handleProductSelect = useCallback((displayName: string, productId: string) => {
    const product = availableProducts.find((p) => p.id === productId);
    if (!product || !pricingPreview) return;
    setPricingPreview((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        displays: prev.displays.map((d) =>
          d.name === displayName
            ? { ...d, matchedProduct: { manufacturer: product.name.split(" ")[0], model: product.name, pitch: product.pitch, fitScore: 100 } }
            : d
        ),
      };
    });
  }, [availableProducts, pricingPreview]);

  // ========================================================================
  // Add custom line item to Margin Analysis
  // ========================================================================

  const handleAddLineItem = useCallback(() => {
    const name = prompt("Line item name:");
    if (!name?.trim()) return;
    setPricingPreview(prev => {
      if (!prev) return prev;
      const newItem = {
        name: name.trim(),
        pixelPitch: null,
        areaSqFt: 0,
        quantity: 1,
        hardwareCost: 0,
        installCost: 0,
        structuralCost: 0,
        pmCost: 0,
        engCost: 0,
        totalCost: 0,
        totalSellingPrice: 0,
        blendedMarginPct: 0.25,
        costSource: "manual",
        rateCardEstimate: null,
        matchedProduct: null,
        isCustom: true,
      };
      return {
        ...prev,
        displays: [...prev.displays, newItem],
        summary: { ...prev.summary, displayCount: prev.summary.displayCount + 1 },
      };
    });
  }, []);

  // ========================================================================
  // Workbook data — computed from state for WorkbookShell rendering
  // ========================================================================

  const requirements = result?.requirements || [];
  const workbookData = useMemo(() => {
    if (!result) return { fileName: "RFP Analysis", sheets: [] };
    return buildRfpWorkbook({
      project: result.project,
      screens: result.screens,
      requirements,
      triage: result.triage || [],
      pricingDisplays: pricingPreview?.displays || [],
      pricingSummary: pricingPreview?.summary || null,
      bidFormResult: bidFormResult || null,
      specMismatches: specMismatches.length > 0 ? specMismatches : undefined,
      availableProducts,
      onProductSelect: handleProductSelect,
      onAddLineItem: handleAddLineItem,
      onSourcePageClick: (pg) => {
        setPdfViewerPage(pg);
        setShowPdfPanel(true);
      },
    });
  }, [result, pricingPreview, requirements, bidFormResult, specMismatches, availableProducts, handleProductSelect, handleAddLineItem]);

  // ========================================================================
  // Auto-run pricing when extraction completes (no manual step needed)
  // ========================================================================

  useEffect(() => {
    if (result && result.screens.length > 0 && !pricingPreview && !loadingPricing) {
      autoPreviewPricing([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result?.id, result?.screens?.length]);

  // Load available products for the dropdown selector
  useEffect(() => {
    if (!result?.id || availableProducts.length > 0) return;
    fetch("/api/rfp/pipeline/products")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data?.products) setAvailableProducts(data.products); })
      .catch((err) => console.error("[RFP] Failed to load products:", err));
  }, [result?.id, availableProducts.length]);

  // Initialize enabled categories from triage data — relevant pages on, boilerplate off
  useEffect(() => {
    if (result?.triage?.length) {
      const relevant = new Set<string>();
      for (const p of result.triage) {
        // Default ON for useful categories, OFF for noise
        if (p.relevance >= 30 && p.category !== "boilerplate" && p.category !== "unknown") {
          relevant.add(p.category);
        }
      }
      // Always include these if present
      for (const cat of ["led_specs", "technical", "cost_schedule", "scope_of_work", "legal", "schedule"]) {
        if (result.triage.some((p) => p.category === cat)) relevant.add(cat);
      }
      setEnabledCategories(relevant);
    }
  }, [result?.triage]);

  // ========================================================================
  // Upload → auto-pipeline (one SSE stream, fully automatic)
  // ========================================================================

  // Bid form state for dual upload
  const [bidFormFile, setBidFormFile] = useState<File | null>(null);

  const handleUpload = useCallback(async (files: File[], attachedBidForm?: File) => {
    if (!files.length) return;

    lastUploadedFiles.current = files;

    // Store bid form for auto-fill after pricing
    if (attachedBidForm) setBidFormFile(attachedBidForm);

    setPhase("processing");
    setError(null);
    setEvents([]);
    setResult(null);
    setQuoteImportResult(null);
    setPricingPreview(null);

    // Create blob URL for PDF viewer (live session — no persistence needed)
    if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl);
    const blobUrl = URL.createObjectURL(files[0]);
    setPdfBlobUrl(blobUrl);

    try {
      const CHUNK_SIZE = 10 * 1024 * 1024;
      abortRef.current = new AbortController();

      // Upload each file (chunked), collect session IDs
      const uploaded: Array<{ sessionId: string; filename: string; pageCount: number; sizeMb: string }> = [];

      for (let fi = 0; fi < files.length; fi++) {
        const file = files[fi];
        const sizeMbStr = (file.size / 1024 / 1024).toFixed(0);
        const totalChunks = Math.max(1, Math.ceil(file.size / CHUNK_SIZE));
        const fileLabel = files.length > 1 ? `(${fi + 1}/${files.length}) ` : "";
        let sessionId = "";
        let lastJson: any = null;

        for (let i = 0; i < totalChunks; i++) {
          const start = i * CHUNK_SIZE;
          const end = Math.min(start + CHUNK_SIZE, file.size);
          const chunk = file.slice(start, end);
          const pct = Math.round(((i + 1) / totalChunks) * 100);

          setEvents([{
            type: "stage",
            stage: "uploading",
            message: `${fileLabel}Uploading ${file.name} (${sizeMbStr}MB) — ${pct}%`,
          }]);

          const MAX_CHUNK_RETRIES = 2;
          let chunkRes: Response | null = null;
          for (let attempt = 0; attempt <= MAX_CHUNK_RETRIES; attempt++) {
            try {
              chunkRes = await fetch("/api/rfp/analyze/upload", {
                method: "POST",
                headers: {
                  "Content-Type": "application/octet-stream",
                  "X-Filename": file.name,
                  "X-Session-Id": sessionId || "",
                  "X-Chunk-Index": String(i),
                  "X-Total-Chunks": String(totalChunks),
                },
                body: chunk,
                credentials: "omit",
                signal: abortRef.current.signal,
              });
              if (chunkRes.ok) break;
              if (attempt < MAX_CHUNK_RETRIES && (chunkRes.status === 502 || chunkRes.status === 503 || chunkRes.status === 504)) {
                setEvents([{ type: "stage", stage: "uploading", message: `${fileLabel}Chunk ${i + 1}/${totalChunks} failed (${chunkRes.status}), retrying...` }]);
                await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
                chunkRes = null;
                continue;
              }
            } catch (fetchErr: any) {
              if (fetchErr.name === "AbortError") throw fetchErr;
              if (attempt < MAX_CHUNK_RETRIES) {
                setEvents([{ type: "stage", stage: "uploading", message: `${fileLabel}Chunk ${i + 1}/${totalChunks} network error, retrying...` }]);
                await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
                chunkRes = null;
                continue;
              }
              throw fetchErr;
            }
          }

          const res = chunkRes!;
          if (!res.ok) {
            const errText = await res.text();
            let msg = `Upload failed: ${file.name} chunk ${i + 1}/${totalChunks} (${res.status})`;
            try { msg = JSON.parse(errText)?.error || msg; } catch {}
            throw new Error(msg);
          }

          lastJson = await res.json();
          if (!sessionId) sessionId = lastJson.sessionId;
        }

        uploaded.push(lastJson as { sessionId: string; filename: string; pageCount: number; sizeMb: string });
      }

      const totalPages = uploaded.reduce((sum, u) => sum + u.pageCount, 0);
      const totalSizeMb = uploaded.reduce((sum, u) => sum + parseFloat(u.sizeMb), 0).toFixed(1);
      const displayName = uploaded.length === 1 ? uploaded[0].filename : `${uploaded.length} files`;
      setFileInfo({ filename: displayName, pageCount: totalPages, sizeMb: totalSizeMb });
      setEvents([{ type: "stage", stage: "uploaded", message: `Uploaded: ${totalPages.toLocaleString()} pages, ${totalSizeMb}MB` }]);

      // Store session info so we can retry analysis without re-uploading
      const sessionPayload = {
        sessionId: uploaded[0].sessionId,
        filename: uploaded[0].filename,
        ...(uploaded.length > 1 ? { mergeSessionIds: uploaded.map((u) => u.sessionId) } : {}),
      };
      lastSessionData.current = sessionPayload;

      // Send all session IDs to analyze — server merges if multiple
      const response = await fetch("/api/rfp/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sessionPayload),
        credentials: "omit",
        signal: abortRef.current.signal,
      });

      if (!response.ok) {
        const errBody = await response.text();
        try { throw new Error(JSON.parse(errBody)?.error || `Pipeline failed (${response.status})`); }
        catch { throw new Error(`Pipeline failed (${response.status})`); }
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No stream");
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event: PipelineEvent = JSON.parse(line.slice(6));
            if (event.type === "heartbeat") continue;
            setEvents((prev) => [...prev, event]);

            if (event.type === "complete" && event.result) {
              setResult(event.result);
              setPhase("results");
            }

            if (event.type === "error") {
              throw new Error(event.message || "Pipeline failed");
            }
          } catch (e: any) {
            if (e.message?.includes("failed") || e.message?.includes("Pipeline")) throw e;
          }
        }
      }

      if (phase !== "results" && !result) {
        const lastErr = events.find((e) => e.type === "error");
        if (lastErr) throw new Error(lastErr.message || "Pipeline failed");
      }
    } catch (err: any) {
      if (err.name === "AbortError") return;
      console.error("Pipeline error:", err);
      setError(err.message || "Unknown error");
      setPhase("upload");
    }
  }, []);

  const handleResumeAnalysis = useCallback(async () => {
    if (!lastSessionData.current) return;
    setPhase("processing");
    setError(null);
    setEvents([{ type: "stage", stage: "resuming", message: "Resuming analysis (file already uploaded)..." }]);
    setResult(null);
    abortRef.current = new AbortController();

    try {
      const response = await fetch("/api/rfp/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(lastSessionData.current),
        credentials: "omit",
        signal: abortRef.current.signal,
      });

      if (!response.ok) {
        const errBody = await response.text();
        try { throw new Error(JSON.parse(errBody)?.error || `Pipeline failed (${response.status})`); }
        catch { throw new Error(`Pipeline failed (${response.status})`); }
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No stream");
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event: PipelineEvent = JSON.parse(line.slice(6));
            if (event.type === "heartbeat") continue;
            setEvents((prev) => [...prev, event]);

            if (event.type === "complete" && event.result) {
              setResult(event.result);
              setPhase("results");
            }

            if (event.type === "error") {
              throw new Error(event.message || "Pipeline failed");
            }
          } catch (e: any) {
            if (e.message?.includes("failed") || e.message?.includes("Pipeline")) throw e;
          }
        }
      }
    } catch (err: any) {
      if (err.name === "AbortError") return;
      console.error("Resume analysis error:", err);
      setError(err.message || "Unknown error");
      setPhase("upload");
    }
  }, []);

  // ========================================================================
  // Quote Preview: open editable preview before downloading
  // ========================================================================

  const openQuotePreview = () => {
    if (!result) return;
    setEditableSpecs(result.screens.map((s) => ({ ...s })));
    setQuotePreviewOpen(true);
    setResultsTab("estimate");
  };

  const updateEditableSpec = (index: number, field: keyof ExtractedLEDSpec, value: any) => {
    setEditableSpecs((prev) => prev.map((s, i) => i === index ? { ...s, [field]: value } : s));
  };

  const removeEditableSpec = (index: number) => {
    setEditableSpecs((prev) => prev.filter((_, i) => i !== index));
  };

  const addEditableSpec = () => {
    setEditableSpecs((prev) => [
      ...prev,
      {
        name: "",
        location: "",
        widthFt: null,
        heightFt: null,
        widthPx: null,
        heightPx: null,
        pixelPitchMm: null,
        brightnessNits: null,
        environment: "indoor" as const,
        quantity: 1,
        serviceType: null,
        mountingType: null,
        maxPowerW: null,
        weightLbs: null,
        specialRequirements: [],
        confidence: 1,
        sourcePages: [],
        sourceType: "text" as const,
        citation: "Manually added",
        notes: null,
      },
    ]);
  };

  // ========================================================================
  // Download Subcontractor Excel (uses edited specs if preview was open)
  // ========================================================================

  const handleDownloadSubcontractorExcel = async () => {
    if (!result?.id) return;
    setDownloading("subcontractor");
    try {
      const specsToSend = quotePreviewOpen && editableSpecs.length > 0 ? editableSpecs : undefined;
      const res = await fetch("/api/rfp/pipeline/subcontractor-excel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysisId: result.id, specs: specsToSend }),
      });
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.headers.get("Content-Disposition")?.split("filename=")[1]?.replace(/"/g, "") || "Quote_Request.xlsx";
      a.click();
      URL.revokeObjectURL(url);
      setQuotePreviewOpen(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setDownloading(null);
    }
  };

  // ========================================================================
  // Pipeline Step 5: Import Quote Excel
  // ========================================================================

  const handleImportQuote = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !result?.id) return;
    setDownloading("importing");
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("analysisId", result.id);
      const res = await fetch("/api/rfp/pipeline/import-quote", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error(`Import failed (${res.status})`);
      const data = await res.json();
      setQuoteImportResult(data);
      // Auto-trigger pricing preview after import + switch to Pricing tab
      setResultsTab("estimate");
      autoPreviewPricing(data.quotes || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setDownloading(null);
      e.target.value = "";
    }
  };

  // ========================================================================
  // Pipeline Step 6: Preview Pricing / Download Rate Card
  // ========================================================================

  const handlePreviewPricing = async () => {
    if (!result?.id) return;
    setLoadingPricing(true);
    try {
      const res = await fetch("/api/rfp/pipeline/pricing-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          analysisId: result.id,
          quotes: quoteImportResult?.quotes || [],
          includeBond: result.project.bondRequired,
        }),
      });
      if (!res.ok) throw new Error(`Pricing failed (${res.status})`);
      const data = await res.json();
      setPricingPreview(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoadingPricing(false);
    }
  };

  // Auto-trigger pricing after quote import (accepts quotes directly so we don't depend on stale state)
  const autoPreviewPricing = async (quotes: any[]) => {
    if (!result || result.screens.length === 0) return;
    setLoadingPricing(true);
    try {
      const res = await fetch("/api/rfp/pipeline/pricing-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          analysisId: result.id || undefined,
          specs: result.screens,
          project: result.project,
          quotes,
          includeBond: result.project.bondRequired,
        }),
      });
      if (!res.ok) {
        const errBody = await res.text().catch(() => "");
        console.error(`[pricing-preview] ${res.status}:`, errBody);
        throw new Error(`Pricing failed (${res.status})`);
      }
      const data = await res.json();
      setPricingPreview(data);
    } catch (err: any) {
      console.error("[autoPreviewPricing] Error:", err);
      setError(err.message);
    } finally {
      setLoadingPricing(false);
    }
  };

  const handleDownloadScopingWorkbook = async () => {
    if (!result?.id) return;
    setDownloading("scoping");
    try {
      const res = await fetch("/api/rfp/pipeline/scoping-workbook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          analysisId: result.id,
          quotes: quoteImportResult?.quotes || [],
          includeBond: result.project.bondRequired,
        }),
      });
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.headers.get("Content-Disposition")?.split("filename=")[1]?.replace(/"/g, "") || "Scoping_Workbook.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setDownloading(null);
    }
  };

  // ========================================================================
  // Create Proposal from RFP extraction
  // ========================================================================

  const handleCreateProposal = async () => {
    if (!result?.id || !session?.user?.email) return;
    setDownloading("creating");
    try {
      const res = await fetch("/api/rfp/pipeline/create-proposal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          analysisId: result.id,
          userEmail: session.user.email,
        }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `Failed (${res.status})`);
      }
      const data = await res.json();
      window.location.href = `/projects/${data.proposalId}`;
    } catch (err: any) {
      setError(err.message);
      setDownloading(null);
    }
  };

  const handleDownloadRateCard = async () => {
    if (!result?.id) return;
    setDownloading("ratecard");
    try {
      const res = await fetch("/api/rfp/pipeline/rate-card-excel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          analysisId: result.id,
          quotes: quoteImportResult?.quotes || [],
          includeBond: result.project.bondRequired,
        }),
      });
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.headers.get("Content-Disposition")?.split("filename=")[1]?.replace(/"/g, "") || "Rate_Card.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setDownloading(null);
    }
  };

  // ========================================================================
  // Excel Export (extraction results)
  // ========================================================================

  const handleExportExcel = async () => {
    if (!result?.id) return;
    setDownloading("extraction");
    try {
      const res = await fetch("/api/rfp/pipeline/extraction-excel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysisId: result.id }),
      });
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.headers.get("Content-Disposition")?.split("filename=")[1]?.replace(/"/g, "") || "Extraction.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setDownloading(null);
    }
  };

  // ========================================================================
  // Fill Bid Form — auto-populate vendor column in client-provided bid form
  // ========================================================================

  /** Core bid form fill logic — used by both manual button and auto-fill */
  const executeBidFormFill = async (file: File, autoDownload: boolean = true) => {
    if (!result?.id) return;
    setDownloading("bidform");
    setBidFormResult(null);
    try {
      const formData = new FormData();
      formData.append("bidForm", file);
      formData.append("analysisId", result.id);
      // Send user-edited specs if available
      if (editableSpecs.length > 0) {
        formData.append("specs", JSON.stringify(editableSpecs));
      }
      // Send pricing data + matched product specs if available
      if (pricingPreview?.displays) {
        const pricingData = pricingPreview.displays.map((d) => ({
          name: d.name,
          hardwareCost: d.hardwareCost,
          processingCost: d.processorCost ?? 0,
          shippingCost: d.shippingCost ?? 0,
          installCost: d.installCost,
          totalCost: d.totalCost,
          totalSellingPrice: d.totalSellingPrice,
          // Matched product specs for ANC column (actual product dimensions/specs)
          matchedProduct: d.matchedProduct ? {
            manufacturer: d.matchedProduct.manufacturer,
            model: d.matchedProduct.model,
            pitch: d.matchedProduct.pitch,
            activeWidthFt: d.matchedProduct.activeWidthFt,
            activeHeightFt: d.matchedProduct.activeHeightFt,
            resolutionX: d.matchedProduct.resolutionX,
            resolutionY: d.matchedProduct.resolutionY,
          } : null,
        }));
        formData.append("pricing", JSON.stringify(pricingData));
      }
      const res = await fetch("/api/rfp/pipeline/fill-bid-form", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error || `Fill failed (${res.status})`);
      }

      // Parse match metadata from headers
      const matchesHeader = res.headers.get("X-Bid-Form-Matches");
      const unmatchedBlocksHeader = res.headers.get("X-Bid-Form-Unmatched-Blocks");
      const unmatchedScreensHeader = res.headers.get("X-Bid-Form-Unmatched-Screens");

      if (matchesHeader) {
        setBidFormResult({
          matches: JSON.parse(matchesHeader),
          unmatchedBlocks: unmatchedBlocksHeader ? JSON.parse(unmatchedBlocksHeader) : [],
          unmatchedScreens: unmatchedScreensHeader ? JSON.parse(unmatchedScreensHeader) : [],
        });
      }

      // Download the filled file
      if (autoDownload) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = res.headers.get("Content-Disposition")?.split("filename=")[1]?.replace(/"/g, "") || "BidForm_Filled.xlsx";
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setDownloading(null);
    }
  };

  const handleFillBidForm = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await executeBidFormFill(file);
    e.target.value = "";
  };

  // Auto-extract specs from bid form when PDF extraction comes up short,
  // then auto-fill the bid form when pricing is ready
  const bidFormAutoFilled = useRef(false);
  const bidFormSpecsExtracted = useRef(false);

  // Step 1: When bid form is attached and extraction completes, supplement specs from bid form
  useEffect(() => {
    if (!bidFormFile || !result?.id || bidFormSpecsExtracted.current) return;
    bidFormSpecsExtracted.current = true;

    (async () => {
      try {
        const formData = new FormData();
        formData.append("bidForm", bidFormFile);
        formData.append("analysisId", result.id!);
        const res = await fetch("/api/rfp/pipeline/extract-bid-form-specs", {
          method: "POST",
          body: formData,
        });
        if (!res.ok) return;
        const data = await res.json();
        const newSpecs = data.specs;
        if (newSpecs?.length > 0) {
          // Bid form is always the authority — replace screens entirely
          setResult((prev) => prev ? { ...prev, screens: newSpecs } : prev);
          setEditableSpecs(newSpecs);
          console.log(`[bid-form-supplement] ${result.screens.length} → ${newSpecs.length} specs from bid form (merged=${data.merged})`);
          // Re-run pricing with the bid form spec set
          setPricingPreview(null);

          // Detect mismatches between PDF and bid form specs
          if (data.pdfSpecs && data.bidFormSpecs) {
            const mismatches = detectSpecMismatches(data.pdfSpecs, data.bidFormSpecs);
            setSpecMismatches(mismatches);
            if (mismatches.length > 0) {
              console.log(`[mismatch] Found ${mismatches.length} discrepancies between PDF and bid form`);
            }
          }
        }
      } catch (err) {
        console.error("[bid-form-supplement] Error:", err);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bidFormFile, result?.id]);

  // Step 2: Auto-fill bid form when pricing becomes available
  useEffect(() => {
    if (bidFormFile && pricingPreview && result?.id && !bidFormAutoFilled.current) {
      bidFormAutoFilled.current = true;
      executeBidFormFill(bidFormFile, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pricingPreview, bidFormFile, result?.id]);

  // ========================================================================
  // Reset
  // ========================================================================

  const handleReset = () => {
    if (abortRef.current) abortRef.current.abort();
    setPhase("upload");
    setError(null);
    setEvents([]);
    setFileInfo(null);
    setResult(null);
    setQuoteImportResult(null);
    setPricingPreview(null);
    setResultsTab("displays");
    setDrawingUpload({ uploading: false, results: [] });
    setQuotePreviewOpen(false);
    setEditableSpecs([]);
    setBidFormResult(null);
    setBidFormFile(null);
    setSpecMismatches([]);
    bidFormAutoFilled.current = false;
    bidFormSpecsExtracted.current = false;
  };

  const handleRetry = () => {
    if (lastUploadedFiles.current.length > 0) {
      handleUpload(lastUploadedFiles.current);
    } else {
      handleReset();
    }
  };

  // ========================================================================
  // Upload supplementary drawings
  // ========================================================================

  const handleUploadDrawings = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !result?.id) return;
    setDrawingUpload((prev) => ({ ...prev, uploading: true }));

    for (const file of Array.from(files)) {
      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("analysisId", result.id);
        const res = await fetch("/api/rfp/analyze/drawings", {
          method: "POST",
          body: formData,
        });
        if (!res.ok) throw new Error(`Failed (${res.status})`);
        const data = await res.json();
        setDrawingUpload((prev) => ({
          ...prev,
          results: [...prev.results, { filename: data.filename, pages: data.pagesProcessed }],
        }));
      } catch (err: any) {
        setError(`Drawing upload failed: ${err.message}`);
      }
    }

    setDrawingUpload((prev) => ({ ...prev, uploading: false }));
    e.target.value = "";
  };

  // ========================================================================
  // Re-embed workspace with selected categories
  // ========================================================================

  const handleReEmbed = async () => {
    if (!result?.id || !result.pages?.length) return;
    setReEmbedding(true);
    setReEmbedResult(null);
    try {
      const selectedPages = result.pages
        .filter((p) => enabledCategories.has(p.category))
        .map((p) => ({
          pageNumber: p.pageNumber,
          category: p.category,
          markdown: p.markdown,
          tables: p.tables,
        }));

      const res = await fetch("/api/rfp/workspace/re-embed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysisId: result.id, selectedPages }),
      });

      if (!res.ok) throw new Error(`Re-embed failed (${res.status})`);
      const data = await res.json();
      setReEmbedResult(`${data.pagesEmbedded} pages embedded across ${data.documentsCreated} documents`);
    } catch (err: any) {
      setReEmbedResult(`Error: ${err.message}`);
    } finally {
      setReEmbedding(false);
    }
  };

  const toggleCategory = (cat: string) => {
    setEnabledCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
    setReEmbedResult(null); // Clear stale result
  };

  // ========================================================================
  // Render
  // ========================================================================

  return (
    <div className="flex-1 min-w-0 bg-background relative min-h-screen pb-24">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-md border-b border-border py-4 px-6 xl:px-8">
        <div className="flex items-center justify-between max-w-[1600px] mx-auto">
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              {phase === "upload" ? "New RFP" : phase === "processing" ? "Reading your RFP..." : result?.project?.projectName || "RFP Analysis"}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {phase === "upload"
                ? "Drop your RFP — specs, pricing, and proposal in minutes"
                : fileInfo
                ? `${fileInfo.filename} — ${fileInfo.pageCount.toLocaleString()} pages, ${fileInfo.sizeMb}MB`
                : ""
              }
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/tools/rfp-analyzer/history"
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
            >
              <History className="w-4 h-4" />
              History
            </Link>
            {phase !== "upload" && (
              <button
                onClick={handleReset}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
              >
                <RefreshCcw className="w-4 h-4" />
                {phase === "processing" ? "Cancel" : "New Analysis"}
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="p-6 xl:px-8 max-w-[1600px] mx-auto">
        {/* Pipeline stepper — always visible */}
        <PipelineStepper
          phase={phase}
          resultsTab={resultsTab}
          hasResult={!!result}
          hasPricing={!!pricingPreview}
          specsFound={result?.screens?.length || result?.stats.specsFound || 0}
          onTabSwitch={setResultsTab}
        />

        {/* ============ UPLOAD / PROCESSING ============ */}
        {(phase === "upload" || phase === "processing") && (
          <>
            <UploadZone
              onUpload={handleUpload}
              isLoading={phase === "processing"}
              events={events}
            />
            {error && phase === "upload" && (
              <div className="mt-6 p-5 max-w-2xl mx-auto text-center border border-destructive/20 bg-destructive/10 rounded-xl">
                <p className="text-sm text-destructive font-medium mb-3">{error}</p>
                <div className="flex items-center justify-center gap-3">
                  {lastSessionData.current && (
                    <button
                      onClick={handleResumeAnalysis}
                      className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 inline-flex items-center gap-2"
                    >
                      <RefreshCcw className="w-4 h-4" /> Resume Analysis
                    </button>
                  )}
                  <button onClick={handleRetry} className="px-4 py-2 bg-background border border-border rounded-lg text-sm font-medium hover:bg-muted">
                    {lastSessionData.current ? "Re-upload File" : "Try Again"}
                  </button>
                </div>
                {lastSessionData.current && (
                  <p className="text-xs text-muted-foreground mt-2">File already uploaded — resume skips the upload step</p>
                )}
              </div>
            )}
          </>
        )}

        {/* ============ RESULTS ============ */}
        {phase === "results" && result && (() => {
          const criticalReqs = requirements.filter((r) => r.status === "critical").length;

          return (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 ease-out space-y-6">
            {/* Error banner */}
            {error && (
              <div className="p-4 border border-destructive/20 bg-destructive/10 rounded-xl">
                <p className="text-sm text-destructive">{error}</p>
                <button onClick={() => setError(null)} className="text-xs text-destructive/60 hover:text-destructive mt-1">Dismiss</button>
              </div>
            )}

            {/* Extraction failure banner — AI providers failed */}
            {result.extractionFailed && (
              <div className="p-4 border border-destructive/30 bg-destructive/10 rounded-xl flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-destructive">Extraction Failed</p>
                  <p className="text-sm text-destructive/80 mt-1">
                    AI providers returned no data. This does not mean the RFP has no displays — the extraction service encountered errors.
                  </p>
                  <div className="flex items-center gap-2 mt-3">
                    <button
                      onClick={handleRetry}
                      className="px-4 py-2 bg-destructive text-destructive-foreground rounded-lg text-sm font-medium hover:bg-destructive/90 inline-flex items-center gap-2"
                    >
                      <RefreshCcw className="w-4 h-4" /> Retry Extraction
                    </button>
                    <button
                      onClick={handleReset}
                      className="px-4 py-2 bg-background border border-border rounded-lg text-sm font-medium hover:bg-muted"
                    >
                      Upload Different File
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Warnings banner — partial failures or degraded results */}
            {!result.extractionFailed && result.warnings && result.warnings.length > 0 && (
              <div className="p-4 border border-amber-500/30 bg-amber-500/10 rounded-xl flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">Results May Be Incomplete</p>
                  {result.warnings.map((w, i) => (
                    <p key={i} className="text-sm text-amber-600/80 dark:text-amber-400/80 mt-1">{w}</p>
                  ))}
                </div>
              </div>
            )}

            {/* Stats row */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
              <StatCard icon={FileText} label="Total Pages" value={result.stats.totalPages.toLocaleString()} />
              <StatCard
                icon={CheckCircle2}
                label="Relevant Pages"
                value={result.stats.relevantPages.toString()}
                sub={`${Math.round((result.stats.relevantPages / result.stats.totalPages) * 100)}% kept`}
                accent="text-emerald-500"
              />
              <StatCard icon={FileText} label="Noise Filtered" value={result.stats.noisePages.toString()} sub="auto-removed" />
              <StatCard icon={Monitor} label="LED Displays" value={(result.screens.length || result.stats.specsFound).toString()} accent="text-primary" />
              <StatCard
                icon={AlertTriangle}
                label="Requirements"
                value={requirements.length.toString()}
                sub={criticalReqs > 0 ? `${criticalReqs} critical` : undefined}
                accent={criticalReqs > 0 ? "text-red-500" : undefined}
              />
              <StatCard icon={Clock} label="Processing Time" value={`${(result.stats.processingTimeMs / 1000).toFixed(1)}s`} />
            </div>

            {/* Project info — collapsible */}
            {(result.project.clientName || result.project.venue || result.project.projectName) && (
              <ProjectInfoCard project={result.project} />
            )}

            {/* Bid Form Fill Result */}
            {bidFormResult && (
              <div className="border border-amber-500/30 bg-amber-50 dark:bg-amber-950/20 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <FileSpreadsheet className="w-4 h-4 text-amber-600" />
                  <span className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                    Bid Form Filled — {bidFormResult.matches.length} display{bidFormResult.matches.length !== 1 ? "s" : ""} matched
                  </span>
                  <button onClick={() => setBidFormResult(null)} className="ml-auto text-xs text-amber-600 hover:text-amber-800">Dismiss</button>
                </div>
                <div className="space-y-1 text-xs">
                  {bidFormResult.matches.map((m, i) => (
                    <div key={i} className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                        <span className="text-foreground/80">
                          <strong>{m.sheetName}</strong>: {m.displayName} → {m.matchedScreen}
                          <span className="text-muted-foreground ml-1">({m.fieldsFilled.length} fields, {Math.round(m.confidence * 100)}% match)</span>
                        </span>
                      </div>
                      {m.fieldsSkipped && m.fieldsSkipped.length > 0 && (
                        <div className="flex items-start gap-2 ml-5">
                          <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0 mt-0.5" />
                          <span className="text-amber-600 dark:text-amber-400">
                            {m.fieldsSkipped.length} cell{m.fieldsSkipped.length !== 1 ? "s" : ""} skipped — existing data preserved
                            <span className="text-muted-foreground ml-1">({m.fieldsSkipped.join(", ")})</span>
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                  {bidFormResult.unmatchedBlocks.length > 0 && (
                    <div className="mt-1.5 pt-1.5 border-t border-amber-300/30">
                      <span className="text-amber-700 dark:text-amber-400 font-medium">Unmatched bid form blocks:</span>
                      {bidFormResult.unmatchedBlocks.map((b, i) => (
                        <span key={i} className="ml-2 text-amber-600">{b}</span>
                      ))}
                    </div>
                  )}
                  {bidFormResult.unmatchedScreens.length > 0 && (
                    <div className="mt-1">
                      <span className="text-amber-700 dark:text-amber-400 font-medium">Unmatched RFP screens:</span>
                      {bidFormResult.unmatchedScreens.map((s, i) => (
                        <span key={i} className="ml-2 text-amber-600">{s}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ============ PRICING STATUS ============ */}
            {result.screens.length > 0 && !pricingPreview && !loadingPricing && (
              <div className="p-3 border border-amber-500/30 bg-amber-500/10 rounded-lg flex items-center gap-3">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <p className="text-sm text-amber-700 dark:text-amber-300 flex-1">
                  Product matching hasn&apos;t loaded yet. The Product, $/sqft, and Total Cost columns may be empty.
                </p>
                <button
                  onClick={() => autoPreviewPricing([])}
                  className="px-3 py-1.5 bg-amber-600 text-white rounded-md text-xs font-medium hover:bg-amber-700 inline-flex items-center gap-1.5 whitespace-nowrap"
                >
                  <RefreshCcw className="w-3 h-3" />
                  Match Products
                </button>
              </div>
            )}
            {loadingPricing && (
              <div className="p-3 border border-blue-500/30 bg-blue-500/10 rounded-lg flex items-center gap-3">
                <Loader2 className="w-4 h-4 text-blue-600 animate-spin shrink-0" />
                <p className="text-sm text-blue-700 dark:text-blue-300">Matching products and calculating pricing...</p>
              </div>
            )}

            {/* ============ WORKBOOK VIEW ============ */}
            <div className="flex gap-3">
            {/* Left: Workbook */}
            <div className={showPdfPanel && pdfBlobUrl ? "flex-1 min-w-0 h-[75vh]" : "w-full h-[75vh]"}>
              <WorkbookShell
                data={workbookData}
                editable
                onCellEdit={(sheetIdx, rowIdx, colIdx, value) => {
                  // Sheet 0: LED Cost Sheet (ANC 20-col format)
                  // Cols: Display(0) Vendor(1) Product(2) Pitch(3) H(ft)(4) W(ft)(5) H(px)(6) W(px)(7)
                  //       SqFt/Screen(8) Qty(9) TotalSqFt(10) NITs(11) Service(12)
                  //       $/SqFt(13) DisplayCost(14) Processor(15) Shipping(16) TotalCost(17) Margin%(18) SellingPrice(19)
                  if (sheetIdx === 0) {
                    // Spec edits → update result.screens
                    const specFieldMap: Record<number, string> = { 4: "heightFt", 5: "widthFt", 9: "quantity" };
                    const specField = specFieldMap[colIdx];
                    if (specField) {
                      setResult(prev => {
                        if (!prev) return prev;
                        const specIdx = rowIdx - 1;
                        if (specIdx < 0 || specIdx >= prev.screens.length) return prev;
                        const spec = { ...prev.screens[specIdx] };
                        (spec as any)[specField] = parseFloat(value) || 0;
                        const updated = [...prev.screens];
                        updated[specIdx] = spec;
                        setEditableSpecs(updated);
                        autoSaveSpecs(updated, prev.id);
                        return { ...prev, screens: updated };
                      });
                      return;
                    }
                    // Pricing edits → update pricingPreview.displays
                    const pricingFieldMap: Record<number, string> = { 14: "hardwareCost", 15: "processorCost", 16: "shippingCost" };
                    const pricingField = pricingFieldMap[colIdx];
                    const isMarginEdit = colIdx === 18;
                    if (!pricingField && !isMarginEdit) return;
                    setPricingPreview(prev => {
                      if (!prev) return prev;
                      const specIdx = rowIdx - 1;
                      if (specIdx < 0 || specIdx >= prev.displays.length) return prev;
                      const updatedDisplays = prev.displays.map((d, i) => {
                        if (i !== specIdx) return d;
                        const updated = { ...d };
                        if (isMarginEdit) {
                          let margin = parseFloat(value) || 0;
                          if (margin > 1) margin = margin / 100;
                          updated.blendedMarginPct = margin;
                        } else {
                          (updated as any)[pricingField!] = parseFloat(value) || 0;
                        }
                        // Recalculate totalCost (LED hardware + processor + shipping)
                        updated.hardwareCost = updated.hardwareCost ?? 0;
                        const ledTotal = updated.hardwareCost + (updated.processorCost ?? 0) + (updated.shippingCost ?? 0);
                        updated.totalCost = ledTotal + (updated.installCost ?? 0) + (updated.structuralCost ?? 0) + (updated.pmCost ?? 0) + (updated.engCost ?? 0);
                        updated.totalSellingPrice = updated.blendedMarginPct > 0
                          ? updated.totalCost / (1 - updated.blendedMarginPct)
                          : updated.totalCost;
                        return updated;
                      });
                      const totalCost = updatedDisplays.reduce((s, d) => s + d.totalCost, 0);
                      const totalSell = updatedDisplays.reduce((s, d) => s + d.totalSellingPrice, 0);
                      return {
                        ...prev,
                        displays: updatedDisplays,
                        summary: { ...prev.summary, totalCost, totalSellingPrice: totalSell, totalMargin: totalSell - totalCost, blendedMarginPct: totalSell > 0 ? Math.round(((totalSell - totalCost) / totalSell) * 1000) / 10 : 0 },
                      };
                    });
                    return;
                  }
                  // Sheet 1: Margin Analysis (ANC flat format)
                  // Cols: LineItem(0) Cost(1) SellingPrice(2) Margin$(3) Margin%(4)
                  // Row layout: [header, ...displays(non-custom), ...serviceCategories, ...customDisplays, separator, total, addRow]
                  if (sheetIdx === 1) {
                    const isCostEdit = colIdx === 1;
                    const isMarginEdit = colIdx === 4;
                    if (!isCostEdit && !isMarginEdit) return;
                    setPricingPreview(prev => {
                      if (!prev) return prev;
                      const itemIdx = rowIdx - 1; // skip header row

                      // Build the same row order as the workbook builder
                      const nonCustomDisplays = prev.displays.filter(d => !d.isCustom);
                      const serviceCategories = [
                        { field: "structuralCost", label: "Structural Materials" },
                        { field: "installCost", label: "Installation Labor" },
                        { field: "pmCost", label: "PM / Gen. Conditions" },
                        { field: "engCost", label: "Engineering / Permits" },
                      ].filter(cat => prev.displays.reduce((s, d) => s + ((d as any)[cat.field] ?? 0), 0) > 0);
                      const customDisplays = prev.displays.filter(d => d.isCustom);

                      const displayCount = nonCustomDisplays.length;
                      const serviceCount = serviceCategories.length;

                      if (itemIdx < displayCount) {
                        // Editing a display row
                        const displayName = nonCustomDisplays[itemIdx].name;
                        const updatedDisplays = prev.displays.map(d => {
                          if (d.name !== displayName || d.isCustom) return d;
                          const updated = { ...d };
                          if (isMarginEdit) {
                            let margin = parseFloat(value) || 0;
                            if (margin > 1) margin = margin / 100;
                            updated.blendedMarginPct = margin;
                          } else {
                            // Cost edit = total LED cost (hardware + processor + shipping)
                            const newCost = parseFloat(value) || 0;
                            updated.hardwareCost = newCost; // set hardware as the base
                            updated.processorCost = 0;
                            updated.shippingCost = 0;
                          }
                          updated.totalCost = updated.hardwareCost + (updated.processorCost ?? 0) + (updated.shippingCost ?? 0) + (updated.installCost ?? 0) + (updated.structuralCost ?? 0) + (updated.pmCost ?? 0) + (updated.engCost ?? 0);
                          updated.totalSellingPrice = updated.blendedMarginPct > 0
                            ? updated.totalCost / (1 - updated.blendedMarginPct)
                            : updated.totalCost;
                          return updated;
                        });
                        const totalCost = updatedDisplays.reduce((s, d) => s + d.totalCost, 0);
                        const totalSell = updatedDisplays.reduce((s, d) => s + d.totalSellingPrice, 0);
                        return { ...prev, displays: updatedDisplays, summary: { ...prev.summary, totalCost, totalSellingPrice: totalSell, totalMargin: totalSell - totalCost, blendedMarginPct: totalSell > 0 ? Math.round(((totalSell - totalCost) / totalSell) * 1000) / 10 : 0 } };
                      } else if (itemIdx < displayCount + serviceCount) {
                        // Editing a service category row
                        const catIdx = itemIdx - displayCount;
                        const cat = serviceCategories[catIdx];
                        if (isCostEdit) {
                          // Distribute new total cost proportionally across displays
                          const currentTotal = prev.displays.reduce((s, d) => s + ((d as any)[cat.field] ?? 0), 0);
                          const newTotal = parseFloat(value) || 0;
                          const ratio = currentTotal > 0 ? newTotal / currentTotal : 0;
                          const updatedDisplays = prev.displays.map(d => {
                            const updated = { ...d };
                            const oldVal = (d as any)[cat.field] ?? 0;
                            (updated as any)[cat.field] = currentTotal > 0 ? oldVal * ratio : newTotal / prev.displays.length;
                            updated.totalCost = updated.hardwareCost + (updated.processorCost ?? 0) + (updated.shippingCost ?? 0) + (updated.installCost ?? 0) + (updated.structuralCost ?? 0) + (updated.pmCost ?? 0) + (updated.engCost ?? 0);
                            updated.totalSellingPrice = updated.blendedMarginPct > 0 ? updated.totalCost / (1 - updated.blendedMarginPct) : updated.totalCost;
                            return updated;
                          });
                          const totalCost = updatedDisplays.reduce((s, d) => s + d.totalCost, 0);
                          const totalSell = updatedDisplays.reduce((s, d) => s + d.totalSellingPrice, 0);
                          return { ...prev, displays: updatedDisplays, summary: { ...prev.summary, totalCost, totalSellingPrice: totalSell, totalMargin: totalSell - totalCost, blendedMarginPct: totalSell > 0 ? Math.round(((totalSell - totalCost) / totalSell) * 1000) / 10 : 0 } };
                        }
                        // Margin edit for service category — can't change per-display margins from service row; skip
                        return prev;
                      } else if (itemIdx < displayCount + serviceCount + customDisplays.length) {
                        // Editing a custom line item
                        const customIdx = itemIdx - displayCount - serviceCount;
                        const customName = customDisplays[customIdx].name;
                        const updatedDisplays = prev.displays.map(d => {
                          if (d.name !== customName || !d.isCustom) return d;
                          const updated = { ...d };
                          if (isMarginEdit) {
                            let margin = parseFloat(value) || 0;
                            if (margin > 1) margin = margin / 100;
                            updated.blendedMarginPct = margin;
                          } else {
                            updated.hardwareCost = parseFloat(value) || 0;
                          }
                          updated.totalCost = updated.hardwareCost + (updated.installCost ?? 0) + (updated.structuralCost ?? 0) + (updated.pmCost ?? 0) + (updated.engCost ?? 0);
                          updated.totalSellingPrice = updated.blendedMarginPct > 0
                            ? updated.totalCost / (1 - updated.blendedMarginPct)
                            : updated.totalCost;
                          return updated;
                        });
                        const totalCost = updatedDisplays.reduce((s, d) => s + d.totalCost, 0);
                        const totalSell = updatedDisplays.reduce((s, d) => s + d.totalSellingPrice, 0);
                        return { ...prev, displays: updatedDisplays, summary: { ...prev.summary, totalCost, totalSellingPrice: totalSell, totalMargin: totalSell - totalCost, blendedMarginPct: totalSell > 0 ? Math.round(((totalSell - totalCost) / totalSell) * 1000) / 10 : 0 } };
                      }
                      return prev;
                    });
                    return;
                  }
                }}
                onCellClick={(sheetIdx, rowIdx, colIdx) => {
                  // Cell click handlers are wired via onClick on individual cells
                }}
                onExport={handleDownloadScopingWorkbook}
                exporting={downloading === "scoping"}
                actions={
                  <>
                    {result.aiWorkspaceSlug && (
                      <Link
                        href={`/chat?workspace=${result.aiWorkspaceSlug}`}
                        target="_blank"
                        className="flex items-center gap-1 px-2 py-0.5 bg-white/20 hover:bg-white/30 rounded text-[10px] font-medium transition-colors"
                      >
                        <MessageSquare className="w-3 h-3" />
                        Cross-Check
                      </Link>
                    )}
                    <button
                      onClick={handleDownloadRateCard}
                      disabled={downloading === "ratecard" || !result?.id}
                      className="flex items-center gap-1 px-2 py-0.5 bg-white/20 hover:bg-white/30 rounded text-[10px] font-medium transition-colors disabled:opacity-50"
                    >
                      {downloading === "ratecard" ? <Loader2 className="w-3 h-3 animate-spin" /> : <DollarSign className="w-3 h-3" />}
                      Rate Card
                    </button>
                    <button
                      onClick={handleExportExcel}
                      disabled={downloading === "extraction"}
                      className="flex items-center gap-1 px-2 py-0.5 bg-white/20 hover:bg-white/30 rounded text-[10px] font-medium transition-colors disabled:opacity-50"
                    >
                      {downloading === "extraction" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                      Specs .xlsx
                    </button>
                    <button
                      onClick={() => bidFormInputRef.current?.click()}
                      disabled={downloading === "bidform" || !result?.id}
                      className="flex items-center gap-1 px-2 py-0.5 bg-amber-500/80 hover:bg-amber-500 text-white rounded text-[10px] font-medium transition-colors disabled:opacity-50"
                      title="Upload a blank bid form Excel and auto-fill vendor specs"
                    >
                      {downloading === "bidform" ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileSpreadsheet className="w-3 h-3" />}
                      Fill Bid Form
                    </button>
                    <input
                      ref={bidFormInputRef}
                      type="file"
                      accept=".xlsx,.xls"
                      onChange={handleFillBidForm}
                      className="hidden"
                    />
                    <button
                      onClick={handleCreateProposal}
                      disabled={downloading === "creating" || !result?.id || !session?.user?.email}
                      className="flex items-center gap-1 px-3 py-1 bg-[#0A52EF] text-white hover:bg-[#0941c3] rounded text-[10px] font-bold transition-colors disabled:opacity-50 shadow-sm ml-1"
                    >
                      {downloading === "creating" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                      Create Proposal
                    </button>
                    {pdfBlobUrl && (
                      <button
                        onClick={() => setShowPdfPanel(!showPdfPanel)}
                        className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-colors ml-1 ${
                          showPdfPanel
                            ? "bg-white text-[#217346]"
                            : "bg-white/20 hover:bg-white/30 text-white"
                        }`}
                        title={showPdfPanel ? "Hide PDF" : "Show PDF"}
                      >
                        {showPdfPanel ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                        PDF
                      </button>
                    )}
                  </>
                }
                footer={
                  <div className="px-4 py-2 space-y-2">
                    {autoSaveStatus !== "idle" && (
                      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                        {autoSaveStatus === "saving" && <><Loader2 className="w-3 h-3 animate-spin" /> Saving...</>}
                        {autoSaveStatus === "saved" && <><CheckCircle2 className="w-3 h-3 text-emerald-500" /> Saved</>}
                        {autoSaveStatus === "error" && <><AlertTriangle className="w-3 h-3 text-red-500" /> Save failed</>}
                      </div>
                    )}
                    <PipelineCheckpoint
                      unconfirmedCount={result.screens.filter((s) => s.confidence < 0.8).length}
                      onProceed={() => {/* tab switching handled by WorkbookShell */}}
                      nextStageLabel="Review Complete"
                    />
                  </div>
                }
              />

              {/* OLD TAB CONTENT REMOVED — now rendered by WorkbookShell */}

              {/* Incomplete specs quarantine — displays referenced but missing physical specs */}
              {result.incompleteSpecs && result.incompleteSpecs.length > 0 && (
                <div className="mt-4 border border-amber-500/30 bg-amber-500/5 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                    <h3 className="text-sm font-semibold text-amber-700 dark:text-amber-300">
                      Incomplete Specs — Manual Entry Required ({result.incompleteSpecs.length})
                    </h3>
                  </div>
                  <p className="text-xs text-muted-foreground mb-3">
                    These displays are referenced in the RFP by name or location but have no measurable specs (dimensions, pixel pitch, or brightness).
                    They may reference existing installations or require spec lookup.
                  </p>
                  <div className="space-y-2">
                    {result.incompleteSpecs.map((spec, i) => (
                      <div key={i} className="flex items-start gap-3 p-2 bg-background/50 rounded border border-border/50">
                        <Monitor className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium">{spec.name}</span>
                          {spec.location && <span className="text-xs text-muted-foreground ml-2">({spec.location})</span>}
                          {spec.notes && <p className="text-xs text-muted-foreground mt-0.5">{spec.notes}</p>}
                          {spec.sourcePages.length > 0 && (
                            <span className="text-[10px] text-muted-foreground">
                              Pages:{" "}
                              {spec.sourcePages.map((pg, pi) => (
                                <button
                                  key={pi}
                                  onClick={() => { setPdfViewerPage(pg); setShowPdfPanel(true); }}
                                  className="hover:text-amber-600 underline decoration-dotted mx-0.5"
                                >
                                  {pg}
                                </button>
                              ))}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Right: PDF split panel */}
            {showPdfPanel && pdfBlobUrl && (
              <div className="w-[420px] shrink-0 rounded-lg border border-border overflow-hidden shadow-sm self-stretch min-h-[500px]">
                <PdfSplitPanel
                  pdfUrl={pdfBlobUrl}
                  activePage={pdfViewerPage}
                  onClose={() => setShowPdfPanel(false)}
                />
              </div>
            )}
            </div>

            {/* Link to saved analysis */}
            {result.id && (
              <div className="flex items-center justify-center gap-4 pt-2">
                <Link
                  href={`/tools/rfp-analyzer/history/${result.id}`}
                  className="text-xs text-muted-foreground hover:text-primary transition-colors"
                >
                  View saved analysis →
                </Link>
              </div>
            )}
          </div>
          );
        })()}
      </main>
    </div>
  );
}

// ==========================================================================
// Sub-components
// ==========================================================================

function StatCard({ icon: Icon, label, value, sub, accent }: {
  icon: typeof FileText; label: string; value: string; sub?: string; accent?: string;
}) {
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2.5">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className={`w-3 h-3 ${accent || "text-muted-foreground"}`} />
        <span className="text-[10px] text-muted-foreground">{label}</span>
      </div>
      <div className={`text-lg font-bold font-mono ${accent || "text-foreground"}`}>{value}</div>
      {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

function Flag({ label }: { label: string }) {
  return (
    <span className="px-2.5 py-1 bg-amber-500/10 text-amber-600 text-xs font-medium rounded-full">
      {label}
    </span>
  );
}

function ProjectInfoCard({ project }: { project: AnalysisResult["project"] }) {
  const [expanded, setExpanded] = useState(false);

  // Primary flags always visible
  const primaryFlags: string[] = [];
  if (project.isOutdoor) primaryFlags.push("Outdoor");
  if (project.isUnionLabor) primaryFlags.push("Union Labor");
  if (project.bondRequired) primaryFlags.push("Bond Required");

  const specialReqs = project.specialRequirements || [];
  const hasExtras = specialReqs.length > 0;

  return (
    <div className="bg-card border border-border rounded-lg px-4 py-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold text-foreground">Project Information</span>
        </div>
        {hasExtras && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
          >
            <span>{expanded ? "Hide" : "Show"} {specialReqs.length} spec requirements</span>
            <ChevronDown className={`w-3 h-3 transition-transform ${expanded ? "rotate-180" : ""}`} />
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        {project.clientName && (
          <div>
            <span className="text-xs text-muted-foreground block">Client</span>
            <span className="font-medium">{project.clientName}</span>
          </div>
        )}
        {project.projectName && (
          <div>
            <span className="text-xs text-muted-foreground block">Project</span>
            <span className="font-medium">{project.projectName}</span>
          </div>
        )}
        {project.venue && (
          <div>
            <span className="text-xs text-muted-foreground block">Venue</span>
            <span className="font-medium">{project.venue}</span>
          </div>
        )}
        {project.location && (
          <div className="flex items-start gap-1">
            <MapPin className="w-3 h-3 text-muted-foreground mt-0.5 shrink-0" />
            <div>
              <span className="text-xs text-muted-foreground block">Location</span>
              <span className="font-medium">{project.location}</span>
            </div>
          </div>
        )}
      </div>
      {/* Primary flags — always visible */}
      {primaryFlags.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-3">
          {primaryFlags.map((f) => <Flag key={f} label={f} />)}
        </div>
      )}
      {/* Special requirements — collapsible */}
      {hasExtras && expanded && (
        <div className="mt-3 pt-3 border-t border-border">
          <div className="flex flex-wrap gap-1.5">
            {specialReqs.map((r) => (
              <span key={r} className="px-2 py-0.5 bg-muted text-muted-foreground text-[11px] rounded-md">
                {r}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PipelineStep({ step, title, description, status, action }: {
  step: number;
  title: string;
  description: string;
  icon?: typeof FileText;
  status: "ready" | "done" | "disabled";
  action: React.ReactNode;
}) {
  return (
    <div className={`bg-background border rounded-xl p-4 space-y-3 ${
      status === "done" ? "border-emerald-500/30" : "border-border"
    }`}>
      <div className="flex items-center gap-3">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
          status === "done"
            ? "bg-emerald-500 text-white"
            : "bg-primary/10 text-primary"
        }`}>
          {status === "done" ? <CheckCircle2 className="w-4 h-4" /> : step}
        </div>
        <div>
          <h4 className="text-sm font-semibold">{title}</h4>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      {action}
    </div>
  );
}

// ==========================================================================
// Pipeline Stepper — horizontal workflow progress
// ==========================================================================

const PIPELINE_STAGES = [
  { id: "upload", label: "RFP In", icon: Upload, sub: "Drop your document" },
  { id: "extract", label: "Specs", icon: Monitor, sub: "Pulling specs & requirements" },
  { id: "review", label: "What's Inside", icon: FileText, sub: "Displays, requirements, docs" },
  { id: "price", label: "Estimate", icon: DollarSign, sub: "Rate card, scoping, subs" },
  { id: "proposal", label: "Proposal", icon: ArrowRight, sub: "Build & send" },
] as const;

function PipelineStepper({
  phase,
  resultsTab,
  hasResult,
  hasPricing,
  specsFound,
  onTabSwitch,
}: {
  phase: Phase;
  resultsTab: string;
  hasResult: boolean;
  hasPricing: boolean;
  specsFound: number;
  onTabSwitch: (tab: string) => void;
}) {
  // Determine which stage is active
  let activeIdx = 0;
  if (phase === "processing") activeIdx = 1;
  else if (phase === "results" && resultsTab === "displays") activeIdx = 2;
  else if (phase === "results" && resultsTab === "estimate") activeIdx = 3;
  // Stage 4 (proposal) is only "done" if user clicks Create Proposal

  const getStatus = (idx: number): "done" | "active" | "upcoming" => {
    if (idx < activeIdx) return "done";
    if (idx === activeIdx) return "active";
    // Processing stage counts as active when extracting
    if (phase === "processing" && idx === 1) return "active";
    return "upcoming";
  };

  const handleClick = (idx: number) => {
    if (!hasResult) return;
    if (idx === 2) onTabSwitch("displays");
    if (idx === 3) onTabSwitch("estimate");
  };

  return (
    <div className="mb-6">
      <div className="flex items-center">
        {PIPELINE_STAGES.map((stage, idx) => {
          const status = getStatus(idx);
          const Icon = stage.icon;
          const clickable = hasResult && (idx === 2 || idx === 3);

          return (
            <React.Fragment key={stage.id}>
              {/* Connector */}
              {idx > 0 && (
                <div className="flex-1 flex items-center px-1">
                  <div className={`h-[2px] w-full rounded-full transition-colors ${
                    status === "done" || (idx <= activeIdx) ? "bg-emerald-500" : "bg-border"
                  }`} />
                  <ChevronRight className={`w-3 h-3 shrink-0 -ml-0.5 ${
                    status === "done" || (idx <= activeIdx) ? "text-emerald-500" : "text-muted-foreground/30"
                  }`} />
                </div>
              )}

              {/* Stage */}
              <button
                onClick={() => handleClick(idx)}
                disabled={!clickable}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg shrink-0 transition-all ${
                  status === "active"
                    ? "bg-[#0A52EF]/10 border border-[#0A52EF]/30 text-[#0A52EF]"
                    : status === "done"
                    ? "bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400"
                    : "bg-muted/30 border border-transparent text-muted-foreground/50"
                } ${clickable ? "cursor-pointer hover:bg-accent/50" : "cursor-default"}`}
              >
                <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                  status === "done"
                    ? "bg-emerald-500 text-white"
                    : status === "active"
                    ? "bg-[#0A52EF] text-white"
                    : "bg-muted text-muted-foreground/40"
                }`}>
                  {status === "done" ? (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  ) : (
                    <Icon className="w-3 h-3" />
                  )}
                </div>
                <div className="text-left hidden sm:block">
                  <div className="text-[11px] font-semibold leading-tight">{stage.label}</div>
                  <div className="text-[9px] opacity-70 leading-tight">
                    {status === "done" && idx === 0 ? "Uploaded"
                      : status === "done" && idx === 1 ? `Found ${specsFound} displays`
                      : status === "done" && idx === 2 ? "Reviewed"
                      : stage.sub}
                  </div>
                </div>
              </button>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

// ==========================================================================
// Document Browser (replaces old Triage Minimap)
// ==========================================================================

const fmtUsd = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(n);

const CAT_COLORS: Record<string, string> = {
  led_specs: "bg-emerald-500",
  drawing: "bg-blue-500",
  cost_schedule: "bg-amber-500",
  scope_of_work: "bg-purple-500",
  technical: "bg-orange-400",
  legal: "bg-slate-300",
  schedule: "bg-cyan-500",
  boilerplate: "bg-slate-200",
  unknown: "bg-slate-200",
};

const CAT_LABELS: Record<string, string> = {
  led_specs: "LED Specs",
  drawing: "Drawings",
  cost_schedule: "Cost / Pricing",
  scope_of_work: "Scope of Work",
  technical: "Technical",
  legal: "Legal / Bond",
  schedule: "Schedule",
  boilerplate: "Boilerplate",
  unknown: "Other",
};

const CAT_ICONS: Record<string, typeof Monitor> = {
  led_specs: Monitor,
  drawing: ImageIcon,
  cost_schedule: DollarSign,
  scope_of_work: FileText,
  technical: Shield,
  legal: Shield,
  schedule: Clock,
  boilerplate: FileText,
  unknown: FileText,
};

function DocumentBrowser({
  triage,
  hasPages,
  enabledCategories,
  onToggle,
  onReEmbed,
  reEmbedding,
  reEmbedResult,
  hasWorkspace,
}: {
  triage: AnalysisResult["triage"];
  hasPages: boolean;
  enabledCategories: Set<string>;
  onToggle: (cat: string) => void;
  onReEmbed: () => void;
  reEmbedding: boolean;
  reEmbedResult: string | null;
  hasWorkspace: boolean;
}) {
  // Group pages by category with stats
  const groups = triage.reduce<Record<string, { pages: number[]; relevant: number; total: number }>>((acc, p) => {
    if (!acc[p.category]) acc[p.category] = { pages: [], relevant: 0, total: 0 };
    acc[p.category].pages.push(p.pageNumber);
    acc[p.category].total++;
    if (p.relevance >= 40) acc[p.category].relevant++;
    return acc;
  }, {});

  // Sort: most relevant categories first, boilerplate/unknown last
  const sortedCats = Object.entries(groups).sort(([a, ga], [b, gb]) => {
    if (a === "boilerplate" || a === "unknown") return 1;
    if (b === "boilerplate" || b === "unknown") return -1;
    return gb.relevant - ga.relevant;
  });

  const enabledPageCount = triage.filter((p) => enabledCategories.has(p.category)).length;
  const hasChanges = hasPages && hasWorkspace;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <FileText className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold text-foreground">Document Categories ({triage.length} pages)</span>
        </div>
        {hasChanges && (
          <button
            onClick={onReEmbed}
            disabled={reEmbedding || enabledPageCount === 0}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-[#0A52EF] hover:bg-[#0840C0] disabled:opacity-50 text-white rounded text-[10px] font-medium transition-colors"
          >
            {reEmbedding ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <RefreshCw className="w-3 h-3" />
            )}
            {reEmbedding ? "Updating..." : `Update Reference Library (${enabledPageCount} pages)`}
          </button>
        )}
      </div>

      {/* Category cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
        {sortedCats.map(([cat, data]) => {
          const enabled = enabledCategories.has(cat);
          return (
            <button
              key={cat}
              onClick={() => onToggle(cat)}
              className={`flex items-start gap-2 p-2.5 rounded-lg border text-left transition-all ${
                enabled
                  ? "border-[#0A52EF]/30 bg-[#0A52EF]/5"
                  : "border-border bg-muted/30 opacity-50"
              }`}
            >
              {(() => { const CatIcon = CAT_ICONS[cat] || CAT_ICONS.unknown; return <CatIcon className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />; })()}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs font-medium truncate">{CAT_LABELS[cat] || cat}</span>
                  {enabled ? (
                    <ToggleRight className="w-3.5 h-3.5 text-[#0A52EF] shrink-0" />
                  ) : (
                    <ToggleLeft className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  )}
                </div>
                <span className="text-[10px] text-muted-foreground">
                  {data.total} page{data.total !== 1 ? "s" : ""}
                  {data.relevant < data.total && ` · ${data.relevant} relevant`}
                </span>
                {/* Mini page blocks */}
                <div className="flex flex-wrap gap-[1px] mt-1.5">
                  {data.pages.slice(0, 30).map((pn) => {
                    const page = triage.find((t) => t.pageNumber === pn);
                    return (
                      <div
                        key={pn}
                        className={`w-2 h-2.5 rounded-[1px] ${CAT_COLORS[cat] || CAT_COLORS.unknown} ${
                          page && page.relevance >= 40 ? "opacity-100" : "opacity-30"
                        }`}
                        title={`Page ${pn}${page ? ` (${page.relevance}% relevance)` : ""}`}
                      />
                    );
                  })}
                  {data.pages.length > 30 && (
                    <span className="text-[8px] text-muted-foreground ml-0.5">+{data.pages.length - 30}</span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Status message */}
      {reEmbedResult && (
        <p className={`text-xs mt-2 ${reEmbedResult.startsWith("Error") ? "text-red-500" : "text-emerald-600"}`}>
          {reEmbedResult.startsWith("Error") ? "⚠ " : "✓ "}{reEmbedResult}
        </p>
      )}

      {!hasPages && (
        <p className="text-[10px] text-muted-foreground mt-2">
          Category selection available during live analysis. From history, workspace uses original embedding.
        </p>
      )}
    </div>
  );
}
