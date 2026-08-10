"use client";

import { useFormContext } from "react-hook-form";

import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { RichTextarea } from "@/components/ui/rich-textarea";
import type { ProposalType } from "@/types";

/**
 * Scope of Work — the toggle and the box you type it into, together.
 *
 * The toggle used to sit alone in Step 4's section list while the only editor
 * for the text lived in a different step, inside the LOI tab of the Screens
 * "Document Text Settings" accordion. Turning Scope of Work on in a Budget or
 * Proposal document gave an author no way at all to write one (Natalia
 * 2026-08-10). The body now opens directly beneath the switch, in every
 * document type that offers the section.
 */
export const ScopeOfWorkControl = ({ idSuffix }: { idSuffix: string }) => {
    const { watch, setValue } = useFormContext<ProposalType>();
    const enabled = watch("details.showScopeOfWork") || false;
    const text = (watch("details.scopeOfWorkText" as any) as string) || "";
    const id = `showScopeOfWork-${idSuffix}`;

    return (
        <div className="flex flex-col gap-3 py-3 border-b border-border/30">
            <div className="flex items-start justify-between gap-4">
                <div className="flex flex-col min-w-0">
                    <Label htmlFor={id} className="text-sm font-semibold text-foreground block">Scope of Work</Label>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">Include Scope of Work text (Exhibit B)</p>
                </div>
                <Switch
                    id={id}
                    checked={enabled}
                    onCheckedChange={(checked) => setValue("details.showScopeOfWork", checked, { shouldDirty: true, shouldTouch: true })}
                    className="data-[state=checked]:bg-brand-blue shrink-0 mt-0.5"
                />
            </div>
            {enabled && (
                <RichTextarea
                    id={`scopeOfWorkText-${idSuffix}`}
                    data-rich-editor="proposal-scope-of-work"
                    value={text}
                    onValueChange={(next) => setValue("details.scopeOfWorkText" as any, next, { shouldDirty: true, shouldTouch: true })}
                    placeholder={"Describe the scope of work…\n\n- Furnish and install the LED displays listed above\n- Commission the control system and train operations staff"}
                    className="min-h-[120px] text-xs resize-y"
                    hint={(
                        <p className="text-[10px] text-muted-foreground">
                            Renders as “Exhibit B — Statement of Work”. Leave it blank and the section stays out of the document.
                        </p>
                    )}
                />
            )}
        </div>
    );
};

export default ScopeOfWorkControl;
