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
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronDown, ChevronRight } from "lucide-react";
import { getDefaultTemplate, resolveExhibits } from "@/lib/serviceContracts/registry";
import { getPreset } from "@/lib/serviceContracts/presets";
import type { ProposalType } from "@/types";

export function ServiceContractTermsPanel() {
    const { watch, setValue, getValues } = useFormContext<ProposalType>();
    const template = getDefaultTemplate();

    const templateId = (watch("details.serviceContractTemplateId" as any) as string) || "ravens";
    const projectType = (watch("details.serviceContractProjectType" as any) as string) || "";
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

    return (
        <Card className="bg-card/40 border border-border/60">
            <CardHeader className="pb-3">
                <CardTitle className="text-sm">Service Contract Terms &amp; Exhibits</CardTitle>
                <p className="text-[11px] text-muted-foreground">
                    Template: {template.name}. Toggle exhibits on/off and edit each clause per-instance. Legal language is verbatim — edits preserve wording.
                </p>
            </CardHeader>
            <CardContent className="space-y-4">
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
            </CardContent>
        </Card>
    );
}