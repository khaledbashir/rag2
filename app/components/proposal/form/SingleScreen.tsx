"use client";

import { useEffect, useState } from "react";

// RHF
import { FieldArrayWithId, useFormContext, useWatch } from "react-hook-form";

// ShadCn
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Components
import { BaseButton, FormInput } from "@/app/components";

// Contexts
import { useTranslationContext } from "@/contexts/TranslationContext";
import { useProposalContext } from "@/contexts/ProposalContext";

// Icons
import { ChevronDown, ChevronUp, Trash2, Copy, ShieldCheck, Zap, AlertTriangle, CheckCircle2, ChevronRight, Info } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { FEATURES } from "@/lib/featureFlags";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

// Enterprise Math
import { formatDimension, formatCurrencyPDF, calculateArea, safeNumber } from "@/lib/math";

type SingleScreenProps = {
    name: string;
    index: number;
    fields: any[];
    field: FieldArrayWithId<any, any>;
    moveFieldUp: (index: number) => void;
    moveFieldDown: (index: number) => void;
    removeField: (index: number) => void;
    duplicateField?: (index: number) => void;
    isSelected?: boolean;
    onToggleSelect?: () => void;
};

const SingleScreen = ({
    name,
    index,
    fields,
    field,
    moveFieldUp,
    moveFieldDown,
    removeField,
    duplicateField,
    isSelected = false,
    onToggleSelect,
}: SingleScreenProps) => {
    const { control, setValue, register, formState: { errors } } = useFormContext();
    const { _t } = useTranslationContext();
    const { aiFields, verifiedFields, setFieldVerified } = useProposalContext();
    const [isExpanded, setIsExpanded] = useState(index === 0 && fields.length === 1);
    const [showMargin, setShowMargin] = useState(false);
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [showSpecs, setShowSpecs] = useState(false);

    const screenName = useWatch({ name: `${name}[${index}].name`, control });
    const width = useWatch({ name: `${name}[${index}].widthFt`, control });
    const height = useWatch({ name: `${name}[${index}].heightFt`, control });
    const quantity = useWatch({ name: `${name}[${index}].quantity`, control });
    const pitch = useWatch({ name: `${name}[${index}].pitchMm`, control });
    const desiredMargin = useWatch({ name: `${name}[${index}].desiredMargin`, control });
    const isManualLineItem = useWatch({ name: `${name}[${index}].isManualLineItem`, control });
    const isAlternate = useWatch({ name: `${name}[${index}].isAlternate`, control });
    const manualCost = useWatch({ name: `${name}[${index}].manualCost`, control });
    const mirrorModeFlag = useWatch({ name: "details.mirrorMode", control });
    const pricingDocument = useWatch({ name: "details.pricingDocument" as any, control });
    const isMirrorMode =
        mirrorModeFlag === true || ((pricingDocument as any)?.tables?.length ?? 0) > 0;

    // Watch the audit result for this screen
    const audit = useWatch({ name: `details.internalAudit.perScreen[${index}]`, control });
    const finalClientTotal = audit?.breakdown?.finalClientTotal || 0;
    const sellingPricePerSqFt = audit?.breakdown?.sellingPricePerSqFt || 0;

    // Check for validation errors
    const screenErrors = (errors as any)?.details?.screens?.[index];
    const hasErrors = screenErrors && Object.keys(screenErrors).length > 0;

    // Check for warnings
    const hasLowMargin = desiredMargin < 0.15;
    const isMissingDimensions = !width || !height || width === 0 || height === 0;
    const hasWarning = hasLowMargin || isMissingDimensions;

    useEffect(() => {
        if (width !== undefined && height !== undefined) {
            const area = calculateArea(Number(width), Number(height));
            setValue(`${name}[${index}].areaSqFt`, area);
        }
        if (width !== undefined && height !== undefined && pitch !== undefined && Number(pitch) > 0) {
            const pitchMm = Number(pitch);
            const pixelsHeight = Math.round((Number(height) * 304.8) / pitchMm);
            const pixelsWidth = Math.round((Number(width) * 304.8) / pitchMm);
            const pixelResolution = pixelsHeight * pixelsWidth;
            setValue(`${name}[${index}].pixelResolution`, pixelResolution);
            setValue(`${name}[${index}].resolutionW`, pixelsWidth);
            setValue(`${name}[${index}].resolutionH`, pixelsHeight);
        }
    }, [width, height, pitch, name, index, setValue]);

    const area = calculateArea(safeNumber(width), safeNumber(height));

    return (
        <div className={cn(
            "border rounded-xl overflow-hidden transition-all duration-200",
            hasErrors ? "border-red-500/50 bg-red-950/10" :
                hasWarning ? "border-yellow-500/50 bg-yellow-950/10" :
                    "border-border bg-card/30"
        )}>
            {/* Collapsed Header - Always Visible */}
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full p-4 flex items-center justify-between hover:bg-accent/30 transition-colors"
            >
                <div className="flex items-center gap-3">
                    {/* Select checkbox - stop propagation so clicking doesn't expand card */}
                    {onToggleSelect && (
                        <div
                            onClick={(e) => {
                                e.stopPropagation();
                                onToggleSelect();
                            }}
                            className="flex items-center shrink-0"
                        >
                            <Checkbox
                                checked={isSelected}
                                onCheckedChange={() => onToggleSelect()}
                                onClick={(e) => e.stopPropagation()}
                            />
                        </div>
                    )}
                    {/* Status Indicator */}
                    <div className={cn(
                        "w-2 h-2 rounded-full",
                        hasErrors ? "bg-red-500" :
                            hasWarning ? "bg-yellow-500" :
                                "bg-emerald-500"
                    )} />

                    <div className="text-left">
                        <p className="font-medium text-foreground">
                            #{index + 1} - {screenName || "Untitled Screen"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                            {isManualLineItem ? (
                                <span className="text-amber-500 font-medium">Manual Line Item</span>
                            ) : (
                                <>
                                    {width > 0 && height > 0 ? `${formatDimension(Number(width))}' × ${formatDimension(Number(height))}'` : "No dimensions"}
                                    {quantity > 1 && ` × ${quantity}`}
                                    {pitch > 0 && ` • ${pitch}mm pitch`}
                                </>
                            )}
                        </p>
                    </div>

                    {/* Warning/Error Badges */}
                    {hasErrors && (
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <span className="px-2 py-0.5 bg-red-500/10 text-red-500 text-[10px] font-medium rounded-full flex items-center gap-1 cursor-help">
                                        <AlertTriangle className="w-3 h-3" />
                                        Errors
                                    </span>
                                </TooltipTrigger>
                                <TooltipContent
                                    side="top"
                                    className="max-w-xs bg-popover border-border text-popover-foreground p-3"
                                >
                                    <div className="text-xs space-y-1">
                                        <p className="font-bold text-red-400 mb-2">Validation Errors:</p>
                                        {screenErrors && Object.entries(screenErrors).map(([field, error]: [string, any]) => (
                                            <p key={field} className="text-muted-foreground">
                                                • {field}: {error?.message || 'Invalid'}
                                            </p>
                                        ))}
                                    </div>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    )}
                    {isAlternate && (
                        <span className="px-2 py-0.5 bg-orange-500/10 text-orange-400 text-[10px] font-medium rounded-full border border-orange-500/20">
                            ALT
                        </span>
                    )}
                    {hasLowMargin && !hasErrors && (
                        <span className="px-2 py-0.5 bg-yellow-500/10 text-yellow-600 text-[10px] font-medium rounded-full">
                            Low Margin
                        </span>
                    )}
                    {aiFields?.includes(`${name}[${index}].name`) && (
                        <div className="flex items-center gap-2">
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <span className={cn(
                                            "px-2 py-0.5 text-[10px] font-medium rounded-full flex items-center gap-1 cursor-help transition-all shadow-[0_0_8px_rgba(10,82,239,0.5)]",
                                            verifiedFields[`${name}[${index}].name`]
                                                ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                                                : "bg-[#0A52EF]/10 text-[#0A52EF]"
                                        )}>
                                            {verifiedFields[`${name}[${index}].name`] ? <ShieldCheck className="w-3 h-3" /> : <Zap className="w-3 h-3" />}
                                            {verifiedFields[`${name}[${index}].name`] ? "VERIFIED" : "AI"}
                                        </span>
                                    </TooltipTrigger>
                                    <TooltipContent
                                        side="top"
                                        className="max-w-xs bg-popover border-border text-popover-foreground p-3 shadow-2xl"
                                    >
                                        <p className="text-xs leading-relaxed">
                                            {verifiedFields[`${name}[${index}].name`] ? (
                                                <>
                                                    <strong className="text-emerald-500">Verified by:</strong> {verifiedFields[`${name}[${index}].name`].verifiedBy}<br />
                                                    <strong className="text-emerald-500">Timestamp:</strong> {new Date(verifiedFields[`${name}[${index}].name`].verifiedAt).toLocaleString()}
                                                </>
                                            ) : (
                                                <>
                                                    <strong className="text-[#0A52EF]">AI Extracted:</strong> This value was pulled automatically from the RFP. Please verify and lock this data.
                                                </>
                                            )}
                                        </p>
                                    </TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                            {!verifiedFields[`${name}[${index}].name`] && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setFieldVerified(`${name}[${index}].name`, "Natalia AI"); // Placeholder for current user
                                    }}
                                    className="p-1 hover:bg-emerald-500/20 rounded text-emerald-500 transition-colors"
                                    title="Verify Field"
                                >
                                    <CheckCircle2 className="w-3 h-3" />
                                </button>
                            )}
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-4">
                    {/* Price Preview */}
                    <div className="text-right">
                        <p className="text-base font-semibold text-[#0A52EF]">
                            {finalClientTotal > 0
                                ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(formatCurrencyPDF(finalClientTotal))
                                : "—"
                            }
                        </p>
                        <p className="text-xs text-muted-foreground">
                            {desiredMargin != null && (desiredMargin * 100 || 0) > 0
                                ? `${(desiredMargin * 100).toFixed(0)}% margin`
                                : "—"
                            }
                        </p>
                    </div>

                    <ChevronRight className={cn(
                        "w-5 h-5 text-muted-foreground transition-transform duration-200",
                        isExpanded && "rotate-90"
                    )} />
                </div>
            </button>

            {/* Expanded Content */}
            {isExpanded && (
                <div className="p-4 border-t border-border space-y-4">
                    {/* Quick Actions Bar */}
                    <div className="flex items-center justify-between pb-3 border-b border-border">
                        <div className="flex items-center gap-2">
                            <BaseButton
                                size="icon"
                                variant="ghost"
                                onClick={() => moveFieldUp(index)}
                                disabled={index === 0}
                                tooltipLabel="Move up"
                            >
                                <ChevronUp className="w-4 h-4" />
                            </BaseButton>
                            <BaseButton
                                size="icon"
                                variant="ghost"
                                onClick={() => moveFieldDown(index)}
                                disabled={index === fields.length - 1}
                                tooltipLabel="Move down"
                            >
                                <ChevronDown className="w-4 h-4" />
                            </BaseButton>
                            <BaseButton
                                size="icon"
                                variant="outline"
                                onClick={() => duplicateField?.(index)}
                                tooltipLabel="Duplicate"
                            >
                                <Copy className="w-4 h-4" />
                            </BaseButton>
                        </div>
                        <div className="flex items-center gap-3">
                            <label className="flex items-center gap-1.5 cursor-pointer" title="Mark as alternate (excluded from grand total)">
                                <Checkbox
                                    checked={!!isAlternate}
                                    onCheckedChange={(checked) => setValue(`${name}[${index}].isAlternate`, !!checked, { shouldDirty: true })}
                                />
                                <span className={cn(
                                    "text-[10px] font-medium",
                                    isAlternate ? "text-orange-400" : "text-muted-foreground"
                                )}>Alternate</span>
                            </label>
                            <BaseButton
                                variant="destructive"
                                size="sm"
                                onClick={() => removeField(index)}
                            >
                                <Trash2 className="w-4 h-4 mr-1" />
                                Remove
                            </BaseButton>
                        </div>
                    </div>

                    {/* Primary Fields */}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                        <FormInput
                            name={`${name}[${index}].name`}
                            label={isManualLineItem ? "Description" : "Screen Name"}
                            placeholder={isManualLineItem ? "e.g., Installation Surcharge" : "e.g., Main Scoreboard"}
                            vertical
                        />
                        <FormInput
                            name={`${name}[${index}].externalName`}
                            label="PDF / Client Name"
                            labelHelper="(shows in PDF specs & pricing header)"
                            placeholder="e.g., Ribbon - North Upper"
                            vertical
                        />
                        {isManualLineItem ? (
                            <FormInput
                                name={`${name}[${index}].manualCost`}
                                label="Internal Cost ($)"
                                type="number"
                                vertical
                            />
                        ) : (
                            FEATURES.INTELLIGENCE_MODE && (
                                <FormInput
                                    name={`${name}[${index}].productType`}
                                    label="Product Type"
                                    placeholder="e.g., A Series"
                                    vertical
                                />
                            )
                        )}

                        <div className="flex flex-col gap-1">
                            <Label className="text-[11px] text-muted-foreground font-medium">Service Type</Label>
                            <select
                                {...register(`${name}[${index}].serviceType`)}
                                disabled={isManualLineItem}
                                className={cn(
                                    "h-9 px-3 text-sm border rounded-md bg-background w-full focus:ring-1 focus:ring-[#0A52EF] focus:outline-none transition-all disabled:opacity-50",
                                    aiFields?.includes(`${name}[${index}].serviceType`) ? "border-[#0A52EF] ring-1 ring-[#0A52EF]" : "border-input"
                                )}
                            >
                                <option value="Front/Rear">Front/Rear (Scoreboard)</option>
                                <option value="Top">Top (Ribbon)</option>
                            </select>
                        </div>

                        <div className="flex flex-col gap-1">
                            <Label className="text-[11px] text-muted-foreground font-medium">Form Factor</Label>
                            <select
                                {...register(`${name}[${index}].formFactor`)}
                                disabled={isManualLineItem}
                                className={cn(
                                    "h-9 px-3 text-sm border rounded-md bg-background w-full focus:ring-1 focus:ring-[#0A52EF] focus:outline-none transition-all disabled:opacity-50",
                                    aiFields?.includes(`${name}[${index}].formFactor`) ? "border-[#0A52EF] ring-1 ring-[#0A52EF]" : "border-input"
                                )}
                            >
                                <option value="Straight">Straight</option>
                                <option value="Curved">Curved</option>
                            </select>
                        </div>
                    </div>

                    {/* Dimensions Row - Hidden for Manual Items */}
                    {!isManualLineItem && (
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                            <FormInput
                                name={`${name}[${index}].widthFt`}
                                label="Width (ft)"
                                type="number"
                                vertical
                            />
                            <FormInput
                                name={`${name}[${index}].heightFt`}
                                label="Height (ft)"
                                type="number"
                                vertical
                            />

                            <FormInput
                                name={`${name}[${index}].quantity`}
                                label="Quantity"
                                type="number"
                                vertical
                            />

                            <FormInput
                                name={`${name}[${index}].pitchMm`}
                                label="Pitch (mm)"
                                type="number"
                                vertical
                            />

                            <FormInput
                                name={`${name}[${index}].brightness`}
                                label="Brightness"
                                placeholder="e.g., 6000"
                                vertical
                            />
                        </div>
                    )}

                    {!isMirrorMode && (
                        <>
                            {/* Desired Margin Toggle */}
                            <button
                                onClick={() => setShowMargin(!showMargin)}
                                className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
                            >
                                <ChevronRight className={cn(
                                    "w-4 h-4 transition-transform",
                                    showMargin && "rotate-90"
                                )} />
                                Desired Margin
                                <span className={cn(
                                    "ml-auto text-sm font-semibold",
                                    hasLowMargin ? "text-yellow-600" : "text-[#0A52EF]"
                                )}>
                                    {(desiredMargin * 100 || 0).toFixed(0)}%
                                </span>
                            </button>

                            {/* Margin Slider - With Natalia Math Tooltip */}
                            {showMargin && (
                                <div className={cn(
                                    "p-4 rounded-xl border space-y-3",
                                    aiFields?.includes(`${name}[${index}].desiredMargin`)
                                        ? "border-[#0A52EF]/50 bg-[#0A52EF]/10"
                                        : "border-border bg-muted/30"
                                )}>
                                    <div className="flex justify-between items-center">
                                        <TooltipProvider>
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <Label className="text-[11px] text-muted-foreground font-medium flex items-center gap-1 cursor-help">
                                                        <Zap className="w-3 h-3 text-yellow-500" />
                                                        Desired Margin
                                                        <Info className="w-3 h-3 text-muted-foreground hover:text-[#0A52EF] transition-colors" />
                                                    </Label>
                                                </TooltipTrigger>
                                                <TooltipContent
                                                    side="top"
                                                    className="max-w-xs bg-popover border-border text-popover-foreground p-3"
                                                >
                                                    <p className="text-xs leading-relaxed">
                                                        <strong className="text-[#0A52EF]">Using ANC Strategic Logic:</strong> We use the Divisor Model <code className="bg-muted px-1 rounded">[Cost / (1 - Margin)]</code> to ensure your P&L profit matches your target percentage exactly.
                                                    </p>
                                                </TooltipContent>
                                            </Tooltip>
                                        </TooltipProvider>
                                        <span className={cn(
                                            "text-sm font-semibold",
                                            hasLowMargin ? "text-yellow-600" : "text-[#0A52EF]"
                                        )}>
                                            {(desiredMargin * 100 || 0).toFixed(0)}%
                                        </span>
                                    </div>
                                    <input
                                        type="range"
                                        min="0"
                                        max="0.8"
                                        step="0.01"
                                        {...register(`${name}[${index}].desiredMargin`, {
                                            valueAsNumber: true,
                                            onChange: (e) => setValue(`${name}[${index}].desiredMargin`, parseFloat(e.target.value))
                                        })}
                                        className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-[#0A52EF]"
                                    />
                                    <p className="text-[10px] text-muted-foreground">
                                        Adjust margin to see real-time price impact
                                    </p>
                                </div>
                            )}
                        </>
                    )}

                    {/* Add Specs Toggle */}
                    <button
                        onClick={() => setShowSpecs(!showSpecs)}
                        className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                        <ChevronRight className={cn(
                            "w-4 h-4 transition-transform",
                            showSpecs && "rotate-90"
                        )} />
                        <Zap className="w-3.5 h-3.5" />
                        Add Specs (Power / Weight)
                    </button>

                    {/* Manual Specs Entry */}
                    {showSpecs && (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-amber-50/50 dark:bg-amber-950/20 rounded-xl border border-amber-200 dark:border-amber-800">
                            <FormInput
                                name={`${name}[${index}].manualMaxPowerW`}
                                label="Max Power (W)"
                                type="number"
                                placeholder="e.g. 7500"
                                vertical
                            />
                            <FormInput
                                name={`${name}[${index}].manualAvgPowerW`}
                                label="Avg Power (W)"
                                type="number"
                                placeholder="e.g. 3000"
                                vertical
                            />
                            <FormInput
                                name={`${name}[${index}].manualWeightLbs`}
                                label="Weight (lbs)"
                                type="number"
                                placeholder="e.g. 8500"
                                vertical
                            />
                            <FormInput
                                name={`${name}[${index}].manualAmps`}
                                label="Amps @208V"
                                type="number"
                                placeholder="e.g. 36"
                                vertical
                            />
                            <p className="col-span-full text-[10px] text-muted-foreground">
                                These override auto-calculated specs. Leave blank to use product defaults.
                            </p>
                        </div>
                    )}

                    {/* Advanced Settings Toggle */}
                    <button
                        onClick={() => setShowAdvanced(!showAdvanced)}
                        className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                        <ChevronRight className={cn(
                            "w-4 h-4 transition-transform",
                            showAdvanced && "rotate-90"
                        )} />
                        Advanced Settings
                    </button>

                    {/* Advanced Settings */}
                    {showAdvanced && (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-muted/30 rounded-xl border border-border">
                            <FormInput
                                name={`${name}[${index}].outletDistance`}
                                label="Outlet Dist (ft)"
                                type="number"
                                vertical
                            />
                            <FormInput
                                name={`${name}[${index}].costPerSqFt`}
                                label="Cost per Sq Ft ($)"
                                type="number"
                                vertical
                            />

                            <div className="flex flex-col gap-2">
                                <Label className="text-[10px] text-muted-foreground font-medium flex items-center gap-1">
                                    <ShieldCheck className="w-3 h-3" />
                                    Include Spares (5%)
                                </Label>
                                <Switch
                                    checked={useWatch({ name: `${name}[${index}].includeSpareParts`, control })}
                                    onCheckedChange={(checked) => setValue(`${name}[${index}].includeSpareParts`, checked)}
                                />
                            </div>

                            <div className="flex flex-col gap-2">
                                <Label className="text-[10px] text-muted-foreground font-medium">Replacement Project</Label>
                                <Switch
                                    checked={useWatch({ name: `${name}[${index}].isReplacement`, control })}
                                    onCheckedChange={(checked) => setValue(`${name}[${index}].isReplacement`, checked)}
                                />
                            </div>

                            {useWatch({ name: `${name}[${index}].isReplacement`, control }) && (
                                <div className="flex flex-col gap-2">
                                    <Label className="text-[10px] text-muted-foreground font-medium">Use Existing Steel</Label>
                                    <Switch
                                        checked={useWatch({ name: `${name}[${index}].useExistingStructure`, control })}
                                        onCheckedChange={(checked) => setValue(`${name}[${index}].useExistingStructure`, checked)}
                                    />
                                </div>
                            )}
                        </div>
                    )}

                    {/* Live Stats Footer */}
                    <div className="flex items-center gap-6 pt-3 border-t border-border text-xs">
                        {!isManualLineItem && (
                            <div className="flex items-center gap-2">
                                <span className="text-muted-foreground">Area:</span>
                                <span className="font-medium text-foreground">{area} sq ft</span>
                            </div>
                        )}
                        {!isManualLineItem && (
                            <div className="flex items-center gap-2">
                                <span className="text-muted-foreground">Price/SqFt:</span>
                                <span className="font-medium text-[#0A52EF]">
                                    {sellingPricePerSqFt > 0
                                        ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(sellingPricePerSqFt)
                                        : "—"
                                    }
                                </span>
                            </div>
                        )}
                        {isManualLineItem && (
                            <div className="flex items-center gap-2">
                                <span className="text-muted-foreground">Internal Cost:</span>
                                <span className="font-medium text-foreground">
                                    {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(manualCost || 0)}
                                </span>
                            </div>
                        )}
                        <div className="ml-auto flex items-center gap-2">
                            {hasErrors ? (
                                <>
                                    <AlertTriangle className="w-4 h-4 text-red-500" />
                                    <span className="text-red-400">Fix errors to calculate</span>
                                </>
                            ) : finalClientTotal > 0 ? (
                                <>
                                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                                    <span className="text-emerald-400">Ready</span>
                                </>
                            ) : (!isManualLineItem && isMissingDimensions) ? (
                                <span className="text-muted-foreground">Add dimensions to calculate</span>
                            ) : null}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SingleScreen;
