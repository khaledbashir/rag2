"use client";

import React from "react";
import { useFormContext, useWatch } from "react-hook-form";
import {
    Calculator,
    DollarSign,
    Settings2,
    Percent,
    TrendingUp,
    AlertCircle,
    Info,
    Shield,
    Hammer,
    Truck,
    Sparkles,
    Receipt,
    Plus,
    Trash2,
    Wand2,
    GripVertical,
    Package,
} from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import AuditTable from "@/app/components/proposal/AuditTable";
import { formatCurrency } from "@/lib/helpers";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { calculateProposalAudit } from "@/lib/estimator";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Textarea } from "@/components/ui/textarea";
import { BaseButton } from "@/app/components";

/**
 * P58: Sortable Quote Item — drag handle + inline editing
 */
const SortableQuoteItem = ({
    item,
    index,
    onUpdate,
    onRemove,
}: {
    item: any;
    index: number;
    onUpdate: (idx: number, patch: any) => void;
    onRemove: (idx: number) => void;
}) => {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    };

    return (
        <div ref={setNodeRef} style={style} className="rounded-2xl border border-border bg-card/30 p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
                <button
                    type="button"
                    className="p-1 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none"
                    {...attributes}
                    {...listeners}
                >
                    <GripVertical className="w-4 h-4" />
                </button>
                <div className="flex-1">
                    <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Location</Label>
                    <Input
                        value={item.locationName || ""}
                        onChange={(e) => onUpdate(index, { locationName: e.target.value })}
                        className="mt-2 bg-background border-input text-foreground"
                    />
                </div>
                <div className="w-[180px]">
                    <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Price</Label>
                    <Input
                        value={String(item.price ?? "")}
                        onChange={(e) => onUpdate(index, { price: Number(e.target.value || 0) })}
                        className="mt-2 bg-background border-input text-foreground"
                        inputMode="decimal"
                    />
                </div>
                <button
                    type="button"
                    onClick={() => onRemove(index)}
                    className="mt-6 p-2 rounded-xl border border-border bg-muted text-muted-foreground hover:text-foreground hover:border-brand-blue/30 transition-colors"
                    title="Remove item"
                >
                    <Trash2 className="w-4 h-4" />
                </button>
            </div>
            <div>
                <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Description</Label>
                <Textarea
                    value={item.description || ""}
                    onChange={(e) => onUpdate(index, { description: e.target.value })}
                    className="mt-2 bg-background border-input text-foreground min-h-[84px]"
                />
            </div>
        </div>
    );
};

const Step3Math = () => {
    const { control, setValue, watch, getValues } = useFormContext();
    const internalAudit = useWatch({
        name: "details.internalAudit",
        control,
    });

    const screens = watch("details.screens") || [];
    const quoteItems = watch("details.quoteItems") || [];
    const bondRate = useWatch({ name: "details.bondRate", control }) || 1.5;
    const mirrorModeFlag = useWatch({ name: "details.mirrorMode", control });
    const pricingDocument = useWatch({ name: "details.pricingDocument" as any, control });
    const isMirrorMode =
        mirrorModeFlag === true || ((pricingDocument as any)?.tables?.length ?? 0) > 0;
    const mirrorMode = isMirrorMode;

    if (isMirrorMode) return null;

    // P58: Drag-to-reorder sensors
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        const oldIndex = quoteItems.findIndex((it: any) => it.id === active.id);
        const newIndex = quoteItems.findIndex((it: any) => it.id === over.id);
        if (oldIndex !== -1 && newIndex !== -1) {
            setQuoteItems(arrayMove(quoteItems, oldIndex, newIndex));
        }
    };

    // P58: Add item from product catalog
    const addFromCatalog = async () => {
        try {
            const res = await fetch("/api/products?active=true");
            const data = await res.json();
            const products = data.products || [];
            if (products.length === 0) {
                addQuoteItem();
                return;
            }
            // Add first 3 products as sample items (user can edit)
            const newItems = products.slice(0, 3).map((p: any) => ({
                id: newId(),
                locationName: p.displayName || p.modelNumber,
                description: `${p.manufacturer} ${p.productFamily} — ${p.pixelPitch}mm, ${p.maxNits} nits, ${p.environment}`,
                price: 0,
            }));
            setQuoteItems([...quoteItems, ...newItems]);
        } catch {
            addQuoteItem();
        }
    };

    // Global pricing controls
    const globalMargin = useWatch({ name: "details.globalMargin", control });
    const globalBondRate = useWatch({ name: "details.globalBondRate", control }) || 1.5;

    // Per-category margins (ANC standard: LED 30%, Services 20%, CMS 35%)
    const categoryMargins = useWatch({ name: "details.categoryMargins", control }) || {
        led: 0.30, services: 0.20, cms: 0.35,
    };
    const [useCategoryMargins, setUseCategoryMargins] = React.useState(
        () => !!(getValues("details.categoryMargins")),
    );

    const totals = internalAudit?.totals;
    const sellPricePerSqFt = totals?.sellingPricePerSqFt || 0;
    const totalProjectValue = totals?.finalClientTotal || 0;
    const structuralLabor = totals?.labor || 0;
    const shippingLogistics = totals?.shipping || 0;
    const romTotals = (screens || []).reduce(
        (acc: any, s: any) => {
            const ex = s?.calculatedExhibitG;
            const pr = s?.calculatedPricing;
            acc.maxPowerW += Number(ex?.maxPowerW || 0);
            acc.totalWeightLbs += Number(ex?.totalWeightLbs || 0);
            acc.installCost += Number(pr?.installCost || 0);
            acc.pmCost += Number(pr?.pmCost || 0);
            acc.engCost += Number(pr?.engCost || 0);
            const hw = pr?.hardwareCost;
            if (typeof hw === "number" && Number.isFinite(hw)) acc.hardwareCost += hw;
            return acc;
        },
        {
            maxPowerW: 0,
            totalWeightLbs: 0,
            installCost: 0,
            pmCost: 0,
            engCost: 0,
            hardwareCost: 0,
        }
    );
    const romGrandTotal =
        romTotals.installCost + romTotals.pmCost + romTotals.engCost + romTotals.hardwareCost;

    const newId = () => {
        if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
            return (crypto as any).randomUUID();
        }
        return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    };

    const setQuoteItems = (items: any[]) => {
        setValue("details.quoteItems", items, { shouldDirty: true, shouldValidate: true });
    };

    const addQuoteItem = () => {
        setQuoteItems([
            ...quoteItems,
            { id: newId(), locationName: "NEW ITEM", description: "", price: 0 },
        ]);
    };

    const removeQuoteItem = (index: number) => {
        const next = [...quoteItems];
        next.splice(index, 1);
        setQuoteItems(next);
    };

    const updateQuoteItem = (index: number, patch: any) => {
        const next = [...quoteItems];
        next[index] = { ...next[index], ...patch };
        setQuoteItems(next);
    };

    const toWholeFeet = (value: any) => {
        const n = Number(value);
        if (!isFinite(n)) return "";
        return `${Math.round(n)}'`;
    };

    const toExactFeet = (value: any) => {
        const n = Number(value);
        if (!isFinite(n)) return "";
        return `${(Math.round(n * 100) / 100).toFixed(2)}'`;
    };

    const buildDescriptionFromScreen = (screen: any) => {
        const serviceType = (screen?.serviceType || "").toString().toLowerCase();
        const serviceLabel = serviceType.includes("top") ? "Ribbon Display" : serviceType ? "Video Display" : "Display";
        const heightFt = screen?.heightFt ?? screen?.height;
        const widthFt = screen?.widthFt ?? screen?.width;
        const pitchMm = screen?.pitchMm ?? screen?.pixelPitch;
        const qty = screen?.quantity || 1;
        const brightness = screen?.brightnessNits ?? screen?.brightness ?? screen?.nits;
        const label = (screen?.externalName || screen?.name || "Display").toString().trim() || "Display";

        const parts: string[] = [];
        parts.push(`${label} - ${serviceLabel}`);
        if (heightFt != null && widthFt != null && Number(heightFt) > 0 && Number(widthFt) > 0) {
            parts.push(`${toWholeFeet(heightFt)} H x ${toWholeFeet(widthFt)} W`);
            parts.push(`${toExactFeet(heightFt)} H x ${toExactFeet(widthFt)} W`);
        }
        if (pitchMm != null && Number(pitchMm) > 0) {
            let np = Number(pitchMm);
            if (np > 100) np /= 100;
            if (np > 50) np /= 10;
            parts.push(`${np < 2 ? np.toFixed(2) : (np % 1 === 0 ? Math.round(np) : np.toFixed(2))}mm`);
        }
        if (brightness != null && brightness !== "" && Number(brightness) > 0) {
            parts.push(`${Number(brightness).toLocaleString()} Brightness`);
        }
        parts.push(`QTY ${qty}`);
        return parts.filter(Boolean).join(" - ");
    };

    const autofillQuoteFromScreens = () => {
        const perScreen = internalAudit?.perScreen || [];
        const items = (screens || []).map((s: any, idx: number) => {
            const auditRow = perScreen.find((r: any) => r.id === s.id || r.name === s.name);
            const price = auditRow?.breakdown?.finalClientTotal || auditRow?.breakdown?.sellPrice || 0;
            return {
                id: s.id || newId(),
                locationName: (s.externalName || s.name || `ITEM ${idx + 1}`).toString().toUpperCase(),
                description: buildDescriptionFromScreen(s),
                price: Number(price) || 0,
            };
        });
        setQuoteItems(items);
    };

    // Apply per-category margins to all screens
    const applyCategoryMargins = (margins: { led?: number; services?: number; cms?: number }) => {
        const currentScreens = getValues("details.screens") || [];
        const merged = { ...categoryMargins, ...margins };
        setValue("details.categoryMargins", merged, { shouldDirty: true });

        // Update all screens with category margins
        const updatedScreens = currentScreens.map((s: any) => ({
            ...s,
            categoryMargins: merged,
        }));
        setValue("details.screens", updatedScreens, { shouldValidate: true, shouldDirty: true });

        // Recalculate audit
        try {
            const audit = calculateProposalAudit(updatedScreens, {
                taxRate: getValues("details.taxRateOverride"),
                bondPct: getValues("details.bondRateOverride"),
                structuralTonnage: getValues("details.metadata.structuralTonnage"),
                reinforcingTonnage: getValues("details.metadata.reinforcingTonnage"),
                projectAddress: `${getValues("receiver.address") ?? ""} ${getValues("receiver.city") ?? ""} ${getValues("receiver.zipCode") ?? ""} ${getValues("details.location") ?? ""}`.trim(),
                venue: getValues("details.venue"),
            });
            setValue("details.internalAudit", audit.internalAudit);
            setValue("details.clientSummary", audit.clientSummary);
        } catch (e) {
            console.error("Category margin recalc failed", e);
        }
    };

    // Switch between category and global margin modes
    const toggleCategoryMode = (enabled: boolean) => {
        setUseCategoryMargins(enabled);
        if (enabled) {
            // Switch to category mode with ANC defaults
            const defaults = { led: 0.30, services: 0.20, cms: 0.35 };
            applyCategoryMargins(defaults);
        } else {
            // Switch back to global mode — clear categoryMargins from screens
            setValue("details.categoryMargins", undefined, { shouldDirty: true });
            const currentScreens = getValues("details.screens") || [];
            const updatedScreens = currentScreens.map((s: any) => {
                const { categoryMargins: _, ...rest } = s;
                return rest;
            });
            setValue("details.screens", updatedScreens, { shouldValidate: true, shouldDirty: true });
            applyGlobalMargin(globalMargin || 0.25);
        }
    };

    // Apply global margin to all screens
    const applyGlobalMargin = (margin: number) => {
        const currentScreens = getValues("details.screens") || [];

        // Update all screens with new margin - FORCE DEEP CLONE
        const updatedScreens = currentScreens.map((s: any) => ({
            ...s,
            desiredMargin: margin,
            // If we wanted to be extra safe, we could wipe derived values to force recalc
            // but calculateProposalAudit should handle it based on inputs
        }));

        // Update screens in form - Use object with timestamp to force change detection if needed
        setValue("details.screens", updatedScreens, { shouldValidate: true, shouldDirty: true });
        setValue("details.globalMargin", margin, { shouldValidate: true, shouldDirty: true });

        // Recalculate audit IMMEDIATELY to update UI
        try {
            const audit = calculateProposalAudit(updatedScreens, {
                taxRate: getValues("details.taxRateOverride"),
                bondPct: getValues("details.bondRateOverride"),
                structuralTonnage: getValues("details.metadata.structuralTonnage"),
                reinforcingTonnage: getValues("details.metadata.reinforcingTonnage"),
                projectAddress: `${getValues("receiver.address") ?? ""} ${getValues("receiver.city") ?? ""} ${getValues("receiver.zipCode") ?? ""} ${getValues("details.location") ?? ""}`.trim(),
                venue: getValues("details.venue"),
            });
            setValue("details.internalAudit", audit.internalAudit);
            setValue("details.clientSummary", audit.clientSummary);
        } catch (e) {
            console.error("Audit recalc failed", e);
        }
    };

    // Apply global bond rate
    const applyGlobalBondRate = (rate: number) => {
        setValue("details.bondRate", rate);
        setValue("details.globalBondRate", rate);
        setValue("details.bondRateOverride", rate);

        // Recalculate audit with new bond rate
        try {
            const currentScreens = getValues("details.screens") || [];
            const audit = calculateProposalAudit(currentScreens, {
                taxRate: getValues("details.taxRateOverride"),
                bondPct: rate,
                structuralTonnage: getValues("details.metadata.structuralTonnage"),
                reinforcingTonnage: getValues("details.metadata.reinforcingTonnage"),
                projectAddress: `${getValues("receiver.address") ?? ""} ${getValues("receiver.city") ?? ""} ${getValues("receiver.zipCode") ?? ""} ${getValues("details.location") ?? ""}`.trim(),
                venue: getValues("details.venue"),
            });
            setValue("details.internalAudit", audit.internalAudit);
            setValue("details.clientSummary", audit.clientSummary);
        } catch (e) {
            console.error("Audit recalc failed", e);
        }
    };

    return (
        <TooltipProvider>
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 p-6">
                {/* Natalia Math Engine Status */}
                <div className="bg-muted/50 border border-border rounded-2xl p-6 relative overflow-hidden">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <div className="absolute top-0 right-0 p-8 opacity-10 hover:opacity-20 rotate-12 transition-opacity cursor-default" aria-hidden>
                                <Sparkles className="w-24 h-24 text-brand-blue" />
                            </div>
                        </TooltipTrigger>
                        <TooltipContent side="left" className="max-w-[200px]">
                            <p className="text-xs">Natalia Math Engine — strategic pricing and margin verification</p>
                        </TooltipContent>
                    </Tooltip>

                    <div className="flex items-center justify-between mb-8 relative z-10">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-brand-blue/20 text-brand-blue">
                                <Calculator className="w-5 h-5" />
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-foreground italic tracking-tight">Natalia Math Engine</h2>
                                <p className="text-muted-foreground text-[10px] uppercase tracking-[0.2em] font-bold">Math Verification</p>
                            </div>
                        </div>

                        {mirrorMode ? (
                            <Badge className="bg-brand-blue/10 text-brand-blue border-brand-blue/20 px-3 py-1 flex items-center gap-2">
                                <Shield className="w-3 h-3" />
                                Excel Pass-Through Active
                            </Badge>
                        ) : (
                            <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 px-3 py-1 flex items-center gap-2">
                                <TrendingUp className="w-3 h-3" />
                                Optimizing Strategic Margins
                            </Badge>
                        )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 relative z-10">
                        {/* KPI 1: Selling Price / SqFt */}
                        <div className="bg-card p-4 rounded-xl border border-border group hover:border-brand-blue/30 transition-all shadow-sm">
                            <div className="flex items-center gap-2 text-muted-foreground mb-1">
                                <DollarSign className="w-3 h-3" />
                                <span className="text-[10px] font-bold uppercase tracking-wider">Selling Price / SQFT</span>
                            </div>
                            <div className="text-xl font-bold text-foreground tracking-tight">
                                {formatCurrency(sellPricePerSqFt, Math.abs(sellPricePerSqFt || 0) < 0.01 ? "—" : undefined)}
                            </div>
                        </div>

                        {/* KPI 2: Structural Labor - hide when N/A (0) */}
                        {(structuralLabor == null || Math.abs(structuralLabor || 0) >= 0.01) && (
                        <div className="bg-card p-4 rounded-xl border border-border group hover:border-brand-blue/30 transition-all shadow-sm">
                            <div className="flex items-center gap-2 text-muted-foreground mb-1">
                                <Hammer className="w-3 h-3" />
                                <span className="text-[10px] font-bold uppercase tracking-wider">Structural Labor (15%)</span>
                            </div>
                            <div className="text-xl font-bold text-foreground tracking-tight">
                                {formatCurrency(structuralLabor)}
                            </div>
                        </div>
                        )}

                        {/* KPI 3: Shipping - hide when N/A (0) */}
                        {(shippingLogistics == null || Math.abs(shippingLogistics || 0) >= 0.01) && (
                        <div className="bg-card p-4 rounded-xl border border-border group hover:border-brand-blue/30 transition-all shadow-sm">
                            <div className="flex items-center gap-2 text-muted-foreground mb-1">
                                <Truck className="w-3 h-3" />
                                <span className="text-[10px] font-bold uppercase tracking-wider">Shipping & Logistics</span>
                            </div>
                            <div className="text-xl font-bold text-foreground tracking-tight">
                                {formatCurrency(shippingLogistics)}
                            </div>
                        </div>
                        )}

                        {/* KPI 4: Final Client Total - always show; display actual total or — */}
                        <div className="bg-brand-blue/10 p-4 rounded-xl border border-brand-blue/20 group hover:border-brand-blue/40 transition-all">
                            <div className="flex items-center gap-2 text-brand-blue mb-1">
                                <TrendingUp className="w-3 h-3" />
                                <span className="text-[10px] font-bold uppercase tracking-wider">Final Client Total</span>
                            </div>
                            <div className="text-xl font-bold text-foreground tracking-tight">
                                {formatCurrency(totalProjectValue, Math.abs(totalProjectValue || 0) < 0.01 ? "—" : undefined)}
                            </div>
                        </div>
                    </div>
                </div>

                {!mirrorMode && (
                    <Card className="bg-card border-border shadow-sm">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-sm font-bold text-foreground uppercase tracking-tight">
                                ROM Estimate
                            </CardTitle>
                            <CardDescription className="text-xs text-muted-foreground">
                                Estimated from density constants — not from Excel data.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <div className="rounded-xl border border-border bg-muted/20 p-3">
                                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Max Power</div>
                                    <div className="text-base font-bold text-foreground mt-1">
                                        {Math.round(romTotals.maxPowerW).toLocaleString("en-US")} W
                                    </div>
                                </div>
                                <div className="rounded-xl border border-border bg-muted/20 p-3">
                                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Total Weight</div>
                                    <div className="text-base font-bold text-foreground mt-1">
                                        {Math.round(romTotals.totalWeightLbs).toLocaleString("en-US")} lbs
                                    </div>
                                </div>
                                <div className="rounded-xl border border-border bg-muted/20 p-3">
                                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Install Labor</div>
                                    <div className="text-base font-bold text-foreground mt-1">
                                        {formatCurrency(romTotals.installCost)}
                                    </div>
                                </div>
                                <div className="rounded-xl border border-border bg-muted/20 p-3">
                                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">PM Cost</div>
                                    <div className="text-base font-bold text-foreground mt-1">
                                        {formatCurrency(romTotals.pmCost)}
                                    </div>
                                </div>
                                <div className="rounded-xl border border-border bg-muted/20 p-3">
                                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Engineering</div>
                                    <div className="text-base font-bold text-foreground mt-1">
                                        {formatCurrency(romTotals.engCost)}
                                    </div>
                                </div>
                                <div className="rounded-xl border border-border bg-muted/20 p-3">
                                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Hardware</div>
                                    <div className="text-base font-bold text-foreground mt-1">
                                        {romTotals.hardwareCost > 0 ? formatCurrency(romTotals.hardwareCost) : "—"}
                                    </div>
                                </div>
                                <div className="rounded-xl border border-brand-blue/30 bg-brand-blue/10 p-3">
                                    <div className="text-[10px] uppercase tracking-wider text-brand-blue font-bold">ROM Grand Total</div>
                                    <div className="text-lg font-bold text-foreground mt-1">
                                        {formatCurrency(romGrandTotal)}
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Calculation Mode Toggle Card */}
                <Card className="bg-card border-border shadow-sm">
                    <CardContent className="p-6 flex items-center justify-between">
                        <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                                <p className="text-muted-foreground text-[11px] font-bold uppercase tracking-wider">
                                    Calculation Mode
                                </p>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Info className="w-3.5 h-3.5 text-muted-foreground hover:text-brand-blue transition-colors cursor-help" />
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="max-w-xs bg-popover border-border text-popover-foreground p-3">
                                        <p className="text-xs leading-relaxed">
                                            <strong className="text-brand-blue">Pass-Through Mode:</strong> Enable this to ignore internal calculations and mirror the exact rows and prices from an uploaded Estimator Excel for 1:1 PDF skinning.
                                        </p>
                                    </TooltipContent>
                                </Tooltip>
                            </div>

                            <h3 className="text-base font-bold text-foreground">
                                {mirrorMode ? "Excel Pass-Through Active" : "Strategic Estimator Active"}
                            </h3>
                            <p className="text-muted-foreground text-[10px] mt-1 italic font-medium">
                                {mirrorMode
                                    ? "Locking values to imported Master Excel for verification accuracy."
                                    : "Using proprietary margin logic and formulaic overrides."
                                }
                            </p>
                        </div>
                        <Switch
                            checked={mirrorMode}
                            onCheckedChange={(checked) => setValue("details.mirrorMode", checked)}
                            className="data-[state=checked]:bg-brand-blue"
                        />
                    </CardContent>
                </Card>

                {/* Sales Quotation Items - Intelligence Mode only */}
                {!mirrorMode && (<Card className="bg-muted/50 border-border">
                    <CardHeader className="pb-3 border-b border-border">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-brand-blue/20">
                                <Receipt className="w-5 h-5 text-brand-blue" />
                            </div>
                            <div className="flex-1">
                                <CardTitle className="text-foreground text-sm font-bold uppercase tracking-tight">Sales Quotation Items</CardTitle>
                                <CardDescription className="text-muted-foreground text-xs">
                                    These lines drive the Project Total / Pricing blocks in the PDF.
                                </CardDescription>
                            </div>
                            <div className="flex items-center gap-2">
                                <BaseButton
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={autofillQuoteFromScreens}
                                >
                                    <Wand2 className="w-4 h-4" />
                                    Auto-fill
                                </BaseButton>
                                <BaseButton
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={addFromCatalog}
                                >
                                    <Package className="w-4 h-4" />
                                    From Catalog
                                </BaseButton>
                                <BaseButton
                                    type="button"
                                    size="sm"
                                    onClick={addQuoteItem}
                                >
                                    <Plus className="w-4 h-4" />
                                    Add
                                </BaseButton>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="pt-6 space-y-4">
                        {quoteItems.length === 0 ? (
                            <div className="text-xs text-muted-foreground">
                                No quotation items yet. Click Add, Auto-fill from screens, or From Catalog.
                            </div>
                        ) : (
                            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                                <SortableContext items={quoteItems.map((it: any) => it.id)} strategy={verticalListSortingStrategy}>
                                    <div className="space-y-3">
                                        {quoteItems.map((it: any, idx: number) => (
                                            <SortableQuoteItem
                                                key={it.id}
                                                item={it}
                                                index={idx}
                                                onUpdate={updateQuoteItem}
                                                onRemove={removeQuoteItem}
                                            />
                                        ))}
                                    </div>
                                </SortableContext>
                            </DndContext>
                        )}
                    </CardContent>
                </Card>)}

                {/* Excel Values Summary - Mirror Mode only */}
                {mirrorMode && (
                    <Card className="bg-muted/50 border-border">
                        <CardHeader className="pb-3 border-b border-border">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-brand-blue/20">
                                    <Shield className="w-5 h-5 text-brand-blue" />
                                </div>
                                <div>
                                    <CardTitle className="text-foreground text-sm font-bold uppercase tracking-tight">
                                        Excel Values Summary
                                    </CardTitle>
                                    <CardDescription className="text-muted-foreground text-xs">
                                        Read-only pass-through from imported Estimator Excel
                                    </CardDescription>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="pt-6">
                            {internalAudit?.perScreen && internalAudit.perScreen.length > 0 ? (
                                <div className="space-y-3">
                                    {internalAudit.perScreen.map((screen: any, idx: number) => {
                                        const fromExcel = pricingDocument?.tables?.[idx]?.grandTotal;
                                        const displayTotal = fromExcel != null ? fromExcel : (screen.breakdown?.finalClientTotal ?? 0);
                                        return (
                                        <div key={idx} className="flex items-center justify-between p-3 rounded-xl border border-border bg-card/30">
                                            <div className="min-w-0">
                                                <div className="text-sm font-semibold text-foreground truncate">
                                                    {screens[idx]?.externalName || screens[idx]?.name || screen.name}
                                                </div>
                                                <div className="text-[10px] text-muted-foreground">
                                                    Qty {screen.quantity} | {Number(screen.areaSqFt).toFixed(1)} sqft
                                                    {screen.pixelMatrix && ` | ${screen.pixelMatrix}`}
                                                </div>
                                            </div>
                                            <div className="text-right shrink-0">
                                                <div className="text-sm font-bold text-foreground">
                                                    {Math.abs(Number(displayTotal)) < 0.01 ? "—" : formatCurrency(displayTotal)}
                                                </div>
                                                <div className="text-[10px] text-muted-foreground">Client Total</div>
                                            </div>
                                        </div>
                                        );
                                    })}
                                    <div className="flex items-center justify-between p-3 rounded-xl border-2 border-brand-blue/20 bg-brand-blue/5">
                                        <div className="text-sm font-bold text-foreground uppercase tracking-tight">
                                            Project Total
                                        </div>
                                        <div className="text-lg font-bold text-brand-blue">
                                            {formatCurrency(internalAudit.totals?.finalClientTotal || 0, Math.abs(internalAudit.totals?.finalClientTotal || 0) < 0.01 ? "—" : undefined)}
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="text-sm text-muted-foreground text-center py-6">
                                    No Excel data imported yet. Upload an Estimator Excel in the Setup step.
                                </div>
                            )}
                        </CardContent>
                    </Card>
                )}

                {/* Global Pricing Controls */}
                {!mirrorMode && (
                    <Card className="bg-muted/50 border-border">
                        <CardHeader className="pb-3 border-b border-border">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-brand-blue/20">
                                    <Settings2 className="w-5 h-5 text-brand-blue" />
                                </div>
                                <div>
                                    <CardTitle className="text-foreground text-sm font-bold uppercase tracking-tight">Global Strategic Controls</CardTitle>
                                    <CardDescription className="text-muted-foreground text-xs">
                                        Apply settings to all {screens.length} screen{screens.length !== 1 ? 's' : ''} in the project.
                                    </CardDescription>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-6 pt-6">
                            {/* Margin Mode Toggle */}
                            <div className="flex items-center justify-between">
                                <Label className="text-xs font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2">
                                    <Percent className="w-4 h-4 text-brand-blue" />
                                    Margin Strategy
                                </Label>
                                <div className="flex items-center gap-2">
                                    <span className={cn("text-[10px] font-bold uppercase", !useCategoryMargins ? "text-brand-blue" : "text-muted-foreground")}>Global</span>
                                    <Switch
                                        checked={useCategoryMargins}
                                        onCheckedChange={toggleCategoryMode}
                                    />
                                    <span className={cn("text-[10px] font-bold uppercase", useCategoryMargins ? "text-emerald-500" : "text-muted-foreground")}>Per-Category</span>
                                </div>
                            </div>

                            {useCategoryMargins ? (
                                /* Per-Category Margin Controls */
                                <div className="space-y-4">
                                    <div className="grid grid-cols-3 gap-3">
                                        {([
                                            { key: "led" as const, label: "LED Hardware", default: 0.30, color: "text-blue-400", icon: Package },
                                            { key: "services" as const, label: "Services", default: 0.20, color: "text-amber-400", icon: Hammer },
                                            { key: "cms" as const, label: "CMS/Software", default: 0.35, color: "text-emerald-400", icon: Settings2 },
                                        ]).map((cat) => {
                                            const value = categoryMargins?.[cat.key] ?? cat.default;
                                            return (
                                                <div key={cat.key} className="p-3 bg-card rounded-xl border border-border space-y-2">
                                                    <div className="flex items-center justify-between">
                                                        <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
                                                            <cat.icon className={cn("w-3 h-3", cat.color)} />
                                                            {cat.label}
                                                        </Label>
                                                        <span className={cn("text-sm font-bold tabular-nums", cat.color)}>
                                                            {(value * 100).toFixed(0)}%
                                                        </span>
                                                    </div>
                                                    <input
                                                        type="range"
                                                        min="0"
                                                        max="0.8"
                                                        step="0.01"
                                                        value={value}
                                                        onChange={(e) => applyCategoryMargins({ [cat.key]: parseFloat(e.target.value) })}
                                                        className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-brand-blue"
                                                    />
                                                    <div className="flex justify-between text-[9px] text-zinc-600">
                                                        <span>0%</span>
                                                        <span>80%</span>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => applyCategoryMargins({ led: 0.30, services: 0.20, cms: 0.35 })}
                                        className="text-[10px] font-bold uppercase text-muted-foreground hover:text-brand-blue transition-colors"
                                    >
                                        Reset to ANC Defaults (30 / 20 / 35)
                                    </button>
                                </div>
                            ) : (
                                /* Legacy Global Margin Slider */
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <Label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">
                                            Global Margin Target
                                        </Label>
                                        <span className="text-lg font-bold text-brand-blue tabular-nums">
                                            {((globalMargin || 0.25) * 100).toFixed(2)}%
                                        </span>
                                    </div>

                                    <input
                                        type="range"
                                        min="0"
                                        max="0.8"
                                        step="0.01"
                                        value={globalMargin || 0.25}
                                        onChange={(e) => applyGlobalMargin(parseFloat(e.target.value))}
                                        className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-brand-blue"
                                    />

                                    <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider text-zinc-600">
                                        <span>0% Base</span>
                                        <span className="text-amber-500/70">Competitiveness Alert</span>
                                        <span>80% Max</span>
                                    </div>
                                </div>
                            )}

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {/* Global Bond Rate */}
                                <div className="flex flex-col gap-3 p-4 bg-card rounded-xl border border-border shadow-sm">
                                    <div className="flex items-center justify-between">
                                        <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                                            <Shield className="w-3.5 h-3.5 text-brand-blue" />
                                            Bond Rate (%)
                                        </Label>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <Info className="w-3.5 h-3.5 text-muted-foreground hover:text-brand-blue transition-colors cursor-help" />
                                            </TooltipTrigger>
                                            <TooltipContent side="top" className="max-w-xs bg-popover border-border text-popover-foreground p-3">
                                                <p className="text-xs leading-relaxed">
                                                    Performance Bond insurance fee applied to the Sell Price after margin calculation. Default: 1.5%
                                                </p>
                                            </TooltipContent>
                                        </Tooltip>
                                    </div>
                                    <Input
                                        type="number"
                                        step="0.1"
                                        className="bg-background border-input text-foreground font-bold h-9 focus-visible:ring-brand-blue/30"
                                        value={globalBondRate}
                                        onChange={(e) => applyGlobalBondRate(parseFloat(e.target.value))}
                                    />
                                </div>

                                {/* Global Tax Rate - REQ-125 */}
                                <div className="flex flex-col gap-3 p-4 bg-card rounded-xl border border-border shadow-sm">
                                    <div className="flex items-center justify-between">
                                        <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                                            <Receipt className="w-3.5 h-3.5 text-brand-blue" />
                                            Sales Tax Rate (%)
                                        </Label>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <Info className="w-3.5 h-3.5 text-muted-foreground hover:text-brand-blue transition-colors cursor-help" />
                                            </TooltipTrigger>
                                            <TooltipContent side="top" className="max-w-xs bg-popover border-border text-popover-foreground p-3">
                                                <p className="text-xs leading-relaxed">
                                                    Sales tax applied to (Sell Price + Bond + B&O Tax). Default: 9.5%. Morgantown/WVU projects auto-add 2% B&O Tax.
                                                </p>
                                            </TooltipContent>
                                        </Tooltip>
                                    </div>
                                    <Input
                                        type="number"
                                        step="0.5"
                                        min="0"
                                        max="20"
                                        className="bg-zinc-950 border-zinc-800 text-white font-bold h-9 focus-visible:ring-brand-blue/30"
                                        value={((watch("details.taxRateOverride") || 0.095) * 100).toFixed(1)}
                                        onChange={(e) => {
                                            const rate = parseFloat(e.target.value) / 100;
                                            setValue("details.taxRateOverride", rate);
                                        }}
                                    />
                                </div>

                                {/* Quick Presets — only show in global mode */}
                                {!useCategoryMargins && (
                                <div className="flex flex-col gap-3 p-4 bg-muted/50 rounded-xl border border-border">
                                    <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Strategic Presets</Label>
                                    <div className="flex flex-wrap gap-2">
                                        {[
                                            { label: "Aggressive", value: 0.15, desc: "15% — Competitive bid" },
                                            { label: "Standard", value: 0.25, desc: "25% — Default ANC" },
                                            { label: "Premium", value: 0.35, desc: "35% — High-value" },
                                            { label: "Strategic", value: 0.40, desc: "40% — Full services" },
                                        ].map((preset) => (
                                            <Tooltip key={preset.value}>
                                                <TooltipTrigger asChild>
                                                    <button
                                                        type="button"
                                                        onClick={() => applyGlobalMargin(preset.value)}
                                                        className={cn(
                                                            "px-3 py-1.5 text-[10px] font-bold uppercase rounded border transition-all",
                                                            globalMargin === preset.value
                                                                ? "bg-brand-blue border-brand-blue text-white shadow-lg shadow-brand-blue/20"
                                                                : "bg-muted border-border text-muted-foreground hover:border-brand-blue/30"
                                                        )}
                                                    >
                                                        {preset.label}
                                                    </button>
                                                </TooltipTrigger>
                                                <TooltipContent side="top" className="text-xs">{preset.desc}</TooltipContent>
                                            </Tooltip>
                                        ))}
                                    </div>
                                </div>
                                )}

                                {/* B&O Tax Override */}
                                <div className="flex flex-col gap-3 p-4 bg-card rounded-xl border border-border shadow-sm">
                                    <div className="flex items-center justify-between">
                                        <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                                            <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
                                            B&O Tax (WV)
                                        </Label>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <Info className="w-3.5 h-3.5 text-muted-foreground hover:text-brand-blue transition-colors cursor-help" />
                                            </TooltipTrigger>
                                            <TooltipContent side="top" className="max-w-xs bg-popover border-border text-popover-foreground p-3">
                                                <p className="text-xs leading-relaxed">
                                                    West Virginia Business & Occupation Tax (2%). Auto-detected for Morgantown/WVU projects. Toggle to override.
                                                </p>
                                            </TooltipContent>
                                        </Tooltip>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <Switch
                                            checked={!!watch("details.forceBoTax")}
                                            onCheckedChange={(checked) => {
                                                setValue("details.forceBoTax", checked, { shouldDirty: true });
                                            }}
                                            className="data-[state=checked]:bg-amber-500"
                                        />
                                        <span className="text-xs text-muted-foreground">
                                            {watch("details.forceBoTax") ? "2% B&O Tax applied" : "Auto-detect (address-based)"}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Audit Table Section - Intelligence Mode only */}
                {!mirrorMode && (
                <div className="flex flex-col gap-4">
                    <div className="flex items-center justify-between px-2">
                        <div className="flex items-center gap-2">
                            <TrendingUp className="w-4 h-4 text-brand-blue" />
                            <h3 className="text-sm font-bold text-foreground uppercase tracking-tight">Strategic P&L Audit</h3>
                        </div>
                        <Badge variant="outline" className="text-[10px] font-bold border-border text-muted-foreground uppercase tracking-widest">
                            Real-time Verification
                        </Badge>
                    </div>

                    <Card className="bg-muted/50 border border-border overflow-hidden">
                        <CardContent className="p-0">
                            <AuditTable bondRateOverride={bondRate} />
                        </CardContent>
                    </Card>
                </div>
                )}
            </div>
        </TooltipProvider>
    );
};

export default Step3Math;
