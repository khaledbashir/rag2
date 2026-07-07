"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Loader2,
  FileText,
  Monitor,
  Clock,
  MapPin,
  Building2,
  CheckCircle2,
  Zap,
  AlertTriangle,
  Shield,
  Calendar,
  DollarSign,
  Download,
  FileSpreadsheet,
  Plus,
  ChevronDown,
  ChevronRight,
  RefreshCcw,
  Upload,
} from "lucide-react";
import SpecsTable from "../../_components/SpecsTable";
import RequirementsTable from "../../_components/RequirementsTable";
import { useRfpServerPreview } from "@/hooks/useRfpServerPreview";
import { snapDimension } from "@/services/catalog/productMatcher";
import WorkbookShell from "@/app/components/reusables/WorkbookShell";
import { buildEstimatorWorkbook } from "@/app/components/estimator/buildEstimatorWorkbook";
import type { ExtractedLEDSpec, ExtractedRequirement } from "@/services/rfp/unified/types";

// ============================================================================
// Types
// ============================================================================

interface IncompleteSpecUI {
  name: string;
  location: string;
  notes: string | null;
  sourcePages: number[];
  reason: string;
}

interface FullAnalysis {
  id: string;
  projectName: string | null;
  clientName: string | null;
  venue: string | null;
  location: string | null;
  filename: string;
  fileSize: number;
  pageCount: number;
  relevantPages: number;
  noisePages: number;
  drawingPages: number;
  specsFound: number;
  processingTimeMs: number;
  visionPages: number;
  screens: ExtractedLEDSpec[];
  requirements: ExtractedRequirement[];
  incompleteSpecs?: IncompleteSpecUI[];
  project: {
    clientName: string | null;
    projectName: string | null;
    venue: string | null;
    location: string | null;
    isOutdoor: boolean;
    isUnionLabor: boolean;
    bondRequired: boolean;
    specialRequirements: string[];
    schedulePhases: Array<{
      phaseName: string;
      startDate: string | null;
      endDate: string | null;
      duration: string | null;
    }>;
  };
  triage: Array<{
    pageNumber: number;
    category: string;
    relevance: number;
    isDrawing: boolean;
  }>;
  aiWorkspaceSlug: string | null;
  status: string;
  createdAt: string;
}

// ============================================================================
// Pipeline Stages
// ============================================================================

const HISTORY_STAGES = [
  { id: "documents", label: "Documents", icon: Upload, sub: "Original RFP files" },
  { id: "specs", label: "LED Specs", icon: Monitor, sub: "Extracted displays" },
  { id: "review", label: "What's Inside", icon: FileText, sub: "Project & requirements" },
  { id: "estimate", label: "Estimate", icon: DollarSign, sub: "Pricing & workbook" },
  { id: "actions", label: "Actions", icon: ArrowRight, sub: "Export & proposal" },
] as const;

// ============================================================================
// Detail Page
// ============================================================================

export default function AnalysisDetailPage() {
  const params = useParams();
  const { data: session } = useSession();
  const id = params?.id as string;
  const [analysis, setAnalysis] = useState<FullAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeStage, setActiveStage] = useState(2); // Default: "What's Inside"
  const [downloading, setDownloading] = useState<string | null>(null);
  const [pricingPreview, setPricingPreview] = useState<any>(null);
  const [loadingPricing, setLoadingPricing] = useState(false);
  const [activeWorkbookTab, setActiveWorkbookTab] = useState(0);
  const [availableProducts, setAvailableProducts] = useState<Array<{ id: string; label: string; pitch: number; name: string; widthMm?: number; heightMm?: number; moduleWidthMm?: number; moduleHeightMm?: number; manufacturer?: string; nits?: number; weightKg?: number; maxPowerWatts?: number; environment?: string }>>([]);
  const [pdfAvailable, setPdfAvailable] = useState<boolean | null>(null);
  const [filledBidFormBlob, setFilledBidFormBlob] = useState<Blob | null>(null);
  const [filledBidFormName, setFilledBidFormName] = useState<string>("");
  const [bidFormStatus, setBidFormStatus] = useState<"checking" | "attached" | "missing" | "generating" | "ready" | "error">("checking");
  const [bidFormFileName, setBidFormFileName] = useState<string | null>(null);
  const [bidFormError, setBidFormError] = useState<string | null>(null);
  const [bidFormSummary, setBidFormSummary] = useState<{
    matches: number;
    totalBlocks: number;
    unmatchedBlocks: number;
    unmatchedScreens: number;
  } | null>(null);
  const [autoSaveStatus, setAutoSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced auto-save: patches screens to DB 2s after last edit
  const autoSaveSpecs = useCallback((specs: ExtractedLEDSpec[], analysisId: string) => {
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
        if (res.ok) setTimeout(() => setAutoSaveStatus("idle"), 3000);
      } catch {
        setAutoSaveStatus("error");
      }
    }, 2000);
  }, []);

  // Remove old handleCellEdit

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const res = await fetch(`/api/rfp/analyses/${id}`);
        if (!res.ok) throw new Error(res.status === 404 ? "Analysis not found" : "Failed to load");
        const data = await res.json();

        // Parse JSON blobs if they come as strings
        if (typeof data.screens === "string") data.screens = JSON.parse(data.screens);
        if (typeof data.requirements === "string") data.requirements = JSON.parse(data.requirements);
        if (typeof data.incompleteSpecs === "string") data.incompleteSpecs = JSON.parse(data.incompleteSpecs);
        if (typeof data.project === "string") data.project = JSON.parse(data.project);
        if (typeof data.triage === "string") data.triage = JSON.parse(data.triage);

        setAnalysis(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  useEffect(() => {
    if (!analysis?.id) return;
    let cancelled = false;
    setBidFormStatus("checking");
    fetch(`/api/rfp/bid-form?analysisId=${analysis.id}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        setBidFormFileName(data?.filename || null);
        setBidFormStatus(data?.exists ? "attached" : "missing");
      })
      .catch(() => {
        if (cancelled) return;
        setBidFormStatus("error");
        setBidFormError("Could not check bid form attachment.");
      });
    return () => { cancelled = true; };
  }, [analysis?.id]);

  // Check if PDF is available
  useEffect(() => {
    if (!id) return;
    fetch(`/api/rfp/analyses/${id}/pdf`, { method: "HEAD" })
      .then((res) => setPdfAvailable(res.ok))
      .catch(() => setPdfAvailable(false));
  }, [id]);

  // Auto-load pricing when analysis loads
  const autoPreviewPricing = useCallback(async (analysisData: FullAnalysis) => {
    if (!analysisData.screens?.length) return;
    setLoadingPricing(true);
    try {
      const res = await fetch("/api/rfp/pipeline/pricing-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          analysisId: analysisData.id,
          specs: analysisData.screens,
          project: analysisData.project,
          quotes: [],
          includeBond: analysisData.project?.bondRequired || false,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setPricingPreview(data);
      }
    } catch (err) {
      console.error("[history] Pricing preview failed:", err);
    } finally {
      setLoadingPricing(false);
    }
  }, []);

  useEffect(() => {
    if (analysis && analysis.screens?.length > 0 && !pricingPreview && !loadingPricing) {
      autoPreviewPricing(analysis);
    }
  }, [analysis, pricingPreview, loadingPricing, autoPreviewPricing]);

  // Load products for dropdown
  useEffect(() => {
    if (!analysis || availableProducts.length > 0) return;
    fetch("/api/rfp/pipeline/products")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data?.products) setAvailableProducts(data.products); })
      .catch(() => {});
  }, [analysis, availableProducts.length]);

  const handleProductSelect = useCallback((displayIndex: number, productId: string) => {
    const product = availableProducts.find((p) => p.id === productId);
    if (!product) return;

    const screens = analysis?.screens as any[] || [];
    const currentSpec = screens[displayIndex];
    const displayName = currentSpec?.name || "";
    const newPitch = product.pitch || 0;
    const weightKgPerCab = product.weightKg || 0;
    const maxPowerPerCab = product.maxPowerWatts || 0;
    const productNits = product.nits || 0;

    // OES/scoring/CMS products have no cabinet dimensions — skip dimension recalc
    const isLedPanel = newPitch > 0 && (product.widthMm || 0) > 0 && (product.heightMm || 0) > 0;

    let activeWidthFt: number, activeHeightFt: number;
    let activeWidthMm: number, activeHeightMm: number;
    let totalCabs: number;

    if (isLedPanel) {
      const cabWidthMm = product.widthMm!;
      const cabHeightMm = product.heightMm!;
      const requestedWidthMm = (currentSpec?.widthFt || 0) * 304.8;
      const requestedHeightMm = (currentSpec?.heightFt || 0) * 304.8;
      const snapW = snapDimension(requestedWidthMm, cabWidthMm, product.moduleWidthMm);
      const snapH = snapDimension(requestedHeightMm, cabHeightMm, product.moduleHeightMm);
      activeWidthMm = snapW.totalMm;
      activeHeightMm = snapH.totalMm;
      activeWidthFt = activeWidthMm / 304.8;
      activeHeightFt = activeHeightMm / 304.8;
      totalCabs = snapW.cabinets * snapH.cabinets;
    } else {
      activeWidthFt = currentSpec?.widthFt || 0;
      activeHeightFt = currentSpec?.heightFt || 0;
      activeWidthMm = activeWidthFt * 304.8;
      activeHeightMm = activeHeightFt * 304.8;
      totalCabs = 1;
    }

    const totalWeightLbs = Math.round(totalCabs * weightKgPerCab * 2.20462);
    const totalPowerW = Math.round(totalCabs * maxPowerPerCab);
    const btuPerHr = Math.round(totalPowerW * 3.412);

    console.log(`[ProductSelect] ${displayName} → ${product.name}: isLED=${isLedPanel}, nits=${productNits}, cabs=${totalCabs}`);

    // Persist product selection + dimensions to DB
    if (analysis?.id) {
      const updatedScreens = (analysis.screens as any[]).map((s: any, i: number) =>
        i === displayIndex
          ? {
              ...s,
              ...(isLedPanel ? {
                // Original widthFt/heightFt stay LOCKED as RFP values — never overwrite
                activeWidthFt: Math.round(activeWidthFt * 100) / 100,
                activeHeightFt: Math.round(activeHeightFt * 100) / 100,
                widthPx: newPitch > 0 ? Math.round(activeWidthMm / newPitch) : s.widthPx,
                heightPx: newPitch > 0 ? Math.round(activeHeightMm / newPitch) : s.heightPx,
                pixelPitchMm: newPitch,
              } : {}),
              // brightnessNits stays LOCKED as RFP value — product nits flow via matchedProduct.nits
              weightLbs: totalWeightLbs || s.weightLbs,
              maxPowerW: totalPowerW || s.maxPowerW,
              selectedProductId: productId,
              selectedProductName: product.name,
            }
          : s
      );
      setAnalysis((prev) => prev ? { ...prev, screens: updatedScreens } : prev);
      fetch(`/api/rfp/analyses/${analysis.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ screens: updatedScreens }),
      }).catch(() => {});
    }

    setPricingPreview((prev: any) => {
      if (!prev) return prev;
      return {
        ...prev,
        displays: prev.displays.map((d: any, i: number) =>
          i === displayIndex
            ? {
                ...d,
                nits: productNits,
                weightLbs: totalWeightLbs,
                totalPowerW: totalPowerW,
                btuPerHr: btuPerHr,
                matchedProduct: {
                  manufacturer: product.manufacturer || product.name.split(" ")[0],
                  model: product.name,
                  pitch: product.pitch,
                  totalModules: totalCabs,
                  fitScore: 100,
                  activeWidthFt: Math.round(activeWidthFt * 100) / 100,
                  activeHeightFt: Math.round(activeHeightFt * 100) / 100,
                  resolutionX: newPitch > 0 ? Math.round(activeWidthMm / newPitch) : 0,
                  resolutionY: newPitch > 0 ? Math.round(activeHeightMm / newPitch) : 0,
                  nits: productNits,
                  weightKgPerCab,
                  maxPowerWPerCab: maxPowerPerCab,
                  totalWeightLbs,
                  totalMaxPowerW: totalPowerW,
                  btuPerHr,
                },
              }
            : d
        ),
      };
    });
  }, [availableProducts, analysis?.screens]);

  const handleAddScreen = useCallback(() => {
    const newSpec: ExtractedLEDSpec = {
      name: `New Display ${(analysis?.screens?.length || 0) + 1}`,
      location: "",
      widthFt: 0,
      heightFt: 0,
      widthPx: null,
      heightPx: null,
      pixelPitchMm: null,
      brightnessNits: null,
      environment: "indoor",
      quantity: 1,
      serviceType: null,
      mountingType: null,
      maxPowerW: null,
      weightLbs: null,
      specialRequirements: [],
      confidence: 1,
      sourcePages: [],
      sourceType: "text",
      citation: "Manually added",
      notes: null,
      isAlternate: false,
    };

    setAnalysis((prev) => {
      if (!prev) return prev;
      const screens = [...prev.screens, newSpec];
      autoSaveSpecs(screens, prev.id);
      return { ...prev, screens };
    });

    setPricingPreview((prev: any) => {
      if (!prev) return prev;
      return {
        ...prev,
        displays: [...prev.displays, {
          name: newSpec.name,
          pixelPitch: null,
          areaSqFt: 0,
          quantity: 1,
          hardwareCost: 0,
          processorCost: 0,
          shippingCost: 0,
          installCost: 0,
          structuralCost: 0,
          pmCost: 0,
          engCost: 0,
          totalCost: 0,
          totalSellingPrice: 0,
          blendedMarginPct: 0.15,
          costSource: "manual",
          rateCardEstimate: null,
          matchedProduct: null,
          isCustom: false,
        }],
        summary: { ...prev.summary, displayCount: prev.summary.displayCount + 1 },
      };
    });
  }, [autoSaveSpecs]);

  const handleRemoveScreen = useCallback((screenIndex: number) => {
    // No confirmation — just remove like Excel. Uses index to avoid deleting all same-name screens.
    setAnalysis((prev) => {
      if (!prev) return prev;
      const screens = (prev.screens as any[]).filter((_, i) => i !== screenIndex);
      autoSaveSpecs(screens, prev.id);
      return { ...prev, screens };
    });
    setPricingPreview((prev: any) => {
      if (!prev) return prev;
      return {
        ...prev,
        displays: prev.displays.filter((_: any, i: number) => i !== screenIndex),
        summary: { ...prev.summary, displayCount: Math.max(0, prev.summary.displayCount - 1) },
      };
    });
  }, [autoSaveSpecs]);

  const handleQtyChange = useCallback((displayIndex: number, qty: number) => {
    setAnalysis((prev) => {
      if (!prev) return prev;
      const screens = (prev.screens as any[]).map((s: any, i: number) =>
        i === displayIndex ? { ...s, quantity: qty } : s
      );
      autoSaveSpecs(screens, prev.id);
      return { ...prev, screens };
    });
  }, [autoSaveSpecs]);

  const { data: serverWorkbookData, loading: serverWorkbookLoading, displayRowMap, skipNextRebuild } = useRfpServerPreview({
    analysisId: analysis?.id || null,
    specs: analysis?.screens || [],
    includeBond: analysis?.project?.bondRequired || false,
  });

  const workbookData = serverWorkbookData || { fileName: "RFP Analysis", sheets: [] };

  // Qty dropdown callback
  const handleHistoryQtyChange = useCallback((displayIndex: number, qty: number) => {
    setAnalysis(prev => {
      if (!prev) return prev;
      if (displayIndex < 0 || displayIndex >= prev.screens.length) return prev;
      const spec = { ...prev.screens[displayIndex] };
      spec.quantity = qty;
      const updated = [...prev.screens];
      updated[displayIndex] = spec;
      autoSaveSpecs(updated, prev.id);
      return { ...prev, screens: updated };
    });
  }, [autoSaveSpecs]);

  // Display name/H/W/Qty inline edit callback
  const handleHistoryCellEdit = useCallback((sheetIndex: number, rowIndex: number, colIndex: number, newValue: string) => {
    const displayIndex = displayRowMap[rowIndex] ?? rowIndex;

    // Display name edit (Column A) — text, not numeric.
    if (colIndex === 0) {
      const nextName = newValue.trim();
      if (!nextName) return;

      setAnalysis(prev => {
        if (!prev) return prev;
        if (displayIndex < 0 || displayIndex >= prev.screens.length) return prev;
        const spec = { ...prev.screens[displayIndex], name: nextName };
        const updated = [...prev.screens];
        updated[displayIndex] = spec;
        autoSaveSpecs(updated, prev.id);
        return { ...prev, screens: updated };
      });

      setPricingPreview((prev: any) => {
        if (!prev?.displays || displayIndex < 0 || displayIndex >= prev.displays.length) return prev;
        const displays = [...prev.displays];
        displays[displayIndex] = { ...displays[displayIndex], name: nextName };
        return { ...prev, displays };
      });
      return;
    }

    const numValue = parseFloat(newValue);
    if (isNaN(numValue) || numValue <= 0) return;

    // Qty edit (col 11) — delegate to existing handler
    if (colIndex === 11) {
      handleHistoryQtyChange(displayIndex, Math.max(1, Math.round(numValue)));
      return;
    }

    let field: string | null = null;
    if (colIndex === 7) field = "heightFt";
    else if (colIndex === 8) field = "widthFt";
    if (!field) return;

    setAnalysis(prev => {
      if (!prev) return prev;
      if (displayIndex < 0 || displayIndex >= prev.screens.length) return prev;
      const spec = { ...prev.screens[displayIndex] };
      (spec as any)[field!] = numValue;
      if (field === "heightFt") spec.activeHeightFt = null;
      if (field === "widthFt") spec.activeWidthFt = null;
      const updated = [...prev.screens];
      updated[displayIndex] = spec;
      autoSaveSpecs(updated, prev.id);
      return { ...prev, screens: updated };
    });
  }, [autoSaveSpecs, displayRowMap, handleHistoryQtyChange]);

  // Download helper
  const downloadBlob = async (url: string, body: object, fallbackName: string) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Download failed (${res.status})`);
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = res.headers.get("Content-Disposition")?.split("filename=")[1]?.replace(/"/g, "") || fallbackName;
    link.click();
    URL.revokeObjectURL(blobUrl);
  };

  const handleExport = async () => {
    if (!analysis) return;
    setDownloading("extraction");
    try {
      await downloadBlob(
        "/api/rfp/pipeline/extraction-excel",
        { analysisId: analysis.id, clientSpecs: (analysis.screens as any[]) || undefined },
        `${analysis.projectName || "rfp-analysis"}.xlsx`,
      );
    } catch (err: any) {
      console.error("Export failed:", err);
    } finally {
      setDownloading(null);
    }
  };

  const handleScoping = async () => {
    if (!analysis) return;
    setDownloading("scoping");
    try {
      await downloadBlob("/api/rfp/pipeline/scoping-workbook", { analysisId: analysis.id, clientSpecs: (analysis.screens as any[]) || undefined, clientDisplays: pricingPreview?.displays || undefined }, "Scoping_Workbook.xlsx");
    } catch (err: any) {
      console.error("Scoping workbook failed:", err);
    } finally {
      setDownloading(null);
    }
  };

  const handleBidFormUpload = useCallback(async (file: File) => {
    if (!analysis?.id) return;
    setDownloading("bidform");
    setBidFormStatus("generating");
    setBidFormError(null);
    setBidFormSummary(null);
    setFilledBidFormBlob(null);
    try {
      const formData = new FormData();
      formData.append("bidForm", file);
      formData.append("analysisId", analysis.id);
      formData.append("specs", JSON.stringify(analysis.screens || []));
      // Pass pricing data so bid form gets cost/price/manufacturer fields
      if (pricingPreview?.displays) {
        const pricingData = pricingPreview.displays.map((d: any) => ({
          name: d.name,
          hardwareCost: d.hardwareCost,
          processingCost: d.processorCost ?? 0,
          shippingCost: d.shippingCost ?? 0,
          installCost: d.installCost,
          pmCost: d.pmCost ?? 0,
          totalCost: d.totalCost,
          hardwareSellingPrice: d.hardwareSellingPrice,
          servicesSellingPrice: d.servicesSellingPrice,
          totalSellingPrice: d.totalSellingPrice,
          matchedProduct: d.matchedProduct ? {
            manufacturer: d.matchedProduct.manufacturer,
            model: d.matchedProduct.model,
            pitch: d.matchedProduct.pitch,
            nits: d.matchedProduct.nits,
            totalMaxPowerW: d.matchedProduct.totalMaxPowerW,
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
      if (!res.ok) throw new Error(`Bid form fill failed (${res.status})`);
      const blob = await res.blob();
      setFilledBidFormBlob(blob);
      const name = res.headers.get("Content-Disposition")?.split("filename=")[1]?.replace(/"/g, "") || "BidForm_Filled.xlsx";
      setFilledBidFormName(name);
      setBidFormSummary({
        matches: JSON.parse(res.headers.get("X-Bid-Form-Matches") || "[]").length,
        totalBlocks: Number(res.headers.get("X-Bid-Form-Total-Blocks") || 0),
        unmatchedBlocks: JSON.parse(res.headers.get("X-Bid-Form-Unmatched-Blocks") || "[]").length,
        unmatchedScreens: JSON.parse(res.headers.get("X-Bid-Form-Unmatched-Screens") || "[]").length,
      });
      setBidFormStatus("ready");
    } catch (err: any) {
      console.error("Bid form fill failed:", err);
      setBidFormError(err.message || "Bid form fill failed.");
      setBidFormStatus("error");
    } finally {
      setDownloading(null);
    }
  }, [analysis, pricingPreview]);

  // Auto-fill bid form if one was saved during initial upload
  const bidFormAutoFilled = useRef(false);
  useEffect(() => {
    if (!analysis?.id || !pricingPreview || bidFormAutoFilled.current || filledBidFormBlob) return;
    if (bidFormStatus !== "attached") return;
    bidFormAutoFilled.current = true;
    (async () => {
      try {
        const fileRes = await fetch(`/api/rfp/bid-form/file?analysisId=${analysis.id}`);
        if (!fileRes.ok) return;
        const fileBlob = await fileRes.blob();
        const file = new File([fileBlob], bidFormFileName || "bid-form.xlsx", { type: fileBlob.type });
        await handleBidFormUpload(file);
      } catch (err: any) {
        setBidFormStatus("error");
        setBidFormError(err.message || "Could not generate the filled bid form.");
      }
    })();
  }, [analysis?.id, pricingPreview, bidFormStatus, bidFormFileName, filledBidFormBlob, handleBidFormUpload]);

  const handleRateCard = async () => {
    if (!analysis) return;
    setDownloading("ratecard");
    try {
      await downloadBlob("/api/rfp/pipeline/rate-card-excel", {
        analysisId: analysis.id,
        quotes: [],
        includeBond: analysis.project?.bondRequired || false,
      }, "Rate_Card.xlsx");
    } catch (err: any) {
      console.error("Rate card failed:", err);
    } finally {
      setDownloading(null);
    }
  };

  const handleCreateProposal = async () => {
    if (!analysis?.id || !session?.user?.email) return;
    setDownloading("creating");
    try {
      const res = await fetch("/api/rfp/pipeline/create-proposal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          analysisId: analysis.id,
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

  if (loading) {
    return (
      <div className="flex-1 min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
        <span className="ml-3 text-sm text-muted-foreground">Loading analysis...</span>
      </div>
    );
  }

  if (error || !analysis) {
    return (
      <div className="flex-1 min-h-screen bg-background flex flex-col items-center justify-center">
        <AlertTriangle className="w-10 h-10 text-destructive mb-3" />
        <p className="text-lg font-medium text-foreground">{error || "Analysis not found"}</p>
        <Link href="/tools/rfp-analyzer/history" className="mt-4 text-sm text-primary hover:underline">
          Back to History
        </Link>
      </div>
    );
  }

  const a = analysis;
  const screens = a.screens || [];
  const requirements = a.requirements || [];
  const project = a.project || {};
  const triage = a.triage || [];
  const date = new Date(a.createdAt);

  const criticalReqs = requirements.filter((r) => r.status === "critical").length;

  return (
    <div className="flex-1 min-w-0 bg-background relative min-h-screen">
      {/* Header — simplified */}
      <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-md border-b border-border h-14 px-6 xl:px-8 flex items-center">
        <div className="flex items-center justify-between w-full max-w-[1600px] mx-auto">
          <div className="flex items-center gap-3">
            <Link
              href="/tools/rfp-analyzer/history"
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              History
            </Link>
            <div className="w-px h-5 bg-border" />
            <div>
              <h1 className="text-sm font-bold text-foreground leading-tight">
                {a.projectName || a.venue || a.filename}
              </h1>
              <p className="text-[10px] text-muted-foreground">
                {a.filename} — {a.pageCount.toLocaleString()} pages — {date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5" />
        </div>
      </header>

      {/* Pipeline Stepper — compact bar on workbook stages */}
      <div className={activeStage === 1 || activeStage === 3 ? "px-2 pt-1" : "px-4 xl:px-6 pt-3 max-w-[1600px] mx-auto"}>
        {activeStage !== 1 && activeStage !== 3 && (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-3">
            <StatCard icon={FileText} label="Total Pages" value={a.pageCount.toLocaleString()} />
            <StatCard
              icon={CheckCircle2}
              label="Relevant"
              value={a.relevantPages.toString()}
              sub={`${Math.round((a.relevantPages / a.pageCount) * 100)}% kept`}
              accent="text-emerald-500"
            />
            <StatCard icon={Monitor} label="LED Displays" value={(screens.length || a.specsFound).toString()} accent="text-primary" />
            <StatCard
              icon={AlertTriangle}
              label="Requirements"
              value={requirements.length.toString()}
              sub={criticalReqs > 0 ? `${criticalReqs} critical` : undefined}
              accent={criticalReqs > 0 ? "text-red-500" : undefined}
            />
            <StatCard icon={Zap} label="Vision Pages" value={a.visionPages.toString()} />
            <StatCard icon={Clock} label="Processing" value={`${(a.processingTimeMs / 1000).toFixed(1)}s`} />
          </div>
        )}
        <HistoryStepper
          activeStage={activeStage}
          onStageClick={setActiveStage}
          specsCount={screens.length || a.specsFound}
        />
      </div>

      <main className={activeStage === 1 || activeStage === 3 ? "px-1 pt-1" : "p-4 xl:px-6 max-w-[1600px] mx-auto space-y-3"}>

        {/* ═══ Stage 0: Documents ═══ */}
        {activeStage === 0 && (
          <div className="space-y-4 animate-in fade-in duration-300">
            <div className="bg-card border border-border rounded-xl p-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-foreground">{a.filename}</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    {a.pageCount.toLocaleString()} pages — {(a.fileSize / 1024 / 1024).toFixed(1)} MB — Uploaded {date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
                  </p>
                </div>
                {pdfAvailable && (
                  <a
                    href={`/api/rfp/analyses/${a.id}/pdf`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    Download PDF
                  </a>
                )}
              </div>
            </div>
            {pdfAvailable ? (
              <div className="bg-card border border-border rounded-xl overflow-hidden" style={{ height: "70vh" }}>
                <iframe
                  src={`/api/rfp/analyses/${a.id}/pdf`}
                  className="w-full h-full"
                  title="RFP Document"
                />
              </div>
            ) : pdfAvailable === false ? (
              <div className="bg-card border border-border rounded-xl p-12 text-center">
                <FileText className="w-12 h-12 mx-auto text-muted-foreground/30 mb-4" />
                <p className="text-sm font-medium text-muted-foreground">PDF not available</p>
                <p className="text-xs text-muted-foreground/70 mt-1">
                  The original file may have been removed after a container restart.
                </p>
              </div>
            ) : (
              <div className="bg-card border border-border rounded-xl p-12 text-center">
                <Loader2 className="w-6 h-6 mx-auto animate-spin text-muted-foreground" />
                <p className="text-xs text-muted-foreground mt-2">Checking PDF availability...</p>
              </div>
            )}
          </div>
        )}

        {/* ═══ Stage 1: LED Specs ═══ */}
        {activeStage === 1 && (
          <div className="animate-in fade-in duration-300 space-y-4">
            {loadingPricing && (
              <div className="mb-4 p-3 border border-blue-500/30 bg-blue-500/10 rounded-lg flex items-center gap-3">
                <Loader2 className="w-4 h-4 text-blue-600 animate-spin shrink-0" />
                <p className="text-sm text-blue-700 dark:text-blue-300">Matching products...</p>
              </div>
            )}
            <div className="h-[calc(100vh-120px)] flex flex-col relative border border-border rounded-xl overflow-hidden bg-white">
              <div className="flex-1 min-h-0 overflow-auto">
                {serverWorkbookLoading && !serverWorkbookData ? (
                  <div className="flex items-center justify-center h-full">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  </div>
                ) : serverWorkbookData ? (() => {
                  const specs = analysis?.screens || [];
                  const wbData = buildEstimatorWorkbook(serverWorkbookData, {
                    products: availableProducts,
                    displayProductIds: specs.map((s: any) => s.selectedProductId || ""),
                    displayRowMap,
                    onProductSelect: handleProductSelect,
                    onRemoveDisplay: handleRemoveScreen,
                  });
                  const ledCostSheet = wbData.sheets.find((sheet) => sheet.name === "LED Cost Sheet");
                  if (ledCostSheet?.editableColumns) {
                    ledCostSheet.editableColumns = ledCostSheet.editableColumns.filter((col) => col !== 21);
                  }
                  const ledCostSheetIdx = ledCostSheet ? wbData.sheets.indexOf(ledCostSheet) : -1;
                  const onLedCostSheet = ledCostSheetIdx >= 0 && activeWorkbookTab === ledCostSheetIdx;
                  return (
                    <div className="relative h-full">
                      {serverWorkbookLoading && (
                        <div className="pointer-events-none absolute right-3 top-3 z-10 rounded-full border border-border bg-background/95 px-2.5 py-1 shadow-sm backdrop-blur-sm">
                          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                            <Loader2 className="w-3 h-3 animate-spin text-[#0A52EF]" />
                            Updating…
                          </div>
                        </div>
                      )}
                      <WorkbookShell
                        data={wbData}
                        editable
                        onCellEdit={handleHistoryCellEdit}
                        activeTab={activeWorkbookTab}
                        onTabChange={setActiveWorkbookTab}
                        actions={onLedCostSheet ? (
                          <button
                            onClick={handleAddScreen}
                            className="flex items-center gap-1 px-2.5 py-1 bg-white text-[#217346] hover:bg-white/90 rounded text-[10px] font-bold transition-colors shadow-sm"
                            title="Append a new blank display row to the LED Cost Sheet"
                          >
                            <Plus className="w-3 h-3" />
                            Add Display
                          </button>
                        ) : undefined}
                      />
                    </div>
                  );
                })() : null}
              </div>
              {autoSaveStatus !== "idle" && (
                <div className="shrink-0 px-4 py-2 flex items-center gap-1.5 text-[10px] text-muted-foreground bg-card border-t border-border">
                  {autoSaveStatus === "saving" && <><Loader2 className="w-3 h-3 animate-spin" /> Saving...</>}
                  {autoSaveStatus === "saved" && <><CheckCircle2 className="w-3 h-3 text-emerald-500" /> Saved</>}
                  {autoSaveStatus === "error" && <><AlertTriangle className="w-3 h-3 text-red-500" /> Save failed</>}
                </div>
              )}
            </div>

            {/* Needs Review — incomplete specs */}
            {a.incompleteSpecs && a.incompleteSpecs.length > 0 && (
              <NeedsReviewSection
                incompleteSpecs={a.incompleteSpecs}
                analysisId={a.id}
                onPromote={(promoted, remainingIncomplete) => {
                  setAnalysis((prev) => {
                    if (!prev) return prev;
                    const newScreens = [...prev.screens, ...promoted];
                    // Also persist the updated screens to DB
                    autoSaveSpecs(newScreens, prev.id);
                    return {
                      ...prev,
                      screens: newScreens,
                      incompleteSpecs: remainingIncomplete,
                    };
                  });
                }}
              />
            )}
          </div>
        )}

        {/* ═══ Stage 2: What's Inside (default) ═══ */}
        {activeStage === 2 && (
          <div className="space-y-6 animate-in fade-in duration-300">
            {(project.clientName || project.venue || project.projectName) && (
              <ProjectInfoCard project={project} />
            )}
            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <Shield className="w-4 h-4 text-muted-foreground" />
                Requirements ({requirements.length})
                {criticalReqs > 0 && (
                  <span className="px-1.5 py-0.5 bg-red-500/10 text-red-500 text-[10px] font-bold rounded-full">
                    {criticalReqs} critical
                  </span>
                )}
              </h3>
              {requirements.length > 0 ? (
                <RequirementsTable requirements={requirements} />
              ) : (
                <p className="text-xs text-muted-foreground">No requirements extracted from this document.</p>
              )}
            </div>
            {triage.length > 0 && (
              <div className="bg-card border border-border rounded-xl p-5">
                <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-muted-foreground" />
                  {triage[0]?.timestamp ? `Pipeline Log (${triage.length} steps)` : `Page Triage (${triage.length} pages)`}
                </h3>
                {triage[0]?.timestamp ? (
                  <div className="max-h-64 overflow-y-auto bg-[#1a1b26] rounded-lg px-3 py-2 font-mono text-[11px] leading-5 space-y-0.5">
                    {triage.map((entry: any, i: number) => {
                      const msg = entry.message || entry.category || "";
                      const isAI = msg.startsWith("AI: ");
                      const isCount = /\d+ displays|\d+ pages|matched|verified|validation/i.test(msg);
                      const isBlock = /BLOCK|FAIL/i.test(msg);
                      return (
                        <div key={i} className="flex gap-2">
                          <span className="text-gray-600 select-none shrink-0">{String(i + 1).padStart(2, "0")}</span>
                          <span className={
                            isBlock ? "text-red-400" :
                            isAI ? "text-[#7aa2f7] italic" :
                            isCount ? "text-[#9ece6a]" :
                            "text-gray-400"
                          }>
                            {isAI ? msg.substring(4) : msg}
                          </span>
                          <span className="text-gray-700 ml-auto shrink-0 text-[9px]">
                            {new Date(entry.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <TriageMinimap triage={triage} />
                )}
              </div>
            )}
          </div>
        )}

        {/* ═══ Stage 3: Estimate ═══ */}
        {activeStage === 3 && (
          <div className="space-y-4 animate-in fade-in duration-300">
            {loadingPricing && (
              <div className="p-3 border border-blue-500/30 bg-blue-500/10 rounded-lg flex items-center gap-3">
                <Loader2 className="w-4 h-4 text-blue-600 animate-spin shrink-0" />
                <p className="text-sm text-blue-700 dark:text-blue-300">Matching products and calculating pricing...</p>
              </div>
            )}
            {!loadingPricing && !pricingPreview && screens.length > 0 && (
              <div className="p-3 border border-amber-500/30 bg-amber-500/10 rounded-lg flex items-center gap-3">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <p className="text-sm text-amber-700 dark:text-amber-300 flex-1">
                  Product matching hasn&apos;t loaded yet.
                </p>
                <button
                  onClick={() => analysis && autoPreviewPricing(analysis)}
                  className="px-3 py-1.5 bg-amber-600 text-white rounded-md text-xs font-medium hover:bg-amber-700 inline-flex items-center gap-1.5"
                >
                  <RefreshCcw className="w-3 h-3" />
                  Match Products
                </button>
              </div>
            )}
            <div className="h-[calc(100vh-120px)] flex flex-col relative border border-border rounded-xl overflow-hidden bg-white">
              <div className="shrink-0 px-4 py-2 flex items-center justify-between border-b border-border bg-card">
                <div className="text-sm font-semibold text-foreground">Estimate Workbook</div>
                <button
                  onClick={handleScoping}
                  disabled={downloading === "scoping"}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground text-xs font-medium rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {downloading === "scoping" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                  Export Excel
                </button>
              </div>
              <div className="flex-1 min-h-0 overflow-auto">
                {serverWorkbookLoading && !serverWorkbookData ? (
                  <div className="flex items-center justify-center h-full">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  </div>
                ) : serverWorkbookData ? (() => {
                  const specs = analysis?.screens || [];
                  const wbData = buildEstimatorWorkbook(serverWorkbookData, {
                    products: availableProducts,
                    displayProductIds: specs.map((s: any) => s.selectedProductId || ""),
                    displayRowMap,
                    onProductSelect: handleProductSelect,
                    onRemoveDisplay: handleRemoveScreen,
                  });
                  return (
                    <WorkbookShell
                      data={wbData}
                      editable
                      onCellEdit={handleHistoryCellEdit}
                      activeTab={activeWorkbookTab}
                      onTabChange={setActiveWorkbookTab}
                    />
                  );
                })() : null}
              </div>
              {autoSaveStatus !== "idle" && (
                <div className="shrink-0 px-4 py-2 flex items-center gap-1.5 text-[10px] text-muted-foreground bg-card border-t border-border">
                  {autoSaveStatus === "saving" && <><Loader2 className="w-3 h-3 animate-spin" /> Saving...</>}
                  {autoSaveStatus === "saved" && <><CheckCircle2 className="w-3 h-3 text-emerald-500" /> Saved</>}
                  {autoSaveStatus === "error" && <><AlertTriangle className="w-3 h-3 text-red-500" /> Save failed</>}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══ Stage 4: Actions ═══ */}
        {activeStage === 4 && (
          <div className="animate-in fade-in duration-300">
            <div className="max-w-3xl mx-auto mb-4 rounded-xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Bid form status</h3>
                  <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                    <p><span className="font-medium text-foreground">Source:</span> {a.filename}</p>
                    <p>
                      <span className="font-medium text-foreground">Bid form:</span>{" "}
                      {bidFormStatus === "checking" && "Checking attachment..."}
                      {bidFormStatus === "missing" && "No bid form attached"}
                      {["attached", "generating", "ready"].includes(bidFormStatus) && (bidFormFileName || "Attached")}
                      {bidFormStatus === "error" && (bidFormError || "Needs attention")}
                    </p>
                    <p><span className="font-medium text-foreground">Displays detected:</span> {a.screens?.length || 0}</p>
                    {bidFormSummary && (
                      <p>
                        <span className="font-medium text-foreground">Fill result:</span>{" "}
                        {bidFormSummary.matches}/{bidFormSummary.totalBlocks} sections filled
                        {bidFormSummary.unmatchedBlocks || bidFormSummary.unmatchedScreens
                          ? `, ${bidFormSummary.unmatchedBlocks} unmatched sections, ${bidFormSummary.unmatchedScreens} unmatched displays`
                          : ", no unmatched items"}
                      </p>
                    )}
                  </div>
                </div>
                <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium ${
                  bidFormStatus === "ready"
                    ? "bg-emerald-50 text-emerald-700"
                    : bidFormStatus === "attached" || bidFormStatus === "generating"
                      ? "bg-blue-50 text-blue-700"
                      : bidFormStatus === "missing"
                        ? "bg-amber-50 text-amber-700"
                        : "bg-red-50 text-red-700"
                }`}>
                  {bidFormStatus === "generating" || bidFormStatus === "checking" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : bidFormStatus === "missing" || bidFormStatus === "error" ? (
                    <AlertTriangle className="h-3.5 w-3.5" />
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  )}
                  {bidFormStatus === "ready" && "Ready"}
                  {bidFormStatus === "attached" && "Attached"}
                  {bidFormStatus === "generating" && "Generating"}
                  {bidFormStatus === "checking" && "Checking"}
                  {bidFormStatus === "missing" && "Missing"}
                  {bidFormStatus === "error" && "Error"}
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 max-w-3xl mx-auto">
              {bidFormStatus === "ready" && filledBidFormBlob ? (
                <ActionCard
                  icon={Download}
                  title="Download Filled Bid Form"
                  description={bidFormSummary ? `${bidFormSummary.matches}/${bidFormSummary.totalBlocks} sections filled. Open the Excel to review the populated specs.` : "Bid form generated from the attached template and LED specs"}
                  onClick={() => {
                    const url = URL.createObjectURL(filledBidFormBlob);
                    const link = document.createElement("a");
                    link.href = url;
                    link.download = filledBidFormName;
                    link.click();
                    URL.revokeObjectURL(url);
                  }}
                  accent="#059669"
                  primary
                />
              ) : bidFormStatus === "attached" || bidFormStatus === "generating" ? (
                <ActionCard
                  icon={FileSpreadsheet}
                  title={bidFormStatus === "generating" ? "Generating Filled Bid Form" : "Generate Filled Bid Form"}
                  description="Uses the attached bid form and current LED specs. No extra upload needed."
                  onClick={async () => {
                    if (!analysis?.id) return;
                    const fileRes = await fetch(`/api/rfp/bid-form/file?analysisId=${analysis.id}`);
                    if (!fileRes.ok) {
                      setBidFormStatus("error");
                      setBidFormError("Attached bid form could not be loaded.");
                      return;
                    }
                    const fileBlob = await fileRes.blob();
                    await handleBidFormUpload(new File([fileBlob], bidFormFileName || "bid-form.xlsx", { type: fileBlob.type }));
                  }}
                  loading={downloading === "bidform" || bidFormStatus === "generating"}
                  accent="#2563eb"
                  primary
                />
              ) : (
                <ActionCard
                  icon={Upload}
                  title="Attach Bid Form"
                  description="No bid form is attached to this analysis. Use this fallback only if it was not uploaded with the source workbook."
                  onClick={() => {
                    const input = document.createElement("input");
                    input.type = "file";
                    input.accept = ".xlsx,.xls";
                    input.onchange = (e) => {
                      const file = (e.target as HTMLInputElement).files?.[0];
                      if (file) handleBidFormUpload(file);
                    };
                    input.click();
                  }}
                  loading={downloading === "bidform"}
                />
              )}
              <ActionCard
                icon={FileSpreadsheet}
                title="Scoping Workbook"
                description="Full scoping workbook with all sheets — LED cost, margin analysis, processors, P&L"
                onClick={handleScoping}
                loading={downloading === "scoping"}
                accent="#217346"
              />
              <ActionCard
                icon={DollarSign}
                title="Rate Card"
                description="Pricing rate card Excel for internal review and vendor comparison"
                onClick={handleRateCard}
                loading={downloading === "ratecard"}
              />
              <ActionCard
                icon={Download}
                title="Specs .xlsx"
                description="Extracted LED specs spreadsheet — display dimensions, pitch, quantities"
                onClick={handleExport}
                loading={downloading === "extraction"}
              />
              <ActionCard
                icon={Plus}
                title="Create Proposal"
                description="Launch a full proposal from this RFP analysis with pre-filled data"
                onClick={handleCreateProposal}
                loading={downloading === "creating"}
                primary
                disabled={!session?.user?.email}
              />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// ============================================================================
// History Pipeline Stepper
// ============================================================================

function HistoryStepper({
  activeStage,
  onStageClick,
  specsCount,
}: {
  activeStage: number;
  onStageClick: (idx: number) => void;
  specsCount: number;
}) {
  return (
    <div className="flex items-center">
      {HISTORY_STAGES.map((stage, idx) => {
        const isActive = idx === activeStage;
        const Icon = stage.icon;

        // Dynamic sub text
        const subText = idx === 1 ? `${specsCount} displays found` : stage.sub;

        return (
          <React.Fragment key={stage.id}>
            {/* Connector */}
            {idx > 0 && (
              <div className="flex-1 flex items-center px-1">
                <div className="h-[2px] w-full rounded-full bg-emerald-500 transition-colors" />
                <ChevronRight className="w-3 h-3 shrink-0 -ml-0.5 text-emerald-500" />
              </div>
            )}

            {/* Stage button */}
            <button
              onClick={() => onStageClick(idx)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg shrink-0 transition-all cursor-pointer ${
                isActive
                  ? "bg-[#0A52EF]/10 border border-[#0A52EF]/30 text-[#0A52EF]"
                  : "bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50/80 dark:hover:bg-emerald-500/15"
              }`}
            >
              <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                isActive
                  ? "bg-[#0A52EF] text-white"
                  : "bg-emerald-500 text-white"
              }`}>
                {isActive ? (
                  <Icon className="w-3 h-3" />
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                )}
              </div>
              <div className="text-left hidden sm:block">
                <div className="text-[11px] font-semibold leading-tight">{stage.label}</div>
                <div className="text-[9px] opacity-70 leading-tight">{subText}</div>
              </div>
            </button>
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ============================================================================
// Action Card (Stage 4)
// ============================================================================

function ActionCard({
  icon: Icon,
  title,
  description,
  onClick,
  loading,
  accent,
  primary,
  disabled,
}: {
  icon: typeof FileSpreadsheet;
  title: string;
  description: string;
  onClick: () => void;
  loading?: boolean;
  accent?: string;
  primary?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading || disabled}
      className={`group text-left p-5 rounded-xl border transition-all disabled:opacity-50 ${
        primary
          ? "bg-[#0A52EF] text-white border-[#0A52EF] hover:bg-[#0941c3]"
          : "bg-card border-border hover:border-primary/40 hover:shadow-md"
      }`}
    >
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
          primary
            ? "bg-white/20"
            : accent
              ? "text-white"
              : "bg-primary/10"
        }`} style={accent ? { backgroundColor: accent } : undefined}>
          {loading ? (
            <Loader2 className={`w-5 h-5 animate-spin ${primary ? "text-white" : accent ? "text-white" : "text-primary"}`} />
          ) : (
            <Icon className={`w-5 h-5 ${primary ? "text-white" : accent ? "text-white" : "text-primary"}`} />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h4 className={`text-sm font-semibold ${primary ? "text-white" : "text-foreground"}`}>
            {title}
          </h4>
          <p className={`text-xs mt-1 ${primary ? "text-white/70" : "text-muted-foreground"}`}>
            {description}
          </p>
        </div>
      </div>
    </button>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

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

function ProjectInfoCard({ project }: { project: any }) {
  const [expanded, setExpanded] = useState(false);

  const primaryFlags: string[] = [];
  if (project.isOutdoor) primaryFlags.push("Outdoor");
  if (project.isUnionLabor) primaryFlags.push("Union Labor");
  if (project.bondRequired) primaryFlags.push("Bond Required");

  const specialReqs: string[] = project.specialRequirements || [];
  const schedulePhases: any[] = project.schedulePhases || [];
  const hasExtras = specialReqs.length > 0 || schedulePhases.length > 0;

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
            <span>{expanded ? "Hide" : "Show"} details ({specialReqs.length} requirements{schedulePhases.length > 0 ? ", schedule" : ""})</span>
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
      {primaryFlags.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-3">
          {primaryFlags.map((f) => <Flag key={f} label={f} />)}
        </div>
      )}
      {hasExtras && expanded && (
        <div className="mt-3 pt-3 border-t border-border space-y-3">
          {specialReqs.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {specialReqs.map((r: string) => (
                <span key={r} className="px-2 py-0.5 bg-muted text-muted-foreground text-[11px] rounded-md">
                  {r}
                </span>
              ))}
            </div>
          )}
          {schedulePhases.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                <Calendar className="w-3 h-3" />
                Schedule
              </h4>
              <div className="flex flex-wrap gap-3">
                {schedulePhases.map((p: any, i: number) => (
                  <div key={i} className="px-3 py-2 bg-muted/50 rounded-lg text-xs">
                    <span className="font-medium text-foreground">{p.phaseName}</span>
                    {p.endDate && <span className="text-muted-foreground ml-2">{p.endDate}</span>}
                    {p.duration && <span className="text-muted-foreground ml-2">({p.duration})</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Needs Review — Incomplete Specs with Inline Editing + Promote
// ============================================================================

function NeedsReviewSection({
  incompleteSpecs,
  analysisId,
  onPromote,
}: {
  incompleteSpecs: IncompleteSpecUI[];
  analysisId: string;
  onPromote: (promoted: ExtractedLEDSpec[], remainingIncomplete: IncompleteSpecUI[]) => void;
}) {
  // Local editable state for each incomplete spec
  const [editState, setEditState] = useState<
    Array<{
      widthFt: string;
      heightFt: string;
      pixelPitchMm: string;
      brightnessNits: string;
      environment: "indoor" | "outdoor";
    }>
  >(() =>
    incompleteSpecs.map(() => ({
      widthFt: "",
      heightFt: "",
      pixelPitchMm: "",
      brightnessNits: "",
      environment: "indoor",
    }))
  );
  const [saving, setSaving] = useState<number | null>(null);
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());

  const updateField = (idx: number, field: string, value: string) => {
    setEditState((prev) => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], [field]: value };
      return updated;
    });
  };

  const canPromote = (idx: number) => {
    const e = editState[idx];
    return (
      (e.widthFt && parseFloat(e.widthFt) > 0) ||
      (e.heightFt && parseFloat(e.heightFt) > 0) ||
      (e.pixelPitchMm && parseFloat(e.pixelPitchMm) > 0) ||
      (e.brightnessNits && parseFloat(e.brightnessNits) > 0)
    );
  };

  const handlePromote = async (idx: number) => {
    const spec = incompleteSpecs[idx];
    const edit = editState[idx];

    const promoted: ExtractedLEDSpec = {
      name: spec.name,
      location: spec.location,
      widthFt: edit.widthFt ? parseFloat(edit.widthFt) : null,
      heightFt: edit.heightFt ? parseFloat(edit.heightFt) : null,
      widthPx: null,
      heightPx: null,
      pixelPitchMm: edit.pixelPitchMm ? parseFloat(edit.pixelPitchMm) : null,
      brightnessNits: edit.brightnessNits ? parseFloat(edit.brightnessNits) : null,
      environment: edit.environment,
      quantity: 1,
      serviceType: null,
      mountingType: null,
      maxPowerW: null,
      weightLbs: null,
      specialRequirements: [],
      confidence: 0.5,
      sourcePages: spec.sourcePages,
      sourceType: "text",
      citation: `[Manual entry from incomplete spec]`,
      notes: spec.notes,
    };

    setSaving(idx);
    try {
      const remaining = incompleteSpecs.filter((_, i) => i !== idx);

      // First get current screens from parent, then save both to DB
      // The onPromote callback updates local state; we also need to persist
      onPromote([promoted], remaining);

      // Persist: update incompleteSpecs (remove this one) — screens auto-saved by parent
      await fetch(`/api/rfp/analyses/${analysisId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ incompleteSpecs: remaining }),
      });
    } catch (err) {
      console.error("Failed to promote spec:", err);
    } finally {
      setSaving(null);
    }
  };

  const handleDismiss = async (idx: number) => {
    setDismissed((prev) => new Set(prev).add(idx));
  };

  const visibleSpecs = incompleteSpecs.filter((_, i) => !dismissed.has(i));

  if (visibleSpecs.length === 0) return null;

  return (
    <div className="border border-amber-500/30 bg-amber-500/[0.04] rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3 border-b border-amber-500/20 bg-amber-500/[0.06]">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          <h3 className="text-sm font-semibold text-amber-700 dark:text-amber-300">
            Needs Review ({visibleSpecs.length})
          </h3>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          These displays are referenced in the RFP but have no physical specs. Fill in what you know and promote them to confirmed.
        </p>
      </div>

      {/* Specs list */}
      <div className="divide-y divide-amber-500/10">
        {incompleteSpecs.map((spec, idx) => {
          if (dismissed.has(idx)) return null;
          const edit = editState[idx];
          const isSaving = saving === idx;

          return (
            <div key={idx} className="px-5 py-4">
              {/* Name + location + reason */}
              <div className="flex items-start justify-between gap-4 mb-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Monitor className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                    <span className="text-sm font-semibold text-foreground">{spec.name}</span>
                  </div>
                  {spec.location && (
                    <p className="text-xs text-muted-foreground mt-0.5 ml-6">{spec.location}</p>
                  )}
                  {spec.notes && (
                    <p className="text-xs text-muted-foreground/70 mt-0.5 ml-6 italic">{spec.notes}</p>
                  )}
                  <p className="text-[10px] text-amber-600/70 mt-1 ml-6">{spec.reason}</p>
                  {spec.sourcePages.length > 0 && (
                    <p className="text-[10px] text-muted-foreground mt-0.5 ml-6">
                      Source: page{spec.sourcePages.length > 1 ? "s" : ""} {spec.sourcePages.join(", ")}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => handleDismiss(idx)}
                  className="text-[10px] text-muted-foreground hover:text-foreground transition-colors shrink-0"
                  title="Dismiss — not a real display"
                >
                  Dismiss
                </button>
              </div>

              {/* Inline editable fields */}
              <div className="ml-6 grid grid-cols-2 sm:grid-cols-5 gap-2">
                <div>
                  <label className="text-[10px] text-muted-foreground block mb-0.5">Width (ft)</label>
                  <input
                    type="number"
                    step="any"
                    value={edit.widthFt}
                    onChange={(e) => updateField(idx, "widthFt", e.target.value)}
                    placeholder="—"
                    className="w-full px-2 py-1.5 text-xs font-mono border border-amber-500/30 rounded bg-background
                      focus:border-amber-500 focus:ring-1 focus:ring-amber-500/20 outline-none transition-colors"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground block mb-0.5">Height (ft)</label>
                  <input
                    type="number"
                    step="any"
                    value={edit.heightFt}
                    onChange={(e) => updateField(idx, "heightFt", e.target.value)}
                    placeholder="—"
                    className="w-full px-2 py-1.5 text-xs font-mono border border-amber-500/30 rounded bg-background
                      focus:border-amber-500 focus:ring-1 focus:ring-amber-500/20 outline-none transition-colors"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground block mb-0.5">Pitch (mm)</label>
                  <input
                    type="number"
                    step="any"
                    value={edit.pixelPitchMm}
                    onChange={(e) => updateField(idx, "pixelPitchMm", e.target.value)}
                    placeholder="—"
                    className="w-full px-2 py-1.5 text-xs font-mono border border-amber-500/30 rounded bg-background
                      focus:border-amber-500 focus:ring-1 focus:ring-amber-500/20 outline-none transition-colors"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground block mb-0.5">Nits</label>
                  <input
                    type="number"
                    step="any"
                    value={edit.brightnessNits}
                    onChange={(e) => updateField(idx, "brightnessNits", e.target.value)}
                    placeholder="—"
                    className="w-full px-2 py-1.5 text-xs font-mono border border-amber-500/30 rounded bg-background
                      focus:border-amber-500 focus:ring-1 focus:ring-amber-500/20 outline-none transition-colors"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground block mb-0.5">Environment</label>
                  <select
                    value={edit.environment}
                    onChange={(e) => updateField(idx, "environment", e.target.value)}
                    className="w-full px-2 py-1.5 text-xs border border-amber-500/30 rounded bg-background
                      focus:border-amber-500 focus:ring-1 focus:ring-amber-500/20 outline-none transition-colors"
                  >
                    <option value="indoor">Indoor</option>
                    <option value="outdoor">Outdoor</option>
                  </select>
                </div>
              </div>

              {/* Promote button */}
              <div className="ml-6 mt-3 flex items-center gap-2">
                <button
                  onClick={() => handlePromote(idx)}
                  disabled={!canPromote(idx) || isSaving}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors
                    disabled:opacity-40 disabled:cursor-not-allowed
                    bg-amber-600 text-white hover:bg-amber-700 disabled:hover:bg-amber-600"
                >
                  {isSaving ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-3 h-3" />
                  )}
                  Promote to Confirmed
                </button>
                {!canPromote(idx) && (
                  <span className="text-[10px] text-muted-foreground">
                    Fill in at least one spec to promote
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// Triage Minimap
// ============================================================================

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

function TriageMinimap({ triage }: { triage: Array<{ pageNumber: number; category: string; relevance: number; isDrawing: boolean }> }) {
  const counts = triage.reduce<Record<string, number>>((acc, p) => {
    acc[p.category] = (acc[p.category] || 0) + 1;
    return acc;
  }, {});

  return (
    <div>
      {/* Legend */}
      <div className="flex flex-wrap gap-3 mb-3 text-xs">
        {Object.entries(counts).sort(([, a], [, b]) => b - a).map(([cat, count]) => (
          <div key={cat} className="flex items-center gap-1.5">
            <div className={`w-2.5 h-2.5 rounded-sm ${CAT_COLORS[cat] || CAT_COLORS.unknown}`} />
            <span className="text-muted-foreground capitalize">{cat.replace(/_/g, " ")} ({count})</span>
          </div>
        ))}
      </div>

      {/* Blocks */}
      <div className="flex flex-wrap gap-[2px]">
        {triage.map((p) => (
          <div
            key={p.pageNumber}
            className={`w-3 h-4 rounded-[2px] ${CAT_COLORS[p.category] || CAT_COLORS.unknown} ${
              p.relevance >= 40 ? "opacity-100" : "opacity-25"
            }`}
            title={`Page ${p.pageNumber}: ${p.category} (${p.relevance}% relevance)${p.isDrawing ? " [Drawing]" : ""}`}
          />
        ))}
      </div>

      <p className="text-[10px] text-muted-foreground mt-2">
        Each block = 1 page. Bright = relevant (kept), faded = noise (filtered). Hover for details.
      </p>
    </div>
  );
}
