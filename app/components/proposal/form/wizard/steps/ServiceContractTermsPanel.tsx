/**
 * ServiceContractTermsPanel — edit UI for the Service Contract term-exhibit system.
 *
 * Shown in Step4Export when the document is a Service Contract (Priority 1). Lets the
 * user pick a project-type preset (pre-toggles exhibits), toggle each term exhibit
 * on/off, edit each exhibit's Markdown body per-instance, and edit the verbatim
 * signature block text. All edits write to `details.termExhibitOverrides`,
 * `details.serviceContractProjectType`, and `details.serviceContractSignatureText`
 * via react-hook-form (autosaved by the existing draft-save loop).
 */
import { useMemo, useState } from "react";
import { useFormContext } from "react-hook-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronDown, ChevronRight } from "lucide-react";
import { getDefaultTemplate, resolveExhibits } from "@/lib/serviceContracts/registry";
import { getPreset } from "@/lib/serviceContracts/presets";
import { matchTeamVenue } from "@/lib/serviceContracts/teamVenues";
import { buildServiceProposalIntro, cityStateFromAddress } from "@/lib/serviceContracts/serviceProposalIntro";
import type { ServicePricingDocument } from "@/types/servicePricing";
import type { ProposalType } from "@/types";

export function ServiceContractTermsPanel() {
    const { watch, setValue, getValues } = useFormContext<ProposalType>();
    const template = getDefaultTemplate();

    const templateId = (watch("details.serviceContractTemplateId" as any) as string) || "ravens";
    const projectType = (watch("details.serviceContractProjectType" as any) as string) || "";

    // Contract identity fields — override the template's party/venue/date so a
    // Carolina Panthers contract doesn't keep the Ravens' "M&T Bank Stadium".
    const scPurchaserName = (watch("details.serviceContractPurchaserName" as any) as string) || "";
    const scVenueName = (watch("details.serviceContractVenueName" as any) as string) || "";
    const scPurchaserAddress = (watch("details.serviceContractPurchaserAddress" as any) as string) || "";
    const scAgreementDate = (watch("details.serviceContractAgreementDate" as any) as string) || "";
    const scTermStart = (watch("details.serviceContractTermStart" as any) as string) || "";
    const scTermEnd = (watch("details.serviceContractTermEnd" as any) as string) || "";
    const receiverName = (watch("receiver.name" as any) as string) || "";

    // Service Proposal vs Service Contract: the proposal shows the intro editor
    // and no legal apparatus (exhibits/signature arrive at contract time).
    const documentMode = (watch("details.documentMode" as any) as string) || "";
    const isServiceProposal = documentMode === "SERVICE_PROPOSAL";
    const svcDoc = (watch("details.servicePricingDocument" as any) ?? null) as ServicePricingDocument | null;
    const serviceProposalIntro = (watch("details.serviceProposalIntro" as any) as string) || "";
    const todayFormatted = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
    // Auto-detect the venue from the team so the placeholders show what the
    // contract will use before the user types anything.
    const detectedTeamVenue = matchTeamVenue(scPurchaserName || receiverName);
    const overrides = (watch("details.termExhibitOverrides" as any) || {}) as Record<string, { enabled?: boolean; bodyMarkdown?: string }>;
    const signatureText = (watch("details.serviceContractSignatureText" as any) as string) || "";

    const resolved = useMemo(() => resolveExhibits(template, overrides), [template, overrides]);
    const [openExhibit, setOpenExhibit] = useState<string | null>(null);

    const applyPreset = (presetId: string) => {
        const preset = getPreset(presetId);
        setValue("details.serviceContractProjectType" as any, presetId, { shouldDirty: true });
        if (!preset) return;
        const current = { ...(getValues("details.termExhibitOverrides" as any) || {}) } as Record<string, { enabled?: boolean; bodyMarkdown?: string }>;
        // Set enabled per preset; preserve any existing bodyMarkdown overrides.
        for (const ex of template.exhibits) {
            const enabled = preset.defaultExhibits[ex.id] ?? false;
            current[ex.id] = { ...(current[ex.id] || {}), enabled };
        }
        setValue("details.termExhibitOverrides" as any, current, { shouldDirty: true });
    };

    const setExhibitEnabled = (id: string, enabled: boolean) => {
        const current = { ...(getValues("details.termExhibitOverrides" as any) || {}) } as Record<string, { enabled?: boolean; bodyMarkdown?: string }>;
        current[id] = { ...(current[id] || {}), enabled };
        setValue("details.termExhibitOverrides" as any, current, { shouldDirty: true });
    };

    const setExhibitBody = (id: string, bodyMarkdown: string) => {
        const current = { ...(getValues("details.termExhibitOverrides" as any) || {}) } as Record<string, { enabled?: boolean; bodyMarkdown?: string }>;
        current[id] = { ...(current[id] || {}), bodyMarkdown };
        setValue("details.termExhibitOverrides" as any, current, { shouldDirty: true });
    };

    // Live default intro preview for the Service Proposal editor placeholder —
    // same resolution the PDF uses (explicit fields > workbook prefill > team lookup).
    const introTeamVenue = matchTeamVenue(scPurchaserName || svcDoc?.clientName || receiverName);
    const defaultIntroText = isServiceProposal
        ? buildServiceProposalIntro({
            purchaserName: scPurchaserName || svcDoc?.clientName || receiverName,
            purchaserAddress: scPurchaserAddress,
            venueName: scVenueName || introTeamVenue?.venue || scPurchaserName || svcDoc?.clientName || receiverName,
            venueCity: cityStateFromAddress(introTeamVenue?.address || scPurchaserAddress),
            teamName: svcDoc?.clientName || introTeamVenue?.team || "",
            league: introTeamVenue?.league ?? null,
            termYears: svcDoc?.termYears ?? null,
            termStart: scTermStart || (svcDoc?.termStartYear ? String(svcDoc.termStartYear) : null),
            termEnd: scTermEnd || (svcDoc?.termEndYear ? String(svcDoc.termEndYear) : null),
        }).join("\n\n")
        : "";

    return (
        <Card className="bg-card/40 border border-border/60">
            <CardHeader className="pb-3">
                <CardTitle className="text-sm">{isServiceProposal ? "Service Proposal Setup" : "Service Contract Terms & Exhibits"}</CardTitle>
                <p className="text-[11px] text-muted-foreground">
                    {isServiceProposal
                        ? "Client, venue, and term are recognized from the uploaded service sheet where possible — adjust anything below. The fee table mirrors the Excel exactly."
                        : `Template: ${template.name}. Toggle exhibits on/off and edit each clause per-instance. Legal language is verbatim — edits preserve wording.`}
                </p>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Recognized-from-Excel summary (service sheet import) */}
                {svcDoc && (
                    <div className="rounded-md border border-border/50 bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
                        Recognized from the uploaded sheet: {svcDoc.rows.filter((r) => r.kind === "line").length} service lines ·{" "}
                        {svcDoc.termYears} contract year{svcDoc.termYears === 1 ? "" : "s"} ({svcDoc.yearLabels.join(", ")})
                        {svcDoc.clientName ? <> · client {svcDoc.clientName}</> : null}
                        {svcDoc.termStartYear && svcDoc.termEndYear ? <> · term {svcDoc.termStartYear}–{svcDoc.termEndYear}</> : null}
                    </div>
                )}
                {/* Contract details — purchaser, venue, address, date. These
                    override the template defaults per-instance so the contract
                    matches the actual client (not the Ravens template values). */}
                <div className="grid grid-cols-1 gap-3 border-b border-border/30 pb-4">
                    <p className="text-[11px] text-muted-foreground -mb-1">
                        {isServiceProposal
                            ? "Set who this proposal is for. These fill the intro and document title."
                            : "Set who this contract is for. These fill the contract body and replace the template’s example values."}
                    </p>
                    <div className="flex flex-col gap-1.5">
                        <Label className="text-sm font-semibold">Purchaser / Client Name</Label>
                        <Input
                            value={scPurchaserName}
                            onChange={(e) => setValue("details.serviceContractPurchaserName" as any, e.target.value, { shouldDirty: true })}
                            placeholder={receiverName || "e.g. Carolina Panthers"}
                        />
                        <p className="text-[11px] text-muted-foreground">Leave blank to use the project client{receiverName ? ` (${receiverName})` : ""}.</p>
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <Label className="text-sm font-semibold">Venue / Stadium</Label>
                        <Input
                            value={scVenueName}
                            onChange={(e) => setValue("details.serviceContractVenueName" as any, e.target.value, { shouldDirty: true })}
                            placeholder={detectedTeamVenue?.venue || "e.g. Bank of America Stadium"}
                        />
                        {detectedTeamVenue && !scVenueName && (
                            <p className="text-[11px] text-muted-foreground">Auto-detected from the team: {detectedTeamVenue.venue}. Leave blank to use it, or type a different venue.</p>
                        )}
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <Label className="text-sm font-semibold">Purchaser Address</Label>
                        <Input
                            value={scPurchaserAddress}
                            onChange={(e) => setValue("details.serviceContractPurchaserAddress" as any, e.target.value, { shouldDirty: true })}
                            placeholder={detectedTeamVenue?.address || "e.g. 800 S Mint St, Charlotte, NC 28202"}
                        />
                    </div>
                    {!isServiceProposal && (
                        <div className="flex flex-col gap-1.5">
                            <Label className="text-sm font-semibold">Agreement Date</Label>
                            <Input
                                value={scAgreementDate}
                                onChange={(e) => setValue("details.serviceContractAgreementDate" as any, e.target.value, { shouldDirty: true })}
                                placeholder={todayFormatted}
                            />
                            <p className="text-[11px] text-muted-foreground">Leave blank to use today&rsquo;s date ({todayFormatted}).</p>
                        </div>
                    )}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="flex flex-col gap-1.5">
                            <Label className="text-sm font-semibold">Term Start</Label>
                            <Input
                                value={scTermStart}
                                onChange={(e) => setValue("details.serviceContractTermStart" as any, e.target.value, { shouldDirty: true })}
                                placeholder={svcDoc?.termStartYear ? String(svcDoc.termStartYear) : "e.g. August 1, 2026"}
                            />
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <Label className="text-sm font-semibold">Term End</Label>
                            <Input
                                value={scTermEnd}
                                onChange={(e) => setValue("details.serviceContractTermEnd" as any, e.target.value, { shouldDirty: true })}
                                placeholder={svcDoc?.termEndYear ? String(svcDoc.termEndYear) : "e.g. July 31, 2029"}
                            />
                        </div>
                    </div>
                    <p className="text-[11px] text-muted-foreground -mt-1">
                        {svcDoc?.termStartYear
                            ? `Recognized ${svcDoc.termStartYear}–${svcDoc.termEndYear ?? ""} from the sheet — add exact dates (e.g. "August 1, ${svcDoc.termStartYear}") for the document prose.`
                            : "Used in the term language of the document."}
                    </p>
                </div>

                {/* Service Proposal intro editor — default is built live from the
                    fields above; typing here overrides it verbatim. */}
                {isServiceProposal && (
                    <div className="flex flex-col gap-1.5 border-b border-border/30 pb-4">
                        <Label className="text-sm font-semibold">Proposal Intro</Label>
                        <Textarea
                            className="min-h-[140px] text-[12px]"
                            value={serviceProposalIntro}
                            onChange={(e) => setValue("details.serviceProposalIntro" as any, e.target.value, { shouldDirty: true })}
                            placeholder={defaultIntroText}
                        />
                        <p className="text-[11px] text-muted-foreground">
                            Leave empty to use the standard service-proposal intro shown above (it updates as you edit the fields). Anything typed here is used verbatim instead.
                        </p>
                    </div>
                )}

                {!isServiceProposal && (<>
                {/* Project-type preset selector */}
                <div className="flex flex-col gap-1.5">
                    <Label className="text-sm font-semibold">Project Type</Label>
                    <Select value={projectType} onValueChange={applyPreset}>
                        <SelectTrigger className="w-full bg-background border-input text-sm">
                            <SelectValue placeholder="Select project type" />
                        </SelectTrigger>
                        <SelectContent className="bg-popover border-border">
                            {template.projectTypePresets.map((p) => (
                                <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <p className="text-[11px] text-muted-foreground">Pre-toggles the relevant exhibits for this project type. You can still adjust individually below.</p>
                </div>

                {/* Exhibit list */}
                <div className="space-y-2">
                    {resolved.map((ex) => {
                        const isOpen = openExhibit === ex.id;
                        const hasBodyOverride = !!(overrides[ex.id]?.bodyMarkdown && overrides[ex.id]!.bodyMarkdown!.trim());
                        return (
                            <div key={ex.id} className="border border-border/50 rounded-md">
                                <div className="flex items-center justify-between px-3 py-2.5">
                                    <button
                                        type="button"
                                        onClick={() => setOpenExhibit(isOpen ? null : ex.id)}
                                        className="flex items-center gap-1.5 text-sm font-medium text-foreground text-left"
                                    >
                                        {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                                        <span>
                                            {ex.exhibitLetter ? `Exhibit ${ex.exhibitLetter} — ` : ""}{ex.title}
                                        </span>
                                        {hasBodyOverride && (
                                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-400">edited</span>
                                        )}
                                    </button>
                                    <Switch
                                        checked={ex.enabled}
                                        onCheckedChange={(checked) => setExhibitEnabled(ex.id, checked)}
                                        className="data-[state=checked]:bg-brand-blue"
                                    />
                                </div>
                                {isOpen && (
                                    <div className="px-3 pb-3 pt-1 border-t border-border/30">
                                        <Label className="text-[11px] text-muted-foreground mb-1.5 block">Exhibit body (Markdown)</Label>
                                        <Textarea
                                            className="min-h-[140px] text-[12px] font-mono"
                                            value={ex.bodyMarkdown}
                                            onChange={(e) => setExhibitBody(ex.id, e.target.value)}
                                            placeholder={template.exhibits.find((t) => t.id === ex.id)?.bodyMarkdown ? "Clear to restore template default" : "Enter the verbatim exhibit text…"}
                                        />
                                        <p className="text-[10px] text-muted-foreground mt-1">
                                            Edits are saved per-instance and override the template default. Leave empty to use the verbatim template text.
                                        </p>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* Signature block editor */}
                <div className="flex flex-col gap-1.5 border-t border-border/30 pt-3">
                    <Label className="text-sm font-semibold">Signature Block</Label>
                    <Textarea
                        className="min-h-[100px] text-[12px] font-mono"
                        value={signatureText}
                        onChange={(e) => setValue("details.serviceContractSignatureText" as any, e.target.value, { shouldDirty: true })}
                        placeholder={template.signatureBlockText || "Enter the verbatim signature block language…"}
                    />
                    <p className="text-[11px] text-muted-foreground">
                        Verbatim signature language from the contract template. Edit only for per-instance changes — never AI-generated wording.
                    </p>
                </div>
                </>)}
            </CardContent>
        </Card>
    );
}