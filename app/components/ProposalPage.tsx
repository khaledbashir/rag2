"use client";

import { useEffect, useRef, useCallback, useMemo } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { isMirrorMode as checkMirrorMode } from "@/lib/modeDetection";
import { Wizard, useWizard } from "react-use-wizard";

// Components
import StudioLayout from "@/app/components/layout/StudioLayout";
import { StudioHeader } from "@/app/components/layout/StudioHeader";
import PdfViewer from "@/app/components/proposal/actions/PdfViewer";
import RfpSidebar from "@/app/components/proposal/RfpSidebar";
import ActionToolbar from "@/app/components/ActionToolbar";
import { WizardStep } from "@/app/components";
import {
  Step1Ingestion,
  Step2Intelligence,
  Step3Math,
  Step4Export
} from "@/app/components/proposal/form/wizard/steps";

// Context
import { useProposalContext, ProposalContextProvider } from "@/contexts/ProposalContext";
import { FEATURES } from "@/lib/featureFlags";
import { EmbeddingStatusBanner } from "@/app/components/proposal/form/wizard/EmbeddingStatusBanner";

import AuditTable from "@/app/components/proposal/AuditTable";
import CopilotPanel from "@/app/components/chat/CopilotPanel";
import { ProposalFormErrorBoundary } from "@/app/components/ProposalFormErrorBoundary";
import { Badge } from "@/components/ui/badge";

// Types
import { ProposalType } from "@/types";

// Hooks
import useAutoSave from "@/lib/useAutoSave";

interface ProposalPageProps {
  initialData?: Partial<ProposalType>;
  projectId?: string;
}

/**
 * WizardWrapper - Provides wizard context to both stepper and form
 * PROMPT 56: Single hydration authority - this is the ONLY place that sets form state on load
 */
const WizardWrapper = ({ projectId, initialData, twentyOpportunityId }: ProposalPageProps) => {
  const { handleSubmit, setValue, getValues, reset, control } = useFormContext<ProposalType>();
  const { onFormSubmit, importANCExcel, excelImportLoading, setInitialDataApplied } = useProposalContext();
  const wizard = useWizard();
  const { activeStep } = wizard;

  const details = useWatch({ name: "details", control });
  const isMirrorMode = checkMirrorMode(details);

  // Skip to Step 2 (Intelligence) when proposal was created from PDF Filter
  // Reads from DB field (proposal.source) via initialData, not URL params
  const rfpSkipHandled = useRef(false);
  useEffect(() => {
    if (rfpSkipHandled.current) return;
    const source = initialData?.details?.source;
    if (source === "rfp_filter" && activeStep === 0) {
      rfpSkipHandled.current = true;
      wizard.goToStep(1);
    }
  }, [initialData, activeStep, wizard]);

  // PROMPT 56: Single hydration path - ONE function that sets EVERYTHING
  const normalizedProjectId = projectId && projectId !== "new" ? projectId : null;
  const hydrationCompleteRef = useRef(false);
  const lastProjectIdRef = useRef<string | undefined>(projectId);

  // Reset hydration guard when projectId changes (navigation)
  useEffect(() => {
    if (lastProjectIdRef.current !== projectId) {
      hydrationCompleteRef.current = false;
      lastProjectIdRef.current = projectId;
    }
  }, [projectId]);

  // PROMPT 56: SINGLE HYDRATION FUNCTION - runs ONCE per project load
  useEffect(() => {
    // Skip if no initialData or Excel import in progress
    if (!initialData || excelImportLoading) return;
    
    // Skip if already hydrated for this project
    if (hydrationCompleteRef.current) return;

    // PROMPT 56: ONE function that sets EVERYTHING from database
    // Apply form data
    reset(initialData);

    // Ensure proposalId is set
    if (normalizedProjectId) {
      setValue("details.proposalId" as any, normalizedProjectId);
    }

    // Mirror Mode currency carry-through: older proposals have the detected currency
    // stored only on pricingDocument.currency. Sync it onto details.currency so every
    // consumer (Step 3/4, PDF, Excel export) renders the correct symbol without the
    // user having to re-pick it in Step 4.
    const pricingDocCurrency = (initialData as any)?.details?.pricingDocument?.currency as string | undefined;
    const explicitCurrency = (initialData as any)?.details?.currency as string | undefined;
    if (pricingDocCurrency && pricingDocCurrency !== "USD" && (!explicitCurrency || explicitCurrency === "USD")) {
      setValue("details.currency" as any, pricingDocCurrency, { shouldDirty: false });
    }

    // Mark as complete - prevents any other hydration paths from running
    hydrationCompleteRef.current = true;
    if (setInitialDataApplied) {
      setInitialDataApplied(true);
    }
  }, [initialData, normalizedProjectId, reset, setValue, excelImportLoading, projectId, setInitialDataApplied]);

  // Auto-Save
  const { status: saveStatus } = useAutoSave({
    projectId: projectId || null,
    debounceMs: 2000
  });

  // Header: Logo | Stepper (center) | Actions
  const HeaderContent = (
    <StudioHeader
      saveStatus={saveStatus}
      initialData={initialData}
      excelImportLoading={excelImportLoading}
      onImportExcel={importANCExcel}
      onExportPdf={() => handleSubmit(onFormSubmit)()}
      projectId={projectId ?? undefined}
      twentyOpportunityId={twentyOpportunityId}
    />
  );

  // Form Content (The Hub - Drafting Mode)
  const effectiveStep = activeStep;
  const formSource = useWatch({ name: "details.source" as any, control }) as string | undefined;
  const formProposalId = useWatch({ name: "details.proposalId" as any, control }) as string | undefined;
  const isFromFilter = formSource === "rfp_filter";
  const FormContent = (
    <div className="flex flex-col h-full">
      {/* Embedding pipeline status — visible on ALL steps for rfp_filter projects */}
      {isFromFilter && formProposalId && formProposalId !== "new" && (
        <div className="px-6 pt-4 shrink-0">
          <EmbeddingStatusBanner projectId={formProposalId} />
        </div>
      )}

      {/* ActionToolbar: only visible in drafting mode */}
      <div className="px-6 pt-6 shrink-0">
        <ActionToolbar />
      </div>

      <div className="flex-1 overflow-auto custom-scrollbar">
        <ProposalFormErrorBoundary>
          {effectiveStep === 0 && (
            <WizardStep>
              <Step1Ingestion />
            </WizardStep>
          )}
          {effectiveStep === 1 && (
            <WizardStep>
              <Step2Intelligence />
            </WizardStep>
          )}
          {activeStep === 2 && (
            <WizardStep>
              <Step3Math />
            </WizardStep>
          )}
          {effectiveStep === 3 && (
            <WizardStep>
              <Step4Export />
            </WizardStep>
          )}
        </ProposalFormErrorBoundary>
      </div>
    </div>
  );

  // AI Content (The Hub - Intelligence Mode)
  const AIContent = (
    <div className="h-full flex flex-col">
      <RfpSidebar />
    </div>
  );

  // Audit Content (The Hub - Audit Mode / Margin Analysis)
  const AuditContent = (
    <div className="h-full min-h-0 flex flex-col p-6 space-y-6">
      <div className="shrink-0 flex items-center justify-between bg-zinc-900/40 p-5 rounded-xl border border-zinc-800">
        <div>
          <h2 className="text-xl font-semibold text-white">Financial Audit</h2>
          <p className="text-xs text-zinc-500">Real-time margin verification and profitability analysis.</p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          {FEATURES.STRATEGIC_MATCH_BADGE && (
            <Badge className="bg-[#0A52EF]/10 text-[#0A52EF] border-[#0A52EF]/10 font-semibold px-2 py-0.5 rounded" title="Strategic match score (Phase 2)">17/20 Strategic Match</Badge>
          )}
          <span className="text-[10px] text-zinc-500 font-medium">Natalia Math Engine Active</span>
        </div>
      </div>

      <div className="flex-1 min-h-[320px] overflow-auto custom-scrollbar">
        <AuditTable />
      </div>
    </div>
  );

  // Copilot: form fill context for guided mode
  const formFillContext = useMemo(() => ({ setValue, getValues }), [setValue, getValues]);

  // Copilot: detect if project has existing data (Excel uploaded / screens exist)
  const screens = useWatch({ name: "details.screens", control }) as any[] | undefined;
  const hasExistingData = isMirrorMode || ((screens?.length ?? 0) > 0);
  const isNewProject = !projectId || projectId === "new";

  // Copilot: send messages via THIS PROJECT's AnythingLLM workspace (freeform mode)
  const handleCopilotMessage = useCallback(async (message: string, _history: any[]) => {
    if (!projectId || projectId === "new") {
      return "Save this project first to enable AI Copilot. The AI workspace is created when the project is saved.";
    }

    const useAgent = message.startsWith("@agent");

    const res = await fetch("/api/copilot/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, message, useAgent }),
    });

    const data = await res.json();
    if (!res.ok) return data.response || data.error || "AI request failed";

    let content = data.response || "No response received.";
    // Strip <think> tags if present
    if (content.includes("<think>")) {
      content = content.replace(/<think>[\s\S]*?<\/think>/, "").trim();
    }
    return content;
  }, [projectId]);

  // PDF Content (The Anchor)
  const PDFContent = (
    <div className="w-full h-full">
      <PdfViewer />
    </div>
  );

  return (
    <>
      <StudioLayout
        header={HeaderContent}
        formContent={FormContent}
        aiContent={AIContent}
        auditContent={isMirrorMode ? null : AuditContent}
        showAudit={!isMirrorMode}
        pdfContent={PDFContent}
      />
      <CopilotPanel
        onSendMessage={handleCopilotMessage}
        formFillContext={formFillContext}
        projectId={projectId}
        isNewProject={isNewProject}
        hasExistingData={hasExistingData}
        currentStep={activeStep}
        onNavigateStep={(step) => wizard.goToStep(step)}
      />
    </>
  );
};

/**
 * ProposalPage - Main workspace with Wizard context provider.
 * Wraps with a scoped ProposalContextProvider so initialData/projectId are available
 * in context; this ensures new projects get a clean Excel state (no stale cache).
 */
const ProposalPage = ({ initialData, projectId, twentyOpportunityId }: ProposalPageProps) => {
  return (
    <ProposalContextProvider initialData={initialData} projectId={projectId}>
      <Wizard header={<WizardWrapper initialData={initialData} projectId={projectId} twentyOpportunityId={twentyOpportunityId} />}>
        <div className="hidden" />
        <div className="hidden" />
        <div className="hidden" />
        <div className="hidden" />
      </Wizard>
    </ProposalContextProvider>
  );
};

export default ProposalPage;
