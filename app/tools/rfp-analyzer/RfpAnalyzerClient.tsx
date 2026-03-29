"use client";

import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import UploadZone, { type PipelineEvent } from "./_components/UploadZone";
import PipelineCheckpoint from "./_components/PipelineCheckpoint";
import { buildRfpWorkbook } from "./_components/rfpWorkbookBuilder";
import { LED_COST_PER_SQFT_BY_PITCH } from "@/services/rfp/productCatalog";
import { packCabinetsAndModules } from "@/services/module-matching";
import { LED_MODULES } from "@/data/catalogs/led-products";
import type { PricingDocument } from "@/types/pricing";
import dynamic from "next/dynamic";

const PdfSplitPanel = dynamic(() => import("./_components/PdfSplitPanel"), { ssr: false });
const UniverSpreadsheet = dynamic(() => import("./_components/UniverSpreadsheet"), { ssr: false });
const LuxWidget = dynamic(() => import("./_components/LuxWidget"), { ssr: false });
import type { ExtractedLEDSpec, ExtractedRequirement } from "@/services/rfp/unified/types";
import { isPlatformOwner } from "@/lib/platformOwner";
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
  Zap,
  Wrench,
  Cpu,
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
    documentMode?: string | null;
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
  hasMarginAnalysis?: boolean;
  hasLedCostSheet?: boolean;
  // Mirror Mode pricing extracted from Excel
  pricingDocument?: any;
  mirrorModePricing?: Array<{
    name: string;
    sellingPrice: number;
    cost: number | null;
    section: string;
  }>;
  // Internal audit data for weight/power/btu calculations
  internalAudit?: {
    perScreen?: Array<{
      quantity?: number;
      pixelMatrix?: string;
      pixelResolution?: string;
      brightnessNits?: number;
      estimatedWeightLbs?: number;
      totalMaxPowerW?: number;
    }>;
    totals?: any;
  };
  createdAt?: string;
  updatedAt?: string;
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const [phase, setPhase] = useState<Phase>("upload");
  const [recentAnalyses, setRecentAnalyses] = useState<Array<{ id: string; projectName: string | null; filename: string; specsFound: number; createdAt: string; status: string }>>([]);
  const [events, setEvents] = useState<PipelineEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const lastExcelFileRef = useRef<File | null>(null);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [fileInfo, setFileInfo] = useState<{ filename: string; pageCount: number; sizeMb: string } | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const loadedFromDbRef = useRef(false);

  // Pipeline step states
  const [downloading, setDownloading] = useState<string | null>(null);
  const [quoteImportResult, setQuoteImportResult] = useState<any>(null);
  const [pricingPreview, setPricingPreview] = useState<PricingPreview | null>(null);
  const [loadingPricing, setLoadingPricing] = useState(false);
  const [availableProducts, setAvailableProducts] = useState<Array<{ id: string; label: string; pitch: number; name: string; widthMm?: number; heightMm?: number; manufacturer?: string; nits?: number; weightKg?: number; maxPowerWatts?: number; environment?: string }>>([]);
  const [resultsTab, setResultsTab] = useState<string>("displays");
  const [customTabs, setCustomTabs] = useState<Array<{ id: string; name: string; content: string }>>([]);
  const [drawingUpload, setDrawingUpload] = useState<{ uploading: boolean; results: Array<{ filename: string; pages: number }> }>({ uploading: false, results: [] });
  const [quotePreviewOpen, setQuotePreviewOpen] = useState(false);
  const [editableSpecs, setEditableSpecs] = useState<ExtractedLEDSpec[]>([]);
  // Full-screen spreadsheet mode — hides pipeline, stats, project info
  const [spreadsheetMode, setSpreadsheetMode] = useState(true);
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
  const scopingImportRef = useRef<HTMLInputElement>(null);
  const [scopingImportResult, setScopingImportResult] = useState<{
    updatedCount: number; missingCount: number; warnings: string[];
    summary: { totalCostAfter: number; costDelta: number };
  } | null>(null);
  const [bidFormResult, setBidFormResult] = useState<{
    matches: Array<{ sheetName: string; displayName: string; matchedScreen: string; confidence: number; fieldsFilled: string[]; fieldsSkipped?: string[] }>;
    unmatchedBlocks: string[];
    unmatchedScreens: string[];
  } | null>(null);
  const [filledBidFormBlob, setFilledBidFormBlob] = useState<Blob | null>(null);
  const [filledBidFormName, setFilledBidFormName] = useState<string>("");
  // Mismatch detection: original PDF vs bid form specs
  const [specMismatches, setSpecMismatches] = useState<Array<{
    displayName: string;
    field: string;
    pdfValue: string | number | null;
    bidFormValue: string | number | null;
    severity: "critical" | "warning";
  }>>([]);
  // Accordion toolbar state
  const [expandedToolbar, setExpandedToolbar] = useState<string | null>(null);

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
  // Auto-load from DB when ?id=xxx is in URL (persistence across refresh)
  // ========================================================================

  useEffect(() => {
    const analysisId = searchParams.get("id");
    if (!analysisId || loadedFromDbRef.current || result) return;
    loadedFromDbRef.current = true;

    (async () => {
      try {
        setPhase("processing");
        setEvents([{ type: "stage", stage: "uploading", message: "Loading saved analysis..." }]);

        const res = await fetch(`/api/rfp/analyses/${analysisId}`);
        if (!res.ok) {
          if (res.status === 404) {
            // Analysis deleted or invalid — clear URL and show upload
            router.replace("/tools/rfp-analyzer", { scroll: false });
            setPhase("upload");
            return;
          }
          throw new Error(`Failed to load analysis (${res.status})`);
        }

        const data = await res.json();

        // Parse JSON blobs if they come as strings (Prisma sometimes does this)
        const parse = (v: any, fallback: any) => {
          if (v == null) return fallback;
          if (typeof v === "string") try { return JSON.parse(v); } catch { return fallback; }
          return v;
        };

        const screens = parse(data.screens, []);
        const requirements = parse(data.requirements, []);
        const project = parse(data.project, {});
        const triage = parse(data.triage, []);
        const pages = parse(data.pages, []);
        const pricingDoc = parse(data.pricingDocument, null);
        const mirrorPricing = parse(data.mirrorModePricing, null);

        const loaded: AnalysisResult = {
          id: data.id,
          screens,
          requirements,
          project: {
            clientName: project.clientName ?? null,
            projectName: project.projectName ?? null,
            venue: project.venue ?? null,
            location: project.location ?? null,
            documentMode: project.documentMode ?? null,
            isOutdoor: project.isOutdoor ?? false,
            isUnionLabor: project.isUnionLabor ?? false,
            bondRequired: project.bondRequired ?? false,
            specialRequirements: project.specialRequirements ?? [],
          },
          stats: {
            totalPages: data.pageCount ?? 0,
            relevantPages: data.relevantPages ?? 0,
            noisePages: data.noisePages ?? 0,
            drawingPages: data.drawingPages ?? 0,
            specsFound: data.specsFound ?? screens.length,
            processingTimeMs: data.processingTimeMs ?? 0,
          },
          triage,
          pages,
          aiWorkspaceSlug: data.aiWorkspaceSlug ?? null,
          pricingDocument: pricingDoc,
          mirrorModePricing: mirrorPricing,
          createdAt: data.createdAt ?? undefined,
          updatedAt: data.updatedAt ?? undefined,
        };

        setResult(loaded);
        setEditableSpecs(screens);
        setFileInfo({
          filename: data.filename || "Loaded from history",
          pageCount: data.pageCount ?? 0,
          sizeMb: ((data.fileSize ?? 0) / 1024 / 1024).toFixed(1),
        });

        setEvents([
          { type: "stage", stage: "uploaded", message: "Loaded from database" },
          { type: "stage", stage: "extracted", message: `${screens.length} displays` },
          { type: "complete", result: loaded },
        ]);
        setPhase("results");

        console.log(`[RFP] Loaded analysis ${analysisId} from DB — ${screens.length} screens, pricingDoc=${!!pricingDoc}`);
      } catch (err: any) {
        console.error("[RFP] Failed to load analysis from DB:", err);
        setError(err.message || "Failed to load saved analysis");
        setPhase("upload");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Fetch recent analyses for the upload landing page
  useEffect(() => {
    if (phase !== "upload") return;
    (async () => {
      try {
        const res = await fetch("/api/rfp/analyses?limit=8&offset=0");
        if (!res.ok) return;
        const data = await res.json();
        setRecentAnalyses(data.analyses ?? []);
      } catch { /* silent */ }
    })();
  }, [phase]);

  // ========================================================================
  // Helpers: recalculate display costs when dims/qty/product change
  // ========================================================================

  function recalcDisplayCosts(
    display: PricingPreview['displays'][0],
    newAreaSqFt: number, newQty: number, newPitch?: number
  ) {
    const updated = { ...display };
    const oldTotalSqFt = (display.areaSqFt || 1) * (display.quantity || 1);
    let ratePerSqFt = oldTotalSqFt > 0 ? display.hardwareCost / oldTotalSqFt : 0;

    // If pitch changed → try catalog rate card (exact match, then ±0.5mm)
    if (newPitch != null && newPitch !== display.pixelPitch) {
      const catalogRate = LED_COST_PER_SQFT_BY_PITCH[String(newPitch)];
      if (catalogRate && catalogRate > 0) {
        ratePerSqFt = catalogRate;
      } else {
        const keys = Object.keys(LED_COST_PER_SQFT_BY_PITCH).map(Number);
        const nearest = keys.reduce((b, k) => Math.abs(k - newPitch) < Math.abs(b - newPitch) ? k : b, keys[0]);
        if (Math.abs(nearest - newPitch) <= 0.5) {
          const r = LED_COST_PER_SQFT_BY_PITCH[String(nearest)];
          if (r > 0) ratePerSqFt = r;
        }
      }
    }

    updated.areaSqFt = newAreaSqFt;
    updated.quantity = newQty;
    if (newPitch != null) updated.pixelPitch = newPitch;
    updated.hardwareCost = ratePerSqFt * newAreaSqFt * newQty;

    // Scale processor/shipping with qty
    const qtyRatio = newQty / (display.quantity || 1);
    if (display.quantity !== newQty) {
      updated.processorCost = (display.processorCost ?? 0) * qtyRatio;
      updated.shippingCost = (display.shippingCost ?? 0) * qtyRatio;
    }

    // Recalc totals
    const ledTotal = updated.hardwareCost + (updated.processorCost ?? 0) + (updated.shippingCost ?? 0);
    updated.totalCost = ledTotal + (updated.installCost ?? 0) + (updated.structuralCost ?? 0)
      + (updated.pmCost ?? 0) + (updated.engCost ?? 0);
    updated.totalSellingPrice = updated.blendedMarginPct > 0
      ? updated.totalCost / (1 - updated.blendedMarginPct) : updated.totalCost;
    return updated;
  }

  function recalcSummary(prev: PricingPreview, updatedDisplays: PricingPreview['displays']): PricingPreview {
    const totalCost = updatedDisplays.reduce((s, d) => s + d.totalCost, 0);
    const totalSell = updatedDisplays.reduce((s, d) => s + d.totalSellingPrice, 0);
    return {
      ...prev, displays: updatedDisplays,
      summary: { ...prev.summary, totalCost, totalSellingPrice: totalSell,
        totalMargin: totalSell - totalCost,
        blendedMarginPct: totalSell > 0 ? Math.round(((totalSell - totalCost) / totalSell) * 1000) / 10 : 0 },
    };
  }

  function updatePricingDocumentFromMarginAnalysis(
    pricingDocument: PricingDocument,
    itemIdx: number,
    field: string,
    value: number
  ): PricingDocument {
    if (field !== "sellingPrice" && field !== "cost") return pricingDocument;

    let visibleItemIdx = 0;
    let found = false;

    const tables = pricingDocument.tables.map((table) => {
      let tableChanged = false;
      const previousSubtotal = typeof table.subtotal === "number"
        ? table.subtotal
        : table.items.filter((item) => !item.isHidden).reduce((sum, item) => sum + (item.sellingPrice || 0), 0);

      const items = table.items.map((item) => {
        if (item.isHidden) return item;

        const currentVisibleIdx = visibleItemIdx;
        visibleItemIdx += 1;

        if (currentVisibleIdx !== itemIdx) return item;

        found = true;
        tableChanged = true;
        return field === "sellingPrice"
          ? { ...item, sellingPrice: value }
          : { ...item, cost: value };
      });

      if (!tableChanged) return table;

      const subtotal = items.filter((item) => !item.isHidden).reduce((sum, item) => sum + (item.sellingPrice || 0), 0);
      const previousTaxRate = table.tax
        ? (typeof table.tax.rate === "number"
          ? table.tax.rate
          : (previousSubtotal > 0 ? (table.tax.amount || 0) / previousSubtotal : 0))
        : 0;
      const previousBondRate = previousSubtotal > 0 ? (table.bond || 0) / previousSubtotal : 0;
      const previousTariffRate = previousSubtotal > 0 ? (table.tariff || 0) / previousSubtotal : 0;
      const tax = table.tax
        ? { ...table.tax, amount: subtotal * previousTaxRate }
        : table.tax;
      const bond = subtotal * previousBondRate;
      const tariff = subtotal * previousTariffRate;
      const grandTotal = subtotal + (tax?.amount || 0) + bond + tariff;

      return {
        ...table,
        items,
        subtotal,
        tax,
        bond,
        tariff,
        grandTotal,
      };
    });

    if (!found) return pricingDocument;

    const documentTotal = tables
      .filter((table) => !(table.isAlternateSection === true || /\balternate/i.test(table.name || "")))
      .reduce((sum, table) => sum + (table.grandTotal || 0), 0);

    return {
      ...pricingDocument,
      tables,
      documentTotal,
    };
  }

  // ========================================================================
  // Product dropdown handler (must be defined before workbookData useMemo)
  // ========================================================================

  // Find the LED_MODULES key for a given product by matching name or pitch
  function findModuleKeyForProduct(productName: string, pitch: number): string | null {
    const upperName = productName.toUpperCase();
    for (const key of Object.keys(LED_MODULES)) {
      if (key === "DEFAULT") continue;
      // NX product keys (e.g., "NX-R25-MIP") appear in product names
      if (upperName.includes(key.replace(/-/g, " ")) || upperName.includes(key)) return key;
    }
    // Fallback: match by pitch + has cabinet data
    for (const [key, mod] of Object.entries(LED_MODULES)) {
      if (key === "DEFAULT") continue;
      if (!mod.cabinetWidthFt) continue;
      if (Math.abs(mod.pitch - pitch) < 0.5) return key;
    }
    return null;
  }

  const handleProductSelect = useCallback((displayName: string, productId: string) => {
    const product = availableProducts.find((p) => p.id === productId);
    if (!product) return;

    // If pricingPreview doesn't exist yet (e.g., pricing API failed or hasn't loaded),
    // create a minimal one so product selection still works
    const currentPreview = pricingPreview ?? (() => {
      const screens = editableSpecs.length > 0 ? editableSpecs : (result?.screens || []);
      const minimalDisplays = screens.map((s: ExtractedLEDSpec) => ({
        name: s.name,
        location: s.location,
        pixelPitch: s.pixelPitchMm,
        environment: s.environment,
        quantity: s.quantity || 1,
        areaSqFt: (s.widthFt ?? 0) * (s.heightFt ?? 0),
        hardwareCost: 0, installCost: 0, pmCost: 0, engCost: 0,
        processorCost: 0, shippingCost: 0,
        totalCost: 0, totalSellingPrice: 0, blendedMarginPct: 0.15,
        costSource: "manual" as const,
      }));
      return {
        displays: minimalDisplays,
        summary: { totalCost: 0, totalSellingPrice: 0, totalMargin: 0, blendedMarginPct: 0, displayCount: minimalDisplays.length, quotedCount: 0, rateCardCount: 0 },
      };
    })();

    // Find the current spec to get requested dimensions
    const currentSpec = editableSpecs.find((s) => s.name === displayName)
      || result?.screens?.find((s: ExtractedLEDSpec) => s.name === displayName);
    const newPitch = product.pitch || 0;
    const weightKgPerCab = product.weightKg || 0;
    const maxPowerPerCab = product.maxPowerWatts || 0;
    const productNits = product.nits || 0;

    // OES/scoring/CMS products have no cabinet dimensions or pitch — skip dimension recalc
    const isLedPanel = newPitch > 0 && (product.widthMm || 0) > 0 && (product.heightMm || 0) > 0;

    let activeWidthFt: number, activeHeightFt: number;
    let activeWidthMm: number, activeHeightMm: number;
    let totalCabs: number;
    let cabinetCount: number | null = null;
    let moduleCount: number | null = null;
    let blendedPriceSqFt: number | null = null;

    if (isLedPanel) {
      // Try cabinet-first packing from LED_MODULES catalog (80/20 pricing)
      const moduleKey = findModuleKeyForProduct(product.name, newPitch);
      const packResult = moduleKey
        ? packCabinetsAndModules(currentSpec?.widthFt || 0, currentSpec?.heightFt || 0, moduleKey)
        : null;

      if (packResult) {
        // Cabinet-first packing succeeded — use its dimensions and pricing
        activeWidthFt = packResult.actualWidthFt;
        activeHeightFt = packResult.actualHeightFt;
        activeWidthMm = activeWidthFt * 304.8;
        activeHeightMm = activeHeightFt * 304.8;
        totalCabs = packResult.totalCabinets;
        cabinetCount = packResult.totalCabinets;
        moduleCount = packResult.totalFillModules;
        blendedPriceSqFt = packResult.blendedPricePerSqft;
        console.log(`[ProductSelect] ${displayName} → ${product.name}: cabinet packing: ${packResult.cabinetsW}×${packResult.cabinetsH} cabs + ${packResult.totalFillModules} modules, ${packResult.fitPercentage}% fit, $${packResult.blendedPricePerSqft}/sqft`);
      } else {
        // No cabinet data — fall back to simple cabinet-grid snapping
        const cabWidthMm = product.widthMm!;
        const cabHeightMm = product.heightMm!;
        const requestedWidthMm = (currentSpec?.widthFt || 0) * 304.8;
        const requestedHeightMm = (currentSpec?.heightFt || 0) * 304.8;
        const cols = requestedWidthMm > 0 ? Math.max(1, Math.floor(requestedWidthMm / cabWidthMm)) : 1;
        const rows = requestedHeightMm > 0 ? Math.max(1, Math.floor(requestedHeightMm / cabHeightMm)) : 1;
        activeWidthMm = cols * cabWidthMm;
        activeHeightMm = rows * cabHeightMm;
        activeWidthFt = activeWidthMm / 304.8;
        activeHeightFt = activeHeightMm / 304.8;
        totalCabs = cols * rows;
      }
    } else {
      // Non-LED product (OES, scoring, CMS, TV) — keep original dimensions
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

    // Update editableSpecs with product selection + dimensions, then persist to DB
    const base = editableSpecs.length > 0 ? editableSpecs : (result?.screens || []);
    const updatedSpecs = base.map((s: ExtractedLEDSpec) =>
      s.name === displayName
        ? {
            ...s,
            ...(isLedPanel ? {
              // Original widthFt/heightFt stay LOCKED as RFP values — never overwrite
              activeWidthFt: Math.round(activeWidthFt * 100) / 100,
              activeHeightFt: Math.round(activeHeightFt * 100) / 100,
              widthPx: newPitch > 0 ? Math.round(activeWidthMm / newPitch) : (s.widthPx ?? null),
              heightPx: newPitch > 0 ? Math.round(activeHeightMm / newPitch) : (s.heightPx ?? null),
              pixelPitchMm: newPitch,
            } : {}),
            weightLbs: totalWeightLbs || s.weightLbs,
            maxPowerW: totalPowerW || s.maxPowerW,
            cabinetCount,
            moduleCount,
            blendedPriceSqFt,
            selectedProductId: productId,
            selectedProductName: product.name,
          }
        : s
    );
    setEditableSpecs(updatedSpecs);
    // Persist product selection + updated dimensions to DB so Excel export picks them up
    if (result?.id) autoSaveSpecs(updatedSpecs, result.id);

    setPricingPreview((prev) => {
      const base = prev || currentPreview;
      const updatedDisplays = base.displays.map((d) => {
        if (d.name !== displayName) return d;
        // Set matched product info
        let updated = {
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
            weightKgPerCab: weightKgPerCab,
            maxPowerWPerCab: maxPowerPerCab,
            totalWeightLbs,
            totalPowerW,
            btuPerHr,
          },
        };
        // Recalculate costs with new pitch + cabinet-grid dimensions
        updated = recalcDisplayCosts(updated, activeHeightFt * activeWidthFt, d.quantity || 1, newPitch);
        return updated;
      });
      return recalcSummary(base, updatedDisplays);
    });
  }, [availableProducts, pricingPreview, editableSpecs, result?.screens]);

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
        blendedMarginPct: 0.15,
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

  const handleAddScreen = useCallback(() => {
    const newSpec: ExtractedLEDSpec = {
      name: `New Display ${(screens?.length || 0) + 1}`,
      location: "",
      pixelPitchMm: null,
      widthFt: 0,
      heightFt: 0,
      widthPx: null,
      heightPx: null,
      brightnessNits: null,
      environment: "indoor",
      quantity: 1,
      serviceType: null,
      mountingType: null,
      maxPowerW: null,
      weightLbs: null,
      specialRequirements: [],
      sourcePages: [],
      confidence: 1,
      sourceType: "text",
      citation: "Manually added",
      notes: null,
    };
    // Add to result.screens + editableSpecs
    setResult(prev => {
      if (!prev) return prev;
      const updated = [...prev.screens, newSpec];
      setEditableSpecs(updated);
      return { ...prev, screens: updated };
    });
    // Also add to pricing displays
    setPricingPreview(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        displays: [...prev.displays, {
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
          blendedMarginPct: 0.15,
          costSource: "manual",
          rateCardEstimate: null,
          matchedProduct: null,
          isCustom: false,
        }],
        summary: { ...prev.summary, displayCount: prev.summary.displayCount + 1 },
      };
    });
  }, []);

  const handleRemoveScreen = useCallback((screenName: string) => {
    // No confirmation — just remove like Excel
    // Remove from result.screens + editableSpecs
    setResult(prev => {
      if (!prev) return prev;
      const updated = prev.screens.filter(s => s.name !== screenName);
      setEditableSpecs(updated);
      autoSaveSpecs(updated, prev.id);
      return { ...prev, screens: updated };
    });
    setPricingPreview(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        displays: prev.displays.filter(d => d.name !== screenName),
        summary: { ...prev.summary, displayCount: Math.max(0, prev.summary.displayCount - 1) },
      };
    });
  }, [autoSaveSpecs]);

  // ========================================================================
  // Qty change handler
  // ========================================================================

  const handleQtyChange = useCallback((displayName: string, qty: number) => {
    const base = editableSpecs.length > 0 ? editableSpecs : (result?.screens || []);
    const updatedSpecs = base.map((s: ExtractedLEDSpec) =>
      s.name === displayName ? { ...s, quantity: qty } : s
    );
    setEditableSpecs(updatedSpecs);
    if (result?.id) autoSaveSpecs(updatedSpecs, result.id);
  }, [editableSpecs, result?.screens, result?.id, autoSaveSpecs]);

  // ========================================================================
  // Row repair handler — triggers AI agent to fix a specific row
  // ========================================================================

  const handleRepairRow = useCallback(async (displayName: string, rowIndex: number) => {
    if (!result?.id) return;

    const spec = (editableSpecs.length > 0 ? editableSpecs : result.screens)[rowIndex];
    if (!spec) return;

    try {
      const res = await fetch("/api/rfp/repair-row", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          analysisId: result.id,
          rowIndex,
          displayName,
          issue: "Values may be incorrect — user requested AI repair",
          currentValues: {
            name: spec.name,
            widthFt: spec.widthFt,
            heightFt: spec.heightFt,
            pixelPitchMm: spec.pixelPitchMm,
            brightnessNits: spec.brightnessNits,
            environment: spec.environment,
          },
          sourceText: result.sourceText || "",
        }),
      });

      const data = await res.json();
      if (data.fixed && data.display) {
        // Apply the fix to editableSpecs
        const base = editableSpecs.length > 0 ? editableSpecs : result.screens;
        const updated = base.map((s: any, i: number) => {
          if (i !== rowIndex) return s;
          return {
            ...s,
            ...(data.display.name != null ? { name: data.display.name } : {}),
            ...(data.display.widthFt != null ? { widthFt: data.display.widthFt } : {}),
            ...(data.display.heightFt != null ? { heightFt: data.display.heightFt } : {}),
            ...(data.display.pixelPitchMm != null ? { pixelPitchMm: data.display.pixelPitchMm } : {}),
            ...(data.display.brightnessNits != null ? { brightnessNits: data.display.brightnessNits } : {}),
            ...(data.display.environment != null ? { environment: data.display.environment } : {}),
            notes: `${s.notes || ""} | Repaired: ${data.reason}`.trim(),
          };
        });
        setEditableSpecs(updated);
        if (result.id) autoSaveSpecs(updated, result.id);
        console.log(`[Repair] Fixed "${displayName}": ${data.reason}`);
      } else {
        console.warn(`[Repair] Could not fix "${displayName}": ${data.error || data.reason}`);
      }
    } catch (err: any) {
      console.error(`[Repair] Failed for "${displayName}":`, err.message);
    }
  }, [editableSpecs, result?.id, result?.screens, result?.sourceText, autoSaveSpecs]);

  // ========================================================================
  // Workbook data — computed from state for WorkbookShell rendering
  // ========================================================================

  const requirements = result?.requirements || [];
  const workbookData = useMemo(() => {
    if (!result) return { fileName: "RFP Analysis", sheets: [] };
    return buildRfpWorkbook({
      project: result.project,
      screens: editableSpecs.length > 0 ? editableSpecs : result.screens,
      requirements,
      triage: result.triage || [],
      pricingDisplays: pricingPreview?.displays || [],
      pricingSummary: pricingPreview?.summary || null,
      bidFormResult: bidFormResult || null,
      specMismatches: specMismatches.length > 0 ? specMismatches : undefined,
      availableProducts,
      onProductSelect: handleProductSelect,
      onAddLineItem: handleAddLineItem,
      onAddScreen: handleAddScreen,
      onRemoveScreen: handleRemoveScreen,
      onQtyChange: handleQtyChange,
      onRepairRow: handleRepairRow,
      onSourcePageClick: (pg) => {
        setPdfViewerPage(pg);
        setShowPdfPanel(true);
      },
    });
  }, [result, editableSpecs, pricingPreview, requirements, bidFormResult, specMismatches, availableProducts, handleProductSelect, handleAddLineItem, handleAddScreen, handleRemoveScreen, handleQtyChange, handleRepairRow]);

  // ========================================================================
  // Auto-run pricing when extraction completes (no manual step needed)
  // ========================================================================

  useEffect(() => {
    if (result && result.screens.length > 0 && !pricingPreview && !loadingPricing) {
      // Check if this is a Mirror Mode file with pre-extracted pricing
      if (result.mirrorModePricing && result.mirrorModePricing.length > 0) {
        console.log("[RFP] Using Mirror Mode pricing from Excel, skipping rate card estimation");
        // Build pricing displays from extracted Mirror Mode data
        const displays: PricingPreview["displays"] = result.screens.map((spec) => {
          // Find matching pricing item by name
          const pricingItem = result.mirrorModePricing!.find(
            (p) => p.name.toLowerCase().includes(spec.name.toLowerCase()) ||
                   spec.name.toLowerCase().includes(p.name.toLowerCase())
          );
          const cost = pricingItem?.cost ?? 0;
          const sellPrice = pricingItem?.sellingPrice ?? 0;
          const margin = sellPrice > 0 ? (sellPrice - cost) / sellPrice : 0;
          return {
            name: spec.name,
            location: spec.location,
            pixelPitch: spec.pixelPitchMm,
            areaSqFt: (spec.widthFt ?? 0) * (spec.heightFt ?? 0),
            quantity: spec.quantity || 1,
            hardwareCost: cost,
            installCost: 0,
            pmCost: 0,
            engCost: 0,
            totalCost: cost,
            totalSellingPrice: sellPrice,
            blendedMarginPct: margin,
            costSource: "mirror_mode",
          };
        });
        const totalCost = displays.reduce((s, d) => s + d.totalCost, 0);
        const totalSell = displays.reduce((s, d) => s + d.totalSellingPrice, 0);
        setPricingPreview({
          displays,
          summary: {
            totalCost,
            totalSellingPrice: totalSell,
            totalMargin: totalSell - totalCost,
            blendedMarginPct: totalSell > 0 ? Math.round(((totalSell - totalCost) / totalSell) * 1000) / 10 : 0,
            displayCount: displays.length,
            quotedCount: displays.filter((d) => d.costSource === "mirror_mode").length,
            rateCardCount: 0,
          },
        });
      } else {
        // Standard flow: estimate via rate card
        autoPreviewPricing([]);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result?.id, result?.screens?.length, result?.mirrorModePricing]);

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

  const handleUpload = useCallback(async (files: File[], attachedBidForm?: File, customKeywords?: string) => {
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
        ...(customKeywords ? { customKeywords } : {}),
      };
      lastSessionData.current = sessionPayload;

      // Send all session IDs to analyze — server merges if multiple
      const response = await fetch("/api/rfp/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sessionPayload),
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
              // Persist analysis ID in URL for reload survival
              if (event.result.id) {
                router.push(`/tools/rfp-analyzer/history/${event.result.id}`);
              }
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

  // ========================================================================
  // Excel upload — direct parse, no SSE (Jireh's Excel-as-starting-point)
  // ========================================================================

  const handleExcelUpload = useCallback(async (file: File) => {
    lastExcelFileRef.current = file;
    setPhase("processing");
    setError(null);
    setEvents([
      { type: "stage", stage: "uploading", message: `Parsing ${file.name}...` },
    ]);
    setResult(null);
    setQuoteImportResult(null);
    setPricingPreview(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      setEvents([
        { type: "stage", stage: "uploading", message: `Parsing ${file.name}...` },
        { type: "stage", stage: "extracting", message: "Extracting LED specs from Excel..." },
      ]);

      const res = await fetch("/api/rfp/analyze/excel", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: `Failed (${res.status})` }));
        throw new Error(body.error || `Failed to parse Excel (${res.status})`);
      }

      const data = await res.json();
      const analysisResult: AnalysisResult = data.result;

      // Fire "complete" events so the stepper shows all-done
      setEvents([
        { type: "stage", stage: "uploaded", message: "File received" },
        { type: "stage", stage: "extracted", message: `Found ${analysisResult.screens.length} displays` },
        { type: "complete", result: analysisResult },
      ]);

      setResult(analysisResult);
      setPhase("results");
      // Persist analysis ID in URL for reload survival
      if (analysisResult.id) {
        router.push(`/tools/rfp-analyzer/history/${analysisResult.id}`);
      }
    } catch (err: any) {
      console.error("Excel upload error:", err);
      setError(err.message || "Failed to parse Excel file");
      setPhase("upload");
    }
  }, [router]);

  // ========================================================================
  // Generate Instant PDF — route Excel through Mirror Mode pipeline
  // ========================================================================

  const handleGenerateMirrorPdf = useCallback(async () => {
    const file = lastExcelFileRef.current;
    if (!file || !session?.user?.email) return;

    setGeneratingPdf(true);
    setError(null);

    try {
      // Step 1: Parse through the Mirror Mode pipeline
      const formData = new FormData();
      formData.append("file", file);

      const parseRes = await fetch("/api/proposals/import-excel", {
        method: "POST",
        body: formData,
      });

      if (!parseRes.ok) {
        const body = await parseRes.json().catch(() => ({ error: `Parse failed (${parseRes.status})` }));
        throw new Error(body.error || `Failed to parse Excel for Mirror Mode (${parseRes.status})`);
      }

      const parseData = await parseRes.json();
      const details = parseData.formData?.details;
      const internalAudit = parseData.internalAudit;

      if (!details?.pricingDocument) {
        throw new Error("Excel parsed but no pricing tables found. Margin Analysis tab may be missing or malformed.");
      }

      // Step 2: Create workspace + proposal with Mirror Mode data
      const projectName = result?.project?.projectName
        || result?.project?.clientName
        || file.name.replace(/\.(xlsx|xls)$/i, "");

      const createRes = await fetch("/api/workspaces/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: projectName,
          userEmail: session.user.email,
          createInitialProposal: true,
          calculationMode: "MIRROR",
          excelData: {
            screens: details.screens || [],
            receiverName: details.receiver?.name || parseData.formData?.receiver?.name,
            proposalName: details.proposalName || projectName,
            internalAudit: internalAudit || undefined,
            pricingDocument: details.pricingDocument,
            marginAnalysis: details.marginAnalysis || undefined,
            pricingMode: "MIRROR",
            parserValidationReport: details.parserValidationReport || undefined,
            sourceWorkbookHash: details.sourceWorkbookHash || undefined,
            parserStrictVersion: details.parserStrictVersion || undefined,
            clientSummary: details.clientSummary || undefined,
          },
        }),
      });

      if (!createRes.ok) {
        const body = await createRes.json().catch(() => ({ error: `Create failed (${createRes.status})` }));
        throw new Error(body.error || `Failed to create proposal (${createRes.status})`);
      }

      const createData = await createRes.json();
      const proposalId = createData.proposal?.id;

      if (!proposalId) {
        throw new Error("Proposal created but no ID returned");
      }

      // Step 3: Redirect to the proposal page
      router.push(`/projects/${proposalId}`);
    } catch (err: any) {
      console.error("Generate Mirror PDF error:", err);
      setError(err.message || "Failed to generate proposal");
      setGeneratingPdf(false);
    }
  }, [session, result, router]);

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
              // Persist analysis ID in URL for reload survival
              if (event.result.id) {
                router.push(`/tools/rfp-analyzer/history/${event.result.id}`);
              }
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
  // Download vendor-specific quote sheets (electrician, installer, LED supplier)
  // ========================================================================

  const handleDownloadVendorSheet = async (vendorType: "electrician" | "installer" | "led_supplier") => {
    if (!result?.id) return;
    setDownloading(vendorType);
    try {
      const specsToSend = quotePreviewOpen && editableSpecs.length > 0 ? editableSpecs : undefined;
      const res = await fetch("/api/rfp/pipeline/vendor-quote-sheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          analysisId: result.id,
          vendorType,
          specs: specsToSend,
          pricingDisplays: pricingPreview?.displays,
        }),
      });
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.headers.get("Content-Disposition")?.split("filename=")[1]?.replace(/"/g, "") || `${vendorType}_quote.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
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
  // Import Scoping Workbook — reverse of export
  // ========================================================================

  const handleImportScopingWorkbook = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !result?.id) return;
    e.target.value = "";
    setDownloading("importing");
    setScopingImportResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("analysisId", result.id);
      const res = await fetch("/api/rfp/pipeline/import-scoping-workbook", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `Import failed (${res.status})`);
      }
      const data = await res.json();
      setScopingImportResult({
        updatedCount: data.updatedCount,
        missingCount: data.missingCount,
        warnings: data.warnings,
        summary: data.summary,
      });

      // Apply imported data to pricing state
      if (data.displays?.length > 0 && pricingPreview) {
        setPricingPreview((prev) => {
          if (!prev) return prev;
          const updated = [...prev.displays];
          for (const imp of data.displays) {
            if (!imp.hasUpdates) continue;
            const existing = updated[imp.specIndex];
            if (!existing) continue;
            // Merge imported values into existing pricing display
            if (imp.hardwareCost != null) existing.hardwareCost = imp.hardwareCost;
            if (imp.processorCost != null) existing.processorCost = imp.processorCost;
            if (imp.shippingCost != null) existing.shippingCost = imp.shippingCost;
            if (imp.installCost != null) existing.installCost = imp.installCost;
            if (imp.structuralCost != null) existing.structuralCost = imp.structuralCost;
            if (imp.pmCost != null) existing.pmCost = imp.pmCost;
            if (imp.engCost != null) existing.engCost = imp.engCost;
            if (imp.marginPct != null) existing.blendedMarginPct = imp.marginPct;
            if (imp.totalCost != null) existing.totalCost = imp.totalCost;
            if (imp.sellingPrice != null) existing.totalSellingPrice = imp.sellingPrice;
          }
          const totalCost = updated.reduce((s, d) => s + d.totalCost, 0);
          const totalSell = updated.reduce((s, d) => s + d.totalSellingPrice, 0);
          return {
            ...prev,
            displays: updated,
            summary: {
              ...prev.summary,
              totalCost,
              totalSellingPrice: totalSell,
              totalMargin: totalSell - totalCost,
              blendedMarginPct: totalSell > 0 ? Math.round(((totalSell - totalCost) / totalSell) * 1000) / 10 : 0,
            },
          };
        });
      }

      console.log(`[import-scoping] Imported ${data.updatedCount} displays from ${file.name}`);
      if (data.warnings?.length > 0) {
        console.warn("[import-scoping] Warnings:", data.warnings);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Import failed";
      setError(message);
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

  /** Core bid form fill logic — fills and stores blob for review (no auto-download) */
  const executeBidFormFill = async (file: File) => {
    if (!result?.id) return;
    setDownloading("bidform");
    setBidFormResult(null);
    setFilledBidFormBlob(null);
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

      // Store filled blob for on-demand download (no auto-download — user reviews first)
      const blob = await res.blob();
      setFilledBidFormBlob(blob);
      const dispositionName = res.headers.get("Content-Disposition")?.split("filename=")[1]?.replace(/"/g, "") || "BidForm_Filled.xlsx";
      setFilledBidFormName(dispositionName);
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
      executeBidFormFill(bidFormFile);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pricingPreview, bidFormFile, result?.id]);

  // Step 3: Re-fill bid form when user edits specs/pricing (debounced 2s)
  const bidFormRefillTimer = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    // Only re-fill if the initial auto-fill already happened
    if (!bidFormAutoFilled.current || !bidFormFile || !pricingPreview || !result?.id) return;
    if (bidFormRefillTimer.current) clearTimeout(bidFormRefillTimer.current);
    bidFormRefillTimer.current = setTimeout(() => {
      executeBidFormFill(bidFormFile);
    }, 2000);
    return () => { if (bidFormRefillTimer.current) clearTimeout(bidFormRefillTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editableSpecs, pricingPreview]);

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
    setFilledBidFormBlob(null);
    setFilledBidFormName("");
    setBidFormFile(null);
    // Clear URL state so refresh shows upload screen for new analysis
    loadedFromDbRef.current = false;
    router.replace("/tools/rfp-analyzer", { scroll: false });
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
  const isSpreadsheetVisible = phase === "results" && result && pricingPreview && spreadsheetMode;

  return (
    <div className={`flex-1 min-w-0 bg-background relative ${isSpreadsheetVisible ? "flex flex-col h-screen overflow-hidden" : "min-h-screen pb-24"}`}>
      {/* Header — thin in spreadsheet mode */}
      {isSpreadsheetVisible ? (
        <header className="shrink-0 z-30 bg-[#002C73] text-white px-4 py-1.5 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-sm font-semibold truncate">{result?.project?.projectName || "RFP Analysis"}</span>
            {fileInfo && <span className="text-xs text-white/60 hidden sm:inline">{fileInfo.filename}</span>}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSpreadsheetMode(false)}
              className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-white/80 hover:text-white hover:bg-white/10 rounded transition-colors"
            >
              <Eye className="w-3.5 h-3.5" />
              Show Analysis
            </button>
            <Link
              href="/tools/rfp-analyzer/history"
              className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-white/60 hover:text-white hover:bg-white/10 rounded transition-colors"
            >
              <History className="w-3.5 h-3.5" />
              History
            </Link>
            <button
              onClick={handleReset}
              className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-white/60 hover:text-white hover:bg-white/10 rounded transition-colors"
            >
              <RefreshCcw className="w-3.5 h-3.5" />
              New
            </button>
          </div>
        </header>
      ) : (
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:px-6 xl:px-8">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-xl font-bold leading-tight text-foreground sm:text-2xl">
              {phase === "upload" ? "New RFP" : phase === "processing" ? "Reading your RFP..." : result?.project?.projectName || "RFP Analysis"}
            </h1>
            <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">
              {phase === "upload"
                ? "Drop your RFP — specs, pricing, and proposal in minutes"
                : fileInfo
                ? `${fileInfo.filename} — ${fileInfo.pageCount.toLocaleString()} pages, ${fileInfo.sizeMb}MB`
                : ""
              }
            </p>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
            <Link
              href="/tools/rfp-analyzer/history"
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:text-sm"
            >
              <History className="w-4 h-4" />
              History
            </Link>
            {phase !== "upload" && (
              <button
                onClick={handleReset}
                className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:text-sm"
              >
                <RefreshCcw className="w-4 h-4" />
                {phase === "processing" ? "Cancel" : "New Analysis"}
              </button>
            )}
          </div>
        </div>
      </header>
      )}

      <main className={isSpreadsheetVisible ? "flex-1 min-h-0 flex flex-col overflow-hidden" : "p-6 xl:px-8 max-w-[1600px] mx-auto"}>
        {(() => {
          const uploadContent = (phase === "upload" || phase === "processing") && (
            <>
              <UploadZone
                onUpload={handleUpload}
                onExcelUpload={handleExcelUpload}
                isLoading={phase === "processing"}
                events={events}
              />
              {/* Recent analyses — shown on upload page so users see past work */}
              {phase === "upload" && recentAnalyses.length > 0 && (
                <div className="mt-8 max-w-3xl mx-auto">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-foreground">Recent Analyses</h3>
                    <Link href="/tools/rfp-analyzer/history" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                      View all
                    </Link>
                  </div>
                  <div className="grid gap-2">
                    {recentAnalyses.map((a) => (
                      <Link
                        key={a.id}
                        href={`/tools/rfp-analyzer?id=${a.id}`}
                        className="flex items-center gap-3 px-4 py-3 rounded-lg border border-border hover:bg-muted/50 transition-colors group"
                      >
                        <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate group-hover:text-[#0A52EF] transition-colors">
                            {a.projectName || a.filename}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {a.specsFound} display{a.specsFound !== 1 ? "s" : ""} &middot; {new Date(a.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-muted-foreground/50 group-hover:text-[#0A52EF] transition-colors" />
                      </Link>
                    ))}
                  </div>
                </div>
              )}
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
          );

          const resultsContent = phase === "results" && result && (() => {
          const criticalReqs = requirements.filter((r) => r.status === "critical").length;

          return (
          <div className={spreadsheetMode ? "flex flex-col flex-1 min-h-0 overflow-hidden" : "animate-in fade-in slide-in-from-bottom-4 duration-500 ease-out space-y-6"}>
            {/* ============ ANALYSIS PANELS — hidden in spreadsheet mode ============ */}
            {!spreadsheetMode && (
            <>
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

            {/* Count mismatch warning — yellow banner */}
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

            {/* Count verified — green banner */}
            {!result.extractionFailed && (!result.warnings || result.warnings.length === 0) && result.screens.length > 0 && (
              <div className="p-3 border border-emerald-500/30 bg-emerald-500/10 rounded-xl flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <p className="text-sm text-emerald-700 dark:text-emerald-300">
                  Count verified: {(() => {
                    const screens = editableSpecs.length > 0 ? editableSpecs : result.screens;
                    return screens.reduce((sum: number, s: any) => sum + (s.quantity || 1), 0);
                  })()} displays extracted
                  {result.stats?.extractionSource && ` via ${result.stats.extractionSource === "glm5" ? "Gemini Flash" : result.stats.extractionSource}`}
                </p>
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
              <StatCard icon={Monitor} label="LED Displays" value={(() => {
                const screens = editableSpecs.length > 0 ? editableSpecs : result.screens;
                const totalQty = screens.reduce((sum: number, s: any) => sum + (s.quantity || 1), 0);
                const unique = screens.length;
                return totalQty > unique ? `${totalQty} (${unique} unique)` : String(unique);
              })()} accent="text-primary" />
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
              <div className="border border-emerald-500/30 bg-emerald-50 dark:bg-emerald-950/20 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
                    Bid Form Ready — {bidFormResult.matches.length} display{bidFormResult.matches.length !== 1 ? "s" : ""} matched
                  </span>
                  <div className="ml-auto flex items-center gap-2">
                    {filledBidFormBlob && (
                      <button
                        onClick={() => {
                          const url = URL.createObjectURL(filledBidFormBlob);
                          const a = document.createElement("a");
                          a.href = url;
                          a.download = filledBidFormName;
                          a.click();
                          URL.revokeObjectURL(url);
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-md text-xs font-medium hover:bg-emerald-700 transition-colors"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Download Filled Form
                      </button>
                    )}
                    <button onClick={() => { setBidFormResult(null); setFilledBidFormBlob(null); }} className="text-xs text-muted-foreground hover:text-foreground">Dismiss</button>
                  </div>
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

            {/* ============ GENERATE INSTANT PDF (Mirror Mode bridge) ============ */}
            {result.hasMarginAnalysis && result.hasLedCostSheet && lastExcelFileRef.current && session?.user?.email && (
              <div className="p-4 border border-[#0A52EF]/30 bg-[#0A52EF]/5 rounded-xl flex items-center gap-3">
                <FileSpreadsheet className="w-5 h-5 text-[#0A52EF] shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-[#002C73]">Standard ANC Workbook Detected</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    This Excel has both Margin Analysis and LED Cost Sheet tabs. Generate an instant Mirror Mode proposal with full PDF export.
                  </p>
                </div>
                <button
                  onClick={handleGenerateMirrorPdf}
                  disabled={generatingPdf}
                  className="px-4 py-2 bg-[#0A52EF] text-white rounded-lg text-sm font-medium hover:bg-[#0941c3] transition-colors inline-flex items-center gap-2 whitespace-nowrap disabled:opacity-50"
                >
                  {generatingPdf ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Creating Proposal...</>
                  ) : (
                    <><Zap className="w-4 h-4" /> Generate Instant PDF</>
                  )}
                </button>
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
            </>
            )}

            {/* ============ WORKBOOK VIEW ============ */}
            <div className={spreadsheetMode ? "flex flex-col flex-1 min-h-0 overflow-hidden" : "flex gap-3"}>
            {/* Left: Workbook */}
            <div className={`flex flex-col ${spreadsheetMode ? "flex-1 min-h-0" : showPdfPanel && pdfBlobUrl ? "flex-1 min-w-0" : "w-full"}`} style={spreadsheetMode ? undefined : { height: "90vh" }}>
              {/* ---- Title Bar with Accordion Toolbar — FIXED HEADER ---- */}
              <div className={`bg-[#217346] text-white ${spreadsheetMode ? "sticky top-0 z-20 shrink-0" : "shrink-0 rounded-t-lg"}`}>
                {/* Main bar - always visible */}
                <div className="flex items-center justify-between px-3 py-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold tracking-wide truncate">{workbookData.fileName || "RFP Analysis"}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {/* Primary action - always visible */}
                    <button
                      onClick={handleCreateProposal}
                      disabled={downloading === "creating" || !result?.id || !session?.user?.email}
                      className="flex items-center gap-1 px-3 py-1 bg-[#0A52EF] text-white hover:bg-[#0941c3] rounded text-[10px] font-bold transition-colors disabled:opacity-50 shadow-sm"
                    >
                      {downloading === "creating" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                      Create Proposal
                    </button>
                    {pdfBlobUrl && (
                      <button
                        onClick={() => setShowPdfPanel(!showPdfPanel)}
                        className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                          showPdfPanel ? "bg-white text-[#217346]" : "bg-white/20 hover:bg-white/30 text-white"
                        }`}
                      >
                        {showPdfPanel ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                        PDF
                      </button>
                    )}
                    {/* Accordion toggle */}
                    <button
                      onClick={() => setExpandedToolbar(expandedToolbar === "tools" ? null : "tools")}
                      className="flex items-center gap-1 px-2 py-0.5 bg-white/20 hover:bg-white/30 rounded text-[10px] font-medium transition-colors"
                    >
                      <ChevronDown className={`w-3 h-3 transition-transform ${expandedToolbar === "tools" ? "rotate-180" : ""}`} />
                      Tools
                    </button>
                  </div>
                </div>
                {/* Expandable toolbar sections */}
                {expandedToolbar === "tools" && (
                  <div className="border-t border-white/10 px-3 py-2 space-y-2">
                    {/* Row 1: Exports */}
                    <div className="flex items-center gap-1 flex-wrap">
                      <span className="text-[9px] uppercase tracking-wider text-white/50 mr-1">Export</span>
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
                        Specs
                      </button>
                      <button
                        onClick={handleDownloadScopingWorkbook}
                        disabled={downloading === "scoping"}
                        className="flex items-center gap-1 px-2 py-0.5 bg-white/20 hover:bg-white/30 rounded text-[10px] font-medium transition-colors disabled:opacity-50"
                      >
                        {downloading === "scoping" ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileSpreadsheet className="w-3 h-3" />}
                        Scoping Workbook
                      </button>
                    </div>
                    {/* Row 2: Vendor Quotes */}
                    <div className="flex items-center gap-1 flex-wrap">
                      <span className="text-[9px] uppercase tracking-wider text-white/50 mr-1">Vendor Quotes</span>
                      <button
                        onClick={() => handleDownloadVendorSheet("electrician")}
                        disabled={downloading === "electrician" || !result?.id}
                        className="flex items-center gap-1 px-2 py-0.5 bg-yellow-500/80 hover:bg-yellow-500 text-white rounded text-[10px] font-medium transition-colors disabled:opacity-50"
                        title="Electrical quote request"
                      >
                        {downloading === "electrician" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                        Electrical
                      </button>
                      <button
                        onClick={() => handleDownloadVendorSheet("installer")}
                        disabled={downloading === "installer" || !result?.id}
                        className="flex items-center gap-1 px-2 py-0.5 bg-green-600/80 hover:bg-green-600 text-white rounded text-[10px] font-medium transition-colors disabled:opacity-50"
                        title="Install/structural quote request"
                      >
                        {downloading === "installer" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wrench className="w-3 h-3" />}
                        Install
                      </button>
                      <button
                        onClick={() => handleDownloadVendorSheet("led_supplier")}
                        disabled={downloading === "led_supplier" || !result?.id}
                        className="flex items-center gap-1 px-2 py-0.5 bg-blue-600/80 hover:bg-blue-600 text-white rounded text-[10px] font-medium transition-colors disabled:opacity-50"
                        title="LED supply quote request"
                      >
                        {downloading === "led_supplier" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Cpu className="w-3 h-3" />}
                        LED Supply
                      </button>
                    </div>
                    {/* Row 3: Import */}
                    <div className="flex items-center gap-1 flex-wrap">
                      <span className="text-[9px] uppercase tracking-wider text-white/50 mr-1">Import</span>
                      <button
                        onClick={() => bidFormInputRef.current?.click()}
                        disabled={downloading === "bidform" || !result?.id}
                        className="flex items-center gap-1 px-2 py-0.5 bg-amber-500/80 hover:bg-amber-500 text-white rounded text-[10px] font-medium transition-colors disabled:opacity-50"
                        title="Auto-fill bid form"
                      >
                        {downloading === "bidform" ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileSpreadsheet className="w-3 h-3" />}
                        Fill Bid Form
                      </button>
                      <input ref={bidFormInputRef} type="file" accept=".xlsx,.xls" onChange={handleFillBidForm} className="hidden" />
                      <button
                        onClick={() => scopingImportRef.current?.click()}
                        disabled={downloading === "importing" || !result?.id}
                        className="flex items-center gap-1 px-2 py-0.5 bg-emerald-600/80 hover:bg-emerald-600 text-white rounded text-[10px] font-medium transition-colors disabled:opacity-50"
                        title="Import updated costs"
                      >
                        {downloading === "importing" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                        Import Workbook
                      </button>
                      <input ref={scopingImportRef} type="file" accept=".xlsx,.xls" onChange={handleImportScopingWorkbook} className="hidden" />
                    </div>
                  </div>
                )}
              </div>

              {/* ---- Univer Spreadsheet — FILLS REMAINING SPACE ---- */}
              <div className={`flex-1 min-h-0 overflow-hidden relative ${spreadsheetMode ? "border-x border-gray-200 dark:border-gray-700" : "border border-t-0 border-gray-200 dark:border-gray-700"}`}>
                {!pricingPreview ? (
                  <div className="flex items-center justify-center h-full gap-2 text-sm text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading pricing data...
                  </div>
                ) : (
                <UniverSpreadsheet
                  screens={editableSpecs.length > 0 ? editableSpecs : (result?.screens || [])}
                  pricingDisplays={pricingPreview.displays}
                  pricingSummary={pricingPreview.summary}
                  pricingDocument={result?.pricingDocument}
                  projectInfo={{
                    projectName: result?.project?.projectName || result?.project?.clientName,
                    clientName: result?.project?.clientName,
                    venue: result?.project?.venue,
                    location: result?.project?.location,
                    documentMode: result?.project?.documentMode,
                    createdAt: result?.createdAt,
                    updatedAt: result?.updatedAt,
                  }}
                  internalAudit={result?.internalAudit}
                  availableProducts={availableProducts}
                  onSpecEdit={(screenIdx, field, value) => {
                    setResult(prev => {
                      if (!prev) return prev;
                      if (screenIdx < 0 || screenIdx >= prev.screens.length) return prev;
                      const spec = { ...prev.screens[screenIdx] };
                      (spec as any)[field] = value;
                      const updated = [...prev.screens];
                      updated[screenIdx] = spec;
                      setEditableSpecs(updated);
                      autoSaveSpecs(updated, prev.id);
                      return { ...prev, screens: updated };
                    });
                    setPricingPreview(prev => {
                      if (!prev) return prev;
                      if (screenIdx < 0 || screenIdx >= prev.displays.length) return prev;
                      const display = prev.displays[screenIdx];
                      const currentSpec = editableSpecs[screenIdx] || result?.screens?.[screenIdx];
                      let h = currentSpec?.heightFt || 0, w = currentSpec?.widthFt || 0, qty = currentSpec?.quantity || 1;
                      if (field === 'heightFt') h = value;
                      if (field === 'widthFt') w = value;
                      if (field === 'quantity') qty = value;
                      const updatedDisplays = prev.displays.map((d, i) =>
                        i === screenIdx ? recalcDisplayCosts(d, h * w, qty) : d);
                      return recalcSummary(prev, updatedDisplays);
                    });
                  }}
                  onPricingEdit={(displayIdx, field, value) => {
                    setPricingPreview(prev => {
                      if (!prev) return prev;
                      if (displayIdx < 0 || displayIdx >= prev.displays.length) return prev;
                      const updatedDisplays = prev.displays.map((d, i) => {
                        if (i !== displayIdx) return d;
                        const updated = { ...d };
                        if (field === "blendedMarginPct") {
                          updated.blendedMarginPct = value;
                        } else {
                          (updated as any)[field] = value;
                        }
                        updated.hardwareCost = updated.hardwareCost ?? 0;
                        const ledTotal = updated.hardwareCost + (updated.processorCost ?? 0) + (updated.shippingCost ?? 0);
                        updated.totalCost = ledTotal + (updated.installCost ?? 0) + (updated.structuralCost ?? 0) + (updated.pmCost ?? 0) + (updated.engCost ?? 0);
                        updated.totalSellingPrice = updated.blendedMarginPct > 0
                          ? updated.totalCost / (1 - updated.blendedMarginPct) : updated.totalCost;
                        return updated;
                      });
                      return recalcSummary(prev, updatedDisplays);
                    });
                  }}
                  onMarginAnalysisEdit={(itemIdx, field, value) => {
                    const hasMirrorPricing = Array.isArray(result?.pricingDocument?.tables)
                      && result.pricingDocument.tables.some((table: any) => Array.isArray(table.items) && table.items.length > 0);

                    if (hasMirrorPricing && (field === "sellingPrice" || field === "cost")) {
                      setResult(prev => {
                        if (!prev?.pricingDocument) return prev;
                        const updatedPricingDocument = updatePricingDocumentFromMarginAnalysis(prev.pricingDocument as PricingDocument, itemIdx, field, value);
                        if (updatedPricingDocument === prev.pricingDocument) return prev;
                        return { ...prev, pricingDocument: updatedPricingDocument };
                      });
                      return;
                    }

                    setPricingPreview(prev => {
                      if (!prev) return prev;
                      const nonCustom = prev.displays.filter(d => !d.isCustom);
                      const serviceCats = [
                        { field: "structuralCost" }, { field: "installCost" },
                        { field: "pmCost" }, { field: "engCost" },
                      ].filter(cat => prev.displays.reduce((s, d) => s + ((d as any)[cat.field] ?? 0), 0) > 0);
                      const customs = prev.displays.filter(d => d.isCustom);
                      const dCount = nonCustom.length;
                      const sCount = serviceCats.length;

                      if (itemIdx < dCount) {
                        const displayName = nonCustom[itemIdx].name;
                        const updatedDisplays = prev.displays.map(d => {
                          if (d.name !== displayName || d.isCustom) return d;
                          const updated = { ...d };
                          if (field === "marginPct") {
                            updated.blendedMarginPct = value;
                          } else if (field === "sellingPrice") {
                            updated.totalSellingPrice = value;
                            updated.blendedMarginPct = value > 0 ? (value - updated.totalCost) / value : 0;
                          } else {
                            updated.hardwareCost = value;
                            updated.processorCost = 0;
                            updated.shippingCost = 0;
                          }
                          updated.totalCost = updated.hardwareCost + (updated.processorCost ?? 0) + (updated.shippingCost ?? 0) + (updated.installCost ?? 0) + (updated.structuralCost ?? 0) + (updated.pmCost ?? 0) + (updated.engCost ?? 0);
                          updated.totalSellingPrice = updated.blendedMarginPct > 0 ? updated.totalCost / (1 - updated.blendedMarginPct) : updated.totalCost;
                          return updated;
                        });
                        return recalcSummary(prev, updatedDisplays);
                      } else if (itemIdx < dCount + sCount) {
                        const cat = serviceCats[itemIdx - dCount];
                        if (field === "cost") {
                          const currentTotal = prev.displays.reduce((s, d) => s + ((d as any)[cat.field] ?? 0), 0);
                          const ratio = currentTotal > 0 ? value / currentTotal : 0;
                          const updatedDisplays = prev.displays.map(d => {
                            const updated = { ...d };
                            const oldVal = (d as any)[cat.field] ?? 0;
                            (updated as any)[cat.field] = currentTotal > 0 ? oldVal * ratio : value / prev.displays.length;
                            updated.totalCost = updated.hardwareCost + (updated.processorCost ?? 0) + (updated.shippingCost ?? 0) + (updated.installCost ?? 0) + (updated.structuralCost ?? 0) + (updated.pmCost ?? 0) + (updated.engCost ?? 0);
                            updated.totalSellingPrice = updated.blendedMarginPct > 0 ? updated.totalCost / (1 - updated.blendedMarginPct) : updated.totalCost;
                            return updated;
                          });
                          return recalcSummary(prev, updatedDisplays);
                        }
                        return prev;
                      } else if (itemIdx < dCount + sCount + 2 + customs.length) {
                        const customIdx = itemIdx - dCount - sCount - 2;
                        if (customIdx >= 0 && customIdx < customs.length) {
                          const customName = customs[customIdx].name;
                          const updatedDisplays = prev.displays.map(d => {
                            if (d.name !== customName || !d.isCustom) return d;
                            const updated = { ...d };
                            if (field === "marginPct") {
                              updated.blendedMarginPct = value;
                            } else if (field === "sellingPrice") {
                              updated.totalSellingPrice = value;
                              updated.blendedMarginPct = value > 0 ? (value - updated.totalCost) / value : 0;
                            } else {
                              updated.hardwareCost = value;
                            }
                            updated.totalCost = updated.hardwareCost + (updated.installCost ?? 0) + (updated.structuralCost ?? 0) + (updated.pmCost ?? 0) + (updated.engCost ?? 0);
                            updated.totalSellingPrice = updated.blendedMarginPct > 0 ? updated.totalCost / (1 - updated.blendedMarginPct) : updated.totalCost;
                            return updated;
                          });
                          return recalcSummary(prev, updatedDisplays);
                        }
                      }
                      return prev;
                    });
                  }}
                  className="w-full h-full"
                />
                )}
              </div>

              {/* ---- Footer — FIXED FOOTER in spreadsheet mode, normal in regular mode ---- */}
              {spreadsheetMode ? (
                <div className="sticky bottom-0 z-20 shrink-0 px-3 py-1 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 flex items-center justify-between text-[10px]">
                  <div className="flex items-center gap-3">
                    {autoSaveStatus !== "idle" && (
                      <span className="flex items-center gap-1 text-muted-foreground">
                        {autoSaveStatus === "saving" && <><Loader2 className="w-3 h-3 animate-spin" /> Saving...</>}
                        {autoSaveStatus === "saved" && <><CheckCircle2 className="w-3 h-3 text-emerald-500" /> Saved</>}
                        {autoSaveStatus === "error" && <><AlertTriangle className="w-3 h-3 text-red-500" /> Save failed</>}
                      </span>
                    )}
                    {scopingImportResult && (
                      <span className="flex items-center gap-1 text-emerald-600">
                        <CheckCircle2 className="w-3 h-3" />
                        Imported {scopingImportResult.updatedCount} display(s)
                        <button onClick={() => setScopingImportResult(null)} className="ml-1 text-muted-foreground hover:text-foreground">×</button>
                      </span>
                    )}
                  </div>
                  <span className="text-muted-foreground">
                    {(() => {
                      const screens = editableSpecs.length > 0 ? editableSpecs : result.screens;
                      const totalQty = screens.reduce((sum: number, s: any) => sum + (s.quantity || 1), 0);
                      const unique = screens.length;
                      return totalQty > unique ? `${totalQty} displays (${unique} unique)` : `${unique} displays`;
                    })()} • {typeof (result.pricingDocument?.documentTotal ?? pricingPreview?.summary?.totalSellingPrice) === "number"
                      ? `$${(result.pricingDocument?.documentTotal ?? pricingPreview?.summary?.totalSellingPrice ?? 0).toLocaleString()}`
                      : "—"}
                  </span>
                </div>
              ) : (
              <div className="px-4 py-2 space-y-2 border border-t-0 border-gray-200 dark:border-gray-700 rounded-b-lg bg-white dark:bg-gray-900">
                {scopingImportResult && (
                  <div className="flex items-center gap-1.5 text-[10px] text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 rounded px-2 py-1">
                    <CheckCircle2 className="w-3 h-3" />
                    Imported {scopingImportResult.updatedCount} display(s)
                    {scopingImportResult.missingCount > 0 && ` (${scopingImportResult.missingCount} unmatched)`}
                    {scopingImportResult.warnings.length > 0 && (
                      <span className="text-amber-600 ml-1">— {scopingImportResult.warnings[0]}</span>
                    )}
                    <button onClick={() => setScopingImportResult(null)} className="ml-auto text-muted-foreground hover:text-foreground">×</button>
                  </div>
                )}
                {autoSaveStatus !== "idle" && (
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    {autoSaveStatus === "saving" && <><Loader2 className="w-3 h-3 animate-spin" /> Saving...</>}
                    {autoSaveStatus === "saved" && <><CheckCircle2 className="w-3 h-3 text-emerald-500" /> Saved</>}
                    {autoSaveStatus === "error" && <><AlertTriangle className="w-3 h-3 text-red-500" /> Save failed</>}
                  </div>
                )}
                <PipelineCheckpoint
                  unconfirmedCount={result.screens.filter((s) => s.confidence < 0.8).length}
                  onProceed={() => {}}
                  nextStageLabel="Review Complete"
                />
              </div>
              )}

              {!spreadsheetMode && (
              <>
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
              </>
              )}
            </div>

            {!spreadsheetMode && showPdfPanel && pdfBlobUrl && (
              <div className="w-[420px] shrink-0 rounded-lg border border-border overflow-hidden shadow-sm self-stretch min-h-[500px]">
                <PdfSplitPanel
                  pdfUrl={pdfBlobUrl}
                  activePage={pdfViewerPage}
                  onClose={() => setShowPdfPanel(false)}
                />
              </div>
            )}
            </div>

            {!spreadsheetMode && result.id && (
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
        })();

          if (isSpreadsheetVisible) {
            return <>{resultsContent}</>;
          }

          return (
            <div className="w-full max-w-[1480px] mx-auto px-4 sm:px-6 xl:px-8 py-4 sm:py-5 min-h-full">
              <div className="sticky top-0 z-20 pb-3 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/75">
                <div className="rounded-xl border border-border/70 bg-card/90 shadow-sm px-3 py-3 sm:px-4 sm:py-3.5">
                  <PipelineStepper
                    phase={phase}
                    resultsTab={resultsTab}
                    hasResult={!!result}
                    hasPricing={!!pricingPreview}
                    specsFound={result?.screens?.length || result?.stats.specsFound || 0}
                    onTabSwitch={setResultsTab}
                  />
                </div>
              </div>

              <div className="space-y-5">
                {uploadContent}
                {resultsContent}
              </div>
            </div>
          );
        })()}

      </main>

      {/* Lux AI Widget — platform owner only */}
      {isPlatformOwner(session?.user?.email) && result?.screens && result.screens.length > 0 && (
        <LuxWidget
          displays={result.screens}
          sourceText={result.sourceText}
        />
      )}
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
