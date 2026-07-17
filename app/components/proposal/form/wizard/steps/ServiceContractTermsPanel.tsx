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
import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
import { getDefaultTemplate, resolveExhibits } from "@/lib/serviceContracts/registry";
import { getPreset } from "@/lib/serviceContracts/presets";
import { matchTeamVenue } from "@/lib/serviceContracts/teamVenues";
import { buildServiceProposalIntro, cityStateFromAddress } from "@/lib/serviceContracts/serviceProposalIntro";
import type { ServicePricingDocument } from "@/types/servicePricing";
import type { ProposalType } from "@/types";
import type { ServiceAgreementFeeRow } from "@/app/components/templates/proposal-pdf/sections/PdfServiceAgreement";

type StandardServiceSectionId = "intro" | "ancResponsibilities" | "purchaserResponsibilities" | "term" | "compensation" | "signature";

type StandardSectionOverride = { enabled?: boolean; bodyText?: string };

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
    const manualFeeRows = ((watch("details.serviceManualFeeRows" as any) as ServiceAgreementFeeRow[]) || []);
    const serviceProposalIntro = (watch("details.serviceProposalIntro" as any) as string) || "";
    const todayFormatted = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
    // Auto-detect the venue from the team so the placeholders show what the
    // contract will use before the user types anything.
    const detectedTeamVenue = matchTeamVenue(scPurchaserName || receiverName);
    const overrides = (watch("details.termExhibitOverrides" as any) || {}) as Record<string, { enabled?: boolean; bodyMarkdown?: string }>;
    const sectionOverrides = (watch("details.serviceSectionOverrides" as any) || {}) as Record<string, StandardSectionOverride>;
    const sectionModeKey = isServiceProposal ? "SERVICE_PROPOSAL" : "SERVICE_CONTRACT";
    const getSectionOverride = (id: StandardServiceSectionId): StandardSectionOverride =>
        sectionOverrides[`${sectionModeKey}:${id}`] || sectionOverrides[id] || {};

    const resolved = useMemo(() => resolveExhibits(template, overrides), [template, overrides]);
    const [openExhibit, setOpenExhibit] = useState<string | null>(null);
    const [openSection, setOpenSection] = useState<string | null>(isServiceProposal ? "intro" : null);

    const defaultManualFeeRows = useMemo<ServiceAgreementFeeRow[]>(() => {
        const startYear = Number((scTermStart.match(/\b(19|20)\d{2}\b/) || [])[0]);
        const endYear = Number((scTermEnd.match(/\b(19|20)\d{2}\b/) || [])[0]);
        const count = startYear && endYear && endYear >= startYear ? Math.max(1, endYear - startYear) : 3;
        return Array.from({ length: Math.min(count, 10) }, (_, idx) => ({
            contractYear: startYear ? `${startYear + idx}-${startYear + idx + 1}` : `Contract Year ${idx + 1}`,
            monthlyFee: "",
        }));
    }, [scTermEnd, scTermStart]);

    const visibleManualFeeRows = manualFeeRows.length > 0 ? manualFeeRows : defaultManualFeeRows;

    const setManualFeeRows = (rows: ServiceAgreementFeeRow[]) => {
        setValue("details.serviceManualFeeRows" as any, rows, { shouldDirty: true });
    };

    const updateManualFeeRow = (idx: number, key: keyof ServiceAgreementFeeRow, value: string) => {
        const rows = [...visibleManualFeeRows];
        rows[idx] = { ...rows[idx], [key]: value };
        setManualFeeRows(rows);
    };

    const addManualFeeRow = () => {
        setManualFeeRows([
            ...visibleManualFeeRows,
            { contractYear: `Contract Year ${visibleManualFeeRows.length + 1}`, monthlyFee: "" },
        ]);
    };

    const removeManualFeeRow = (idx: number) => {
        const rows = visibleManualFeeRows.filter((_, rowIdx) => rowIdx !== idx);
        setManualFeeRows(rows.length > 0 ? rows : [{ contractYear: "Contract Year 1", monthlyFee: "" }]);
    };

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

    const setSectionEnabled = (id: StandardServiceSectionId, enabled: boolean) => {
        const current = { ...(getValues("details.serviceSectionOverrides" as any) || {}) } as Record<string, StandardSectionOverride>;
        const key = `${sectionModeKey}:${id}`;
        current[key] = { ...(current[key] || {}), enabled };
        setValue("details.serviceSectionOverrides" as any, current, { shouldDirty: true });
    };

    const setSectionBody = (id: StandardServiceSectionId, bodyText: string) => {
        const current = { ...(getValues("details.serviceSectionOverrides" as any) || {}) } as Record<string, StandardSectionOverride>;
        const key = `${sectionModeKey}:${id}`;
        current[key] = { ...(current[key] || {}), bodyText };
        setValue("details.serviceSectionOverrides" as any, current, { shouldDirty: true });
        if (id === "intro" && isServiceProposal) {
            setValue("details.serviceProposalIntro" as any, bodyText, { shouldDirty: true });
        }
        if (id === "signature") {
            setValue("details.serviceContractSignatureText" as any, bodyText, { shouldDirty: true });
        }
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

    const contractIntroText =
        `AGREEMENT (“Agreement”) dated ${scAgreementDate || todayFormatted} between ANC SPORTS ENTERPRISES, LLC, a Delaware limited liability company located at 2 Manhattanville Road, Purchase, NY 10577 (“ANC”) and ${scPurchaserName || receiverName || "Purchaser"} with office at ${scPurchaserAddress || "________"}.\n\n` +
        `WHEREAS, ANC has expertise in the maintenance of video-based light-emitting diode (“LED”) modules (the “LED Modules”).\n\n` +
        `WHEREAS, Purchaser plays in the sports and entertainment facility currently known as ${scVenueName || detectedTeamVenue?.venue || "________"} (the “Stadium”), in which LED Modules and the necessary hardware, software, equipment and connections required to operate the Stadium LED Modules (collectively, the “LED System”) have been installed for use at NFL Games and other events; and which Purchaser wishes to have ANC maintain such LED System;\n\n` +
        `NOW, THEREFORE, the parties hereto hereby agree as follows:`;

    const standardSections = (isServiceProposal
        ? [
            { id: "intro" as const, label: "Intro / Whereas", defaultBody: defaultIntroText },
            { id: "compensation" as const, label: "Compensation", defaultBody: "" },
        ]
        : [
            { id: "intro" as const, label: "Intro / Whereas", defaultBody: contractIntroText },
            {
                id: "ancResponsibilities" as const,
                label: "ANC's Responsibilities",
                defaultBody:
                    `WHEREAS, ANC has expertise in the maintenance of video-based light-emitting diode (“LED”) modules (the “LED Modules”); and\n\n` +
                    `WHEREAS, Purchaser operates the sports and entertainment facility currently known as ${scVenueName || detectedTeamVenue?.venue || "________"} (the "Stadium"), in which LED Modules and the necessary hardware, parts, equipment and connections required to service and maintain the Stadium’s LED Modules (collectively, the “LED System”) are provided by the Purchaser for their use in NFL games, and additional events at the Stadium, and Purchaser wishes to have ANC service and maintain such LED System.\n\n` +
                    `ANC shall provide Maintenance Staff as defined in Exhibit A – Service Overview.\nANC shall provide service as defined in Exhibit A for Display List as defined in Exhibit B\nANC will also provide a trained and capable representative or representatives to work with Purchaser throughout the Term to service and maintain the LED System for the duration of the term.\nANC will provide 24/7 365 tech support at no additional cost to assist with any hardware issues that occur.`,
            },
            {
                id: "purchaserResponsibilities" as const,
                label: "Purchaser's Responsibilities",
                defaultBody:
                    `Purchaser shall supply, at its expense, the electricity required for the operation of the LED System.\n` +
                    `Purchaser will provide at its cost the raw unencoded data feed from any sports information service for display on the LED Modules.\n` +
                    `Purchaser shall provide at no cost to ANC or its technicians full access credentials and complimentary parking at The Stadium parking lot (as needed) for each NFL Game for the purposes of carrying out ANC’s obligations hereunder. Such ANC personnel shall comply with all applicable Stadium rules and regulations in connection with their activities hereunder. The Purchaser shall use best efforts to ensure that ANC’s technicians have easy physical access to the LED Modules. If lifts, cranes or other equipment are required to access any portion of the ANC LED displays, the Purchaser will be responsible for providing.`,
            },
            { id: "term" as const, label: "Term", defaultBody: `The term or this agreement (“Term”) shall begin on ${scTermStart || "________"}, and end on ${scTermEnd || "________"}` },
            {
                id: "compensation" as const,
                label: "Compensation",
                defaultBody:
                    `As compensation for the services described in Section 1, the Company shall pay ANC an annual service fee as follows:\n\n` +
                    `Payment Schedule. The annual service fee for each Contract Year shall be payable in six (6) equal monthly installments. The first installment shall be due on August 1st of the applicable Contract Year, with subsequent installments due on the first (1st) day of each month thereafter, and the final installment due on January 1, 2030.`,
            },
            { id: "signature" as const, label: "Signature Block", defaultBody: template.signatureBlockText },
        ]);

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

                <div className="space-y-2 border-b border-border/30 pb-4">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <Label className="text-sm font-semibold">Manual Pricing Fallback</Label>
                            <p className="text-[11px] text-muted-foreground">
                                {svcDoc
                                    ? "The imported fee schedule is currently rendering. These rows are saved as the fallback if the sheet is removed."
                                    : "Used when no service sheet is imported. Imported schedules still take priority."}
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={addManualFeeRow}
                            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-xs font-medium text-foreground hover:bg-muted"
                        >
                            <Plus className="h-3.5 w-3.5" />
                            Add Row
                        </button>
                    </div>
                    <div className="space-y-2">
                        {visibleManualFeeRows.map((row, idx) => (
                            <div key={idx} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                                <Input
                                    value={row.contractYear}
                                    onChange={(e) => updateManualFeeRow(idx, "contractYear", e.target.value)}
                                    placeholder={`Contract Year ${idx + 1}`}
                                />
                                <Input
                                    value={row.monthlyFee}
                                    onChange={(e) => updateManualFeeRow(idx, "monthlyFee", e.target.value)}
                                    placeholder="$0.00"
                                />
                                <button
                                    type="button"
                                    onClick={() => removeManualFeeRow(idx)}
                                    className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
                                    aria-label="Remove manual fee row"
                                >
                                    <Trash2 className="h-4 w-4" />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="space-y-2 border-b border-border/30 pb-4">
                    <div>
                        <Label className="text-sm font-semibold">Document Sections</Label>
                        <p className="text-[11px] text-muted-foreground">
                            Toggle a section off to remove it from the preview. Body edits change only the section text; the styled blue header stays in the template.
                        </p>
                    </div>
                    {standardSections.map((section) => {
                        const isOpen = openSection === section.id;
                        const override = getSectionOverride(section.id);
                        const enabled = override.enabled ?? true;
                        const legacyProposalIntro = section.id === "intro" && isServiceProposal ? serviceProposalIntro : "";
                        const bodyValue = (override.bodyText ?? legacyProposalIntro) || section.defaultBody;
                        const hasBodyOverride = !!(
                            (typeof override.bodyText === "string" && override.bodyText.trim())
                            || legacyProposalIntro.trim()
                        );
                        return (
                            <div key={section.id} className="border border-border/50 rounded-md">
                                <div className="flex items-center justify-between px-3 py-2.5">
                                    <button
                                        type="button"
                                        onClick={() => setOpenSection(isOpen ? null : section.id)}
                                        className="flex items-center gap-1.5 text-sm font-medium text-foreground text-left"
                                    >
                                        {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                                        <span>{section.label}</span>
                                        {hasBodyOverride && (
                                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-400">edited</span>
                                        )}
                                    </button>
                                    <Switch
                                        checked={enabled}
                                        onCheckedChange={(checked) => setSectionEnabled(section.id, checked)}
                                        className="data-[state=checked]:bg-brand-blue"
                                    />
                                </div>
                                {isOpen && (
                                    <div className="px-3 pb-3 pt-1 border-t border-border/30">
                                        <Label className="text-[11px] text-muted-foreground mb-1.5 block">Body text</Label>
                                        <Textarea
                                            className="min-h-[120px] text-[12px]"
                                            value={bodyValue}
                                            onChange={(e) => setSectionBody(section.id, e.target.value)}
                                            placeholder={section.defaultBody || "This section uses the pricing table below. Add supporting text here only if needed."}
                                        />
                                        <p className="text-[10px] text-muted-foreground mt-1">
                                            Leave empty to use the template default. The blue section header is not editable here.
                                        </p>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

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

                </>)}
            </CardContent>
        </Card>
    );
}
