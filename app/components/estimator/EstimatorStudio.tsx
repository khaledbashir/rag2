"use client";

/**
 * EstimatorStudio — Split-screen Intelligence Mode workspace.
 *
 * Left panel:  Typeform-style questionnaire (QuestionFlow)
 * Right panel: Live Excel preview with sheet tabs (ExcelPreview)
 *
 * Same pattern as Mirror Mode (form + PDF preview) but for building estimates.
 */

import React, { useState, useCallback, useMemo } from "react";
import { useConfirm } from "@/hooks/useConfirm";
import dynamic from "next/dynamic";
import { FileSpreadsheet, ArrowLeft, Download, Loader2, MessageSquare, Copy, ArrowRightLeft, Package, Boxes, Search, Shield, Send, GitCompare, FileText, Box, Zap, ChevronDown, PenLine } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import QuestionFlow from "./QuestionFlow";
import ExcelPreview from "./ExcelPreview";
import EstimatorCopilot from "./EstimatorCopilot";
import { calculateDisplay, type ExcelPreviewData, type SheetTab, type ProductSpec } from "./EstimatorBridge";
import { getDefaultAnswers, type EstimatorAnswers, type DisplayAnswers } from "./questions";
import VendorDropZone from "./VendorDropZone";
import BundlePanel from "./BundlePanel";
import ReverseEngineerPanel from "./ReverseEngineerPanel";
import LiabilityPanel from "./LiabilityPanel";
import RfqPanel from "./RfqPanel";
import RevisionRadarPanel from "./RevisionRadarPanel";
import CutSheetPanel from "./CutSheetPanel";
import AutoRfpPanel from "./AutoRfpPanel";
import ToolDescription from "./ToolDescription";
import type { VendorExtractedSpec } from "@/services/vendor/vendorParser";
import { useProductSpecs } from "@/hooks/useProductSpecs";
import { exportEstimatorExcel } from "./exportEstimatorExcel";
import { useRateCard } from "@/hooks/useRateCard";
import { useEstimatorAutoSave } from "@/hooks/useEstimatorAutoSave";
import { useServerPreview } from "@/hooks/useServerPreview";

const EstimatorVenuePanel = dynamic(() => import("./EstimatorVenuePanel"), { ssr: false });

const SHEET_COLORS = ["#6366F1", "#EC4899", "#14B8A6", "#F59E0B", "#8B5CF6", "#EF4444"];

interface EstimatorStudioProps {
    projectId?: string;
    initialAnswers?: EstimatorAnswers;
    initialCellOverrides?: Record<string, string | number>;
    initialCustomSheets?: SheetTab[];
}

export default function EstimatorStudio({
    projectId,
    initialAnswers,
    initialCellOverrides,
    initialCustomSheets,
}: EstimatorStudioProps = {}) {
    const router = useRouter();
    const [answers, setAnswers] = useState<EstimatorAnswers>(initialAnswers || getDefaultAnswers());
    const [exporting, setExporting] = useState(false);
    const [questionsComplete, setQuestionsComplete] = useState(false);
    const [copilotOpen, setCopilotOpen] = useState(false);
    const [converting, setConverting] = useState(false);
    const [duplicating, setDuplicating] = useState(false);
    const [vendorOpen, setVendorOpen] = useState(false);
    const [bundleOpen, setBundleOpen] = useState(false);
    const [reverseOpen, setReverseOpen] = useState(false);
    const [liabilityOpen, setLiabilityOpen] = useState(false);
    const [rfqOpen, setRfqOpen] = useState(false);
    const [revisionOpen, setRevisionOpen] = useState(false);
    const [cutSheetOpen, setCutSheetOpen] = useState(false);
    const [autoRfpOpen, setAutoRfpOpen] = useState(false);
    const [venueOpen, setVenueOpen] = useState(false);
    const [toolbarOpen, setToolbarOpen] = useState(false);
    // Cell overrides: key = "sheetIdx-rowIdx-colIdx", value = edited value
    const [cellOverrides, setCellOverrides] = useState<Record<string, string | number>>(initialCellOverrides || {});
    // User-added custom sheets
    const [customSheets, setCustomSheets] = useState<SheetTab[]>(initialCustomSheets || []);
    // Rate card from DB (replaces hardcoded constants)
    const { rates, loading: ratesLoading } = useRateCard();
    // Auto-save to DB when projectId is provided
    const { status: saveStatus } = useEstimatorAutoSave({
        projectId,
        answers,
        cellOverrides,
        customSheets,
        rates,
    });
    const { confirm, alert: showAlert } = useConfirm();

    // Fetch product specs for cabinet layout calculations
    const productIds = useMemo(() =>
        answers.displays.map((d) => d.productId).filter(Boolean),
        [answers.displays]
    );
    const { specs: productSpecs } = useProductSpecs(productIds);

    // Calculate per-display cost breakdowns (used by copilot for query responses)
    const calcs = useMemo(() => {
        return answers.displays.map((d) => {
            const spec = d.productId ? productSpecs[d.productId] : null;
            return calculateDisplay(d, answers, rates ?? undefined, spec);
        });
    }, [answers, rates, productSpecs]);

    // WYSIWYG preview: call the same server-side generator that produces the export.
    // No fake preview. No client-side approximation. Loading state shown until ready.
    const { data: serverPreview, loading: serverPreviewLoading, error: serverPreviewError } = useServerPreview(answers);

    // Preview data comes ONLY from the canonical server-side generator.
    // null when no displays or server hasn't responded yet — ExcelPreview shows loading state.
    const previewData: ExcelPreviewData | null = useMemo(() => {
        if (!serverPreview) return null;
        const allSheets = [...serverPreview.sheets, ...customSheets];

        // Apply cell overrides
        const sheets = allSheets.map((sheet, si) => ({
            ...sheet,
            rows: sheet.rows.map((row, ri) => ({
                ...row,
                cells: row.cells.map((cell, ci) => {
                    const key = `${si}-${ri}-${ci}`;
                    if (key in cellOverrides) {
                        const raw = cellOverrides[key];
                        const numVal = typeof raw === "string" ? parseFloat(raw) : raw;
                        const isNum = !isNaN(numVal as number) && raw !== "";
                        return { ...cell, value: isNum ? numVal : raw };
                    }
                    return cell;
                }),
            })),
        }));

        return { ...serverPreview, sheets };
    }, [serverPreview, customSheets, cellOverrides]);

    const handleChange = useCallback((next: EstimatorAnswers) => {
        setAnswers(next);
    }, []);

    const handleCellEdit = useCallback((sheetIndex: number, rowIndex: number, colIndex: number, newValue: string) => {
        const key = `${sheetIndex}-${rowIndex}-${colIndex}`;
        setCellOverrides(prev => ({ ...prev, [key]: newValue }));
    }, []);

    const handleAddSheet = useCallback(() => {
        const idx = customSheets.length;
        const sheetCount = (serverPreview?.sheets?.length ?? 0) + idx;
        const color = SHEET_COLORS[idx % SHEET_COLORS.length];
        const newSheet: SheetTab = {
            name: `Sheet ${sheetCount + 1}`,
            color,
            columns: ["A", "B", "C", "D", "E"],
            rows: Array.from({ length: 20 }, () => ({
                cells: Array.from({ length: 5 }, () => ({ value: "" })),
            })),
        };
        setCustomSheets(prev => [...prev, newSheet]);
    }, [customSheets.length, serverPreview]);

    const handleExport = useCallback(async () => {
        if (!previewData || previewData.sheets.length === 0) {
            void showAlert({ title: "Cannot Export", description: serverPreviewError || "Workbook preview hasn't loaded yet. Wait for it to generate or check for errors." });
            return;
        }
        setExporting(true);
        try {
            // Use unified server-side export (same generator as RFP path)
            const res = await fetch("/api/estimator/export-unified", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ answers }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({ error: `Export failed (${res.status})` }));
                throw new Error(err.error || `Export failed (${res.status})`);
            }
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = res.headers.get("Content-Disposition")?.split("filename=")[1]?.replace(/"/g, "") || previewData.fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error("Export error:", err);
            void showAlert({ title: "Export Failed", description: err instanceof Error ? err.message : "Unknown error" });
        } finally {
            setExporting(false);
        }
    }, [answers, previewData, showAlert, serverPreviewError]);

    const handleComplete = useCallback(() => {
        setQuestionsComplete(true);
    }, []);

    // Active display index for vendor panel (use first display or 0)
    const activeDisplayIndex = Math.max(0, answers.displays.length - 1);

    const handleVendorApply = useCallback((fields: Partial<DisplayAnswers>, vendorSpec: VendorExtractedSpec) => {
        const next = { ...answers };
        const idx = activeDisplayIndex;
        if (idx >= 0 && idx < next.displays.length) {
            next.displays = [...next.displays];
            next.displays[idx] = { ...next.displays[idx], ...fields };
        }
        setAnswers(next);
        setVendorOpen(false);
    }, [answers, activeDisplayIndex]);

    const handleBundleToggle = useCallback((displayIndex: number, itemId: string) => {
        setAnswers((prev) => {
            const next = { ...prev, displays: [...prev.displays] };
            const d = { ...next.displays[displayIndex] };
            const excluded = d.excludedBundleItems || [];
            if (excluded.includes(itemId)) {
                d.excludedBundleItems = excluded.filter((id) => id !== itemId);
            } else {
                d.excludedBundleItems = [...excluded, itemId];
            }
            next.displays[displayIndex] = d;
            return next;
        });
    }, []);

    const handleReverseSelect = useCallback((productId: string, productName: string) => {
        const idx = activeDisplayIndex;
        if (idx >= 0 && idx < answers.displays.length) {
            const next = { ...answers, displays: [...answers.displays] };
            next.displays[idx] = { ...next.displays[idx], productId, productName };
            setAnswers(next);
        }
        setReverseOpen(false);
    }, [answers, activeDisplayIndex]);

    const handleConvert = useCallback(async () => {
        if (!projectId || converting) return;
        const ok = await confirm({ title: "Convert to Proposal", description: "Convert this estimate to a full Intelligence Mode proposal? This will create screens from your displays.", confirmLabel: "Convert", variant: "default" });
        if (!ok) return;
        setConverting(true);
        try {
            const res = await fetch("/api/estimator/convert", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ projectId }),
            });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || "Conversion failed");
            }
            const data = await res.json();
            router.push(`/projects/${data.projectId}`);
        } catch (err) {
            void showAlert({ title: "Conversion Failed", description: err instanceof Error ? err.message : "Unknown error" });
        } finally {
            setConverting(false);
        }
    }, [projectId, converting, router, confirm, showAlert]);

    const handleAutoRfpApply = useCallback((rfpAnswers: EstimatorAnswers) => {
        setAnswers(rfpAnswers);
        setAutoRfpOpen(false);
    }, []);

    const handleDuplicate = useCallback(async () => {
        if (!projectId || duplicating) return;
        setDuplicating(true);
        try {
            const res = await fetch("/api/estimator/duplicate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ projectId }),
            });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || "Duplication failed");
            }
            const data = await res.json();
            router.push(`/estimator/${data.projectId}`);
        } catch (err) {
            void showAlert({ title: "Duplicate Failed", description: err instanceof Error ? err.message : "Unknown error" });
        } finally {
            setDuplicating(false);
        }
    }, [projectId, duplicating, router, showAlert]);

    return (
        <div className="h-[100dvh] w-full min-w-0 overflow-hidden flex flex-col bg-background text-foreground">
            {/* Header */}
            <header className="h-14 shrink-0 border-b border-border bg-background/95 backdrop-blur-md flex items-center px-4 gap-4 z-30 sticky top-0">
                <Link
                    href="/projects"
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    Projects
                </Link>
                <div className="h-5 w-px bg-border" />
                <div className="flex items-center gap-2">
                    <FileSpreadsheet className="w-4 h-4 text-[#0A52EF]" />
                    <span className="text-sm font-semibold">
                        {answers.projectName || "New Estimate"}
                    </span>
                    {answers.clientName && (
                        <span className="text-xs text-muted-foreground">
                            — {answers.clientName}
                        </span>
                    )}
                </div>
                <div className="ml-auto flex items-center gap-2">
                    {ratesLoading && (
                        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            Loading rates...
                        </span>
                    )}
                    {projectId && saveStatus === "saving" && (
                        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            Saving...
                        </span>
                    )}
                    {projectId && saveStatus === "saved" && (
                        <span className="text-[10px] text-emerald-500">Saved</span>
                    )}
                    {projectId && saveStatus === "error" && (
                        <span className="text-[10px] text-destructive">Save failed</span>
                    )}
                    {answers.displays.length > 0 && (
                        <>
                            <span className="text-[10px] text-muted-foreground">
                                {answers.displays.length} display{answers.displays.length !== 1 ? "s" : ""}
                            </span>
                            {questionsComplete && (
                                <button
                                    onClick={() => setQuestionsComplete(false)}
                                    className="flex items-center gap-1 px-2.5 py-1.5 border border-border rounded text-xs text-muted-foreground hover:bg-muted transition-colors"
                                >
                                    <PenLine className="w-3 h-3" />
                                    Edit Answers
                                </button>
                            )}
                            <button
                                onClick={handleExport}
                                disabled={exporting}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0A52EF] text-white rounded text-xs font-medium hover:bg-[#0A52EF]/90 transition-colors disabled:opacity-50"
                            >
                                <Download className="w-3 h-3" />
                                {exporting ? "Exporting..." : "Export .xlsx"}
                            </button>
                        </>
                    )}
                    {projectId && answers.displays.length > 0 && (
                        <>
                            <button
                                onClick={handleDuplicate}
                                disabled={duplicating}
                                className="flex items-center gap-1 px-2.5 py-1.5 border border-border rounded text-xs text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50"
                                title="Duplicate estimate"
                            >
                                <Copy className="w-3 h-3" />
                                {duplicating ? "..." : "Duplicate"}
                            </button>
                            <button
                                onClick={handleConvert}
                                disabled={converting}
                                className="flex items-center gap-1 px-2.5 py-1.5 border border-border rounded text-xs text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50"
                                title="Convert to full proposal"
                            >
                                <ArrowRightLeft className="w-3 h-3" />
                                {converting ? "..." : "To Proposal"}
                            </button>
                        </>
                    )}
                    {/* Auto-RFP and 3D Arena hidden — reserved for Phase 2 */}
                    <div className="w-px h-5 bg-border mx-0.5" />
                    <button
                        onClick={() => setToolbarOpen((v) => !v)}
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium transition-colors ${
                            toolbarOpen
                                ? "bg-amber-600 text-white"
                                : "border border-border text-muted-foreground hover:bg-muted"
                        }`}
                    >
                        <Zap className="w-3 h-3" />
                        Tools
                        <ChevronDown className={`w-3 h-3 transition-transform ${toolbarOpen ? "rotate-180" : ""}`} />
                    </button>
                    {toolbarOpen && <>
                    <ToolDescription
                        label="Smart Assembly Bundle"
                        description="Auto-suggests hidden line items you might forget: video processors, receiving cards, spare modules, mounting brackets, cable kits, and more."
                        whenToUse="After adding displays. Review before exporting to catch missing accessories."
                        benefit="Catches $5K-$30K in commonly forgotten line items per project."
                    >
                        <button
                            onClick={() => setBundleOpen((v) => !v)}
                            className={`flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-medium transition-colors ${
                                bundleOpen
                                    ? "bg-orange-600 text-white"
                                    : "border border-border text-muted-foreground hover:bg-muted"
                            }`}
                        >
                            <Boxes className="w-3 h-3" />
                            Bundle
                        </button>
                    </ToolDescription>
                    <ToolDescription
                        label="Price-to-Spec Reverse Engineer"
                        description="Enter a target budget and display size. The system searches the product catalog and shows which LED products fit within that budget, with full cost breakdowns."
                        whenToUse="When the client says 'I have $200K for a scoreboard' and you need to find what's possible."
                        benefit="Instantly answers 'what can I get for $X?' instead of manual trial-and-error."
                    >
                        <button
                            onClick={() => setReverseOpen((v) => !v)}
                            className={`flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-medium transition-colors ${
                                reverseOpen
                                    ? "bg-teal-600 text-white"
                                    : "border border-border text-muted-foreground hover:bg-muted"
                            }`}
                        >
                            <Search className="w-3 h-3" />
                            Budget
                        </button>
                    </ToolDescription>
                    <ToolDescription
                        label="Vendor Spec Drop Zone"
                        description="Drop a manufacturer's PDF spec sheet and the system extracts cabinet dimensions, weight, power, pixel pitch, and other specs automatically."
                        whenToUse="When you receive a new product spec sheet from LG, Yaham, Absen, etc. and need to get the numbers into the estimate."
                        benefit="Eliminates manual data entry from spec sheets — seconds instead of minutes."
                    >
                        <button
                            onClick={() => setVendorOpen((v) => !v)}
                            className={`flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-medium transition-colors ${
                                vendorOpen
                                    ? "bg-purple-600 text-white"
                                    : "border border-border text-muted-foreground hover:bg-muted"
                            }`}
                        >
                            <Package className="w-3 h-3" />
                            Vendor
                        </button>
                    </ToolDescription>
                    <ToolDescription
                        label="Vendor RFQ Generator"
                        description="Auto-generates a professional Request for Quote email to LED manufacturers with your display specs, quantities, and ANC standard terms."
                        whenToUse="After finalizing display specs. Generate one RFQ per manufacturer to get pricing."
                        benefit="Professional RFQ in 10 seconds instead of writing emails from scratch."
                    >
                        <button
                            onClick={() => setRfqOpen((v) => !v)}
                            className={`flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-medium transition-colors ${
                                rfqOpen
                                    ? "bg-cyan-600 text-white"
                                    : "border border-border text-muted-foreground hover:bg-muted"
                            }`}
                        >
                            <Send className="w-3 h-3" />
                            RFQ
                        </button>
                    </ToolDescription>
                    <ToolDescription
                        label="Liability Hunter (SOW Scanner)"
                        description="Upload a SOW, RFP, or contract. The system scans it against a 20-point checklist of required clauses: payment terms, liability caps, change orders, force majeure, warranty, and more."
                        whenToUse="Before signing any contract or SOW. Upload the document to find missing protections."
                        benefit="Catches liability gaps that could cost $50K+ in unprotected exposure."
                    >
                        <button
                            onClick={() => setLiabilityOpen((v) => !v)}
                            className={`flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-medium transition-colors ${
                                liabilityOpen
                                    ? "bg-rose-600 text-white"
                                    : "border border-border text-muted-foreground hover:bg-muted"
                            }`}
                        >
                            <Shield className="w-3 h-3" />
                            Risk
                        </button>
                    </ToolDescription>
                    <ToolDescription
                        label="Revision Radar (Delta Scanner)"
                        description="Upload an original and revised cost analysis Excel. The system diffs them section-by-section, highlights every change, and shows the dollar impact."
                        whenToUse="When a client sends an addendum or revised scope. See exactly what changed and by how much."
                        benefit="Spot hidden cost changes in seconds instead of line-by-line comparison."
                    >
                        <button
                            onClick={() => setRevisionOpen((v) => !v)}
                            className={`flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-medium transition-colors ${
                                revisionOpen
                                    ? "bg-amber-600 text-white"
                                    : "border border-border text-muted-foreground hover:bg-muted"
                            }`}
                        >
                            <GitCompare className="w-3 h-3" />
                            Delta
                        </button>
                    </ToolDescription>
                    <ToolDescription
                        label="Visual Cut-Sheet Automator"
                        description="Generates per-display spec sheets with product specs, cabinet layout, power/weight/resolution stats, and installation notes. Ready for submittal packages."
                        whenToUse="Before submitting a proposal. Generate cut sheets for each display to include in the package."
                        benefit="One-click submittal-ready spec sheets instead of manual formatting."
                    >
                        <button
                            onClick={() => setCutSheetOpen((v) => !v)}
                            className={`flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-medium transition-colors ${
                                cutSheetOpen
                                    ? "bg-indigo-600 text-white"
                                    : "border border-border text-muted-foreground hover:bg-muted"
                            }`}
                        >
                            <FileText className="w-3 h-3" />
                            Cuts
                        </button>
                    </ToolDescription>
                    <ToolDescription
                        label="Lux AI Copilot"
                        description="Chat with Lux about your estimate. Ask questions like 'What's the cost breakdown for Display 1?' or 'How can I reduce the total by 15%?' Lux sees your full estimate in real time."
                        whenToUse="Anytime you need help understanding costs, exploring alternatives, or explaining numbers to a client."
                        benefit="AI assistant that understands your exact estimate — no copy-pasting needed."
                    >
                        <button
                            onClick={() => setCopilotOpen((v) => !v)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                                copilotOpen
                                    ? "bg-[#0055B3] text-white"
                                    : "border border-border text-muted-foreground hover:bg-muted"
                            }`}
                        >
                            <MessageSquare className="w-3 h-3" />
                            Lux
                        </button>
                    </ToolDescription>
                    </>}
                </div>
            </header>

            {/* Split screen — responsive grid: Questions | Excel | Copilot */}
            <main className={`flex-1 min-h-0 overflow-hidden grid transition-all duration-500 ease-in-out ${
                copilotOpen
                    ? 'grid-cols-[minmax(0,1fr)_minmax(320px,380px)]'
                    : questionsComplete
                        ? 'grid-cols-[1fr]'
                        : 'grid-cols-[minmax(0,1fr)_minmax(0,1fr)]'
            }`}>
                {/* Left: Questions (hidden when Lux is open or questions complete) */}
                {!copilotOpen && !questionsComplete ? (
                    <section className="relative min-w-0 min-h-0 flex flex-col overflow-hidden bg-background border-r border-border">
                        <QuestionFlow
                            answers={answers}
                            onChange={handleChange}
                            onComplete={handleComplete}
                            productSpecs={productSpecs}
                        />
                    </section>
                ) : null}

                {/* Center/Right: Excel Preview */}
                <section className="relative min-w-0 min-h-0 bg-zinc-100 dark:bg-zinc-950 overflow-hidden flex flex-col p-3">
                    <ExcelPreview
                        data={previewData}
                        onExport={handleExport}
                        exporting={exporting}
                        editable={true}
                        onCellEdit={handleCellEdit}
                        onAddSheet={handleAddSheet}
                        loading={serverPreviewLoading}
                        error={serverPreviewError}
                    />
                    {/* Bundle panel overlay */}
                    {bundleOpen && (
                        <div className="absolute inset-0 z-20 bg-background/80 backdrop-blur-md rounded-lg border border-border shadow-lg">
                            <BundlePanel
                                calcs={calcs}
                                displays={answers.displays}
                                onToggleItem={handleBundleToggle}
                                onClose={() => setBundleOpen(false)}
                            />
                        </div>
                    )}
                    {/* Vendor spec panel overlay */}
                    {vendorOpen && (
                        <div className="absolute inset-0 z-20 bg-background/80 backdrop-blur-md rounded-lg border border-border shadow-lg">
                            <VendorDropZone
                                displayIndex={activeDisplayIndex}
                                currentDisplay={answers.displays[activeDisplayIndex] || { widthFt: 0, heightFt: 0 } as any}
                                onApplySpecs={handleVendorApply}
                                onClose={() => setVendorOpen(false)}
                            />
                        </div>
                    )}
                    {/* Reverse Engineer panel overlay */}
                    {reverseOpen && (
                        <div className="absolute inset-0 z-20 bg-background/80 backdrop-blur-md rounded-lg border border-border shadow-lg overflow-hidden">
                            <ReverseEngineerPanel
                                open={reverseOpen}
                                onClose={() => setReverseOpen(false)}
                                currentDisplay={answers.displays[activeDisplayIndex] || {} as any}
                                onSelectProduct={handleReverseSelect}
                            />
                        </div>
                    )}
                    {/* Liability scanner panel overlay */}
                    {liabilityOpen && (
                        <div className="absolute inset-0 z-20 bg-background/80 backdrop-blur-md rounded-lg border border-border shadow-lg overflow-hidden">
                            <LiabilityPanel
                                open={liabilityOpen}
                                onClose={() => setLiabilityOpen(false)}
                            />
                        </div>
                    )}
                    {/* RFQ generator panel overlay */}
                    {rfqOpen && (
                        <div className="absolute inset-0 z-20 bg-background/80 backdrop-blur-md rounded-lg border border-border shadow-lg overflow-hidden">
                            <RfqPanel
                                open={rfqOpen}
                                onClose={() => setRfqOpen(false)}
                                answers={answers}
                                calcs={calcs}
                                productSpecs={productSpecs}
                            />
                        </div>
                    )}
                    {/* Revision Radar panel overlay */}
                    {revisionOpen && (
                        <div className="absolute inset-0 z-20 bg-background/80 backdrop-blur-md rounded-lg border border-border shadow-lg overflow-hidden">
                            <RevisionRadarPanel
                                open={revisionOpen}
                                onClose={() => setRevisionOpen(false)}
                            />
                        </div>
                    )}
                    {/* Cut-Sheet panel overlay */}
                    {cutSheetOpen && (
                        <div className="absolute inset-0 z-20 bg-background/80 backdrop-blur-md rounded-lg border border-border shadow-lg overflow-hidden">
                            <CutSheetPanel
                                open={cutSheetOpen}
                                onClose={() => setCutSheetOpen(false)}
                                answers={answers}
                                calcs={calcs}
                            />
                        </div>
                    )}
                    {/* Auto-RFP Response panel overlay */}
                    {autoRfpOpen && (
                        <div className="absolute inset-0 z-20 bg-background/80 backdrop-blur-md rounded-lg border border-border shadow-lg overflow-hidden">
                            <AutoRfpPanel
                                open={autoRfpOpen}
                                onClose={() => setAutoRfpOpen(false)}
                                projectId={projectId}
                                onApply={handleAutoRfpApply}
                            />
                        </div>
                    )}
                    {/* 3D Arena preview panel overlay */}
                    {venueOpen && (
                        <div className="absolute inset-0 z-20 bg-[#030812] rounded-lg border border-border shadow-lg overflow-hidden">
                            <EstimatorVenuePanel
                                displays={answers.displays}
                                onClose={() => setVenueOpen(false)}
                            />
                        </div>
                    )}
                </section>

                {/* Right: Copilot panel as proper grid column (pushes layout) */}
                {copilotOpen && (
                    <section className="min-w-0 min-h-0 overflow-hidden border-l border-border">
                        <EstimatorCopilot
                            answers={answers}
                            calcs={calcs}
                            onUpdateAnswers={handleChange}
                            isOpen={copilotOpen}
                            onClose={() => setCopilotOpen(false)}
                        />
                    </section>
                )}
            </main>
        </div>
    );
}
