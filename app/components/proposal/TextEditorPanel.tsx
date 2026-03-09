"use client";

import React, { useState } from "react";
import { useFormContext } from "react-hook-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { FileText, ChevronRight, DollarSign, MessageSquare, Scale } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * TextEditorPanel - Centralized component for all editable narrative text blocks
 * 
 * Per Natalia requirement: "Every narrative text block must be editable"
 * 
 * Fields:
 * - Introduction Text: Custom header blurb with currency disclaimers
 * - Payment Terms: Editable payment schedule (default: 50/40/10)
 * - Additional Notes: Ad-hoc project-specific notes
 */
export function TextEditorPanel() {
    const { register, watch } = useFormContext();
    const [isExpanded, setIsExpanded] = useState(false);

    // Watch values for character counts
    const introText = watch("details.additionalNotes") || "";
    const paymentTerms = watch("details.paymentTerms") || "";
    const additionalNotes = watch("details.customProposalNotes") || "";
    const purchaserLegalName = watch("details.purchaserLegalName") || "";
    const signatureLegalText = watch("details.signatureBlockText") || "";
    const documentMode = watch("details.documentMode") || "BUDGET";

    const hasContent = introText.length > 0 || paymentTerms.length > 0 || additionalNotes.length > 0 || purchaserLegalName.length > 0 || signatureLegalText.length > 0;

    return (
        <Card className="bg-card/40 border border-border/60">
            <CardHeader className="border-b border-border/60 cursor-pointer" onClick={() => setIsExpanded(!isExpanded)}>
                <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                        <CardTitle className="text-sm font-bold text-foreground flex items-center gap-2">
                            <FileText className="w-4 h-4 text-brand-blue" />
                            Text Editor
                            {hasContent && (
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-brand-blue/30 text-brand-blue">
                                    Custom Text
                                </Badge>
                            )}
                        </CardTitle>
                        <CardDescription className="text-xs text-muted-foreground">
                            Edit introduction, payment terms, and additional notes
                        </CardDescription>
                    </div>
                    <ChevronRight className={cn(
                        "w-5 h-5 text-muted-foreground transition-transform shrink-0",
                        isExpanded && "rotate-90"
                    )} />
                </div>
            </CardHeader>

            {isExpanded && (
                <CardContent className="p-6 space-y-6">
                    {/* Introduction Text */}
                    <div className="space-y-2">
                        <Label htmlFor="additionalNotes" className="text-xs font-semibold text-foreground flex items-center gap-2">
                            <FileText className="w-3.5 h-3.5 text-brand-blue" />
                            Introduction Text
                            <span className="text-[10px] text-muted-foreground font-normal">
                                ({introText.length} characters)
                            </span>
                        </Label>
                        <Textarea
                            id="additionalNotes"
                            {...register("details.additionalNotes")}
                            placeholder="ANC is pleased to present the following LED Display proposal... (Leave blank for default)"
                            className="min-h-[100px] text-xs resize-y"
                        />
                        <p className="text-[10px] text-muted-foreground">
                            Customize the opening paragraph. Add currency disclaimers like "All pricing in CAD" if needed.
                        </p>
                    </div>

                    {/* Payment Terms */}
                    <div className="space-y-2">
                        <Label htmlFor="paymentTerms" className="text-xs font-semibold text-foreground flex items-center gap-2">
                            <DollarSign className="w-3.5 h-3.5 text-emerald-500" />
                            Payment Terms
                            <span className="text-[10px] text-muted-foreground font-normal">
                                ({paymentTerms.length} characters)
                            </span>
                        </Label>
                        <Textarea
                            id="paymentTerms"
                            {...register("details.paymentTerms")}
                            placeholder="50% on Deposit, 40% on Mobilization, 10% on Substantial Completion"
                            className="min-h-[80px] text-xs resize-y"
                        />
                        <p className="text-[10px] text-muted-foreground">
                            Edit payment schedule. Default: 50/40/10 split. Toggle visibility in PDF Section Toggles.
                        </p>
                    </div>

                    {/* Additional Notes (renders after pricing tables in PDF) */}
                    <div className="space-y-2">
                        <Label htmlFor="customProposalNotes" className="text-xs font-semibold text-foreground flex items-center gap-2">
                            <MessageSquare className="w-3.5 h-3.5 text-amber-500" />
                            Additional Notes
                            <span className="text-[10px] text-muted-foreground font-normal">
                                ({additionalNotes.length} characters)
                            </span>
                        </Label>
                        <Textarea
                            id="customProposalNotes"
                            {...register("details.customProposalNotes")}
                            placeholder="Project-specific notes, constraints, or disclaimers... (Optional - only shows if text is entered)"
                            className="min-h-[100px] text-xs resize-y"
                        />
                        <p className="text-[10px] text-muted-foreground">
                            Optional field. Only renders in PDF if you type text. Use for project-specific constraints.
                        </p>
                    </div>

                    {/* Signature Legal Text (renders before signature lines in PDF) */}
                    <div className="space-y-2">
                        <Label htmlFor="signatureBlockText" className="text-xs font-semibold text-foreground flex items-center gap-2">
                            <Scale className="w-3.5 h-3.5 text-violet-500" />
                            Signature Legal Text
                            <span className="text-[10px] text-muted-foreground font-normal">
                                ({signatureLegalText.length} characters)
                            </span>
                        </Label>
                        <Textarea
                            id="signatureBlockText"
                            {...register("details.signatureBlockText")}
                            placeholder="Please sign below to indicate Purchaser's agreement... (Leave blank for default)"
                            className="min-h-[80px] text-xs resize-y"
                        />
                        <p className="text-[10px] text-muted-foreground">
                            Legal paragraph that appears right before the signature lines. Leave blank for default.
                        </p>
                    </div>

                    {/* Purchaser Legal Name (LOI only) - Prompt 42 */}
                    {(documentMode === "LOI" || documentMode === "CONTRACT") && (
                        <div className="space-y-2 border-t border-border/40 pt-6">
                            <Label htmlFor="purchaserLegalName" className="text-xs font-semibold text-foreground flex items-center gap-2">
                                <FileText className="w-3.5 h-3.5 text-indigo-500" />
                                Purchaser Legal Name
                                <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-indigo-500/30 text-indigo-600">
                                    LOI Only
                                </Badge>
                            </Label>
                            <Textarea
                                id="purchaserLegalName"
                                {...register("details.purchaserLegalName")}
                                placeholder="e.g., Maple Leaf Sports & Entertainment Ltd. (defaults to client name if empty)"
                                className="min-h-[60px] text-xs resize-y"
                            />
                            <p className="text-[10px] text-muted-foreground">
                                Legal entity name for the Purchaser in LOI legal paragraph. Defaults to client name if left blank. The project name will still appear at the end of the paragraph.
                            </p>
                        </div>
                    )}
                </CardContent>
            )}
        </Card>
    );
}
