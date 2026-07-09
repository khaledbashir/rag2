"use client";

import React, { useState, useCallback } from "react";

// RHF
import { useFieldArray, useFormContext, useWatch } from "react-hook-form";

// Components
import { BaseButton, Subheading } from "@/app/components";
import SingleScreen from "../SingleScreen";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
// Contexts
import { useTranslationContext } from "@/contexts/TranslationContext";
import { useProposalContext } from "@/contexts/ProposalContext";

// Shared legal defaults (same text the PDF falls back to when the field is empty)
import { DEFAULT_SIGNATURE_BLOCK_TEXT } from "@/app/components/templates/proposal-pdf/sections/shared";

// Icons
import { Plus, Settings2, ChevronDown, ChevronUp, FileText, FileSpreadsheet, FileCheck, Trash2 } from "lucide-react";

// Toast
import { toast } from "@/components/ui/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { ProposalType } from "@/types";

const Screens = () => {
    const { control, getValues, setValue } = useFormContext<ProposalType>();
    const { _t } = useTranslationContext();

    // Selection for bulk delete
    const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());

    // Watch current values
    const paymentTerms = useWatch({ control, name: "details.paymentTerms" }) || "";
    const additionalNotes = useWatch({ control, name: "details.additionalNotes" }) || "";
    const scopeOfWorkText = useWatch({ control, name: "details.scopeOfWorkText" }) || "";
    const signatureBlockText = useWatch({ control, name: "details.signatureBlockText" }) || "";
    const loiHeaderText = useWatch({ control, name: "details.loiHeaderText" }) || "";
    const specsSectionTitle = useWatch({ control, name: "details.specsSectionTitle" }) || "";

    // Count how many fields have custom content
    const customFieldsCount = [
        specsSectionTitle,
        paymentTerms,
        additionalNotes,
        scopeOfWorkText,
        signatureBlockText,
        loiHeaderText
    ].filter(Boolean).length;

    // Default LOI header paragraph (placeholders substituted on "Load default")
    const getDefaultLoiHeaderText = () => {
        const r = getValues("receiver");
        const d = getValues("details");
        const clientName = (r?.name || "").toString().trim() || "Purchaser";
        const parts = [r?.address, r?.city, r?.zipCode].filter(Boolean);
        const clientAddress = parts.length > 0 ? parts.join(", ") : "[Client Address]";
        const projectName = (d?.proposalName || "").toString().trim() || "[Project Name]";
        return `This Sales Quotation will set forth the terms by which ${clientName} ("Purchaser") located at ${clientAddress} and ANC Sports Enterprises, LLC ("ANC") located at 2 Manhattanville Road, Suite 402, Purchase, NY 10577 (collectively, the "Parties") agree that ANC will provide following LED Display and services (the "Display System") described below for the ${projectName}.`;
    };

    // Default legal text for signature block — shared with the PDF fallback so
    // "Load default" inserts exactly what an untouched proposal already renders.
    const defaultSignatureText = DEFAULT_SIGNATURE_BLOCK_TEXT;

    const SCREENS_NAME = "details.screens";
    const { fields, append, remove, move } = useFieldArray({
        control: control,
        name: SCREENS_NAME,
    });

    const addNewScreen = () => {
        append({
            name: "",
            productType: "",
            zoneComplexity: "standard",
            zoneSize: "small",
            widthFt: 0,
            heightFt: 0,
            quantity: 1,
            pitchMm: 10,
            costPerSqFt: 120,
            desiredMargin: 0.25,
            hiddenFromSpecs: false,
            isReplacement: false,
            useExistingStructure: false,
            includeSpareParts: false,
            isManualLineItem: false,
        });
    };

    const addNewManualLineItem = () => {
        append({
            name: "",
            productType: "Manual Item",
            quantity: 1,
            desiredMargin: 0.25,
            isManualLineItem: true,
            manualCost: 0,
            widthFt: 0,
            heightFt: 0,
            pitchMm: 0,
            hiddenFromSpecs: false,
            isReplacement: false,
            useExistingStructure: false,
            includeSpareParts: false,
        });
    };

    const removeScreen = (index: number) => {
        const screens = getValues(SCREENS_NAME);
        if (!screens) return;

        const deletedScreen = screens[index];
        remove(index);
        setSelectedIndices((prev) =>
            new Set([...prev].filter((i) => i !== index).map((i) => (i > index ? i - 1 : i)))
        );

        toast({
            title: "Screen removed",
            description: `"${deletedScreen?.name || 'Untitled Screen'}" has been deleted.`,
            action: (
                <ToastAction
                    altText="Undo"
                    onClick={() => {
                        append(deletedScreen, { shouldFocus: false });
                        const currentScreens = getValues(SCREENS_NAME);
                        if (currentScreens && index < currentScreens.length - 1) {
                            move(currentScreens.length - 1, index);
                        }
                    }}
                >
                    Undo
                </ToastAction>
            ),
        });
    };

    const toggleSelect = useCallback((index: number) => {
        setSelectedIndices((prev) => {
            const next = new Set(prev);
            if (next.has(index)) next.delete(index);
            else next.add(index);
            return new Set(next);
        });
    }, []);

    const deleteSelected = useCallback(() => {
        const sorted = [...selectedIndices].sort((a, b) => b - a);
        sorted.forEach((idx) => remove(idx));
        setSelectedIndices(new Set());
        const n = sorted.length;
        toast({
            title: n === 1 ? "Screen removed" : "Screens removed",
            description: `${n} screen${n > 1 ? "s" : ""} deleted.`,
        });
    }, [selectedIndices, remove]);

    // Single accordion state for all document settings
    const [showDocSettings, setShowDocSettings] = useState(false);

    const moveScreenUp = (index: number) => {
        if (index > 0) move(index, index - 1);
    };

    const moveScreenDown = (index: number) => {
        if (index < fields.length - 1) move(index, index + 1);
    };

    const { duplicateScreen } = useProposalContext();
    const screens = getValues(SCREENS_NAME) || [];
    const pricingDocument = (getValues() as any)?.details?.pricingDocument as any;
    const mirrorMode =
        getValues("details.mirrorMode") === true ||
        (pricingDocument?.tables?.length ?? 0) > 0;
    const optionIndices = screens
        .map((s: any, idx: number) => {
            const name = (s?.name ?? "").toString().trim().toUpperCase();
            const w = Number(s?.widthFt ?? s?.width ?? 0);
            const h = Number(s?.heightFt ?? s?.height ?? 0);
            const isOptionPlaceholder = name.includes("OPTION") && (w <= 0 || h <= 0);
            return isOptionPlaceholder ? idx : -1;
        })
        .filter((idx: number) => idx >= 0);

    return (
        <section className="flex flex-col gap-2 w-full">
            <Subheading>{_t("form.steps.screens.heading")}:</Subheading>

            {mirrorMode && optionIndices.length > 0 && (
                <div className="rounded-xl border border-amber-600/30 dark:border-amber-500/20 bg-amber-50 dark:bg-amber-500/5 px-4 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                        <div className="text-xs font-bold text-amber-700 dark:text-amber-200 uppercase tracking-widest">OPTION placeholder detected</div>
                        <div className="mt-1 text-[11px] text-muted-foreground">
                            This is a header/placeholder row from the estimator sheet, not a real screen.
                        </div>
                    </div>
                    <BaseButton tooltipLabel="Remove placeholder rows" onClick={() => remove(optionIndices)} className="shrink-0">
                        Remove
                    </BaseButton>
                </div>
            )}

            {selectedIndices.size > 0 && (
                <div className="flex items-center gap-3 px-3 py-2 rounded-lg border border-primary/30 bg-primary/5">
                    <span className="text-sm font-medium text-foreground">
                        {selectedIndices.size} selected
                    </span>
                    <BaseButton
                        variant="destructive"
                        size="sm"
                        onClick={deleteSelected}
                        className="gap-1.5"
                    >
                        <Trash2 className="w-4 h-4" />
                        Delete selected
                    </BaseButton>
                    <button
                        type="button"
                        onClick={() => setSelectedIndices(new Set())}
                        className="text-xs text-muted-foreground hover:text-foreground"
                    >
                        Clear selection
                    </button>
                </div>
            )}

            <div className="space-y-3">
                {fields.map((field, index) => (
                    <SingleScreen
                        key={field.id}
                        name={SCREENS_NAME}
                        index={index}
                        fields={fields as any}
                        field={field as any}
                        moveFieldUp={moveScreenUp}
                        moveFieldDown={moveScreenDown}
                        removeField={removeScreen}
                        duplicateField={duplicateScreen}
                        isSelected={selectedIndices.has(index)}
                        onToggleSelect={() => toggleSelect(index)}
                    />
                ))}
            </div>

            <div className="grid grid-cols-2 gap-3">
                <BaseButton tooltipLabel="Add a new screen" onClick={addNewScreen} className="w-full">
                    <Plus className="w-4 h-4" />
                    {_t("form.steps.screens.addNewScreen")}
                </BaseButton>
                <BaseButton variant="outline" tooltipLabel="Add a non-display line item (Manual Cost/Margin)" onClick={addNewManualLineItem} className="w-full">
                    <Plus className="w-4 h-4" />
                    Add Line Item
                </BaseButton>
            </div>

            {/* Document Settings with Tabs */}
            <div className="mt-4">
                <button
                    type="button"
                    onClick={() => setShowDocSettings(!showDocSettings)}
                    className="w-full flex items-center justify-between px-4 py-2.5 bg-muted/50 hover:bg-muted border border-border rounded-lg text-foreground text-sm transition-colors"
                >
                    <div className="flex items-center gap-2">
                        <Settings2 className="w-4 h-4 text-muted-foreground" />
                        <span className="font-medium">Document Text Settings</span>
                        {customFieldsCount > 0 && (
                            <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded font-medium">
                                {customFieldsCount} customized
                            </span>
                        )}
                    </div>
                    {showDocSettings ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                </button>

                {showDocSettings && (
                    <div className="mt-2 p-4 bg-card border border-border rounded-lg animate-in fade-in slide-in-from-top-2 duration-200">
                        <Tabs defaultValue="budget" className="w-full">
                            <TabsList className="grid w-full grid-cols-3">
                                <TabsTrigger value="budget" className="flex items-center gap-1.5">
                                    <FileSpreadsheet className="w-3.5 h-3.5" />
                                    Budget
                                </TabsTrigger>
                                <TabsTrigger value="proposal" className="flex items-center gap-1.5">
                                    <FileText className="w-3.5 h-3.5" />
                                    Proposal
                                </TabsTrigger>
                                <TabsTrigger value="loi" className="flex items-center gap-1.5">
                                    <FileCheck className="w-3.5 h-3.5" />
                                    LOI
                                </TabsTrigger>
                            </TabsList>

                            {/* Budget Tab */}
                            <TabsContent value="budget" className="space-y-4 mt-4">
                                <div className="space-y-1.5">
                                    <Label className="text-xs font-medium text-muted-foreground">
                                        Specs Header
                                    </Label>
                                    <input
                                        type="text"
                                        placeholder="SPECIFICATIONS"
                                        value={specsSectionTitle}
                                        onChange={(e) => setValue("details.specsSectionTitle", e.target.value, { shouldDirty: true })}
                                        className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md"
                                    />
                                    <p className="text-[11px] text-muted-foreground">
                                        Title shown above the specifications table in Budget documents.
                                    </p>
                                </div>
                            </TabsContent>

                            {/* Proposal Tab */}
                            <TabsContent value="proposal" className="space-y-4 mt-4">
                                <div className="space-y-1.5">
                                    <Label className="text-xs font-medium text-muted-foreground">
                                        Specs Header
                                    </Label>
                                    <input
                                        type="text"
                                        placeholder="SPECIFICATIONS"
                                        value={specsSectionTitle}
                                        onChange={(e) => setValue("details.specsSectionTitle", e.target.value, { shouldDirty: true })}
                                        className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md"
                                    />
                                    <p className="text-[11px] text-muted-foreground">
                                        Title shown above the specifications table in Proposal documents.
                                    </p>
                                </div>
                            </TabsContent>

                            {/* LOI Tab */}
                            <TabsContent value="loi" className="space-y-4 mt-4">
                                {/* LOI Legal Paragraph - renders BEFORE signature lines */}
                                <div className="space-y-1.5">
                                    <div className="flex items-center justify-between">
                                        <Label className="text-xs font-medium text-muted-foreground">
                                            Legal Paragraph (Before Signatures)
                                        </Label>
                                        {!loiHeaderText && (
                                            <button
                                                type="button"
                                                onClick={() => setValue("details.loiHeaderText", getDefaultLoiHeaderText(), { shouldDirty: true })}
                                                className="text-[10px] text-primary hover:underline"
                                            >
                                                Load default
                                            </button>
                                        )}
                                    </div>
                                    <p className="text-[11px] text-muted-foreground">
                                        Legal paragraph that appears before the signature lines. Leave blank for default.
                                    </p>
                                    <Textarea
                                        placeholder="This Sales Quotation will set forth the terms by which..."
                                        value={loiHeaderText}
                                        onChange={(e) => setValue("details.loiHeaderText", e.target.value, { shouldDirty: true })}
                                        className="min-h-[100px] text-sm bg-background border-border resize-none"
                                    />
                                </div>

                                {/* Payment Terms */}
                                <div className="space-y-1.5">
                                    <Label className="text-xs font-medium text-muted-foreground">
                                        Payment Terms
                                    </Label>
                                    <Textarea
                                        placeholder="50% on Deposit, 40% on Mobilization, 10% on Substantial Completion"
                                        value={paymentTerms}
                                        onChange={(e) => setValue("details.paymentTerms", e.target.value, { shouldDirty: true })}
                                        className="min-h-[60px] text-sm bg-background border-border resize-none"
                                    />
                                </div>

                                {/* Additional Notes */}
                                <div className="space-y-1.5">
                                    <Label className="text-xs font-medium text-muted-foreground">
                                        Additional Notes
                                    </Label>
                                    <Textarea
                                        placeholder="Any additional notes or terms..."
                                        value={additionalNotes}
                                        onChange={(e) => setValue("details.additionalNotes", e.target.value, { shouldDirty: true })}
                                        className="min-h-[60px] text-sm bg-background border-border resize-none"
                                    />
                                </div>

                                {/* Scope of Work */}
                                <div className="space-y-1.5">
                                    <Label className="text-xs font-medium text-muted-foreground">
                                        Scope of Work <span className="text-[10px] opacity-70">(Exhibit B - optional)</span>
                                    </Label>
                                    <Textarea
                                        placeholder="Custom scope of work text... Leave empty to hide Exhibit B."
                                        value={scopeOfWorkText}
                                        onChange={(e) => setValue("details.scopeOfWorkText", e.target.value, { shouldDirty: true })}
                                        className="min-h-[80px] text-sm bg-background border-border resize-none font-mono"
                                    />
                                </div>

                                {/* Signature Legal Text */}
                                <div className="space-y-1.5">
                                    <div className="flex items-center justify-between">
                                        <Label className="text-xs font-medium text-muted-foreground">
                                            Signature Legal Text
                                        </Label>
                                        {!signatureBlockText && (
                                            <button
                                                type="button"
                                                onClick={() => setValue("details.signatureBlockText", defaultSignatureText, { shouldDirty: true })}
                                                className="text-[10px] text-primary hover:underline"
                                            >
                                                Load default
                                            </button>
                                        )}
                                    </div>
                                    <Textarea
                                        placeholder="Please sign below to indicate Purchaser's agreement..."
                                        value={signatureBlockText}
                                        onChange={(e) => setValue("details.signatureBlockText", e.target.value, { shouldDirty: true })}
                                        className="min-h-[80px] text-sm bg-background border-border resize-none"
                                    />
                                </div>
                            </TabsContent>
                        </Tabs>
                    </div>
                )}
            </div>

        </section>
    );
};

export default Screens;
