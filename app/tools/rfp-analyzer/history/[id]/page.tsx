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
  MessageSquare,
  Plus,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  RefreshCcw,
  Upload,
} from "lucide-react";
import SpecsTable from "../../_components/SpecsTable";
import RequirementsTable from "../../_components/RequirementsTable";
import { buildRfpWorkbook } from "../../_components/rfpWorkbookBuilder";
import WorkbookShell from "@/app/components/reusables/WorkbookShell";
import type { ExtractedLEDSpec, ExtractedRequirement } from "@/services/rfp/unified/types";

// ============================================================================
// Types
// ============================================================================

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
  const [availableProducts, setAvailableProducts] = useState<Array<{ id: string; label: string; pitch: number; name: string }>>([]);
  const [pdfAvailable, setPdfAvailable] = useState<boolean | null>(null);
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

  // Cell edit handler for LED Cost Sheet
  const handleCellEdit = useCallback((sheetIdx: number, rowIdx: number, colIdx: number, value: string) => {
    if (sheetIdx !== 0) return;
    const fieldMap: Record<number, string> = { 0: "name", 3: "heightFt", 4: "widthFt", 7: "quantity" };
    const field = fieldMap[colIdx];
    if (!field) return;
    setAnalysis(prev => {
      if (!prev) return prev;
      const specIdx = rowIdx - 1;
      if (specIdx < 0 || specIdx >= prev.screens.length) return prev;
      const spec = { ...prev.screens[specIdx] };
      if (field === "name") {
        (spec as any)[field] = value;
      } else {
        (spec as any)[field] = parseFloat(value) || 0;
      }
      const updated = [...prev.screens];
      updated[specIdx] = spec;
      autoSaveSpecs(updated, prev.id);
      return { ...prev, screens: updated };
    });
  }, [autoSaveSpecs]);

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

  const handleProductSelect = useCallback((displayName: string, productId: string) => {
    const product = availableProducts.find((p) => p.id === productId);
    if (!product || !pricingPreview) return;
    setPricingPreview((prev: any) => {
      if (!prev) return prev;
      return {
        ...prev,
        displays: prev.displays.map((d: any) =>
          d.name === displayName
            ? { ...d, matchedProduct: { manufacturer: product.name.split(" ")[0], model: product.name, pitch: product.pitch, fitScore: 100 } }
            : d
        ),
      };
    });
  }, [availableProducts, pricingPreview]);

  const workbookData = useMemo(() => {
    if (!analysis) return { fileName: "RFP Analysis", sheets: [] };
    return buildRfpWorkbook({
      project: analysis.project,
      screens: analysis.screens || [],
      requirements: analysis.requirements || [],
      triage: analysis.triage || [],
      pricingDisplays: pricingPreview?.displays || [],
      pricingSummary: pricingPreview?.summary || null,
      bidFormResult: null,
      availableProducts,
      onProductSelect: handleProductSelect,
    });
  }, [analysis, pricingPreview, availableProducts, handleProductSelect]);

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
      await downloadBlob("/api/rfp/pipeline/extraction-excel", { analysisId: analysis.id }, `${analysis.projectName || "rfp-analysis"}.xlsx`);
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
      await downloadBlob("/api/rfp/pipeline/scoping-workbook", { analysisId: analysis.id }, "Scoping_Workbook.xlsx");
    } catch (err: any) {
      console.error("Scoping workbook failed:", err);
    } finally {
      setDownloading(null);
    }
  };

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
    <div className="flex-1 min-w-0 bg-background relative min-h-screen pb-24">
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

          <div className="flex items-center gap-1.5">
            {a.aiWorkspaceSlug && (
              <Link
                href={`/chat?workspace=${a.aiWorkspaceSlug}`}
                target="_blank"
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium border border-border text-muted-foreground rounded hover:bg-muted transition-colors"
              >
                <MessageSquare className="w-3 h-3" />
                Cross-Check
                <ExternalLink className="w-2.5 h-2.5 opacity-50" />
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="p-6 xl:px-8 max-w-[1600px] mx-auto space-y-6">
        {/* Stats row — always visible */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
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

        {/* Pipeline Stepper */}
        <HistoryStepper
          activeStage={activeStage}
          onStageClick={setActiveStage}
          specsCount={screens.length || a.specsFound}
        />

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
          <div className="animate-in fade-in duration-300">
            {loadingPricing && (
              <div className="mb-4 p-3 border border-blue-500/30 bg-blue-500/10 rounded-lg flex items-center gap-3">
                <Loader2 className="w-4 h-4 text-blue-600 animate-spin shrink-0" />
                <p className="text-sm text-blue-700 dark:text-blue-300">Matching products...</p>
              </div>
            )}
            <div className="h-[75vh]">
            <WorkbookShell
              data={workbookData}
              editable
              onCellEdit={handleCellEdit}
              footer={autoSaveStatus !== "idle" ? (
                <div className="px-4 py-2 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  {autoSaveStatus === "saving" && <><Loader2 className="w-3 h-3 animate-spin" /> Saving...</>}
                  {autoSaveStatus === "saved" && <><CheckCircle2 className="w-3 h-3 text-emerald-500" /> Saved</>}
                  {autoSaveStatus === "error" && <><AlertTriangle className="w-3 h-3 text-red-500" /> Save failed</>}
                </div>
              ) : undefined}
            />
            </div>
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
                  Page Triage ({triage.length} pages)
                </h3>
                <TriageMinimap triage={triage} />
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
            <div className="h-[75vh]">
            <WorkbookShell
              data={workbookData}
              editable
              onCellEdit={handleCellEdit}
              onExport={handleScoping}
              exporting={downloading === "scoping"}
              footer={autoSaveStatus !== "idle" ? (
                <div className="px-4 py-2 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  {autoSaveStatus === "saving" && <><Loader2 className="w-3 h-3 animate-spin" /> Saving...</>}
                  {autoSaveStatus === "saved" && <><CheckCircle2 className="w-3 h-3 text-emerald-500" /> Saved</>}
                  {autoSaveStatus === "error" && <><AlertTriangle className="w-3 h-3 text-red-500" /> Save failed</>}
                </div>
              ) : undefined}
            />
            </div>
          </div>
        )}

        {/* ═══ Stage 4: Actions ═══ */}
        {activeStage === 4 && (
          <div className="animate-in fade-in duration-300">
            <div className="grid gap-4 md:grid-cols-2 max-w-3xl mx-auto">
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
