/**
 * RFP to Proposal Auto-Fill — P74
 *
 * Auto-populates proposal form fields from extracted RFP data.
 * Maps extracted displays, client info, and project metadata to form state.
 */

import type { ExtractedDisplay } from "./displayScheduleExtractor";
import {
    calculateExhibitG,
    calculateHardwareCost,
    estimatePricing,
    getAllProducts,
    getProduct,
} from "./productCatalog";

// ============================================================================
// TYPES
// ============================================================================

export interface RFPExtractedData {
    clientName?: string;
    clientAddress?: string;
    venue?: string;
    projectTitle?: string;
    displays: ExtractedDisplay[];
    specialRequirements: string[];
    isUnionLabor?: boolean;
    isOutdoor?: boolean;
    bondRequired?: boolean;
    extractionAccuracy: "High" | "Standard" | "Low";
    extractedSchedulePhases?: Array<{
        phaseName: string;
        phaseNumber?: string | number | null;
        duration?: string | null;
        startDate?: string | null;
        endDate?: string | null;
        tasks?: Array<{ name: string; duration?: string | null }>;
    }>;
}

export interface ExhibitGOverridesByIndex {
    [index: number]: {
        maxPowerW?: number;
        avgPowerW?: number;
        totalWeightLbs?: number;
        installCost?: number;
        pmCost?: number;
        engCost?: number;
    };
}

export interface AutoFillResult {
    fieldsPopulated: string[];
    fieldsSkipped: string[];
    screensCreated: number;
    warnings: string[];
}

// ============================================================================
// AUTO-FILL
// ============================================================================

/**
 * Auto-fill proposal form from extracted RFP data.
 * Returns a partial form values object to merge into the form.
 */
export function buildAutoFillValues(
    extracted: RFPExtractedData,
    overridesByIndex: ExhibitGOverridesByIndex = {},
): {
    values: Record<string, any>;
    result: AutoFillResult;
} {
    const fieldsPopulated: string[] = [];
    const fieldsSkipped: string[] = [];
    const warnings: string[] = [];
    const values: Record<string, any> = {};

    // Client info
    if (extracted.clientName) {
        values["receiver.name"] = extracted.clientName;
        fieldsPopulated.push("receiver.name");
    } else {
        fieldsSkipped.push("receiver.name");
    }

    if (extracted.clientAddress) {
        values["receiver.address"] = extracted.clientAddress;
        fieldsPopulated.push("receiver.address");
    }

    // Project info
    if (extracted.projectTitle) {
        values["details.proposalName"] = extracted.projectTitle;
        fieldsPopulated.push("details.proposalName");
    }

    if (extracted.venue) {
        values["details.venue"] = extracted.venue;
        fieldsPopulated.push("details.venue");
    }

    const catalog = getAllProducts();
    const toNumberOrNull = (value: any): number | null => {
        if (value == null || value === "") return null;
        const n = Number(value);
        return Number.isFinite(n) ? n : null;
    };

    const deriveZoneSizeFromArea = (areaM2: number): "small" | "medium" | "large" => {
        if (!Number.isFinite(areaM2) || areaM2 <= 0) return "small";
        if (areaM2 < 10) return "small";
        if (areaM2 <= 50) return "medium";
        return "large";
    };

    const toZoneClass = (
        zoneComplexity: "standard" | "complex",
        zoneSize: "small" | "medium" | "large",
    ): "standard" | "medium" | "large" | "complex" => {
        if (zoneComplexity === "complex") return "complex";
        if (zoneSize === "large") return "large";
        if (zoneSize === "medium") return "medium";
        return "standard";
    };

    const matchProductIdFromPitch = (pitchMmRaw: number | null): string | null => {
        if (!pitchMmRaw || !Number.isFinite(pitchMmRaw) || pitchMmRaw <= 0) return null;
        const pitchMm = Number(pitchMmRaw);

        if (Math.abs(pitchMm - 4) <= 0.15) return "4mm-nitxeon";
        if (Math.abs(pitchMm - 10) <= 0.25) return "10mm-mesh";
        if (Math.abs(pitchMm - 2.5) <= 0.15) return "2.5mm-mip";

        const nearest = catalog
            .map((p) => ({ id: p.id, diff: Math.abs(p.pitchMm - pitchMm) }))
            .sort((a, b) => a.diff - b.diff)[0];
        if (nearest && nearest.diff <= 1.5) return nearest.id;
        return null;
    };

    // Screens from extracted displays
    const screens = extracted.displays.map((d, idx) => {
        const pitchMm = toNumberOrNull((d as any).pitchMm);
        const widthFt = toNumberOrNull((d as any).widthFt) ?? 0;
        const heightFt = toNumberOrNull((d as any).heightFt) ?? 0;
        const quantity = Math.max(1, Math.round(toNumberOrNull((d as any).quantity) ?? 1));
        const productId = matchProductIdFromPitch(pitchMm);
        const product = productId ? getProduct(productId) : undefined;
        const zoneComplexity: "standard" | "complex" = "standard";
        const areaM2 = widthFt > 0 && heightFt > 0 ? widthFt * heightFt * 0.092903 : 0;
        const zoneSize = deriveZoneSizeFromArea(areaM2);

        const extractedBrightness = toNumberOrNull((d as any).brightness);
        const extractedHardware = ((d as any).hardware || "").toString().trim();
        const extractedProcessing = ((d as any).processing || "").toString().trim();
        const extractedDiode = ((d as any).diode || "").toString().trim();
        const extractedLifespan = toNumberOrNull((d as any).lifespanHours);

        const screen: any = {
            name: d.name || `Screen ${idx + 1}`,
            externalName: d.name,
            productType: productId || "Manual Item",
            quantity,
            widthFt,
            heightFt,
            pitchMm: pitchMm ?? 0,
            desiredMargin: 0.15, // Default 15% LED margin
            isManualLineItem: !productId,
            manualCost: 0,
            isReplacement: false,
            useExistingStructure: false,
            includeSpareParts: false,
            environment: d.environment || "Indoor",
            brightness: extractedBrightness ?? product?.brightnessNits,
            notes: (d as any).notes,
            zoneComplexity,
            zoneSize,
            hardware: extractedHardware || product?.hardware || "",
            processing: extractedProcessing || product?.processing || "",
            diode: extractedDiode || product?.diode || "",
            lifespanHours: extractedLifespan ?? product?.lifespanHours ?? null,
        };

        if (product && widthFt > 0 && heightFt > 0) {
            const effectivePitch = (pitchMm && pitchMm > 0) ? pitchMm : product.pitchMm;
            if (effectivePitch > 0) {
                const resolutionW = Math.round((widthFt * 304.8) / effectivePitch);
                const resolutionH = Math.round((heightFt * 304.8) / effectivePitch);
                if (resolutionW > 0 && resolutionH > 0) {
                    const exhibit = calculateExhibitG(product, resolutionW, resolutionH);
                    const zoneClass = toZoneClass(zoneComplexity, zoneSize);
                    const hwCost = calculateHardwareCost(exhibit.activeAreaM2, product.id);
                    const pricing = estimatePricing(exhibit, zoneClass, hwCost);
                    const rowOverrides = overridesByIndex[idx] || {};

                    screen.calculatedExhibitG = {
                        displayWidthFt: exhibit.displayWidthFt,
                        displayHeightFt: exhibit.displayHeightFt,
                        resolutionW: exhibit.resolutionW,
                        resolutionH: exhibit.resolutionH,
                        activeAreaM2: exhibit.activeAreaM2,
                        activeAreaSqFt: exhibit.activeAreaSqFt,
                        maxPowerW: rowOverrides.maxPowerW ?? exhibit.maxPowerW,
                        avgPowerW: rowOverrides.avgPowerW ?? exhibit.avgPowerW,
                        totalWeightLbs: rowOverrides.totalWeightLbs ?? exhibit.totalWeightLbs,
                        pitchMm: exhibit.pitchMm,
                    };
                    screen.calculatedPricing = {
                        installCost: rowOverrides.installCost ?? pricing.installCost,
                        pmCost: rowOverrides.pmCost ?? pricing.pmCost,
                        engCost: rowOverrides.engCost ?? pricing.engCost,
                        hardwareCost: pricing.hardwareCost,
                        totalEstimate: pricing.totalEstimate,
                        zoneClass: pricing.zoneClass,
                    };
                }
            }
        } else if (pitchMm && !productId) {
            warnings.push(`No catalog product match for ${pitchMm}mm at ${d.name || `Display ${idx + 1}`}`);
        }

        return screen;
    });

    if (screens.length > 0) {
        values["details.screens"] = screens;
        fieldsPopulated.push(`details.screens (${screens.length} displays)`);
    } else {
        warnings.push("No displays extracted from RFP — manual entry required");
    }

    if (Array.isArray(extracted.extractedSchedulePhases) && extracted.extractedSchedulePhases.length > 0) {
        values["details.extractedScheduleReference"] = extracted.extractedSchedulePhases.map((phase) => ({
            phaseName: phase.phaseName,
            phaseNumber: phase.phaseNumber != null ? String(phase.phaseNumber) : null,
            duration: phase.duration ?? null,
            startDate: phase.startDate ?? null,
            endDate: phase.endDate ?? null,
            taskCount: Array.isArray(phase.tasks) ? phase.tasks.length : 0,
        }));
        fieldsPopulated.push("details.extractedScheduleReference");
    }

    // Context flags
    if (extracted.isUnionLabor) {
        warnings.push("Union labor detected — IBEW surcharge may apply");
    }
    if (extracted.bondRequired) {
        values["details.bondRate"] = 1.5;
        fieldsPopulated.push("details.bondRate");
    }

    // Accuracy warning
    if (extracted.extractionAccuracy === "Low") {
        warnings.push("Low extraction accuracy — please verify all fields manually");
    }

    return {
        values,
        result: {
            fieldsPopulated,
            fieldsSkipped,
            screensCreated: screens.length,
            warnings,
        },
    };
}

/**
 * Apply auto-fill values to a form using setValue.
 */
export function applyAutoFill(
    values: Record<string, any>,
    setValue: (name: string, value: any, options?: any) => void
): void {
    for (const [key, value] of Object.entries(values)) {
        setValue(key, value, { shouldDirty: true, shouldValidate: true });
    }
}
