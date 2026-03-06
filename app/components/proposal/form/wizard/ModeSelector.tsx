"use client";

import { useFormContext } from "react-hook-form";
import { FileSpreadsheet, PenTool, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export type WorkflowMode = "mirror" | "intelligence" | "ai-import";

interface ModeSelectorProps {
  onSelect: (mirror: boolean, mode?: WorkflowMode) => void;
}

/**
 * ModeSelector — Full-screen gate shown before Step 1 on new projects.
 * Three options: Upload Excel (Mirror), AI Import (BETA), Build from Scratch.
 */
const ModeSelector = ({ onSelect }: ModeSelectorProps) => {
  const { setValue } = useFormContext();

  const handleSelect = (mode: WorkflowMode) => {
    if (mode === "mirror") {
      setValue("details.mirrorMode", true, { shouldDirty: true });
      setValue("details.calculationMode", "MIRROR", { shouldDirty: true });
      onSelect(true, "mirror");
    } else if (mode === "ai-import") {
      setValue("details.mirrorMode", true, { shouldDirty: true });
      setValue("details.calculationMode", "MIRROR", { shouldDirty: true });
      setValue("details.aiImport", true, { shouldDirty: true });
      onSelect(true, "ai-import");
    } else {
      setValue("details.mirrorMode", false, { shouldDirty: true });
      setValue("details.calculationMode", "INTELLIGENCE", { shouldDirty: true });
      onSelect(false, "intelligence");
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] px-6 py-12 animate-in fade-in duration-500">
      <div className="text-center mb-10">
        <h1 className="text-2xl font-bold text-foreground tracking-tight">
          How would you like to start?
        </h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-lg mx-auto">
          Choose your workflow. You can switch modes later if needed.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-4xl w-full">
        {/* Mirror Mode */}
        <button
          type="button"
          onClick={() => handleSelect("mirror")}
          className={cn(
            "group relative flex flex-col items-center text-center p-8 rounded-xl",
            "border-2 border-brand-blue/30 bg-brand-blue/5 hover:border-brand-blue/50 hover:bg-brand-blue/10",
            "transition-all duration-200 cursor-pointer"
          )}
        >
          <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-5 bg-brand-blue/10 group-hover:bg-brand-blue/20 transition-colors duration-200">
            <FileSpreadsheet className="w-6 h-6 text-brand-blue" />
          </div>
          <h3 className="text-sm font-semibold text-foreground mb-2">
            Upload Excel → PDF
          </h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            I have a completed Excel with pricing. Convert it to a branded proposal PDF.
          </p>
          <div className="mt-5 px-4 py-1.5 rounded-md border border-brand-blue/30 text-xs font-medium text-brand-blue group-hover:bg-brand-blue group-hover:text-white transition-all duration-200">
            Select
          </div>
        </button>

        {/* AI Import BETA */}
        <button
          type="button"
          onClick={() => handleSelect("ai-import")}
          className={cn(
            "group relative flex flex-col items-center text-center p-8 rounded-xl",
            "border border-amber-400/40 bg-amber-50/50 hover:border-amber-400/60 hover:bg-amber-50/80",
            "dark:bg-amber-950/20 dark:border-amber-400/30 dark:hover:border-amber-400/50",
            "transition-all duration-200 cursor-pointer"
          )}
        >
          {/* BETA badge */}
          <div className="absolute -top-2.5 right-4 px-2.5 py-0.5 rounded-full bg-amber-400 text-[10px] font-bold uppercase tracking-widest text-amber-950">
            BETA
          </div>
          <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-5 bg-amber-100 group-hover:bg-amber-200 dark:bg-amber-900/30 transition-colors duration-200">
            <Sparkles className="w-6 h-6 text-amber-600" />
          </div>
          <h3 className="text-sm font-semibold text-foreground mb-2">
            AI-Powered Import
          </h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Upload any Excel — AI reads it and builds the proposal. Works with any template format.
          </p>
          <div className="mt-5 px-4 py-1.5 rounded-md border border-amber-400/40 text-xs font-medium text-amber-700 dark:text-amber-400 group-hover:bg-amber-400 group-hover:text-amber-950 transition-all duration-200">
            Try It
          </div>
        </button>

        {/* Intelligence Mode */}
        <button
          type="button"
          onClick={() => handleSelect("intelligence")}
          className={cn(
            "group relative flex flex-col items-center text-center p-8 rounded-xl border border-border bg-card",
            "hover:border-foreground/20 hover:bg-muted/30",
            "transition-all duration-200 cursor-pointer"
          )}
        >
          <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-5 bg-muted/50 group-hover:bg-muted transition-colors duration-200">
            <PenTool className="w-6 h-6 text-muted-foreground group-hover:text-foreground" />
          </div>
          <h3 className="text-sm font-semibold text-foreground mb-2">
            Build from Scratch
          </h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Start a new proposal without an RFP. Add screens and configure pricing manually.
          </p>
          <div className="mt-5 px-4 py-1.5 rounded-md border border-border text-xs font-medium text-muted-foreground group-hover:border-foreground/30 group-hover:text-foreground transition-all duration-200">
            Select
          </div>
        </button>
      </div>
    </div>
  );
};

export default ModeSelector;
