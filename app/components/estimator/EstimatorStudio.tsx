"use client";

/**
 * EstimatorStudio — Split-screen Intelligence Mode workspace.
 *
 * Left panel:  Typeform-style questionnaire (QuestionFlow)
 * Right panel: Live Excel preview with sheet tabs (ExcelPreview)
 *
 * Same pattern as Mirror Mode (form + PDF preview) but for building estimates.
 */

import React, { useState, useCallback, useMemo, useEffect } from "react";
import { useConfirm } from "@/hooks/useConfirm";
import dynamic from "next/dynamic";
import { FileSpreadsheet, ArrowLeft, Download, Loader2, MessageSquare, Copy, ArrowRightLeft, Package, Boxes, Search, Shield, Send, GitCompare, FileText, Box, Zap, ChevronDown, PenLine, Activity } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import QuestionFlow from "./QuestionFlow";
import EstimatorCopilot from "./EstimatorCopilot";
import { calculateDisplay, type SheetTab, type ProductSpec } from "./EstimatorBridge";
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
import { useRateCard } from "@/hooks/useRateCard";
import { useEstimatorAutoSave } from "@/hooks/useEstimatorAutoSave";
import { useServerPreview } from "@/hooks/useServerPreview";
import { usePresence } from "@/hooks/usePresence";
import type { ExtractedLEDSpec } from "@/services/rfp/unified/types";

const EstimatorVenuePanel = dynamic(() => import("./EstimatorVenuePanel"), { ssr: false });
const EditableWorkbook = dynamic(() => import("@/app/tools/rfp-analyzer/_components/UniverSpreadsheet"), { ssr: false });
const UniverPreview = dynamic(() => import("./UniverPreview"), { ssr: false });
const EstimatorProductWorkbook = dynamic(() => import("./EstimatorProductWorkbook"), { ssr: false });
const EstimatorActivityPanel = dynamic(() => import("./EstimatorActivityPanel"), { ssr: false });

// Sheet colors no longer needed — Univer renders tab colors from the workbook data.

interface EstimatorStudioProps {
    projectId?: string;
    initialAnswers?: EstimatorAnswers;
    initialCellOverrides?: Record<string, string | number>;
    initialCustomSheets?: SheetTab[];
}

export default function EstimatorStudio({
    projectId,
    initialAnswers,
}: EstimatorStudioProps = {}) {
    const ADDITIONAL_ITEM_MARGIN = 0.15;
    const router = useRouter();
    const [answers, setAnswers] = useState<EstimatorAnswers>(initialAnswers || getDefaultAnswers());
    const [exporting, setExporting] = useState(false);
    const [questionsComplete, setQuestionsComplete] = useState(!!initialAnswers);
    const [editingAnswers, setEditingAnswers] = useState(!initialAnswers);
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
    const [activityOpen, setActivityOpen] = useState(false);
    const [workbookSyncMessage, setWorkbookSyncMessage] = useState<string>("");
    const [uiFeedback, setUiFeedback] = useState<{ tone: "info" | "success" | "error"; message: string } | null>(null);
    const [questionResumeTarget, setQuestionResumeTarget] = useState<{
        phase: "project" | "display" | "financial";
        step: number;
        displayIndex: number;
    } | null>(null);
    const [availableProducts, setAvailableProducts] = useState<Array<{ id: string; label: string; pitch: number; name: string }>>([]);
    const { activeUsers } = usePresence(projectId);
    // Legacy cell overrides / custom sheets kept for auto-save compatibility
    const cellOverrides: Record<string, string | number> = {};
    const customSheets: SheetTab[] = [];
    // Rate card from DB (replaces hardcoded constants)
    const { rates, loading: ratesLoading } = useRateCard();
    // WYSIWYG preview: call the same server-side generator that produces the export.
    // No fake preview. No client-side approximation. Loading state shown until ready.
    const { data: serverPreview, loading: serverPreviewLoading, error: serverPreviewError, projectTotal, displayRowMap, skipNextRebuild } = useServerPreview(answers);
    // Auto-save to DB when projectId is provided
    const { status: saveStatus } = useEstimatorAutoSave({
        projectId,
        answers,
        cellOverrides,
        customSheets,
        rates,
        totalAmount: projectTotal,
    });
    const { confirm, alert: showAlert } = useConfirm();

    const noteWorkbookSync = useCallback((message: string) => {
        setWorkbookSyncMessage(message);
    }, []);

    useEffect(() => {
        if (!uiFeedback) return;
        const timer = window.setTimeout(() => setUiFeedback(null), 4000);
        return () => window.clearTimeout(timer);
    }, [uiFeedback]);

    const venueServices = useMemo(() => {
        const enabled = answers.includeVenueServices && answers.venueServiceAnnualFee > 0;
        const years = Math.max(1, parseInt(answers.venueServiceYears || "1", 10) || 1);
        const escalationPct = Math.max(0, answers.venueServiceEscalationPct || 0) / 100;
        const marginPct = Math.max(0, Math.min(0.95, (answers.venueServiceMarginPct || 0) / 100));
        const annualFee = Math.max(0, answers.venueServiceAnnualFee || 0);
        const rows = Array.from({ length: years }, (_, index) => {
            const year = index + 1;
            const cost = annualFee * Math.pow(1 + escalationPct, index);
            const sellingPrice = marginPct < 1 ? cost / (1 - marginPct) : cost;
            return {
                year,
                cost,
                sellingPrice,
                margin: sellingPrice - cost,
            };
        });
        const totalCost = rows.reduce((sum, row) => sum + row.cost, 0);
        const totalSellingPrice = rows.reduce((sum, row) => sum + row.sellingPrice, 0);
        const totalMargin = totalSellingPrice - totalCost;
        return {
            enabled,
            years,
            annualFee,
            escalationPct,
            marginPct,
            rows,
            totalCost,
            totalSellingPrice,
            totalMargin,
        };
    }, [
        answers.includeVenueServices,
        answers.venueServiceAnnualFee,
        answers.venueServiceEscalationPct,
        answers.venueServiceMarginPct,
        answers.venueServiceYears,
    ]);

    const normalizeLocationType = useCallback((value: string) => {
        const normalized = value.trim().toLowerCase();
        if (!normalized) return "wall";
        if (normalized.includes("score")) return "scoreboard";
        if (normalized.includes("ribbon")) return "ribbon";
        if (normalized.includes("fascia")) return "fascia";
        if (normalized.includes("court")) return "courtside";
        if (normalized.includes("stanch")) return "stanchion";
        if (normalized.includes("outdoor")) return "outdoor";
        if (normalized.includes("wall")) return "wall";
        return normalized;
    }, []);

    const normalizeServiceType = useCallback((value: string) => {
        const normalized = value.trim().toLowerCase();
        if (!normalized) return "Front/Rear";
        if (normalized.includes("top")) return "Top";
        if (normalized.includes("front") || normalized.includes("rear")) return "Front/Rear";
        return value.trim();
    }, []);

    // Fetch product specs for cabinet layout calculations
    const productIds = useMemo(() =>
        answers.displays.map((d) => d.productId).filter(Boolean),
        [answers.displays]
    );
    const { specs: productSpecs } = useProductSpecs(productIds);

    useEffect(() => {
        const env = answers.isIndoor ? "indoor" : "outdoor";
        let cancelled = false;
        fetch(`/api/rfp/pipeline/products?environment=${env}`)
            .then((r) => (r.ok ? r.json() : null))
            .then((data) => {
                if (cancelled) return;
                const products = (data?.products || []).map((p: any) => ({
                    id: p.id,
                    label: p.label || p.displayName || p.modelNumber || "Unknown Product",
                    pitch: Number(p.pitch ?? p.pixelPitch ?? p.pixelPitchMm ?? 0) || 0,
                    name: p.name || p.displayName || p.modelNumber || "Unknown Product",
                }));
                setAvailableProducts(products);
            })
            .catch(() => {
                if (!cancelled) setAvailableProducts([]);
            });
        return () => {
            cancelled = true;
        };
    }, [answers.isIndoor]);

    // Calculate per-display cost breakdowns (used by copilot for query responses)
    const calcs = useMemo(() => {
        return answers.displays.map((d) => {
            const spec = d.productId ? productSpecs[d.productId] : null;
            return calculateDisplay(d, answers, rates ?? undefined, spec);
        });
    }, [answers, rates, productSpecs]);

    const workbookScreens = useMemo<ExtractedLEDSpec[]>(() => {
        return answers.displays.map((display, index) => {
            const product = display.productId ? productSpecs[display.productId] : null;
            const pitch = Number(display.pixelPitch || 0) || null;
            const productBrightness = product
                ? (
                    (product as any).brightnessNits
                    ?? (product as any).maxNits
                    ?? (product as any).typicalNits
                    ?? null
                )
                : null;
            return {
                name: display.displayName || `Display ${index + 1}`,
                location: display.locationType || "",
                widthFt: display.widthFt || 0,
                heightFt: display.heightFt || 0,
                widthPx: pitch && display.widthFt ? Math.round(display.widthFt * 304.8 / pitch) : null,
                heightPx: pitch && display.heightFt ? Math.round(display.heightFt * 304.8 / pitch) : null,
                pixelPitchMm: pitch,
                brightnessNits: productBrightness,
                environment: answers.isIndoor ? "indoor" : "outdoor",
                quantity: display.quantity || 1,
                serviceType: display.serviceType?.toLowerCase().includes("front")
                    ? "front"
                    : display.serviceType?.toLowerCase().includes("rear")
                        ? "rear"
                        : null,
                mountingType: display.locationType || null,
                maxPowerW: null,
                weightLbs: null,
                specialRequirements: [],
                confidence: 1,
                sourcePages: [],
                sourceType: "text",
                citation: "Estimator",
                notes: null,
                selectedProductId: display.productId || null,
                selectedProductName: display.productName || null,
            };
        });
    }, [answers, productSpecs]);

    const workbookPricingDisplays = useMemo(() => {
        return calcs.map((calc, index) => {
            const display = answers.displays[index];
            const spec = display?.productId ? productSpecs[display.productId] : null;
            const productBrightness = spec
                ? (
                    (spec as any).brightnessNits
                    ?? (spec as any).maxNits
                    ?? (spec as any).typicalNits
                    ?? undefined
                )
                : undefined;
            return {
                name: calc.name,
                location: display?.locationType || "",
                pixelPitch: calc.pixelPitch || null,
                areaSqFt: calc.areaSqFt,
                quantity: display?.quantity || 1,
                hardwareCost: calc.hardwareCost,
                processorCost: calc.processorCost,
                portsNeeded: calc.portsNeeded,
                processorsNeeded: calc.processorsNeeded,
                processorLabel: calc.processorLabel,
                shippingCost: calc.shippingCost,
                installCost: calc.installCost,
                structuralCost: calc.structureCost,
                electricalCost: calc.electricalCost,
                pmCost: calc.pmCost,
                engCost: calc.engineeringCost,
                totalCost: calc.totalCost,
                totalSellingPrice: calc.sellPrice,
                blendedMarginPct: calc.marginPct,
                costSource: "estimator",
                rateCardEstimate: calc.costPerSqFt || null,
                matchedProduct: spec ? {
                    manufacturer: (spec as any).manufacturer || "",
                    model: (spec as any).displayName || display?.productName || "",
                    pitch: Number((spec as any).pixelPitch ?? calc.pixelPitch ?? 0),
                    fitScore: 100,
                    activeWidthFt: calc.cabinetLayout?.actualWidthFt,
                    activeHeightFt: calc.cabinetLayout?.actualHeightFt,
                    resolutionX: calc.pixelsW,
                    resolutionY: calc.pixelsH,
                    totalModules: calc.cabinetLayout?.totalCabinets,
                    weightKgPerCab: (spec as any).weightKgPerCabinet,
                    maxPowerWPerCab: (spec as any).maxPowerWattsPerCab,
                    totalWeightLbs: calc.cabinetLayout?.totalWeightLbs,
                    totalMaxPowerW: calc.cabinetLayout?.totalPowerWatts,
                    nits: productBrightness,
                  } : null,
            };
        });
    }, [answers.displays, calcs, productSpecs]);

    const workbookPricingSummary = useMemo(() => {
        const additionalCost = answers.gameClockAllocation
            + answers.pitchClocksAllocation
            + answers.oesAllocation
            + answers.miscEquipmentAllocation;
        const additionalSellingPrice = additionalCost > 0
            ? additionalCost / (1 - ADDITIONAL_ITEM_MARGIN)
            : 0;
        const totalCost = workbookPricingDisplays.reduce((sum, d) => sum + d.totalCost, 0) + additionalCost + venueServices.totalCost;
        const totalSellingPrice = workbookPricingDisplays.reduce((sum, d) => sum + d.totalSellingPrice, 0) + additionalSellingPrice + venueServices.totalSellingPrice;
        const totalMargin = totalSellingPrice - totalCost;
        const blendedMarginPct = totalSellingPrice > 0 ? totalMargin / totalSellingPrice : 0;
        return {
            totalCost,
            totalSellingPrice,
            totalMargin,
            blendedMarginPct,
            displayCount: workbookPricingDisplays.length,
            quotedCount: workbookPricingDisplays.length,
            rateCardCount: 0,
        };
    }, [ADDITIONAL_ITEM_MARGIN, answers.gameClockAllocation, answers.miscEquipmentAllocation, answers.oesAllocation, answers.pitchClocksAllocation, venueServices.totalCost, venueServices.totalSellingPrice, workbookPricingDisplays]);

    const workbookManualAdditions = useMemo(() => {
        const toSellingPrice = (cost: number) => (cost > 0 ? cost / (1 - ADDITIONAL_ITEM_MARGIN) : 0);
        return [
            { key: "gameClockAllocation", label: "Game Clock", cost: answers.gameClockAllocation, marginPct: ADDITIONAL_ITEM_MARGIN, sellingPrice: toSellingPrice(answers.gameClockAllocation) },
            { key: "pitchClocksAllocation", label: "Pitch Clocks", cost: answers.pitchClocksAllocation, marginPct: ADDITIONAL_ITEM_MARGIN, sellingPrice: toSellingPrice(answers.pitchClocksAllocation) },
            { key: "oesAllocation", label: "OES / MIS / Timing", cost: answers.oesAllocation, marginPct: ADDITIONAL_ITEM_MARGIN, sellingPrice: toSellingPrice(answers.oesAllocation) },
            { key: "miscEquipmentAllocation", label: "DMX / Misc Equipment", cost: answers.miscEquipmentAllocation, marginPct: ADDITIONAL_ITEM_MARGIN, sellingPrice: toSellingPrice(answers.miscEquipmentAllocation) },
        ];
    }, [ADDITIONAL_ITEM_MARGIN, answers.gameClockAllocation, answers.miscEquipmentAllocation, answers.oesAllocation, answers.pitchClocksAllocation]);

    // Univer handles all editing natively — no client-side cell override logic needed.

    const handleChange = useCallback((next: EstimatorAnswers) => {
        setAnswers(next);
    }, []);

    const handleExport = useCallback(async () => {
        if (!serverPreview) {
            void showAlert({ title: "Cannot Export", description: serverPreviewError || "Workbook preview hasn't loaded yet. Wait for it to generate or check for errors." });
            return;
        }
        setExporting(true);
        setUiFeedback({ tone: "info", message: "Preparing Excel export..." });
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
            const clientName = answers.clientName || "Client";
            const defaultName = `ANC_${clientName.replace(/\s+/g, "_")}_Cost_Analysis.xlsx`;
            const downloadName = res.headers.get("Content-Disposition")?.split("filename=")[1]?.replace(/"/g, "") || defaultName;
            a.download = downloadName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            setUiFeedback({ tone: "success", message: `Export started: ${downloadName}` });
        } catch (err) {
            console.error("Export error:", err);
            setUiFeedback({ tone: "error", message: err instanceof Error ? err.message : "Export failed" });
            void showAlert({ title: "Export Failed", description: err instanceof Error ? err.message : "Unknown error" });
        } finally {
            setExporting(false);
        }
    }, [answers, serverPreview, showAlert, serverPreviewError]);

    const handleComplete = useCallback(() => {
        setQuestionsComplete(true);
        setEditingAnswers(false);
        setQuestionResumeTarget(null);
    }, []);

    const questionPanelOpen = editingAnswers && !copilotOpen;

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

    const handleInlineProductSelect = useCallback((displayIndex: number, product: { id: string; name: string; pitch: number }) => {
        setAnswers((prev) => {
            if (displayIndex < 0 || displayIndex >= prev.displays.length) return prev;
            const displays = [...prev.displays];
            displays[displayIndex] = {
                ...displays[displayIndex],
                productId: product.id,
                productName: product.name,
                pixelPitch: String(product.pitch),
            };
            return { ...prev, displays };
        });
        noteWorkbookSync(`Workbook edit synced: Display ${displayIndex + 1} product -> ${product.name}`);
    }, [noteWorkbookSync]);

    const handleInlineDisplayEdit = useCallback((displayIndex: number, field: "displayName" | "heightFt" | "widthFt", value: string) => {
        setAnswers((prev) => {
            if (displayIndex < 0 || displayIndex >= prev.displays.length) return prev;
            const displays = [...prev.displays];
            const current = { ...displays[displayIndex] } as any;
            if (field === "displayName") current.displayName = value;
            if (field === "heightFt") current.heightFt = parseFloat(value) || 0;
            if (field === "widthFt") current.widthFt = parseFloat(value) || 0;
            displays[displayIndex] = current;
            return { ...prev, displays };
        });
    }, []);

    const handleWorkbookSpecEdit = useCallback((displayIndex: number, field: string, value: number | string) => {
        setAnswers((prev) => {
            if (displayIndex < 0 || displayIndex >= prev.displays.length) return prev;
            const displays = [...prev.displays];
            const current = { ...displays[displayIndex] } as any;
            if (field === "displayName") current.displayName = typeof value === "string" ? value : String(value || "");
            if (field === "heightFt") current.heightFt = typeof value === "number" ? value || 0 : parseFloat(value) || 0;
            if (field === "widthFt") current.widthFt = typeof value === "number" ? value || 0 : parseFloat(value) || 0;
            if (field === "quantity") current.quantity = Math.max(1, Math.round(typeof value === "number" ? value || 1 : parseFloat(value) || 1));
            if (field === "pixelPitch") current.pixelPitch = String(typeof value === "number" ? value || 0 : parseFloat(value) || 0);
            if (field === "serviceType") current.serviceType = normalizeServiceType(typeof value === "string" ? value : String(value || ""));
            if (field === "locationType") current.locationType = normalizeLocationType(typeof value === "string" ? value : String(value || ""));
            displays[displayIndex] = current;
            return { ...prev, displays };
        });
        const labelMap: Record<string, string> = {
            displayName: "name",
            heightFt: "height",
            widthFt: "width",
            quantity: "quantity",
            pixelPitch: "pitch",
            serviceType: "service",
            locationType: "location",
        };
        noteWorkbookSync(`Workbook edit synced: Display ${displayIndex + 1} ${labelMap[field] || field} updated`);
    }, [normalizeLocationType, normalizeServiceType, noteWorkbookSync]);

    const handleWorkbookPricingEdit = useCallback((displayIndex: number, field: string, value: number) => {
        setAnswers((prev) => {
            if (displayIndex < 0 || displayIndex >= prev.displays.length) return prev;
            const displays = [...prev.displays];
            const current = { ...displays[displayIndex] };
            const nextOverrides = { ...(current.costOverrides || {}) };
            if (field === "hardwareCost") nextOverrides.displayCost = value;
            if (field === "processorCost") nextOverrides.processor = value;
            if (field === "shippingCost") nextOverrides.shipping = value;
            if (field === "blendedMarginPct") nextOverrides.marginPct = value;
            current.costOverrides = nextOverrides;
            displays[displayIndex] = current;
            return { ...prev, displays };
        });
        const labelMap: Record<string, string> = {
            hardwareCost: "display cost",
            processorCost: "processor cost",
            shippingCost: "shipping",
            blendedMarginPct: "margin",
        };
        noteWorkbookSync(`Workbook edit synced: Display ${displayIndex + 1} ${labelMap[field] || field} updated`);
    }, [noteWorkbookSync]);

    const handleWorkbookMarginAnalysisEdit = useCallback((itemIdx: number, field: string, value: number) => {
        setAnswers((prev) => {
            if (itemIdx < 0) return prev;
            if (itemIdx >= prev.displays.length) {
                const manualKeys = ["gameClockAllocation", "pitchClocksAllocation", "oesAllocation", "miscEquipmentAllocation"] as const;
                const targetKey = manualKeys[itemIdx - prev.displays.length];
                if (!targetKey) return prev;
                const nextValue = field === "sellingPrice"
                    ? Math.max(0, value * (1 - ADDITIONAL_ITEM_MARGIN))
                    : Math.max(0, value);
                const labelMap: Record<typeof manualKeys[number], string> = {
                    gameClockAllocation: "Game Clock",
                    pitchClocksAllocation: "Pitch Clocks",
                    oesAllocation: "OES / MIS / Timing",
                    miscEquipmentAllocation: "DMX / Misc Equipment",
                };
                noteWorkbookSync(`Workbook edit synced: ${labelMap[targetKey]} updated`);
                return { ...prev, [targetKey]: nextValue };
            }

            const currentCalc = calcs[itemIdx];
            if (!currentCalc) return prev;

            const displays = [...prev.displays];
            const current = { ...displays[itemIdx] };
            const nextOverrides = { ...(current.costOverrides || {}) };

            if (field === "cost") {
                const nonHardwareCost = currentCalc.totalCost - currentCalc.hardwareCost;
                nextOverrides.displayCost = Math.max(0, value - nonHardwareCost);
            }

            if (field === "sellingPrice" && value > 0) {
                const nextMarginPct = 1 - (currentCalc.totalCost / value);
                nextOverrides.marginPct = Math.max(0, Math.min(0.95, nextMarginPct));
            }

            current.costOverrides = nextOverrides;
            displays[itemIdx] = current;
            return { ...prev, displays };
        });
        if (itemIdx < calcs.length) {
            noteWorkbookSync(`Workbook edit synced: Display ${itemIdx + 1} margin analysis updated`);
        }
    }, [ADDITIONAL_ITEM_MARGIN, calcs, noteWorkbookSync]);

    // Inline cell editing on the Univer preview — maps LED Cost Sheet & Margin Analysis edits back to answers
    // MUST be defined after handleWorkbookPricingEdit and handleWorkbookMarginAnalysisEdit (temporal dead zone)
    const handlePreviewCellEdit = useCallback((sheetName: string, row: number, col: number, value: number | string) => {
        // ── LED Cost Sheet edits ──
        if (sheetName === "LED Cost Sheet") {
            const displayIndex = displayRowMap[row];
            if (displayIndex == null || displayIndex < 0 || displayIndex >= answers.displays.length) return;

            // Product change (col 5) — needs full rebuild to recalculate everything
            if (col === 5) {
                const productName = String(value).trim();
                const product = availableProducts.find((p) => p.name === productName || p.label === productName);
                if (product) {
                    const updated = { ...answers };
                    updated.displays = [...updated.displays];
                    updated.displays[displayIndex] = { ...updated.displays[displayIndex], productId: product.id };
                    setAnswers(updated);
                }
                return;
            }

            // Dimension / quantity edits (7=H(ft), 8=W(ft), 11=Qty)
            // Let server rebuild — Univer preview uses cached results (not live formulas)
            // so cross-sheet links only update when the server regenerates the workbook
            const fieldMap: Record<number, "heightFt" | "widthFt" | "quantity"> = { 7: "heightFt", 8: "widthFt", 11: "quantity" };
            const field = fieldMap[col];
            if (field) {
                const numValue = typeof value === "number" ? value : (parseFloat(String(value)) || 0);
                const updated = { ...answers };
                updated.displays = [...updated.displays];
                updated.displays[displayIndex] = { ...updated.displays[displayIndex], [field]: numValue };
                setAnswers(updated);
                return;
            }

            // Margin % edit (col 20)
            if (col === 20) {
                const pct = typeof value === "number" ? value : (parseFloat(String(value)) || 0);
                const marginPct = pct > 1 ? pct / 100 : pct;
                handleWorkbookPricingEdit(displayIndex, "blendedMarginPct", Math.max(0, Math.min(0.95, marginPct)));
                return;
            }

            // Selling Price edit (col 21)
            if (col === 21) {
                const sp = typeof value === "number" ? value : (parseFloat(String(value)) || 0);
                if (sp > 0) handleWorkbookMarginAnalysisEdit(displayIndex, "sellingPrice", sp);
                return;
            }
            return;
        }

        // ── Margin Analysis edits ──
        if (sheetName === "Margin Analysis") {
            const itemIdx = row - 3;
            if (itemIdx < 0) return;
            const numVal = typeof value === "number" ? value : (parseFloat(String(value)) || 0);
            if (numVal > 0) {
                handleWorkbookMarginAnalysisEdit(itemIdx, col <= 4 ? "cost" : "sellingPrice", numVal);
            }
            return;
        }
    }, [answers, displayRowMap, availableProducts, skipNextRebuild, handleWorkbookPricingEdit, handleWorkbookMarginAnalysisEdit]);

    const handleVenueServicesEdit = useCallback((field: string, value: number) => {
        setAnswers((prev) => {
            if (field === "venueServiceYears") {
                return { ...prev, includeVenueServices: true, venueServiceYears: String(Math.max(1, Math.round(value || 1))) };
            }
            if (field === "venueServiceAnnualFee") {
                return { ...prev, includeVenueServices: true, venueServiceAnnualFee: Math.max(0, value) };
            }
            if (field === "venueServiceEscalationPct") {
                return { ...prev, includeVenueServices: true, venueServiceEscalationPct: Math.max(0, value) };
            }
            if (field === "venueServiceMarginPct") {
                return { ...prev, includeVenueServices: true, venueServiceMarginPct: Math.max(0, Math.min(95, value)) };
            }
            return prev;
        });
        const labelMap: Record<string, string> = {
            venueServiceYears: "contract years",
            venueServiceAnnualFee: "year 1 cost",
            venueServiceEscalationPct: "annual escalation",
            venueServiceMarginPct: "venue services margin",
        };
        noteWorkbookSync(`Workbook edit synced: Venue Services ${labelMap[field] || field} updated`);
    }, [noteWorkbookSync]);

    const handleWorkbookProductSelect = useCallback((displayName: string, productId: string) => {
        const product = availableProducts.find((p) => p.id === productId);
        setAnswers((prev) => {
            const index = prev.displays.findIndex((d, idx) => (d.displayName || `Display ${idx + 1}`) === displayName);
            if (index === -1) return prev;
            const displays = [...prev.displays];
            displays[index] = {
                ...displays[index],
                productId,
                productName: product?.name || displays[index].productName,
                pixelPitch: product?.pitch ? String(product.pitch) : displays[index].pixelPitch,
            };
            return { ...prev, displays };
        });
        noteWorkbookSync(`Workbook edit synced: ${displayName} product -> ${product?.name || productId}`);
    }, [availableProducts, noteWorkbookSync]);

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
                    {workbookSyncMessage && (
                        <span className="max-w-[280px] truncate text-[10px] text-[#0A52EF]">
                            {workbookSyncMessage}
                        </span>
                    )}
                    {answers.displays.length > 0 && (
                        <>
                            <span className="text-[10px] text-muted-foreground">
                                {(() => {
                                    const totalQty = answers.displays.reduce((sum, d) => sum + (d.quantity || 1), 0);
                                    const uniqueCount = answers.displays.length;
                                    return totalQty > uniqueCount
                                        ? `${totalQty} displays (${uniqueCount} unique)`
                                        : `${uniqueCount} display${uniqueCount !== 1 ? "s" : ""}`;
                                })()}
                            </span>
                            {questionsComplete && !editingAnswers && (
                                <button
                                    onClick={() => {
                                    setQuestionsComplete(false);
                                    setEditingAnswers(true);
                                    setQuestionResumeTarget({
                                        phase: answers.displays.length > 0 ? "financial" : "project",
                                        step: 0,
                                        displayIndex: Math.max(answers.displays.length - 1, 0),
                                    });
                                }}
                                className="flex items-center gap-1 px-2.5 py-1.5 border border-border rounded text-xs text-muted-foreground hover:bg-muted transition-colors"
                            >
                                    <PenLine className="w-3 h-3" />
                                    Edit Answers
                                </button>
                            )}
                            {editingAnswers && (
                                <button
                                    onClick={() => {
                                        setQuestionsComplete(true);
                                        setEditingAnswers(false);
                                        setQuestionResumeTarget(null);
                                    }}
                                    className="flex items-center gap-1 px-2.5 py-1.5 border border-border rounded text-xs text-muted-foreground hover:bg-muted transition-colors"
                                >
                                    <PenLine className="w-3 h-3" />
                                    Hide Questions
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
                    {/* Active users presence indicators */}
                    {activeUsers.length > 0 && (
                        <div className="flex items-center gap-1">
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                            </span>
                            <div className="flex -space-x-1.5">
                                {activeUsers.slice(0, 3).map((u, i) => (
                                    u.userImage ? (
                                        <img key={i} src={u.userImage} alt={u.userName} className="w-5 h-5 rounded-full border border-background" />
                                    ) : (
                                        <div key={i} className="w-5 h-5 rounded-full bg-[#0A52EF] text-white text-[8px] font-bold flex items-center justify-center border border-background">
                                            {u.userName?.split(" ").map(w => w[0]).join("").slice(0, 2) || "?"}
                                        </div>
                                    )
                                ))}
                            </div>
                            {activeUsers.length > 3 && (
                                <span className="text-[9px] text-muted-foreground">+{activeUsers.length - 3}</span>
                            )}
                        </div>
                    )}
                    {/* Activity panel toggle */}
                    {projectId && (
                        <button
                            onClick={() => setActivityOpen((v) => !v)}
                            className={`flex items-center gap-1 px-2 py-1.5 rounded text-xs transition-colors ${
                                activityOpen
                                    ? "bg-[#0A52EF] text-white"
                                    : "text-muted-foreground hover:bg-muted"
                            }`}
                            title="Activity timeline"
                        >
                            <Activity className="w-3.5 h-3.5" />
                        </button>
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

            {/* Split screen — responsive grid: Questions | Excel | Activity/Copilot */}
            <main className={`flex-1 min-h-0 overflow-hidden grid transition-all duration-500 ease-in-out ${
                copilotOpen && activityOpen
                    ? !questionPanelOpen
                        ? 'grid-cols-[1fr_minmax(320px,380px)_320px]'
                        : 'grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(320px,380px)_320px]'
                    : copilotOpen
                        ? 'grid-cols-[minmax(0,1fr)_minmax(320px,380px)]'
                    : activityOpen
                            ? !questionPanelOpen
                                ? 'grid-cols-[1fr_320px]'
                                : 'grid-cols-[minmax(0,1fr)_minmax(0,1fr)_320px]'
                            : !questionPanelOpen
                                ? 'grid-cols-[1fr]'
                                : 'grid-cols-[minmax(0,1fr)_minmax(0,1fr)]'
            }`}>
                {/* Left: Questions (hidden when Lux is open or questions complete) */}
                {questionPanelOpen ? (
                    <section className="relative min-w-0 min-h-0 flex flex-col overflow-hidden bg-background border-r border-border">
                        <QuestionFlow
                            answers={answers}
                            onChange={handleChange}
                            onComplete={handleComplete}
                            productSpecs={productSpecs}
                            initialPhase={questionResumeTarget?.phase}
                            initialStep={questionResumeTarget?.step}
                            initialDisplayIndex={questionResumeTarget?.displayIndex}
                        />
                    </section>
                ) : null}

                {/* Center/Right: Excel Preview */}
                <section className="relative min-w-0 min-h-0 bg-zinc-100 dark:bg-zinc-950 flex flex-col p-3 pb-0">
                    {/* Product selector — native dropdowns like RFP Analyzer */}
                    {availableProducts.length > 0 && answers.displays.length > 0 && (
                        <div className="shrink-0 mb-2 max-h-[180px] overflow-auto rounded-lg border border-border">
                            <EstimatorProductWorkbook
                                answers={answers}
                                calcs={calcs}
                                products={availableProducts}
                                onProductSelect={(idx, product) => {
                                    setAnswers((prev) => {
                                        const displays = [...prev.displays];
                                        displays[idx] = {
                                            ...displays[idx],
                                            productId: product.id,
                                            productName: product.name,
                                            pixelPitch: String(product.pitch),
                                        };
                                        return { ...prev, displays };
                                    });
                                    noteWorkbookSync(`Product changed: Display ${idx + 1} → ${product.label}`);
                                }}
                            />
                        </div>
                    )}
                    {/* Full workbook preview */}
                    <UniverPreview
                        workbookData={serverPreview}
                        loading={serverPreviewLoading}
                        error={serverPreviewError}
                        onCellEdit={handlePreviewCellEdit}
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

                {/* Activity panel */}
                {activityOpen && (
                    <section className="min-w-0 min-h-0 overflow-hidden">
                        <EstimatorActivityPanel
                            projectId={projectId}
                            onClose={() => setActivityOpen(false)}
                            activeUsers={activeUsers}
                        />
                    </section>
                )}
            </main>

        </div>
    );
}
