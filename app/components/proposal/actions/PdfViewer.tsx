"use client";

// RHF
import { useFormContext } from "react-hook-form";

// Components
import { DynamicProposalTemplate } from "@/app/components";

// Contexts
import { useProposalContext } from "@/contexts/ProposalContext";

// Types
import { ProposalType } from "@/types";

// Debounce
import { useDebounce } from "use-debounce";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { getProposalPreviewState } from "@/lib/proposalPreviewState";

// Page width in px at 96 DPI for each layout option
const PAGE_WIDTH_PX: Record<string, number> = {
    "portrait-letter": 816,
    "portrait-legal": 816,
    "portrait-a4": 794,
    "landscape-letter": 1056,
    "landscape-legal": 1344,
    "landscape-a4": 1122,
};

/** Stable fingerprint of form data so we only regenerate PDF when data actually changed. */
function getPdfFingerprint(data: ProposalType): string {
    try {
        const d = data?.details ?? {};
        const screens = (d.screens ?? []).map((s: any) => ({
            name: s?.name,
            externalName: s?.externalName,
            customDisplayName: s?.customDisplayName,
            heightFt: s?.heightFt ?? s?.height,
            widthFt: s?.widthFt ?? s?.width,
            quantity: s?.quantity,
            pitchMm: s?.pitchMm ?? s?.pixelPitch,
            costPerSqFt: s?.costPerSqFt,
            desiredMargin: s?.desiredMargin,
            brightness: s?.brightness ?? s?.brightnessNits,
        }));
        const r = data?.receiver ?? {};
        return JSON.stringify({
            proposalId: d.proposalId,
            documentMode: d.documentMode,
            paymentTerms: (d.paymentTerms ?? "").slice(0, 200),
            additionalNotes: (d.additionalNotes ?? "").slice(0, 200),
            customProposalNotes: (d.customProposalNotes ?? "").slice(0, 200),
            showSpecifications: d.showSpecifications,
            showExhibitA: d.showExhibitA,
            showExhibitB: d.showExhibitB,
            showPaymentTerms: d.showPaymentTerms,
            showSignatureBlock: d.showSignatureBlock,
            showPricingTables: d.showPricingTables,
            pageLayout: (d as any).pageLayout,
            receiverName: r.name,
            receiverAddress: r.address,
            receiverCity: r.city,
            receiverZip: r.zipCode,
            screens,
        });
    } catch {
        return "";
    }
}

/**
 * PdfViewer - Live PDF Preview
 *
 * Always shows the live preview using DynamicProposalTemplate.
 * The preview updates in real-time as the user edits the form.
 * No redundant FinalPdf component - export actions are in Step4Export.
 */
const PdfViewer = () => {
    const { watch } = useFormContext<ProposalType>();
    const formValues = watch();
    const { generatePdf, proposalPdfLoading, pdfUrl, excelPreview, excelImportLoading } = useProposalContext();
    const previewState = getProposalPreviewState(
        formValues?.details,
        Boolean(excelPreview),
        Boolean(excelImportLoading),
    );
    const [exactPdfPreview, setExactPdfPreview] = useState(false);
    const [zoomPct, setZoomPct] = useState(100);
    const [pageNumber, setPageNumber] = useState(1);
    const [compareMode, setCompareMode] = useState(false);
    const [baselineValues, setBaselineValues] = useState<ProposalType | null>(null);
    const [showControls, setShowControls] = useState(false);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const isDraggingRef = useRef(false);
    const wasDraggedRef = useRef(false);
    const dragStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
    const lastGeneratedFingerprint = useRef<string>("");
    const isGenerating = useRef(false);

    // Page-simulation: measure container width and scale template to fit
    const containerRef = useRef<HTMLDivElement>(null);
    const [containerWidth, setContainerWidth] = useState(0);
    const pageLayout = ((formValues?.details as any)?.pageLayout || "portrait-letter") as string;
    const pageWidthPx = PAGE_WIDTH_PX[pageLayout] || 816;

    const measureContainer = useCallback(() => {
        if (containerRef.current) {
            setContainerWidth(containerRef.current.clientWidth);
        }
    }, []);

    useEffect(() => {
        measureContainer();
        const observer = new ResizeObserver(measureContainer);
        if (containerRef.current) observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, [measureContainer]);

    const scaleFactor = containerWidth > 0 ? Math.min(1, containerWidth / pageWidthPx) : 1;
    const effectiveScale = scaleFactor * (zoomPct / 100);

    // Store generatePdf in a ref so it doesn't cause effect re-runs
    const generatePdfRef = useRef(generatePdf);
    generatePdfRef.current = generatePdf;

    const debounceMs = useMemo(() => (exactPdfPreview ? 2500 : 300), [exactPdfPreview]);
    const [debouncedValues] = useDebounce(formValues, debounceMs);

    // Cast to any to accept the custom prop without TS errors
    const Template = DynamicProposalTemplate as any;

    // Memoized fingerprint to avoid recalculating on every render
    const currentFingerprint = useMemo(() => getPdfFingerprint(debouncedValues), [debouncedValues]);

    // Only trigger generation when fingerprint actually changes and we're in exact mode
    useEffect(() => {
        if (!exactPdfPreview) {
            lastGeneratedFingerprint.current = "";
            isGenerating.current = false;
            return;
        }

        // Skip if already generating or fingerprint hasn't changed
        if (isGenerating.current) return;
        if (currentFingerprint === lastGeneratedFingerprint.current) return;

        // Mark as generating and store fingerprint BEFORE calling
        isGenerating.current = true;
        lastGeneratedFingerprint.current = currentFingerprint;

        generatePdfRef.current(debouncedValues).finally(() => {
            isGenerating.current = false;
        });
    }, [currentFingerprint, exactPdfPreview, debouncedValues]);

    useEffect(() => {
        if (zoomPct <= 100) setPan({ x: 0, y: 0 });
    }, [zoomPct]);

    const captureBaseline = useCallback(() => {
        const snapshot = JSON.parse(JSON.stringify(getPdfFingerprint(formValues) ? formValues : debouncedValues)) as ProposalType;
        setBaselineValues(snapshot);
    }, [debouncedValues, formValues]);

    const onMouseDown = useCallback((e: React.MouseEvent) => {
        if (exactPdfPreview || zoomPct <= 100) return;
        isDraggingRef.current = true;
        wasDraggedRef.current = false;
        dragStartRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
    }, [exactPdfPreview, zoomPct, pan.x, pan.y]);

    const onMouseMove = useCallback((e: React.MouseEvent) => {
        if (!isDraggingRef.current) return;
        const dx = e.clientX - dragStartRef.current.x;
        const dy = e.clientY - dragStartRef.current.y;
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
            wasDraggedRef.current = true;
        }
        setPan({
            x: dragStartRef.current.panX + dx,
            y: dragStartRef.current.panY + dy,
        });
    }, []);

    const onMouseUp = useCallback(() => {
        isDraggingRef.current = false;
    }, []);

    const onPreviewClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        if (wasDraggedRef.current) {
            wasDraggedRef.current = false;
            return;
        }
        const target = e.target as HTMLElement | null;
        if (!target) return;
        const sectionEl = target.closest("[data-preview-section]") as HTMLElement | null;
        const section = sectionEl?.dataset?.previewSection;
        if (!section) return;
        window.dispatchEvent(new CustomEvent("anc-focus-control", { detail: { section } }));
    }, []);

    const iframeSrc = useMemo(() => {
        if (!pdfUrl) return "";
        const safePage = Math.max(1, pageNumber || 1);
        if (exactPdfPreview) {
            return `${pdfUrl}#page=${safePage}&zoom=page-width`;
        }
        const safeZoom = Math.max(50, Math.min(200, zoomPct || 100));
        return `${pdfUrl}#page=${safePage}&zoom=${safeZoom}`;
    }, [pdfUrl, pageNumber, zoomPct, exactPdfPreview]);

    return (
        <div className="w-full h-full flex flex-col items-center">
            <div className="w-full shrink-0 px-4 py-3 border-b border-border bg-background/60">
                <div className="flex items-center justify-between">
                    <div className="text-xs font-semibold tracking-wide">
                        {exactPdfPreview ? "Exact PDF Preview" : "Live Preview"}
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setShowControls((v) => !v)}
                            className="px-2 py-1 rounded border border-border text-[11px] hover:bg-muted/60"
                        >
                            {showControls ? "Hide Tools" : "Show Tools"}
                        </button>
                        <div className="h-5 w-px bg-border mx-1" />
                        <div className="text-[11px] text-muted-foreground">Exact PDF</div>
                        <Switch checked={exactPdfPreview} onCheckedChange={setExactPdfPreview} />
                    </div>
                </div>
                {showControls && (
                    <div className="flex items-center gap-2 mt-3 flex-wrap">
                        <button
                            type="button"
                            onClick={() => setZoomPct((z) => Math.max(50, z - 10))}
                            disabled={exactPdfPreview}
                            className="px-2 py-1 rounded border border-border text-[11px] hover:bg-muted/60 disabled:opacity-50"
                        >
                            -
                        </button>
                        <span className="text-[11px] w-12 text-center tabular-nums">{zoomPct}%</span>
                        <button
                            type="button"
                            onClick={() => setZoomPct((z) => Math.min(200, z + 10))}
                            disabled={exactPdfPreview}
                            className="px-2 py-1 rounded border border-border text-[11px] hover:bg-muted/60 disabled:opacity-50"
                        >
                            +
                        </button>
                        <button
                            type="button"
                            onClick={() => setZoomPct(100)}
                            disabled={exactPdfPreview}
                            className="px-2 py-1 rounded border border-border text-[11px] hover:bg-muted/60 disabled:opacity-50"
                        >
                            100%
                        </button>
                        <div className="h-5 w-px bg-border mx-1" />
                        <button
                            type="button"
                            onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
                            disabled={!exactPdfPreview}
                            className="px-2 py-1 rounded border border-border text-[11px] hover:bg-muted/60 disabled:opacity-50"
                        >
                            Prev
                        </button>
                        <span className="text-[11px]">Page</span>
                        <input
                            type="number"
                            min={1}
                            value={pageNumber}
                            disabled={!exactPdfPreview}
                            onChange={(e) => setPageNumber(Math.max(1, Number(e.target.value) || 1))}
                            className="w-14 h-7 rounded border border-border bg-background px-2 text-[11px]"
                        />
                        <button
                            type="button"
                            onClick={() => setPageNumber((p) => Math.max(1, p + 1))}
                            disabled={!exactPdfPreview}
                            className="px-2 py-1 rounded border border-border text-[11px] hover:bg-muted/60 disabled:opacity-50"
                        >
                            Next
                        </button>
                        {!exactPdfPreview && (
                            <>
                                <div className="h-5 w-px bg-border mx-1" />
                                <button
                                    type="button"
                                    onClick={captureBaseline}
                                    className="px-2 py-1 rounded border border-border text-[11px] hover:bg-muted/60"
                                >
                                    Set Baseline
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setCompareMode((v) => !v)}
                                    disabled={!baselineValues}
                                    className="px-2 py-1 rounded border border-border text-[11px] hover:bg-muted/60 disabled:opacity-50"
                                >
                                    {compareMode ? "Exit Compare" : "Compare to Baseline"}
                                </button>
                            </>
                        )}
                    </div>
                )}
            </div>

            <div
                ref={containerRef}
                className={exactPdfPreview ? "w-full flex-1 min-h-0 overflow-hidden" : "w-full flex-1 min-h-0 overflow-y-auto overflow-x-hidden"}
                onMouseMove={onMouseMove}
                onMouseUp={onMouseUp}
                onMouseLeave={onMouseUp}
            >
                {exactPdfPreview ? (
                    pdfUrl ? (
                        <iframe className="w-full h-full border-0" src={iframeSrc} title="PDF Preview" />
                    ) : (
                        <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                            {proposalPdfLoading ? "Generating PDF..." : "PDF preview will appear after generation."}
                        </div>
                    )
                ) : Template ? (
                    (() => {
                        if (previewState !== "template") {
                            return (
                                <div className="flex flex-col items-center justify-center h-full text-center p-8 bg-muted/20 rounded-xl border border-dashed border-border">
                                    {previewState === "excel-loading" ? (
                                        <>
                                            <div className="w-8 h-8 border-2 border-brand-blue/30 border-t-brand-blue rounded-full animate-spin mb-4" />
                                            <p className="text-sm font-medium text-foreground">Building Preview</p>
                                            <p className="text-xs text-muted-foreground mt-2 max-w-[220px]">AI is reading your spreadsheet and extracting pricing data. This usually takes 10-15 seconds.</p>
                                        </>
                                    ) : previewState === "mode-unselected" ? (
                                        <>
                                            <p className="text-sm font-medium text-foreground">Choose a workflow</p>
                                            <p className="text-xs text-muted-foreground mt-2 max-w-[240px]">Select Upload Excel or Build from Scratch to start the live preview.</p>
                                        </>
                                    ) : (
                                        <>
                                            <p className="text-sm font-medium text-foreground">Live Preview</p>
                                            <p className="text-xs text-muted-foreground mt-2 max-w-[220px]">Upload an Excel file to see your proposal preview here.</p>
                                        </>
                                    )}
                                </div>
                            );
                        }
                        const renderTemplate = (values: ProposalType, scale?: number) => {
                            const s = scale ?? effectiveScale;
                            const scaledWidth = pageWidthPx * s;
                            return (
                                <div style={{ width: `${scaledWidth}px`, maxWidth: "100%" }}>
                                    <div
                                        onMouseDown={onMouseDown}
                                        onClick={onPreviewClick}
                                        style={{
                                            width: `${pageWidthPx}px`,
                                            transformOrigin: "top left",
                                            transform: `translate(${pan.x}px, ${pan.y}px) scale(${s})`,
                                            cursor: !exactPdfPreview && zoomPct > 100 ? "grab" : "default",
                                        }}
                                    >
                                        <Template {...values} />
                                    </div>
                                </div>
                            );
                        };
                        if (compareMode && baselineValues) {
                            const halfWidth = Math.max(100, (containerWidth - 24) / 2);
                            const compareScale = Math.min(1, halfWidth / pageWidthPx) * (zoomPct / 100);
                            return (
                                <div className="p-2">
                                    <div className="flex gap-3">
                                        <div className="flex-1 min-w-0">
                                            <div className="text-[11px] font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                                                <span className="w-2 h-2 rounded-full bg-rose-400 inline-block" />
                                                Before (baseline)
                                            </div>
                                            <div className="border border-border rounded-lg overflow-hidden bg-white" style={{ height: `${halfWidth * 1.4}px`, overflowY: "auto" }}>
                                                <div style={{ width: `${pageWidthPx}px`, transformOrigin: "top left", transform: `scale(${compareScale})` }}>
                                                    <Template {...baselineValues} />
                                                </div>
                                            </div>
                                        </div>
                                        <div className="w-px bg-border shrink-0" />
                                        <div className="flex-1 min-w-0">
                                            <div className="text-[11px] font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                                                <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
                                                After (live)
                                            </div>
                                            <div className="border border-border rounded-lg overflow-hidden bg-white" style={{ height: `${halfWidth * 1.4}px`, overflowY: "auto" }}>
                                                <div style={{ width: `${pageWidthPx}px`, transformOrigin: "top left", transform: `scale(${compareScale})` }}>
                                                    <Template {...debouncedValues} />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        }
                        return (
                            <div className="p-2">
                                <div className="text-[11px] text-muted-foreground mb-2">
                                    {baselineValues
                                        ? "Baseline saved. Click 'Compare to Baseline' to view before vs after."
                                        : "No baseline yet. Click 'Set Baseline' first, then compare."}
                                </div>
                                {renderTemplate(debouncedValues)}
                            </div>
                        );
                    })()
                ) : (
                    <div className="flex items-center justify-center h-full text-gray-400">
                        Generator Loading...
                    </div>
                )}
            </div>
        </div>
    );
};

export default PdfViewer;
