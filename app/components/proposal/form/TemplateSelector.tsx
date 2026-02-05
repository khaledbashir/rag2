"use client";

import React from "react";
import { Sparkles, LayoutGrid, Table2 } from "lucide-react";
import { useFormContext, useWatch } from "react-hook-form";
import { ProposalType } from "@/types";
import { cn } from "@/lib/utils";

/**
 * TemplateSelector - Enterprise Standard: ANC Hybrid Template (ID 5)
 *
 * When pricingDocument exists (Excel with Margin Analysis was imported),
 * shows a toggle to switch between:
 *   - Hybrid — clean specs + pricing layout
 *   - Mirror Mode — Scotia Bank pricing tables
 */
const TemplateSelector = () => {
    const { setValue, control } = useFormContext<ProposalType>();
    const pricingDocument = useWatch({ control, name: "details.pricingDocument" as any });
    const pricingMode = useWatch({ control, name: "details.pricingMode" as any });

    const hasPricingData = !!(pricingDocument as any)?.tables?.length;
    const isMirror = pricingMode === "MIRROR";

    const toggleMode = (mode: "STANDARD" | "MIRROR") => {
        if (mode === "MIRROR") {
            setValue("details.pricingMode" as any, "MIRROR", { shouldDirty: true });
        } else {
            setValue("details.pricingMode" as any, "STANDARD", { shouldDirty: true });
        }
    };

    // No pricing data — just show the standard badge (Hybrid template)
    if (!hasPricingData) {
        return (
            <div className="flex items-center gap-2 h-8 px-3 border border-border/50 rounded-md bg-muted/30">
                <div
                    className="w-3 h-3 rounded-sm"
                    style={{ background: "#002C73" }}
                />
                <span className="text-xs font-medium text-foreground">Hybrid</span>
                <Sparkles className="w-3 h-3 text-muted-foreground" />
            </div>
        );
    }

    // Pricing data exists — show toggle between Hybrid and Mirror
    return (
        <div className="flex items-center h-8 border border-border/50 rounded-md bg-muted/30 overflow-hidden">
            <button
                onClick={() => toggleMode("STANDARD")}
                className={cn(
                    "flex items-center gap-1.5 h-full px-2.5 text-xs font-medium transition-colors",
                    !isMirror
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                )}
            >
                <LayoutGrid className="w-3 h-3" />
                Hybrid
            </button>
            <button
                onClick={() => toggleMode("MIRROR")}
                className={cn(
                    "flex items-center gap-1.5 h-full px-2.5 text-xs font-medium transition-colors",
                    isMirror
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                )}
            >
                <Table2 className="w-3 h-3" />
                Mirror
            </button>
        </div>
    );
};

export default TemplateSelector;
