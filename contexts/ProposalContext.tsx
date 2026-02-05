"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { useRouter } from "next/navigation";

// RHF
import { useFormContext } from "react-hook-form";

// Hooks
import useToasts from "@/hooks/useToasts";

// Services
import { exportProposal } from "@/services/proposal/client/exportProposal";

// Variables
import {
  FORM_DEFAULT_VALUES,
  GENERATE_PDF_API,
  SEND_PDF_API,
  SHORT_DATE_OPTIONS,
  LOCAL_STORAGE_PROPOSAL_DRAFT_KEY,
} from "@/lib/variables";

// Types
import { ExportTypes, ProposalType } from "@/types";
import type { VerificationManifest, Exception as VerificationException } from "@/types/verification";

// Estimator / Audit
import { calculateProposalAudit } from "@/lib/estimator";
import { roundToCents } from "@/lib/decimal";
import Decimal from "decimal.js";

// Risk Detector
import { detectRisks, RiskItem } from "@/services/risk-detector";
import * as xlsx from "xlsx";

type ExcelPreviewMerge = { s: { r: number; c: number }; e: { r: number; c: number } };
export type ExcelPreviewSheet = {
  name: string;
  grid: string[][];
  merges: ExcelPreviewMerge[];
  hiddenRows: boolean[];
  colWidths: Array<number | null>;
  validationIssue: boolean;
  hasNumericDimensions: boolean;
};

export type ExcelPreview = {
  fileName: string;
  sheets: ExcelPreviewSheet[];
  loadedAt: number;
};

const defaultProposalContext = {
  proposalPdf: new Blob(),
  proposalPdfLoading: false,
  pdfGenerationProgress: null as { value: number; label: string } | null,
  pdfBatchProgress: null as { current: number; total: number; label: string } | null,
  excelImportLoading: false,
  excelPreviewLoading: false,
  excelPreview: null as ExcelPreview | null,
  excelValidationOk: false,
  excelSourceData: null as any,
  verificationManifest: null as VerificationManifest | null,
  verificationExceptions: [] as VerificationException[],
  loadExcelPreview: (file: File) => Promise.resolve(),
  savedProposals: [] as ProposalType[],
  pdfUrl: null as string | null,
  activeTab: "client",
  setActiveTab: (tab: string) => { },
  onFormSubmit: (values: ProposalType) => { },
  newProposal: () => { },
  resetProposal: () => { },
  generatePdf: async (data: ProposalType) => new Blob(),
  removeFinalPdf: () => { },
  downloadPdf: async () => { },
  downloadAllPdfVariants: async () => Promise.resolve(),
  downloadBundlePdfs: async () => Promise.resolve(),
  printPdf: () => { },
  printLivePreview: () => { },
  previewPdfInTab: () => { },
  saveProposalData: () => { },
  saveDraft: (): Promise<{ created: boolean; projectId?: string; error?: string }> => Promise.resolve({ created: false }),
  deleteProposalData: (index: number) => { },
  // Backwards-compatible alias
  deleteProposal: (index: number) => { },
  sendPdfToMail: (email: string): Promise<void> => Promise.resolve(),
  exportProposalDataAs: (exportAs: ExportTypes) => { },
  // Backwards-compatible alias
  exportProposalAs: (exportAs: ExportTypes) => { },
  exportAudit: () => Promise.resolve(),
  importProposalData: (file: File) => { },
  importANCExcel: (file: File) => Promise.resolve(),
  // Diagnostic functions
  diagnosticOpen: false,
  diagnosticPayload: null,
  openDiagnostic: (payload: any) => { },
  closeDiagnostic: () => { },
  submitDiagnostic: (answers: any) => { },
  lowMarginAlerts: [] as any[],
  // RFP functions
  rfpDocumentUrl: null as string | null,
  rfpDocuments: [] as { id: string, name: string, url: string, createdAt: string }[],
  refreshRfpDocuments: async () => { },
  deleteRfpDocument: (id: string) => Promise.resolve(false),
  aiWorkspaceSlug: null as string | null,
  rfpQuestions: [] as Array<{ id: string; question: string; answer: string | null; answered: boolean; order: number }>,
  uploadRfpDocument: (file: File) => Promise.resolve(),
  reExtractRfp: () => Promise.resolve(null as any),
  answerRfpQuestion: (questionId: string, answer: string) => Promise.resolve(),
  filterStats: null as { originalPages: number; keptPages: number; drawingCandidates: number[]; visionDisabled?: boolean } | null,
  sidebarMode: "HEALTH" as "HEALTH" | "CHAT",
  setSidebarMode: (mode: "HEALTH" | "CHAT") => { },
  // Command execution
  applyCommand: (command: any) => { },
  executeAiCommand: async (message: string) => { },
  aiMessages: [] as any[],
  aiLoading: false,
  duplicateScreen: (index: number) => { },
  // AI & Verification
  aiFields: [] as string[],
  aiCitations: {} as Record<string, string>,
  verifiedFields: {} as Record<string, { verifiedBy: string; verifiedAt: string }>,
  setFieldVerified: (fieldPath: string, userName: string) => { },
  aiFieldTimestamps: {} as Record<string, number>,
  unverifiedAiFields: [] as string[],
  isGatekeeperLocked: false,
  trackAiFieldModification: (fieldNames: string[]) => { },
  isFieldGhostActive: (fieldName: string) => false,
  rulesDetected: null as any,
  setRulesDetected: (rules: any) => { },
  // Core State
  proposal: null as any,
  headerType: "PROPOSAL" as "LOI" | "PROPOSAL" | "BUDGET",
  setHeaderType: (type: "LOI" | "PROPOSAL" | "BUDGET") => { },
  calculationMode: "MIRROR" as "MIRROR" | "INTELLIGENCE",
  setCalculationMode: (mode: "MIRROR" | "INTELLIGENCE") => { },
  risks: [] as RiskItem[],
  setRisks: (risks: RiskItem[]) => { },
  // Excel Editing
  updateExcelCell: (sheetName: string, row: number, col: number, value: string) => { },
};

export const ProposalContext = createContext(defaultProposalContext);

export const useProposalContext = () => {
  return useContext(ProposalContext);
};

type ProposalContextProviderProps = {
  children: React.ReactNode;
  initialData?: any; // Hydration data
  projectId?: string; // DB ID
};

export const ProposalContextProvider = ({
  children,
  initialData,
  projectId
}: ProposalContextProviderProps) => {
  const router = useRouter();

  // Toasts
  const {
    newProposalSuccess,
    pdfGenerationSuccess,
    saveProposalSuccess,
    modifiedProposalSuccess,
    sendPdfSuccess,
    sendPdfError,
    importProposalError,
    aiExtractionSuccess,
    aiExtractionError,
    error: showError,
  } = useToasts();

  // Get form values and methods from form context
  const { getValues, reset, watch, setValue } = useFormContext<ProposalType>();

  // Variables
  const [proposalPdf, setProposalPdf] = useState<Blob>(new Blob());
  const [proposalPdfLoading, setProposalPdfLoading] = useState<boolean>(false);
  const [pdfGenerationProgress, setPdfGenerationProgress] = useState<{ value: number; label: string } | null>(null);
  const [pdfBatchProgress, setPdfBatchProgress] = useState<{ current: number; total: number; label: string } | null>(null);
  const [excelImportLoading, setExcelImportLoading] = useState<boolean>(false);
  const [excelPreviewLoading, setExcelPreviewLoading] = useState<boolean>(false);
  const [excelPreview, setExcelPreview] = useState<ExcelPreview | null>(null);
  const [excelValidationOk, setExcelValidationOk] = useState<boolean>(false);
  const [excelSourceData, setExcelSourceData] = useState<any | null>(null);
  const [verificationManifest, setVerificationManifest] = useState<VerificationManifest | null>(null);
  const [verificationExceptions, setVerificationExceptions] = useState<VerificationException[]>([]);
  const [activeTab, setActiveTab] = useState<string>("client");

  // Alerts
  const [lowMarginAlerts, setLowMarginAlerts] = useState<Array<{ name: string; marginPct: number }>>([]);

  // RFP state
  const [rfpDocumentUrl, setRfpDocumentUrl] = useState<string | null>(null);
  const [rfpDocuments, setRfpDocuments] = useState<Array<{ id: string; name: string; url: string; createdAt: string }>>([]);
  const [rfpQuestions, setRfpQuestions] = useState<Array<{ id: string; question: string; answer: string | null; answered: boolean; order: number }>>([]);
  const [aiFields, setAiFields] = useState<string[]>([]);
  const [aiCitations, setAiCitations] = useState<Record<string, string>>({});
  const [verifiedFields, setVerifiedFields] = useState<Record<string, { verifiedBy: string; verifiedAt: string }>>({});
  const [aiFieldTimestamps, setAiFieldTimestamps] = useState<Record<string, number>>({});
  const [aiMessages, setAiMessages] = useState<any[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [risks, setRisks] = useState<RiskItem[]>([]);

  const [rulesDetected, setRulesDetected] = useState<any>(null);
  const [filterStats, setFilterStats] = useState<{ originalPages: number; keptPages: number; drawingCandidates: number[] } | null>(null);
  const [sidebarMode, setSidebarMode] = useState<"HEALTH" | "CHAT">("HEALTH");

  // Computed Gatekeeper State
  const unverifiedAiFields = useMemo(() => {
    return aiFields.filter(field => !verifiedFields[field]);
  }, [aiFields, verifiedFields]);

  const isGatekeeperLocked = unverifiedAiFields.length > 0;

  const setFieldVerified = useCallback(async (fieldPath: string, userName: string) => {
    // Optimistic Update
    setVerifiedFields(prev => ({
      ...prev,
      [fieldPath]: {
        verifiedBy: userName,
        verifiedAt: new Date().toISOString()
      }
    }));

    const pid = getValues("details.proposalId");
    if (!pid || pid === "new") return;

    try {
      const res = await fetch(`/api/proposals/${pid}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fieldPath, userName, verified: true })
      });

      if (!res.ok) {
        throw new Error("Failed to sync verification");
      }

      const data = await res.json();
      console.log("Verification synced to DB:", data);
    } catch (error) {
      console.error("Verification sync failed:", error);
      // Revert on error if necessary, but for now we'll just log
      // In a production app we might show a toast
    }
  }, [getValues]);

  // RFP Vault Refresh
  const refreshRfpDocuments = useCallback(async () => {
    const pid = getValues("details.proposalId");
    if (!pid || pid === "new") return;

    try {
      const res = await fetch(`/api/rfp/upload?proposalId=${pid}`);
      if (res.ok) {
        const data = await res.json();
        if (data.docs) setRfpDocuments(data.docs);
      }
    } catch (e) {
      console.error("Failed to refresh RFP docs:", e);
    }
  }, [getValues]);

  // RFP Vault Delete
  const deleteRfpDocument = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/rfp/upload?id=${id}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setRfpDocuments(prev => prev.filter(doc => doc.id !== id));
        // Reset active URL if we deleted the current one
        if (rfpDocumentUrl && rfpDocuments.find(d => d.id === id)?.url === rfpDocumentUrl) {
          setRfpDocumentUrl(null);
        }
        return true;
      }
      return false;
    } catch (error) {
      console.error("Failed to delete RFP document:", error);
      return false;
    }
  }, [rfpDocumentUrl, rfpDocuments]);

  // Calculation Mode - THE PRIMARY BRANCH DECISION GATE
  const [calculationMode, setCalculationModeState] = useState<"MIRROR" | "INTELLIGENCE">(FORM_DEFAULT_VALUES.details.calculationMode);
  const setCalculationMode = useCallback((mode: "MIRROR" | "INTELLIGENCE") => {
    setCalculationModeState(mode);
    setValue("details.calculationMode", mode, { shouldValidate: true, shouldDirty: true });
    setValue("details.mirrorMode", mode === "MIRROR", { shouldValidate: true, shouldDirty: true });
  }, [setValue]);

  // AI Ghost Effect - Track recently modified fields with timestamps
  const trackAiFieldModification = useCallback((fieldNames: string[]) => {
    const now = Date.now();
    const timestamps: Record<string, number> = {};
    fieldNames.forEach(field => {
      timestamps[field] = now;
    });
    setAiFieldTimestamps(prev => ({ ...prev, ...timestamps }));
    setAiFields(prev => Array.from(new Set([...prev, ...fieldNames])));

    // Clear timestamps after 3 seconds (ghost effect duration)
    setTimeout(() => {
      setAiFieldTimestamps(prev => {
        const next = { ...prev };
        fieldNames.forEach(field => delete next[field]);
        return next;
      });
    }, 3000);
  }, []);

  // Check if field should show ghost effect (within 3 seconds of AI modification)
  const isFieldGhostActive = useCallback((fieldName: string): boolean => {
    const timestamp = aiFieldTimestamps[fieldName];
    if (!timestamp) return false;
    return Date.now() - timestamp < 3000;
  }, [aiFieldTimestamps]);

  // Sync isolated AI workspace from form state (set via reset(initialData))
  const aiWorkspaceSlug = watch("details.aiWorkspaceSlug") || null;

  const watchedDocumentType = watch("details.documentType");
  const watchedPricingType = watch("details.pricingType");
  const headerType = useMemo(() => {
    return watchedDocumentType === "LOI"
      ? "LOI"
      : watchedPricingType === "Hard Quoted"
        ? "PROPOSAL"
        : "BUDGET";
  }, [watchedDocumentType, watchedPricingType]);

  const mirrorMode = watch("details.mirrorMode") || false;

  const setHeaderType = useCallback((next: "LOI" | "PROPOSAL" | "BUDGET") => {
    setValue("details.documentMode", next, { shouldValidate: true, shouldDirty: true });

    // Apply mode-specific defaults for PDF sections
    if (next === "LOI") {
      setValue("details.documentType", "LOI", { shouldValidate: true, shouldDirty: true });
      setValue("details.showPaymentTerms", true, { shouldDirty: true });
      setValue("details.showSignatureBlock", true, { shouldDirty: true });
      // Mirror Mode: never enable SOW (static hard-coded content not relevant)
      if (!mirrorMode) {
        setValue("details.showExhibitA", true, { shouldDirty: true });
      }
      setValue("details.showExhibitB", true, { shouldDirty: true });
      setValue("details.showSpecifications", false, { shouldDirty: true });
      return;
    }

    setValue("details.documentType", "First Round", { shouldValidate: true, shouldDirty: true });
    setValue("details.pricingType", next === "PROPOSAL" ? "Hard Quoted" : "Budget", { shouldValidate: true, shouldDirty: true });
    setValue("details.showPaymentTerms", false, { shouldDirty: true });
    setValue("details.showSignatureBlock", false, { shouldDirty: true });
    // Mirror Mode: keep specs hidden (user controls via toggle)
    if (!mirrorMode) {
      setValue("details.showSpecifications", true, { shouldDirty: true });
    }
    setValue("details.showExhibitB", false, { shouldDirty: true });

    if (!mirrorMode && next === "PROPOSAL") {
      setValue("details.showExhibitA", true, { shouldDirty: true });
    } else {
      setValue("details.showExhibitA", false, { shouldDirty: true });
    }
  }, [setValue, mirrorMode]);

  // Saved proposals
  const [savedProposals, setSavedProposals] = useState<ProposalType[]>([]);

  useEffect(() => {
    let savedProposalsDefault;
    if (typeof window !== "undefined") {
      // Saved proposals variables
      const savedProposalsJSON = window.localStorage.getItem("savedProposals");
      try {
        savedProposalsDefault = savedProposalsJSON && savedProposalsJSON.trim() !== ""
          ? JSON.parse(savedProposalsJSON)
          : [];
      } catch (e) {
        console.error("Error parsing savedProposals from localStorage:", e);
        savedProposalsDefault = [];
      }
      setSavedProposals(savedProposalsDefault);
    }
  }, []);

  // Persist full form state with debounce
  useEffect(() => {
    if (typeof window === "undefined") return;
    const subscription = watch((value: any) => {
      try {
        window.localStorage.setItem(
          LOCAL_STORAGE_PROPOSAL_DRAFT_KEY,
          JSON.stringify(value)
        );
      } catch { }
    });
    return () => subscription.unsubscribe();
  }, [watch]);

  // Real-time Risk Detection
  useEffect(() => {
    const subscription = watch(() => {
      const currentValues = getValues();
      if (!currentValues?.details) return; // Defensive check

      const detected = detectRisks(currentValues, rulesDetected);

      // Simple deep equality check to prevent loops
      if (JSON.stringify(detected) !== JSON.stringify(risks)) {
        setRisks(detected);
      }
    });
    return () => subscription.unsubscribe();
  }, [watch, rulesDetected, risks, getValues]);

  // Hydrate from initialData if provided (Server Component support)
  useEffect(() => {
    // @ts-ignore
    if (initialData && typeof reset === 'function') {
      const d = initialData;
      console.log("Hydrating ProposalContext from Server Data:", d.id);

      // Fetch RFP documents
      if (d.id && d.id !== "new") {
        fetch(`/api/rfp/upload?proposalId=${d.id}`)
          .then(res => res.json())
          .then(data => {
            if (data.docs) setRfpDocuments(data.docs);
          })
          .catch(e => console.error("Failed to load RFP docs:", e));
      }

      // Map Prisma model to Form structure
      // Ensure we explicitly map JSON fields
      let details: any = {};
      let sender: any = {};
      let receiver: any = {};

      try {
        details = typeof d.detailsData === 'string' && d.detailsData.trim() !== "" ? JSON.parse(d.detailsData) : d.detailsData || {};
      } catch (e) {
        console.error("Error parsing detailsData:", e);
      }

      try {
        sender = typeof d.senderData === 'string' && d.senderData.trim() !== "" ? JSON.parse(d.senderData) : d.senderData || {};
      } catch (e) {
        console.error("Error parsing senderData:", e);
      }

      try {
        receiver = typeof d.receiverData === 'string' && d.receiverData.trim() !== "" ? JSON.parse(d.receiverData) : d.receiverData || {};
      } catch (e) {
        console.error("Error parsing receiverData:", e);
      }

      const mappedData: ProposalType = {
        sender: {
          name: sender.name || FORM_DEFAULT_VALUES.sender.name,
          address: sender.address || FORM_DEFAULT_VALUES.sender.address,
          zipCode: sender.zipCode || FORM_DEFAULT_VALUES.sender.zipCode,
          city: sender.city || FORM_DEFAULT_VALUES.sender.city,
          country: sender.country || FORM_DEFAULT_VALUES.sender.country,
          email: sender.email || FORM_DEFAULT_VALUES.sender.email,
          phone: sender.phone || FORM_DEFAULT_VALUES.sender.phone,
          customInputs: sender.customInputs || [],
        },
        receiver: {
          name: receiver.name || FORM_DEFAULT_VALUES.receiver.name,
          address: receiver.address || FORM_DEFAULT_VALUES.receiver.address,
          zipCode: receiver.zipCode || FORM_DEFAULT_VALUES.receiver.zipCode,
          city: receiver.city || FORM_DEFAULT_VALUES.receiver.city,
          country: receiver.country || FORM_DEFAULT_VALUES.receiver.country,
          email: receiver.email || FORM_DEFAULT_VALUES.receiver.email,
          phone: receiver.phone || FORM_DEFAULT_VALUES.receiver.phone,
          customInputs: receiver.customInputs || [],
        },
        details: {
          proposalId: d.id, // Use DB ID
          proposalNumber: d.id, // Legacy compat
          proposalName: details.proposalName || d.proposalName || "",
          proposalDate: details.proposalDate || new Date().toISOString(),
          dueDate: details.dueDate || new Date().toISOString(),
          items: details.items || [],
          currency: details.currency || "USD",
          language: "English",
          taxDetails: details.taxDetails || FORM_DEFAULT_VALUES.details.taxDetails,
          discountDetails: details.discountDetails || FORM_DEFAULT_VALUES.details.discountDetails,
          shippingDetails: details.shippingDetails || FORM_DEFAULT_VALUES.details.shippingDetails,
          paymentInformation: details.paymentInformation || FORM_DEFAULT_VALUES.details.paymentInformation,
          additionalNotes: details.additionalNotes || "",
          paymentTerms: details.paymentTerms || "Net 30", // Default if missing
          pdfTemplate: details.pdfTemplate || 5, // Default to Standard (Hybrid) template
          venue: details.venue || "Generic",
          subTotal: details.subTotal || 0,
          totalAmount: details.totalAmount || 0,
          totalAmountInWords: details.totalAmountInWords || "",
          // Critical: Screens
          screens: d.screens ? d.screens.map((s: any) => ({
            ...s,
            pitchMm: Number(s.pitchMm || 0),
            widthFt: Number(s.widthFt || 0),
            heightFt: Number(s.heightFt || 0),
            quantity: Number(s.quantity || 1),
          })) : (details.screens || []),
          clientName: d.clientName || "",
          workspaceId: d.workspaceId || "",
          aiWorkspaceSlug: d.aiWorkspaceSlug || null, // Hydrate the workspace slug!
          internalAudit: details.internalAudit || FORM_DEFAULT_VALUES.details.internalAudit,
          clientSummary: details.clientSummary || FORM_DEFAULT_VALUES.details.clientSummary,
          documentType: d.documentType || "First Round",
          pricingType: d.pricingType || "Budget",
          documentMode:
            details.documentMode ||
            (d.documentType === "LOI"
              ? "LOI"
              : d.pricingType === "Hard Quoted"
                ? "PROPOSAL"
                : "BUDGET"),
          mirrorMode: d.mirrorMode ?? FORM_DEFAULT_VALUES.details.mirrorMode,
          calculationMode: d.calculationMode || FORM_DEFAULT_VALUES.details.calculationMode, // Hydrate calculation mode
          taxRateOverride: d.taxRateOverride ?? details.taxRateOverride ?? FORM_DEFAULT_VALUES.details.taxRateOverride,
          bondRateOverride: d.bondRateOverride ?? details.bondRateOverride ?? FORM_DEFAULT_VALUES.details.bondRateOverride,
          overheadRate: details.overheadRate ?? 0.10,
          profitRate: details.profitRate ?? 0.05,
          quoteItems: details.quoteItems ?? FORM_DEFAULT_VALUES.details.quoteItems,
          includePricingBreakdown: details.includePricingBreakdown ?? false, // Default: show pricing
          showPricingTables: (details as any).showPricingTables ?? true,
          showIntroText: (details as any).showIntroText ?? true,
          showBaseBidTable: (details as any).showBaseBidTable ?? false,
          showSpecifications: (details as any).showSpecifications ?? true,
          showCompanyFooter: (details as any).showCompanyFooter ?? true,
          showPaymentTerms: details.showPaymentTerms ?? true,
          showSignatureBlock: details.showSignatureBlock ?? true,
          showAssumptions: details.showAssumptions ?? false,
          showExhibitA: details.showExhibitA ?? false,
          showExhibitB: details.showExhibitB ?? false,
          showNotes: (details as any).showNotes ?? true,
          showScopeOfWork: (details as any).showScopeOfWork ?? false,
          // FR-4.1 & FR-4.2: Manual overrides
          tableHeaderOverrides: (details as any).tableHeaderOverrides ?? {},
          customProposalNotes: (details as any).customProposalNotes ?? "",
        },
      };

      reset(mappedData);
      // Force update the slug state if needed
      setValue("details.aiWorkspaceSlug", d.aiWorkspaceSlug);

      // Hydrate calculation mode from database
      setCalculationModeState(d.calculationMode || FORM_DEFAULT_VALUES.details.calculationMode);

      // Cleanup AI state on project switch
      setAiMessages([]);
      setAiFields(d.aiFilledFields || details.metadata?.aiFilledFields || details.metadata?.filledByAI || []); // Hydrate AI fields
      setAiCitations((d.aiCitations as Record<string, string>) || details.metadata?.aiCitations || {}); // Hydrate citations for Blue Glow tooltips
      setVerifiedFields((d.verifiedFields as any) || details.metadata?.verifiedFields || {}); // Hydrate Verified fields
      setProposalPdf(new Blob());

      // Restore Excel preview from database (survives page refresh)
      if (d.excelPreviewData) {
        setExcelPreview(d.excelPreviewData as ExcelPreview);
      }
    }
  }, [initialData, reset, setValue]);

  // SAVE CALCULATION MODE TO DATABASE
  useEffect(() => {
    if (!calculationMode || typeof window === 'undefined') return;

    const handler = setTimeout(async () => {
      const currentValues = getValues();
      const pid = currentValues.details?.proposalId;

      // Only save if we have a valid database ID (not "new")
      if (pid && pid !== 'new' && projectId) {
        try {
          await fetch(`/api/projects/${projectId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ calculationMode })
          });
          console.log("✓ Calculation mode saved:", calculationMode);
        } catch (e) {
          console.warn("Failed to save calculation mode:", e);
        }
      }
    }, 500); // 500ms debounce

    return () => clearTimeout(handler);
  }, [calculationMode, getValues, projectId]);


  // Reactive Watcher for ANC Logic Brain (Real-time Math)
  const screens = watch("details.screens");

  // AUTO-SAVE LOGIC (Debounced)
  const bondRateOverride = watch("details.bondRateOverride");
  const taxRateOverride = watch("details.taxRateOverride");
  const details = watch("details");
  const globalMargin = details?.globalMargin;

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Use a ref or simple timeout for debounce
    const handler = setTimeout(async () => {
      const currentValues = getValues();
      const pid = currentValues.details?.proposalId;

      // Only auto-save if we have a valid database ID (not "new")
      if (pid && pid !== 'new' && projectId) {
        try {
          // Construct payload matching Prisma schema requirements
          // We send partial JSON updates or full JSONs
          const payload = {
            clientName: currentValues.receiver.name || "Unnamed Client",
            senderData: currentValues.sender,
            receiverData: currentValues.receiver,
            detailsData: {
              ...currentValues.details,
              // Don't duplicate screens in detailsData if we use relations, 
              // but for now keeping it redundant for safety is fine or just minimal
            },
            screens: currentValues.details.screens, // This might need special handling endpoint side
            aiWorkspaceSlug: currentValues.details.aiWorkspaceSlug,
            calculationMode: calculationMode, // Sync calculation mode to database
            taxRateOverride: currentValues.details.taxRateOverride,
            bondRateOverride: currentValues.details.bondRateOverride,
            metadata: {
              ...currentValues.details.metadata,
              aiFilledFields: aiFields,
              verifiedFields: verifiedFields,
            }
          };

          // Using specific endpoint for auto-save
          /* 
             Note: The route /api/projects/[id] needs to handle PATCH.
          */
          await fetch(`/api/projects/${projectId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });

          // Determine if we need to show a save indicator?
          // For now, silent save is "Enterprise" standard.
        } catch (e) {
          console.warn("Auto-save failed:", e);
        }
      }
    }, 2000); // 2 second debounce

    return () => clearTimeout(handler);
  }, [screens, projectId, getValues, watch, bondRateOverride, taxRateOverride, globalMargin, aiFields, aiCitations, verifiedFields]); // Re-run when screens, AI state, or global settings change


  useEffect(() => {
    if (!screens || !Array.isArray(screens) || screens.length === 0) return;
    if (mirrorMode) return; // PROXIED DATA GUARD: Do not recalc if in Mirror Mode

    try {
      // Normalize for estimator
      const normalized = screens.map((s: any) => ({
        name: s.name || "Unnamed",
        productType: s.productType || "Unknown",
        widthFt: Number(s.widthFt ?? s.width ?? 0),
        heightFt: Number(s.heightFt ?? s.height ?? 0),
        quantity: Number(s.quantity ?? 1),
        pitchMm: Number(s.pitchMm ?? s.pixelPitch ?? 10),
        costPerSqFt: Number(s.costPerSqFt || 120),
        brightness: Number(s.brightness || 0),
        isHDR: !!s.isHDR,
        desiredMargin: s.desiredMargin,
        serviceType: s.serviceType,
        formFactor: s.formFactor,
        isReplacement: !!s.isReplacement,
        useExistingStructure: !!s.useExistingStructure,
        includeSpareParts: s.includeSpareParts !== false,
      }));

      const projectAddress = `${getValues("receiver.address") ?? ""} ${getValues("receiver.city") ?? ""} ${getValues("receiver.zipCode") ?? ""} ${getValues("details.location") ?? ""}`.trim();
      const venue = getValues("details.venue");
      const { clientSummary, internalAudit } = calculateProposalAudit(normalized, {
        taxRate: getValues("details.taxRateOverride"),
        bondPct: getValues("details.bondRateOverride"),
        structuralTonnage: getValues("details.metadata.structuralTonnage"),
        reinforcingTonnage: getValues("details.metadata.reinforcingTonnage"),
        projectAddress,
        venue,
      });

      // Update internal state without triggering infinite loop (only if changed)
      const currentAudit = getValues("details.internalAudit");
      if (JSON.stringify(currentAudit?.totals) !== JSON.stringify(internalAudit.totals)) {
        setValue("details.internalAudit", internalAudit);
        setValue("details.clientSummary", clientSummary);

        // Sync line items for PDF template (Polished Mode)
        const screensWithLineItems = syncLineItemsFromAudit(screens, internalAudit);

        // Only setValue if lineItems actually differ to prevent flickering
        setValue("details.screens", screensWithLineItems, { shouldValidate: false });
      }
    } catch (e) {
      console.warn("Real-time calculation failed:", e);
    }
  }, [screens, setValue, getValues]);

  const duplicateScreen = useCallback((index: number) => {
    const values = getValues();
    const screens = values.details.screens ?? [];
    if (index >= 0 && index < screens.length) {
      const screenToCopy = screens[index];
      const newScreen = {
        ...screenToCopy,
        name: `${screenToCopy.name} (Copy)`,
      };
      const updatedScreens = [...screens, newScreen];
      setValue("details.screens", updatedScreens);

      // Recalculate audit
      try {
        const { clientSummary, internalAudit } = calculateProposalAudit(updatedScreens, {
          taxRate: getValues("details.taxRateOverride"),
          bondPct: getValues("details.bondRateOverride"),
          structuralTonnage: getValues("details.metadata.structuralTonnage"),
          reinforcingTonnage: getValues("details.metadata.reinforcingTonnage"),
          projectAddress: `${getValues("receiver.address") ?? ""} ${getValues("receiver.city") ?? ""} ${getValues("receiver.zipCode") ?? ""} ${getValues("details.location") ?? ""}`.trim(),
          venue: getValues("details.venue"),
        });
        setValue("details.internalAudit", internalAudit);
        setValue("details.clientSummary", clientSummary);
      } catch (e) { }
    }
  }, [getValues, setValue]);

  // PDF URL state with cleanup
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  useEffect(() => {
    if (proposalPdf && proposalPdf.size > 0) {
      const url = window.URL.createObjectURL(proposalPdf);
      setPdfUrl(url);
      return () => {
        window.URL.revokeObjectURL(url);
      };
    } else {
      setPdfUrl(null);
    }
  }, [proposalPdf]);

  /**
   * Handles form submission.
   *
   * @param {ProposalType} data - The form values used to generate the PDF.
   */
  const onFormSubmit = (data: ProposalType) => {
    console.log("VALUE");
    console.log(data);

    // Call generate pdf method
    generatePdf(data);
  };

  /**
   * Clears state and redirects to start a fresh project.
   */
  const newProposal = () => {
    reset(FORM_DEFAULT_VALUES);
    setProposalPdf(new Blob());

    // Clear the draft
    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(LOCAL_STORAGE_PROPOSAL_DRAFT_KEY);
      } catch { }
    }

    // Toast
    newProposalSuccess();

    // Force redirect to start fresh initialization
    window.location.href = "/projects/new";
  };

  /**
   * Resets the current form to the last saved state from the database.
   */
  const resetProposal = async () => {
    if (!projectId || projectId === 'new') {
      newProposal();
      return;
    }

    try {
      const resp = await fetch(`/api/projects/${projectId}`);
      const data = await resp.json();
      if (resp.ok && data) {
        // Hydrate logic is already in an useEffect, 
        // but we can trigger a manual reset here for immediate UI feedback
        // Re-using the logic from the hydration useEffect would be cleaner
        // but for now, let's just trigger a refresh or manual reset.
        window.location.reload();
      }
    } catch (e) {
      console.error("Reset failed:", e);
    }
  };

  /**
   * Generate a PDF document based on the provided data.
   *
   * @param {ProposalType} data - The data used to generate the PDF.
   * @returns {Promise<void>} - A promise that resolves when the PDF is successfully generated.
   * @throws {Error} - If an error occurs during the PDF generation process.
   */
  const generatePdf = useCallback(async (data: ProposalType): Promise<Blob> => {
    setProposalPdfLoading(true);
    setPdfGenerationProgress({ value: 10, label: "Preparing…" });
    let generated: Blob = new Blob();

    try {
      // Sanitize screens into the estimator's expected shape
      const screens = (data?.details?.screens || []).map((s: any) => ({
        name: s.name,
        productType: s.productType ?? "",
        heightFt: s.heightFt ?? s.height ?? 0,
        widthFt: s.widthFt ?? s.width ?? 0,
        quantity: s.quantity ?? 1,
        pitchMm: s.pitchMm ?? s.pixelPitch ?? undefined,
        costPerSqFt: s.costPerSqFt,
        desiredMargin: s.desiredMargin,
      }));

      // Compute deterministic audit before generating PDF
      const audit = calculateProposalAudit(screens, {
        taxRate: getValues("details.taxRateOverride"),
        bondPct: getValues("details.bondRateOverride"),
        structuralTonnage: getValues("details.metadata.structuralTonnage"),
        reinforcingTonnage: getValues("details.metadata.reinforcingTonnage"),
        projectAddress: `${getValues("receiver.address") ?? ""} ${getValues("receiver.city") ?? ""} ${getValues("receiver.zipCode") ?? ""} ${getValues("details.location") ?? ""}`.trim(),
        venue: getValues("details.venue"),
      });

      console.log("Audit computed for PDF:", audit.internalAudit.totals);

      const payload = {
        ...data,
        _audit: audit, // include both clientSummary and internalAudit for server-side rendering and archive
      };

      setPdfGenerationProgress({ value: 35, label: "Generating PDF…" });
      const response = await fetch(GENERATE_PDF_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("PDF generation API error:", errorText);
        throw new Error(`PDF generation failed: ${response.status} ${response.statusText} - ${errorText}`);
      }

      setPdfGenerationProgress({ value: 75, label: "Downloading…" });
      const result = await response.blob();
      generated = result;
      setProposalPdf(result);

      if (result.size > 0) {
        setPdfGenerationProgress({ value: 100, label: "Done" });
        setTimeout(() => setPdfGenerationProgress(null), 800);
        // Toast
        pdfGenerationSuccess();
      }
    } catch (err) {
      console.error("PDF generation catch error:", err);
      const errorMsg = err instanceof Error ? err.message : "Unable to generate PDF";
      setPdfGenerationProgress(null);

      // Check if it's a server/Chromium error and offer print fallback
      if (errorMsg.includes("libnspr4") || errorMsg.includes("chromium") || errorMsg.includes("browser process")) {
        showError(
          "Server PDF Unavailable",
          "The PDF server is temporarily unavailable. Use 'Print Preview' button instead - select 'Save as PDF' in the print dialog."
        );
      } else {
        showError("PDF Generation Failed", errorMsg + ". Try using 'Print Preview' as an alternative.");
      }
    } finally {
      setProposalPdfLoading(false);
    }
    return generated as Blob;
  }, [getValues, pdfGenerationSuccess, showError]);

  /**
   * Removes the final PDF file and switches to Live Preview
   */
  const removeFinalPdf = () => {
    setProposalPdf(new Blob());
  };

  /**
   * Generates a preview of a PDF file and opens it in a new browser tab.
   */
  const previewPdfInTab = async () => {
    console.log("Previewing PDF in tab...");
    let pdfBlob: Blob | null = proposalPdf;
    if (!(pdfBlob instanceof Blob) || pdfBlob.size === 0) {
      console.log("No existing PDF blob, generating new one...");
      pdfBlob = await generatePdf(getValues());
    }

    if (pdfBlob instanceof Blob && pdfBlob.size > 0) {
      const url = pdfUrl ?? window.URL.createObjectURL(pdfBlob);
      console.log("Opening blob URL:", url);

      const link = document.createElement("a");
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      document.body.appendChild(link);
      link.click();

      setTimeout(() => {
        document.body.removeChild(link);
        if (!pdfUrl) window.URL.revokeObjectURL(url);
      }, 60_000);
    } else {
      console.error("Failed to generate PDF blob for preview - blob is empty or null");
    }
  };

  /**
   * Downloads a PDF file.
   * Filename: "{Client Name} {Document Type} {Template Name}.pdf"
   * e.g. "PDF-TEST Letter of Intent Classic.pdf"
   */
  const downloadPdf = async () => {
    // Always regenerate to ensure it uses current template/mode selection
    const pdfBlob = await generatePdf(getValues());

    if (pdfBlob instanceof Blob && pdfBlob.size > 0) {
      const url = window.URL.createObjectURL(pdfBlob);
      const details = getValues("details");
      const clientName = (details?.clientName || details?.proposalName || "proposal").toString();
      const safeName = (s: string) =>
        s.replace(/[/\\:*?"<>|]/g, "").replace(/\s+/g, " ").trim().slice(0, 80) || "proposal";
      const docMode = details?.documentMode ?? headerType;
      const documentTypeLabel =
        docMode === "LOI" ? "Letter of Intent" : docMode === "PROPOSAL" ? "Proposal" : "Budget";
      const templateId = details?.pdfTemplate ?? 2;
      const templateLabel = templateId === 5 ? "Hybrid" : templateId === 4 ? "Bold" : templateId === 3 ? "Modern" : "Classic";
      const fileName = `${safeName(clientName)} ${documentTypeLabel} ${templateLabel}.pdf`;
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    }
  };

  const TEMPLATES = [
    { id: 2, label: "Classic" },
    { id: 3, label: "Modern" },
    { id: 4, label: "Bold" },
    { id: 5, label: "Hybrid" },
  ] as const;
  const MODES = [
    { mode: "BUDGET" as const, label: "Budget" },
    { mode: "PROPOSAL" as const, label: "Proposal" },
    { mode: "LOI" as const, label: "Letter of Intent" },
  ] as const;

  /**
   * Downloads all 9 PDF variants (Budget/Proposal/LOI × Classic/Modern/Premium) with current form data.
   */
  const downloadAllPdfVariants = useCallback(async () => {
    const data = getValues();
    const screens = (data?.details?.screens || []).map((s: any) => ({
      name: s.name,
      productType: s.productType ?? "",
      heightFt: s.heightFt ?? s.height ?? 0,
      widthFt: s.widthFt ?? s.width ?? 0,
      quantity: s.quantity ?? 1,
      pitchMm: s.pitchMm ?? s.pixelPitch ?? undefined,
      costPerSqFt: s.costPerSqFt,
      desiredMargin: s.desiredMargin,
    }));
    const projectAddress = `${getValues("receiver.address") ?? ""} ${getValues("receiver.city") ?? ""} ${getValues("receiver.zipCode") ?? ""} ${getValues("details.location") ?? ""}`.trim();
    const audit = calculateProposalAudit(screens, {
      taxRate: getValues("details.taxRateOverride"),
      bondPct: getValues("details.bondRateOverride"),
      structuralTonnage: getValues("details.metadata.structuralTonnage"),
      reinforcingTonnage: getValues("details.metadata.reinforcingTonnage"),
      projectAddress,
      venue: getValues("details.venue"),
    });
    const clientName = (data.details?.clientName || data.details?.proposalName || "proposal").toString();
    const safeName = (s: string) =>
      s.replace(/[/\\:*?"<>|]/g, "").replace(/\s+/g, " ").trim().slice(0, 80) || "proposal";

    const total = MODES.length * TEMPLATES.length;
    setPdfBatchProgress({ current: 0, total, label: "Starting…" });

    let current = 0;
    for (const { mode, label: modeLabel } of MODES) {
      for (const { id: templateId, label: templateLabel } of TEMPLATES) {
        current += 1;
        setPdfBatchProgress({ current, total, label: `${modeLabel} ${templateLabel}` });
        const isLOI = mode === "LOI";
        const payload = {
          ...data,
          details: {
            ...data.details,
            pdfTemplate: templateId,
            documentMode: mode,
            documentType: isLOI ? "LOI" : "First Round",
            pricingType: mode === "PROPOSAL" ? "Hard Quoted" : "Budget",
            showPaymentTerms: isLOI,
            showSignatureBlock: isLOI,
            showExhibitA: isLOI || mode === "PROPOSAL",
            showExhibitB: isLOI,
            showNotes: true,
            showScopeOfWork: false,
          },
          _audit: audit,
        };
        try {
          const res = await fetch(GENERATE_PDF_API, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          if (!res.ok) throw new Error(await res.text());
          const blob = await res.blob();
          if (blob.size === 0) continue;
          const url = window.URL.createObjectURL(blob);
          const fileName = `${safeName(clientName)} ${modeLabel} ${templateLabel}.pdf`;
          const a = document.createElement("a");
          a.href = url;
          a.download = fileName;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          window.URL.revokeObjectURL(url);

          // Small delay to prevent browser from blocking multiple automatic downloads
          await new Promise((resolve) => setTimeout(resolve, 600));
        } catch (e) {
          console.error(`PDF variant ${modeLabel} ${templateLabel} failed:`, e);
          setPdfBatchProgress(null);
          showError("Download All PDFs", `Failed to generate ${modeLabel} ${templateLabel}. Try again or use single PDF download.`);
          return;
        }
      }
    }
    setPdfBatchProgress(null);
    pdfGenerationSuccess();
  }, [getValues, pdfGenerationSuccess, showError]);

  /**
   * Downloads 3 PDFs (Budget, Proposal, LOI) with the current template for the Export Bundle.
   */
  const downloadBundlePdfs = useCallback(async () => {
    const data = getValues();
    const currentTemplateId = data.details?.pdfTemplate || 5; // Default to Hybrid
    const screens = (data?.details?.screens || []).map((s: any) => ({
      name: s.name,
      productType: s.productType ?? "",
      heightFt: s.heightFt ?? s.height ?? 0,
      widthFt: s.widthFt ?? s.width ?? 0,
      quantity: s.quantity ?? 1,
      pitchMm: s.pitchMm ?? s.pixelPitch ?? undefined,
      costPerSqFt: s.costPerSqFt,
      desiredMargin: s.desiredMargin,
    }));
    const projectAddress = `${getValues("receiver.address") ?? ""} ${getValues("receiver.city") ?? ""} ${getValues("receiver.zipCode") ?? ""} ${getValues("details.location") ?? ""}`.trim();
    const audit = calculateProposalAudit(screens, {
      taxRate: getValues("details.taxRateOverride"),
      bondPct: getValues("details.bondRateOverride"),
      structuralTonnage: getValues("details.metadata.structuralTonnage"),
      reinforcingTonnage: getValues("details.metadata.reinforcingTonnage"),
      projectAddress,
      venue: getValues("details.venue"),
    });
    const clientName = (data.details?.clientName || data.details?.proposalName || "proposal").toString();
    const safeName = (s: string) =>
      s.replace(/[/\\:*?"<>|]/g, "").replace(/\s+/g, " ").trim().slice(0, 80) || "proposal";

    const total = MODES.length;
    setPdfBatchProgress({ current: 0, total, label: "Starting…" });

    let current = 0;
    for (const { mode, label: modeLabel } of MODES) {
      current += 1;
      setPdfBatchProgress({ current, total, label: modeLabel });
      const isLOI = mode === "LOI";
      const payload = {
        ...data,
        details: {
          ...data.details,
          pdfTemplate: currentTemplateId,
          documentMode: mode,
          documentType: isLOI ? "LOI" : "First Round",
          pricingType: mode === "PROPOSAL" ? "Hard Quoted" : "Budget",
          showPaymentTerms: isLOI,
          showSignatureBlock: isLOI,
          showExhibitA: isLOI || mode === "PROPOSAL",
          showExhibitB: isLOI,
          showNotes: true,
          showScopeOfWork: false,
        },
        _audit: audit,
      };
      try {
        const res = await fetch(GENERATE_PDF_API, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(await res.text());
        const blob = await res.blob();
        if (blob.size === 0) continue;
        const url = window.URL.createObjectURL(blob);
        const fileName = `${safeName(clientName)} ${modeLabel}.pdf`;
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);

        // Small delay to prevent browser from blocking multiple automatic downloads
        await new Promise((resolve) => setTimeout(resolve, 600));
      } catch (e) {
        console.error(`PDF ${modeLabel} failed:`, e);
        setPdfBatchProgress(null);
        showError("Download Bundle", `Failed to generate ${modeLabel} PDF. Try again or use single PDF download.`);
        return;
      }
    }
    setPdfBatchProgress(null);
    pdfGenerationSuccess();
  }, [getValues, pdfGenerationSuccess, showError]);

  /**
   * Prints a PDF file.
   */
  const printPdf = () => {
    if (proposalPdf) {
      const pdfUrl = URL.createObjectURL(proposalPdf);
      const printWindow = window.open(pdfUrl, "_blank");
      if (printWindow) {
        printWindow.onload = () => {
          printWindow.print();
        };
      }
    }
  };

  /**
   * Print the live preview directly (fallback when server PDF fails).
   * Opens a print-optimized version of the preview.
   */
  const printLivePreview = useCallback(() => {
    // Find the live preview iframe or container
    const previewFrame = document.querySelector('iframe[title="PDF Preview"]') as HTMLIFrameElement;
    if (previewFrame?.contentWindow) {
      previewFrame.contentWindow.print();
      return;
    }

    // Fallback: find the preview container and print it
    const previewContainer = document.querySelector('[data-preview-container]') as HTMLElement;
    if (previewContainer) {
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>ANC Proposal - Print</title>
            <link href="https://cdn.tailwindcss.com" rel="stylesheet">
            <style>
              @media print {
                body { margin: 0; padding: 20px; }
                @page { size: A4; margin: 0.5in; }
              }
            </style>
          </head>
          <body>
            ${previewContainer.innerHTML}
            <script>window.onload = function() { window.print(); }</script>
          </body>
          </html>
        `);
        printWindow.document.close();
      }
    } else {
      // Final fallback: just print the current page
      window.print();
    }
  }, []);

  /**
   * Saves the proposal data to local storage.
   */
  const saveProposalData = () => {
    if (proposalPdf) {
      // If get values function is provided, allow to save the proposal
      if (getValues) {
        // Retrieve the existing array from local storage or initialize an empty array
        const savedProposalsJSON = localStorage.getItem("savedProposals");
        let savedProposals = [];
        try {
          savedProposals = savedProposalsJSON && savedProposalsJSON.trim() !== ""
            ? JSON.parse(savedProposalsJSON)
            : [];
        } catch (e) {
          console.error("Error parsing savedProposals from localStorage during save:", e);
          savedProposals = [];
        }

        const formValues = getValues();

        // Normalize IDs: use proposalId
        const id = formValues?.details?.proposalId || `prop-${Date.now()}`;
        formValues.details.proposalId = id;
        // Legacy support
        formValues.details.proposalNumber = id;

        const updatedDate = new Date().toLocaleDateString(
          "en-US",
          SHORT_DATE_OPTIONS
        );

        formValues.details.updatedAt = updatedDate;

        // Attach deterministic audit snapshot for saved proposals (internal audit + client summary)
        try {
          const screens = (formValues?.details?.screens || []).map((s: any) => ({
            name: s.name,
            productType: s.productType ?? "",
            heightFt: s.heightFt ?? s.height ?? 0,
            widthFt: s.widthFt ?? s.width ?? 0,
            quantity: s.quantity ?? 1,
            pitchMm: s.pitchMm ?? s.pixelPitch ?? undefined,
            costPerSqFt: s.costPerSqFt,
            desiredMargin: s.desiredMargin,
          }));

          const audit = calculateProposalAudit(screens, {
            taxRate: getValues("details.taxRateOverride"),
            bondPct: getValues("details.bondRateOverride"),
            structuralTonnage: getValues("details.metadata.structuralTonnage"),
            reinforcingTonnage: getValues("details.metadata.reinforcingTonnage"),
            projectAddress: `${getValues("receiver.address") ?? ""} ${getValues("receiver.city") ?? ""} ${getValues("receiver.zipCode") ?? ""} ${getValues("details.location") ?? ""}`.trim(),
            venue: getValues("details.venue"),
          });
          // store under a non-typed key to avoid type mismatch with Zod/ProposalType
          (formValues as any)._internalAudit = audit.internalAudit;
          (formValues as any)._clientSummary = audit.clientSummary;
        } catch (e) {
          console.warn("Failed to calculate audit for saved proposal:", e);
        }

        const existingIndex = savedProposals.findIndex(
          (p: ProposalType) => {
            return (
              p.details.proposalId === id ||
              p.details.proposalNumber === id
            );
          }
        );

        // If proposal already exists
        if (existingIndex !== -1) {
          savedProposals[existingIndex] = formValues;

          // Toast
          modifiedProposalSuccess();
        } else {
          // Add the form values to the array
          savedProposals.push(formValues);

          // Toast
          saveProposalSuccess();
        }

        localStorage.setItem("savedProposals", JSON.stringify(savedProposals));

        setSavedProposals(savedProposals);

        // Attempt to persist to server if workspaceId is available
        try {
          const workspaceId = (formValues as any)?.details?.workspaceId;
          if (workspaceId) {
            // Prepare minimal payload expected by server
            const screens = (formValues as any)?.details?.screens || [];
            fetch("/api/proposals/create", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                workspaceId,
                clientName: (formValues as any)?.receiver?.name || (formValues as any)?.details?.clientName || "",
                screens,
              }),
            })
              .then((res) => {
                if (!res.ok) {
                  console.warn("Server save failed for proposal", res.statusText);
                }
              })
              .catch((err) => console.warn("Server save error:", err));
          }
        } catch (e) {
          console.warn("Failed to sync proposal to server:", e);
        }
      }
    }
  };

  /**
   * Save Draft: for /projects/new creates workspace + proposal and redirects; for existing project PATCHes.
   * Use this to persist without completing all wizard steps.
   */
  const saveDraft = useCallback(async (): Promise<{ created: boolean; projectId?: string; error?: string }> => {
    if (!getValues) return { created: false, error: "Form not ready" };
    const formValues = getValues();
    const effectiveId = (formValues?.details?.proposalId as string) || "";

    if (!effectiveId || effectiveId === "new") {
      try {
        const clientName = formValues?.receiver?.name || formValues?.details?.clientName || formValues?.details?.proposalName || "Untitled Project";
        const resp = await fetch("/api/workspaces/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: clientName,
            userEmail: formValues?.receiver?.email || "noreply@anc.com",
            createInitialProposal: true,
            clientName,
          }),
        });
        const json = await resp.json().catch(() => null);
        if (!resp.ok) {
          const base = (json as any)?.error || "Create failed";
          const details = (json as any)?.details;
          return { created: false, error: details ? `${base}: ${details}` : base };
        }
        if (json?.proposal?.id) {
          router.push(`/projects/${json.proposal.id}`);
          return { created: true, projectId: json.proposal.id };
        }
        return { created: false, error: "No proposal ID returned" };
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Create failed";
        return { created: false, error: msg };
      }
    }

    try {
      const payload = {
        clientName: formValues?.receiver?.name || formValues?.details?.clientName || "Unnamed Client",
        clientAddress: formValues?.receiver?.address,
        clientCity: formValues?.receiver?.city,
        clientZip: formValues?.receiver?.zipCode,
        proposalName: formValues?.details?.proposalName,
        venue: (formValues as any)?.details?.venue,
        status: formValues?.details?.status,
        calculationMode: calculationMode,
        internalAudit: formValues?.details?.internalAudit,
        clientSummary: formValues?.details?.clientSummary,
        screens: formValues?.details?.screens,
        taxRateOverride: formValues?.details?.taxRateOverride,
        bondRateOverride: formValues?.details?.bondRateOverride,
        documentMode: (formValues as any)?.details?.documentMode,
        documentConfig: {
          includePricingBreakdown: (formValues as any)?.details?.includePricingBreakdown,
          showPricingTables: (formValues as any)?.details?.showPricingTables,
          showIntroText: (formValues as any)?.details?.showIntroText,
          showBaseBidTable: (formValues as any)?.details?.showBaseBidTable,
          showSpecifications: (formValues as any)?.details?.showSpecifications,
          showCompanyFooter: (formValues as any)?.details?.showCompanyFooter,
          showPaymentTerms: (formValues as any)?.details?.showPaymentTerms,
          showSignatureBlock: (formValues as any)?.details?.showSignatureBlock,
          showExhibitA: (formValues as any)?.details?.showExhibitA,
          showExhibitB: (formValues as any)?.details?.showExhibitB,
          showNotes: (formValues as any)?.details?.showNotes,
          showScopeOfWork: (formValues as any)?.details?.showScopeOfWork,
        },
        quoteItems: (formValues as any)?.details?.quoteItems,
        paymentTerms: (formValues as any)?.details?.paymentTerms,
        additionalNotes: (formValues as any)?.details?.additionalNotes,
        excelPreviewData: excelPreview,
      };
      const res = await fetch(`/api/projects/${effectiveId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const text = await res.text();
        try {
          const parsed = JSON.parse(text);
          const base = parsed?.error || "Save failed";
          const details = parsed?.details;
          return { created: false, error: details ? `${base}: ${details}` : base };
        } catch {
          return { created: false, error: text || "Save failed" };
        }
      }
      modifiedProposalSuccess();
      return { created: false };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Save failed";
      return { created: false, error: msg };
    }
  }, [getValues, router, calculationMode, aiFields, modifiedProposalSuccess, excelPreview]);

  /**
   * Delete a proposal from local storage based on the given index.
   *
   * @param {number} index - The index of the proposal to be deleted.
   */
  const deleteProposalData = (index: number) => {
    if (index >= 0 && index < savedProposals.length) {
      const updatedProposals = [...savedProposals];
      updatedProposals.splice(index, 1);
      setSavedProposals(updatedProposals);

      const updatedProposalsJSON = JSON.stringify(updatedProposals);

      localStorage.setItem("savedProposals", updatedProposalsJSON);
    }
  };

  /**
   * Send the proposal PDF to the specified email address.
   *
   * @param {string} email - The email address to which the Proposal PDF will be sent.
   * @returns {Promise<void>} A promise that resolves once the email is successfully sent.
   */
  const sendPdfToMail = (email: string) => {
    const fd = new FormData();
    const formValues = getValues();
    const id = formValues?.details?.proposalId ?? "";
    fd.append("email", email);
    fd.append("proposalPdf", proposalPdf, "proposal.pdf");
    // Keep proposalNumber for backwards-compatibility and include proposalId
    fd.append("proposalNumber", id);
    fd.append("proposalId", id);

    return fetch(SEND_PDF_API, {
      method: "POST",
      body: fd,
    })
      .then((res) => {
        if (res.ok) {
          // Successful toast msg
          sendPdfSuccess();
        } else {
          // Error toast msg
          sendPdfError({ email, sendPdfToMail });
        }
      })
      .catch((error) => {
        console.log(error);

        // Error toast msg
        sendPdfError({ email, sendPdfToMail });
      });
  };

  /**
   * Apply a JSON command returned by the controller LLM
   * Supported command types: ADD_SCREEN, UPDATE_CLIENT, SET_MARGIN, SYNC_CATALOG
   */
  // Diagnostic overlay state
  const [diagnosticOpen, setDiagnosticOpen] = useState(false);
  const [diagnosticPayload, setDiagnosticPayload] = useState<any>(null);

  const openDiagnostic = (payload: any) => {
    setDiagnosticPayload(payload);
    setDiagnosticOpen(true);
  };

  const closeDiagnostic = () => {
    setDiagnosticPayload(null);
    setDiagnosticOpen(false);
  };

  const submitDiagnostic = (answers: any) => {
    // Merge answers with original payload and dispatch as ADD_SCREEN
    const merged = { ...(diagnosticPayload?.payload || {}), ...answers };
    applyCommand({ type: "ADD_SCREEN", payload: merged });
    closeDiagnostic();
  };

  /**
   * Syncs summarized line items to each screen based on current internalAudit
   */
  const syncLineItemsFromAudit = (screens: any[], internalAudit: any) => {
    if (!internalAudit?.perScreen) return screens;

    return screens.map((screen, idx) => {
      // If line items are already present (e.g. from Excel Mirroring), preserve them
      if (screen.lineItems && screen.lineItems.length > 0) {
        return screen;
      }

      const audit = internalAudit.perScreen[idx];
      if (!audit) return screen;

      const b = audit.breakdown;
      // Grouping logic for "Polished" client-facing PDF
      // Use Decimal.js for deterministic distribution of margin
      const totalCost = new Decimal(b.totalCost || 1); // Avoid division by zero
      const ancMargin = new Decimal(b.ancMargin || 0);

      const hardwareCost = new Decimal(b.hardware || 0);
      const structureCost = new Decimal(b.structure || 0);
      const laborCost = new Decimal(b.labor || 0);
      const installCost = new Decimal(b.install || 0);
      const laborInstallCost = laborCost.plus(installCost);

      // Distribute margin proportionally to cost
      const hardwareSell = roundToCents(hardwareCost.plus(ancMargin.times(hardwareCost.div(totalCost))));
      const structureSell = roundToCents(structureCost.plus(ancMargin.times(structureCost.div(totalCost))));
      const laborSell = roundToCents(laborInstallCost.plus(ancMargin.times(laborInstallCost.div(totalCost))));

      const finalClientTotal = new Decimal(b.finalClientTotal || 0);
      // Calculate "Other" as the remainder to ensure the sum exactly matches the total
      const otherSell = roundToCents(finalClientTotal.minus(hardwareSell).minus(structureSell).minus(laborSell));

      return {
        ...screen,
        lineItems: [
          { id: `hw-${idx}`, category: 'LED Display System', price: hardwareSell.toNumber() },
          { id: `st-${idx}`, category: 'Structural Materials', price: structureSell.toNumber() },
          { id: `inst-${idx}`, category: 'Installation & Labor', price: laborSell.toNumber() },
          { id: `other-${idx}`, category: 'Electrical, Data & Conditions', price: otherSell.toNumber() },
        ]
      };
    });
  };

  const executeAiCommand = async (message: string) => {
    if (!message.trim()) return;

    const userMsg = { id: `u-${Date.now()}`, role: "user", content: message };
    setAiMessages((h) => [...h, userMsg]);
    setAiLoading(true);

    try {
      const formValues = getValues();
      const currentProposalId = formValues?.details?.proposalId || "new";

      const res = await fetch("/api/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: message,
          history: aiMessages.map((m) => ({ role: m.role, content: m.content })),
          proposalId: currentProposalId,
          workspace: aiWorkspaceSlug || localStorage.getItem("aiWorkspaceSlug") || "anc-estimator",
        }),
      });

      const data = await res.json();
      let responseText = data?.data?.textResponse || data?.text || "";

      if (data?.data?.action) {
        applyCommand(data.data.action);
      }

      if (responseText) {
        setAiMessages((h) => [...h, { id: `a-${Date.now()}`, role: "assistant", content: responseText }]);
      }
    } catch (err) {
      console.error("AI Command error:", err);
    } finally {
      setAiLoading(false);
    }
  };

  const applyCommand = (command: any) => {
    try {
      const formValues = getValues();

      if (!command || !command.type) return;

      switch (command.type) {
        case "ADD_SCREEN": {
          const payload = command.payload || {};
          const screens = formValues.details.screens ?? [];

          const newScreen = {
            name: payload.name ?? "New Screen",
            productType: payload.productType ?? payload.type ?? "Unknown",
            widthFt: Number(payload.widthFt ?? payload.width ?? 0),
            heightFt: Number(payload.heightFt ?? payload.height ?? 0),
            quantity: payload.quantity ?? payload.qty ?? 1,
            pitchMm: Number(payload.pitch ?? payload.pitchMm ?? payload.pitchMm ?? 10),
            costPerSqFt: Number(payload.costPerSqFt ?? payload.cost_per_sqft ?? 120),
            desiredMargin: payload.desiredMargin ?? undefined,
            isReplacement: payload.isReplacement ?? false,
            useExistingStructure: payload.useExistingStructure ?? false,
            includeSpareParts: payload.includeSpareParts ?? true,
          };

          // Track which fields were AI-populated for the blue glow
          const aiPopulated = Object.keys(payload).map(k => `details.screens.${screens.length}.${k}`);
          setAiFields(prev => Array.from(new Set([...prev, ...aiPopulated])));

          // Push new screen
          const updatedScreens = [...screens, newScreen];

          // Calculate audit for the new screen set
          const audit = calculateProposalAudit(updatedScreens, {
            taxRate: getValues("details.taxRateOverride"),
            bondPct: getValues("details.bondRateOverride"),
            structuralTonnage: getValues("details.metadata.structuralTonnage"),
            reinforcingTonnage: getValues("details.metadata.reinforcingTonnage"),
            projectAddress: `${getValues("receiver.address") ?? ""} ${getValues("receiver.city") ?? ""} ${getValues("receiver.zipCode") ?? ""} ${getValues("details.location") ?? ""}`.trim(),
            venue: getValues("details.venue"),
          });
          const internalAudit = audit.internalAudit;

          // Sync line items for PDF template
          const screensWithLineItems = syncLineItemsFromAudit(updatedScreens, internalAudit);
          setValue("details.screens", screensWithLineItems);

          // CRITICAL: Flatten all screen-level lineItems into details.items for the PDF Template
          const allItems = screensWithLineItems.flatMap(s => s.lineItems || []).map((li: any) => {
            let desc = "Standard specification.";
            if (li.category.includes('LED')) desc = "Supply of LED Display System including spare parts, power/data cabling, and processing hardware.";
            if (li.category.includes('Structure')) desc = "Structural engineering, fabrication, and mounting hardware.";
            if (li.category.includes('Installation')) desc = "Union labor installation per IBEW jurisdiction. Includes prevailing wage, certified payroll, and final commissioning.";
            if (li.category.includes('Electrical')) desc = "Primary power tie-in and data conduit runs.";

            return {
              name: li.category,
              description: desc,
              quantity: 1,
              unitPrice: li.price,
              total: li.price
            };
          });
          setValue("details.items", allItems);

          // Normalize screens to ensure all have required fields for ScreenInput type
          const normalizedScreens = updatedScreens.map((s: any) => ({
            name: s.name || "Unnamed",
            productType: s.productType || "Unknown",
            widthFt: Number(s.widthFt || s.width || 0),
            heightFt: Number(s.heightFt || s.height || 0),
            quantity: Number(s.quantity || s.qty || 1),
            pitchMm: Number(s.pitchMm || s.pitch || 10),
            costPerSqFt: Number(s.costPerSqFt || s.cost_per_sqft || 120),
            desiredMargin: s.desiredMargin,
            isReplacement: !!s.isReplacement,
            useExistingStructure: !!s.useExistingStructure,
            includeSpareParts: s.includeSpareParts !== false,
          }));

          // Recalculate audit and persist into form for live audit view
          try {
            const { clientSummary, internalAudit } = calculateProposalAudit(normalizedScreens, {
              taxRate: getValues("details.taxRateOverride"),
              bondPct: getValues("details.bondRateOverride"),
              structuralTonnage: getValues("details.metadata.structuralTonnage"),
              reinforcingTonnage: getValues("details.metadata.reinforcingTonnage"),
              projectAddress: `${getValues("receiver.address") ?? ""} ${getValues("receiver.city") ?? ""} ${getValues("receiver.zipCode") ?? ""} ${getValues("details.location") ?? ""}`.trim(),
              venue: getValues("details.venue"),
            });
            setValue("details.internalAudit", internalAudit);
            setValue("details.clientSummary", clientSummary);

            // Sync line items for PDF template
            const screensWithLineItems = syncLineItemsFromAudit(normalizedScreens, internalAudit);
            setValue("details.screens", screensWithLineItems);

            // Flag low margins if any per-screen margin below threshold
            try {
              const threshold = parseFloat(process.env.NATALIA_MARGIN_THRESHOLD || "0.2");
              const alerts: Array<{ name: string; marginPct: number }> = [];
              for (const s of internalAudit.perScreen) {
                const ancMargin = s.breakdown.ancMargin;
                const finalClientTotal = s.breakdown.finalClientTotal || 1;
                const marginPct = finalClientTotal ? ancMargin / finalClientTotal : 0;
                if (marginPct < threshold) {
                  console.warn(`Low margin detected for screen ${s.name}: ${Number((marginPct * 100).toFixed(2))}% (< ${(threshold * 100)}%)`);
                  alerts.push({ name: s.name, marginPct });
                }
              }

              if (alerts.length > 0) {
                setLowMarginAlerts(alerts);
              }
            } catch (e) { }



            // Switch to audit tab so estimator changes are visible
            setActiveTab("audit");
          } catch (e) {
            console.warn("Failed to calculate audit after ADD_SCREEN", e);
          }

          break;
        }
        case "UPDATE_CLIENT": {
          const payload = command.payload || {};
          if (payload.name) {
            setValue("receiver.name", payload.name);
            setAiFields(prev => Array.from(new Set([...prev, "receiver.name"])));
          }
          if (payload.address) {
            setValue("receiver.address", payload.address);
            setAiFields(prev => Array.from(new Set([...prev, "receiver.address"])));
          }
          break;
        }
        case "SET_MARGIN":
        case "UPDATE_MARGIN": {
          const payload = command.payload || {};
          const value = Number(payload.value ?? payload.margin ?? payload.desiredMargin);
          if (isFinite(value)) {
            // Apply to all screens
            const screens = formValues.details.screens ?? [];
            const updated = screens.map((s: any) => ({ ...s, desiredMargin: value }));
            setValue("details.screens", updated);

            // Recalculate audit
            try {
              const { clientSummary, internalAudit } = calculateProposalAudit(updated, {
                taxRate: getValues("details.taxRateOverride"),
                bondPct: getValues("details.bondRateOverride"),
                structuralTonnage: getValues("details.metadata.structuralTonnage"),
                reinforcingTonnage: getValues("details.metadata.reinforcingTonnage"),
                projectAddress: `${getValues("receiver.address") ?? ""} ${getValues("receiver.city") ?? ""} ${getValues("receiver.zipCode") ?? ""} ${getValues("details.location") ?? ""}`.trim(),
                venue: getValues("details.venue"),
              });
              setValue("details.internalAudit", internalAudit);
              setValue("details.clientSummary", clientSummary);

              // Sync line items for PDF template
              const screensWithLineItems = syncLineItemsFromAudit(updated, internalAudit);
              setValue("details.screens", screensWithLineItems);

              // Switch to audit tab because internal pricing changed
              setActiveTab("audit");
            } catch (e) {
              console.warn("Failed to calculate audit after SET_MARGIN", e);
            }
          }
          break;
        }
        case "SYNC_CATALOG": {
          // Ask server to sync the local catalog file with AnythingLLM
          (async () => {
            try {
              const res = await fetch("/api/rag/sync", { method: "POST" });
              const json = await res.json();
              console.log("SYNC_CATALOG server response", json);
            } catch (e) {
              console.error("SYNC_CATALOG failed", e);
            }
          })();

          break;
        }
        case "INCOMPLETE_SPECS": {
          // Open Diagnostic overlay
          openDiagnostic(command);
          break;
        }
        default:
          console.warn("Unknown command type:", command.type);
      }
    } catch (err) {
      console.error("applyCommand error:", err);
    }
  };


  /**
   * Export an proposal in the specified format using the provided form values.
   *
   * This function initiates the export process with the chosen export format and the form data.
   *
   * @param {ExportTypes} exportAs - The format in which to export the proposal.
   */
  const exportProposalDataAs = (exportAs: ExportTypes) => {
    const formValues = getValues();
    const id = formValues?.details?.proposalId ?? formValues?.details?.proposalNumber ?? "";
    formValues.details.proposalId = id;
    formValues.details.proposalNumber = id;

    // Service to export proposal with given parameters
    exportProposal(exportAs, formValues);
  };

  /**
   * Export internal audit XLSX for the current proposal (if proposalId exists)
   */
  const exportAudit = async () => {
    const formValues = getValues();
    const screens = formValues?.details?.screens || [];
    const id = formValues?.details?.proposalId ?? formValues?.details?.proposalNumber ?? "";
    const isMirror = !!formValues?.details?.mirrorMode || formValues?.details?.calculationMode === "MIRROR";

    // Validate we have data to export
    if (!screens || screens.length === 0) {
      showError("Export Failed", "Add at least one screen before exporting the audit.");
      return;
    }

    try {
      const res = await fetch("/api/proposals/export/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proposalId: id || "new",
          projectAddress: `${formValues?.receiver?.address ?? ""} ${formValues?.receiver?.city ?? ""} ${formValues?.receiver?.zipCode ?? ""} ${formValues?.details?.location ?? ""}`.trim(),
          venue: formValues?.details?.venue ?? "",
          internalAudit: formValues?.details?.internalAudit ?? null,
          screens,
          calculationMode: isMirror ? "MIRROR" : (formValues?.details?.calculationMode ?? "INTELLIGENCE"),
          mirrorMode: isMirror,
          clientName: formValues?.receiver?.name ?? "",
          projectName: formValues?.details?.proposalName ?? "",
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error("Audit export failed", errText);
        showError("Export Failed", "Server error while generating audit file.");
        return;
      }

      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const err = await res.json().catch(() => ({}));
        console.error("Audit export returned JSON error", err);
        showError("Export Failed", err?.error || "Unable to generate audit file.");
        return;
      }

      const blob = await res.blob();
      if (blob.size === 0) {
        console.error("Audit export returned empty file");
        showError("Export Failed", "Generated file is empty. Make sure screens have valid dimensions.");
        return;
      }

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(formValues?.details?.proposalName || id || "proposal").toString().replace(/\s+/g, "-").replace(/[^a-zA-Z0-9-_]/g, "")}-audit.xlsx`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      console.error("exportAudit error:", e);
      showError("Export Failed", e instanceof Error ? e.message : "Unable to export audit file.");
    }
  };

  const loadExcelPreview = useCallback(async (file: File) => {
    setExcelPreviewLoading(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = xlsx.read(arrayBuffer, { type: "array" });
      const maxRows = 200;
      const maxCols = 60;

      const sheets: ExcelPreviewSheet[] = workbook.SheetNames.map((name) => {
        const sheet = workbook.Sheets[name];
        const ref = (sheet as any)["!ref"] as string | undefined;
        const range = ref ? xlsx.utils.decode_range(ref) : { s: { r: 0, c: 0 }, e: { r: 0, c: 0 } };
        const rowsCount = Math.min(range.e.r + 1, maxRows);
        const colsCount = Math.min(range.e.c + 1, maxCols);

        const rawRows = xlsx.utils.sheet_to_json(sheet, {
          header: 1,
          raw: false,
          defval: "",
        }) as any[][];

        const grid: string[][] = Array.from({ length: rowsCount }, (_, r) => {
          const src = rawRows[r] || [];
          return Array.from({ length: colsCount }, (_, c) => String(src[c] ?? ""));
        });

        const merges = (((sheet as any)["!merges"] as any[]) || []).map((m) => ({
          s: { r: m.s.r, c: m.s.c },
          e: { r: m.e.r, c: m.e.c },
        }));

        const hiddenRowsMeta = ((sheet as any)["!rows"] as Array<{ hidden?: boolean }> | undefined) || [];
        const hiddenRows = Array.from({ length: rowsCount }, (_, r) => !!hiddenRowsMeta[r]?.hidden);

        const colsMeta = ((sheet as any)["!cols"] as Array<{ wch?: number; hidden?: boolean }> | undefined) || [];
        const colWidths = Array.from({ length: colsCount }, (_, c) => {
          if (colsMeta[c]?.hidden) return 0;
          const wch = colsMeta[c]?.wch;
          return typeof wch === "number" ? wch : null;
        });

        const normalizedSheetName = name.toLowerCase();
        const isLedSheet =
          (normalizedSheetName.includes("led") && normalizedSheetName.includes("sheet")) ||
          normalizedSheetName.includes("led cost sheet");
        const requiredCols = { a: 0, f: 5, g: 6 };

        let headerRowIndex = 0;
        for (let r = 0; r < Math.min(grid.length, 15); r++) {
          const rowText = grid[r].join(" ").toLowerCase();
          if (rowText.includes("display name") || rowText.includes("display")) {
            headerRowIndex = r;
            break;
          }
        }

        let validationIssue = false;
        let hasNumericDimensions = false;
        if (isLedSheet) {
          for (let r = headerRowIndex + 1; r < grid.length; r++) {
            const row = grid[r];
            const nameCell = row[requiredCols.a] || "";
            const nameCellNorm = String(nameCell ?? "").trim();
            const isAlt = /^(alt(\b|[^a-z])|alternate(\b|[^a-z]))/i.test(nameCellNorm);
            if (hiddenRows[r] || isAlt) continue;
            const isRowActive = String(nameCell).trim() !== "";
            if (!isRowActive) continue;
            const h = String(row[requiredCols.f] || "").trim();
            const w = String(row[requiredCols.g] || "").trim();

            const isBad = (v: string) => v === "" || v.toUpperCase().includes("TBD");
            if (isBad(nameCell) || isBad(h) || isBad(w)) {
              validationIssue = true;
              continue;
            }

            const toNum = (v: string) => Number(String(v).replace(/[^\d.-]/g, ""));
            const hn = toNum(h);
            const wn = toNum(w);
            if (!isFinite(hn) || !isFinite(wn) || hn <= 0 || wn <= 0) {
              validationIssue = true;
              continue;
            }
            hasNumericDimensions = true;
          }
        }

        return {
          name,
          grid,
          merges,
          hiddenRows,
          colWidths,
          validationIssue,
          hasNumericDimensions,
        };
      });

      const ledSheet = sheets.find((s) => {
        const n = s.name.toLowerCase();
        return (n.includes("led") && n.includes("sheet")) || n.includes("led cost sheet");
      });
      setExcelValidationOk(!!ledSheet?.hasNumericDimensions && !ledSheet?.validationIssue);

      setExcelPreview({
        fileName: file.name,
        sheets,
        loadedAt: Date.now(),
      });
    } catch {
      setExcelPreview(null);
      setExcelValidationOk(false);
    } finally {
      setExcelPreviewLoading(false);
    }
  }, []);

  /**
   * Update a single cell in the Excel preview and sync to form data.
   * This enables WYSIWYG editing - changes in Excel reflect in PDF.
   */
  const updateExcelCell = useCallback((sheetName: string, row: number, col: number, value: string) => {
    if (!excelPreview) return;

    const ledSheet = excelPreview.sheets.find((s) => {
      const n = s.name.toLowerCase();
      return n.includes("led cost sheet") || (n.includes("led") && n.includes("sheet"));
    }) || null;

    const isLedEdit = !!ledSheet && ledSheet.name === sheetName;
    let ledHeaderRowIndex = -1;
    let ledHeaderRow: string[] | null = null;

    if (isLedEdit) {
      const grid = ledSheet.grid;
      for (let r = 0; r < Math.min(grid.length, 15); r++) {
        const rowText = grid[r].join(" ").toLowerCase();
        if (rowText.includes("display name") || rowText.includes("display")) {
          ledHeaderRowIndex = r;
          ledHeaderRow = grid[r] || [];
          break;
        }
      }
      if (ledHeaderRowIndex === row && ledHeaderRow) {
        ledHeaderRow = ledHeaderRow.map((c, ci) => (ci === col ? value : c));
      }
    }

    // Update the Excel preview grid
    setExcelPreview(prev => {
      if (!prev) return prev;

      const newSheets = prev.sheets.map(sheet => {
        if (sheet.name !== sheetName) return sheet;

        // Clone the grid and update the cell
        const newGrid = sheet.grid.map((r, ri) => {
          if (ri !== row) return r;
          return r.map((c, ci) => (ci === col ? value : c));
        });

        return { ...sheet, grid: newGrid };
      });

      return { ...prev, sheets: newSheets };
    });

    if (!isLedEdit) return;
    if (ledHeaderRowIndex < 0 || row <= ledHeaderRowIndex) return;

    // Map column indices to field names
    const header = ledHeaderRow || [];
    const colName = (header[col] || "").toLowerCase().trim();

    const screens = getValues("details.screens") || [];
    const rowOneBased = row + 1;
    const hasAnySourceRef = screens.some((s: any) => s?.sourceRef?.sheet && s?.sourceRef?.row);

    let screenIndex = -1;
    if (hasAnySourceRef) {
      screenIndex = screens.findIndex((s: any) => s?.sourceRef?.sheet === sheetName && s?.sourceRef?.row === rowOneBased);
      if (screenIndex < 0) {
        showError("Excel Sync Error", "Edited row does not map to an imported screen. Re-import the Excel to resync.");
        return;
      }
    } else {
      screenIndex = row - ledHeaderRowIndex - 1;
      if (screenIndex < 0 || screenIndex >= screens.length) return;
    }

    // Map Excel column to form field
    // IMPORTANT: "Display Name" is client-facing; keep `name` stable for audit matching.
    const fieldMap: Record<string, string> = {
      "display name": "externalName",
      "display": "externalName",
      "height": "heightFt",
      "h": "heightFt",
      "width": "widthFt",
      "w": "widthFt",
      "qty": "quantity",
      "quantity": "quantity",
      "mm pitch": "pitchMm",
      "pitch": "pitchMm",
      "pixel pitch": "pitchMm",
      "brightness": "brightness",
      "nits": "brightness",
    };

    const fieldName = fieldMap[colName];
    if (fieldName) {
      const fieldPath = `details.screens.${screenIndex}.${fieldName}` as any;
      // Convert to number for numeric fields
      if (["heightFt", "widthFt", "quantity", "pitchMm"].includes(fieldName)) {
        const numValue = parseFloat(value.replace(/[^\d.-]/g, ""));
        if (!isNaN(numValue)) {
          setValue(fieldPath, numValue, { shouldDirty: true, shouldValidate: true });
        }
      } else {
        setValue(fieldPath, value, { shouldDirty: true, shouldValidate: true });
      }
    }
  }, [excelPreview, getValues, setValue, showError]);

  /**
   * Import an proposal from a JSON file.
   *
   * @param {File} file - The JSON file to import.
   */
  const importProposalData = (file: File) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const importedData = JSON.parse(event.target?.result as string);

        // Parse the dates
        if (importedData.details) {
          if (importedData.details.proposalDate) {
            importedData.details.proposalDate = new Date(
              importedData.details.proposalDate
            );
          }
          if (importedData.details.dueDate) {
            importedData.details.dueDate = new Date(
              importedData.details.dueDate
            );
          }

          // Normalize IDs/dates: prefer proposalId/proposalDate and fill proposal fallbacks
          importedData.details.proposalId = importedData.details.proposalId ?? importedData.details.proposalNumber ?? "";
          importedData.details.proposalNumber = importedData.details.proposalNumber ?? importedData.details.proposalId;
          importedData.details.proposalDate = importedData.details.proposalDate ?? importedData.details.proposalDate ?? null;
        }

        // Reset form with imported data
        reset(importedData);
      } catch (error) {
        console.error("Error parsing JSON file:", error);
        importProposalError();
      }
    };
    reader.readAsText(file);
  };

  /**
   * Import an ANC Master Excel file and update the proposal state.
   * 
   * @param {File} file - The Excel file to import.
   */
  const importANCExcel = async (file: File) => {
    loadExcelPreview(file);
    const formData = new FormData();
    formData.append("file", file);

    setExcelImportLoading(true);
    try {
      const res = await fetch("/api/proposals/import-excel", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        throw new Error(await res.text());
      }

      const data = await res.json();

      setExcelSourceData(data.excelData ?? null);
      setVerificationManifest(data.verificationManifest ?? null);
      setVerificationExceptions(Array.isArray(data.exceptions) ? data.exceptions : []);

      if (data.formData) {
        const { formData, internalAudit } = data;

        // 1. Batch update main form fields
        const currentReceiverName = (getValues("receiver.name") ?? "").toString().trim();
        const importedReceiverName = (formData.receiver?.name ?? "").toString().trim();
        const currentProposalName = (getValues("details.proposalName") ?? "").toString().trim();
        const importedProposalName = (formData.details?.proposalName ?? "").toString().trim();

        const isReceiverPlaceholder =
          currentReceiverName.length === 0 ||
          currentReceiverName === FORM_DEFAULT_VALUES.receiver.name ||
          currentReceiverName.toLowerCase() === "new project" ||
          currentReceiverName.toLowerCase() === "placeholder";

        const isImportedReceiverPlaceholder =
          importedReceiverName.length === 0 ||
          importedReceiverName === FORM_DEFAULT_VALUES.receiver.name ||
          importedReceiverName.toLowerCase() === "new project" ||
          importedReceiverName.toLowerCase() === "placeholder";

        const isProposalPlaceholder =
          currentProposalName.length === 0 ||
          currentProposalName.toLowerCase() === "new project" ||
          currentProposalName.toLowerCase() === "placeholder";

        const isImportedProposalPlaceholder =
          importedProposalName.length === 0 ||
          importedProposalName.toLowerCase() === "anc led display proposal" ||
          importedProposalName.toLowerCase() === "new project" ||
          importedProposalName.toLowerCase() === "placeholder";

        // Only overwrite if current is placeholder AND imported is NOT placeholder
        if (isReceiverPlaceholder && !isImportedReceiverPlaceholder) {
          setValue("receiver.name", importedReceiverName, { shouldValidate: true, shouldDirty: true });
        }

        if (isProposalPlaceholder && !isImportedProposalPlaceholder) {
          setValue("details.proposalName", importedProposalName, { shouldValidate: true, shouldDirty: true });
        }

        // Also preserve address/city/zip if they exist locally
        const fieldsToPreserve = [
          "receiver.address",
          "receiver.city",
          "receiver.zipCode",
          "details.venue",
          "details.location"
        ] as const;

        fieldsToPreserve.forEach((field) => {
          const current = (getValues(field) ?? "").toString().trim();
          const imported = (formData.receiver?.[field.split(".")[1] as keyof typeof formData.receiver] ??
            formData.details?.[field.split(".")[1] as keyof typeof formData.details] ?? "").toString().trim();

          const isCurrentEmpty = current.length === 0 || current.toLowerCase() === "placeholder";
          const isImportedNotEmpty = imported.length > 0 && imported.toLowerCase() !== "placeholder";

          if (isCurrentEmpty && isImportedNotEmpty) {
            setValue(field, imported, { shouldValidate: true, shouldDirty: true });
          }
        });

        if (formData.details?.mirrorMode !== undefined) {
          setValue("details.mirrorMode", formData.details.mirrorMode, { shouldValidate: true, shouldDirty: true });
          setValue("details.calculationMode", formData.details.mirrorMode ? "MIRROR" : "INTELLIGENCE", { shouldValidate: true, shouldDirty: true });
        }

        // 2. Handle Screens & Line Items
        if (formData.details?.screens && internalAudit) {
          const screens = formData.details.screens.filter((s: any) => {
            const name = (s?.name ?? "").toString().trim().toUpperCase();
            const w = Number(s?.widthFt ?? s?.width ?? 0);
            const h = Number(s?.heightFt ?? s?.height ?? 0);
            if (name.includes("OPTION") && (w <= 0 || h <= 0)) return false;
            return true;
          });

          // Sync line items for PDF template (Injecting pricing from Audit into Screen Objects)
          const screensWithLineItems = syncLineItemsFromAudit(screens, internalAudit);
          setValue("details.screens", screensWithLineItems, { shouldValidate: true, shouldDirty: true });
          setValue("details.internalAudit", internalAudit, { shouldValidate: true, shouldDirty: true });
          setValue("details.clientSummary", internalAudit.totals, { shouldValidate: true, shouldDirty: true });

          // CRITICAL: Set marginAnalysis for complete Project Total (includes non-LED items)
          // This is used by ProposalTemplate1 to show Structural, Electrical, PM, etc.
          if (formData.details?.marginAnalysis && formData.details.marginAnalysis.length > 0) {
            setValue("marginAnalysis", formData.details.marginAnalysis, { shouldValidate: true, shouldDirty: true });
          }

          // 3. CRITICAL: Update the PDF Item Table (The "Items" array used by templates)
          const allItems = screensWithLineItems.flatMap(s => (s.lineItems || []).map((li: any) => ({
            name: li.category,
            description: s.description || "Standard LED specification.",
            quantity: 1,
            unitPrice: li.price,
            total: li.price
          })));
          setValue("details.items", allItems, { shouldValidate: true, shouldDirty: true });
        }
      }

      // 4. NEW: Store PricingDocument for Natalia Mirror Mode
      const pricingDocument = (data as any).pricingDocument || (data.formData?.details as any)?.pricingDocument;
      if (pricingDocument) {
        setValue("details.pricingDocument" as any, pricingDocument, { shouldValidate: true, shouldDirty: true });
        // Auto-enable mirror mode when pricingDocument is available
        setValue("details.pricingMode" as any, "MIRROR", { shouldValidate: true, shouldDirty: true });
        // Mirror Mode: hide SOW (not relevant), keep specs visible for screen edits
        setValue("details.showExhibitA", false, { shouldDirty: true });
        console.log("[CONTEXT] PricingDocument stored for Mirror Mode");
      }

      aiExtractionSuccess();
      setActiveTab("audit");

      // CRITICAL: Immediately save Excel data to database to prevent data loss
      // Don't rely on auto-save debounce (2000ms delay) - user might navigate away
      try {
        const saveResult = await saveDraft();
        if (!saveResult.created && saveResult.error) {
          console.error("[EXCEL IMPORT] Failed to auto-save after import:", saveResult.error);
        } else {
          console.log("[EXCEL IMPORT] Excel data saved to database successfully");
        }
      } catch (saveError) {
        console.error("[EXCEL IMPORT] Error auto-saving after import:", saveError);
      }
    } finally {
      setExcelImportLoading(false);
    }
  };

  return (
    <ProposalContext.Provider
      value={{
        proposalPdf,
        proposalPdfLoading,
        pdfGenerationProgress,
        pdfBatchProgress,
        excelImportLoading,
        excelPreviewLoading,
        excelPreview,
        excelValidationOk,
        excelSourceData,
        verificationManifest,
        verificationExceptions,
        loadExcelPreview,
        savedProposals,
        pdfUrl,
        activeTab,
        setActiveTab,
        onFormSubmit,
        newProposal,
        resetProposal,
        generatePdf,
        removeFinalPdf,
        downloadPdf,
        downloadAllPdfVariants,
        downloadBundlePdfs,
        printPdf,
        printLivePreview,
        previewPdfInTab,
        saveProposalData,
        saveDraft,
        deleteProposalData,
        // Backwards-compatible alias
        deleteProposal: deleteProposalData,
        sendPdfToMail,
        exportProposalDataAs,
        // Backwards-compatible alias
        exportProposalAs: exportProposalDataAs,
        exportAudit,
        importProposalData,
        importANCExcel,
        // AI & Verification
        aiFields,
        aiCitations,
        verifiedFields,
        setFieldVerified,
        aiFieldTimestamps,
        unverifiedAiFields,
        isGatekeeperLocked,
        trackAiFieldModification,
        isFieldGhostActive,
        rulesDetected,
        setRulesDetected: (rules: any) => setRulesDetected(rules),
        // Core State
        risks,
        setRisks: (newRisks: RiskItem[]) => setRisks(newRisks),
        // Diagnostic functions
        diagnosticOpen,
        diagnosticPayload,
        openDiagnostic,
        closeDiagnostic,
        submitDiagnostic,
        // Alerts
        lowMarginAlerts,
        // RFP functions
        rfpDocumentUrl,
        rfpDocuments,
        refreshRfpDocuments,
        deleteRfpDocument,
        aiWorkspaceSlug,
        rfpQuestions,
        uploadRfpDocument: async (file: File) => {
          const formData = new FormData();
          formData.append("file", file);
          const currentDetails = getValues().details;
          if (currentDetails?.proposalId) {
            formData.append("proposalId", currentDetails.proposalId as string);
          }
          try {
            const res = await fetch("/api/rfp/upload", { method: "POST", body: formData });
            const data = await res.json();

            if (data.ok) {
              setRfpDocumentUrl(data.url);
              if (data.workspaceSlug) {
                setValue("details.aiWorkspaceSlug", data.workspaceSlug);
              }
              if (data.questions) setRfpQuestions(data.questions);
              if (data.filterStats) setFilterStats(data.filterStats);

              // Refresh the vault list
              refreshRfpDocuments();

              // Handle Excel import data (exact pricing from Natalia's Excel)
              if (data.excelData && data.importType === "standard_excel") {
                const excel = data.excelData;
                const aiPopulated: string[] = [];
                const citations: Record<string, string> = {};

                // Set receiver info
                if (excel.receiver?.name) {
                  setValue("receiver.name", excel.receiver.name);
                  aiPopulated.push("receiver.name");
                  citations["receiver.name"] = "[Source: Natalia Excel Import]";
                }

                // Set proposal details
                if (excel.details?.proposalName) {
                  setValue("details.proposalName", excel.details.proposalName);
                  aiPopulated.push("details.proposalName");
                  citations["details.proposalName"] = "[Source: Natalia Excel Import]";
                }
                if (excel.details?.venue) {
                  setValue("details.venue", excel.details.venue);
                  aiPopulated.push("details.venue");
                  citations["details.venue"] = "[Source: Natalia Excel Import]";
                }

                // Set calculation mode to MIRROR for Excel imports (exact pricing)
                setValue("details.calculationMode", "MIRROR");
                setCalculationModeState("MIRROR");

                // Process screens from Excel
                if (excel.screens && Array.isArray(excel.screens) && excel.screens.length > 0) {
                  const normalized = excel.screens.map((s: any, idx: number) => {
                    const prefix = `details.screens[${idx}]`;

                    // Track all populated fields
                    if (s.name) { aiPopulated.push(`${prefix}.name`); citations[`${prefix}.name`] = "[Source: Natalia Excel Import]"; }
                    if (s.widthFt != null) { aiPopulated.push(`${prefix}.widthFt`); citations[`${prefix}.widthFt`] = "[Source: Natalia Excel Import]"; }
                    if (s.heightFt != null) { aiPopulated.push(`${prefix}.heightFt`); citations[`${prefix}.heightFt`] = "[Source: Natalia Excel Import]"; }
                    if (s.pitchMm != null) { aiPopulated.push(`${prefix}.pitchMm`); citations[`${prefix}.pitchMm`] = "[Source: Natalia Excel Import]"; }
                    if (s.pixelsH != null) { aiPopulated.push(`${prefix}.pixelsH`); citations[`${prefix}.pixelsH`] = "[Source: Natalia Excel Import]"; }
                    if (s.pixelsW != null) { aiPopulated.push(`${prefix}.pixelsW`); citations[`${prefix}.pixelsW`] = "[Source: Natalia Excel Import]"; }
                    if (s.brightness != null) { aiPopulated.push(`${prefix}.brightness`); citations[`${prefix}.brightness`] = "[Source: Natalia Excel Import]"; }
                    if (s.quantity != null) { aiPopulated.push(`${prefix}.quantity`); citations[`${prefix}.quantity`] = "[Source: Natalia Excel Import]"; }
                    if (s.externalName) { aiPopulated.push(`${prefix}.externalName`); citations[`${prefix}.externalName`] = "[Source: Natalia Excel Import]"; }
                    if (s.location) { aiPopulated.push(`${prefix}.location`); citations[`${prefix}.location`] = "[Source: Natalia Excel Import]"; }
                    if (s.application) { aiPopulated.push(`${prefix}.application`); citations[`${prefix}.application`] = "[Source: Natalia Excel Import]"; }
                    if (s.serviceType) { aiPopulated.push(`${prefix}.serviceType`); citations[`${prefix}.serviceType`] = "[Source: Natalia Excel Import]"; }
                    if (s.installationType) { aiPopulated.push(`${prefix}.installationType`); citations[`${prefix}.installationType`] = "[Source: Natalia Excel Import]"; }
                    if (s.isReplacement != null) { aiPopulated.push(`${prefix}.isReplacement`); citations[`${prefix}.isReplacement`] = "[Source: Natalia Excel Import]"; }
                    if (s.useExistingStructure != null) { aiPopulated.push(`${prefix}.useExistingStructure`); citations[`${prefix}.useExistingStructure`] = "[Source: Natalia Excel Import]"; }
                    if (s.includeSpareParts != null) { aiPopulated.push(`${prefix}.includeSpareParts`); citations[`${prefix}.includeSpareParts`] = "[Source: Natalia Excel Import]"; }
                    if (s.isCurved != null) { aiPopulated.push(`${prefix}.isCurved`); citations[`${prefix}.isCurved`] = "[Source: Natalia Excel Import]"; }
                    if (s.isDoubleSided != null) { aiPopulated.push(`${prefix}.isDoubleSided`); citations[`${prefix}.isDoubleSided`] = "[Source: Natalia Excel Import]"; }

                    return {
                      name: s.name || `Screen ${idx + 1}`,
                      externalName: s.externalName || s.name || `Screen ${idx + 1}`,
                      widthFt: Number(s.widthFt ?? 0),
                      heightFt: Number(s.heightFt ?? 0),
                      quantity: Number(s.quantity ?? 1),
                      pitchMm: Number(s.pitchMm ?? 10),
                      pixelsH: Number(s.pixelsH ?? 0),
                      pixelsW: Number(s.pixelsW ?? 0),
                      brightness: s.brightness != null ? String(s.brightness) : "",
                      serviceType: s.serviceType || "Front/Rear",
                      application: s.application || "",
                      installationType: s.installationType || "",
                      location: s.location || "",
                      isReplacement: !!s.isReplacement,
                      useExistingStructure: !!s.useExistingStructure,
                      includeSpareParts: s.includeSpareParts !== false,
                      isCurved: !!s.isCurved,
                      isDoubleSided: !!s.isDoubleSided,
                    };
                  });

                  setValue("details.screens", normalized);
                  setAiFields(aiPopulated);
                  setAiCitations(prev => ({ ...prev, ...citations }));

                  // Calculate audit with Excel data
                  try {
                    const { clientSummary, internalAudit } = calculateProposalAudit(normalized, {
                      taxRate: getValues("details.taxRateOverride"),
                      bondPct: getValues("details.bondRateOverride"),
                      projectAddress: `${getValues("receiver.address") ?? ""} ${getValues("receiver.city") ?? ""} ${getValues("receiver.zipCode") ?? ""} ${getValues("details.location") ?? ""}`.trim(),
                      venue: excel.details?.venue ?? getValues("details.venue"),
                    });
                    setValue("details.internalAudit", internalAudit);
                    setValue("details.clientSummary", clientSummary);
                  } catch (e) {
                    console.error("Audit calculation failed:", e);
                  }
                }

                // Set Excel source data for reference
                setExcelSourceData(excel);

                // Show success toast
                aiExtractionSuccess();
                return data;
              }

              // Apply AI extracted data if available (supports { value, citation } shape)
              if (data.extractedData) {
                const ext = data.extractedData;
                const v = (x: any) => (x != null && typeof x === "object" && "value" in x) ? x.value : x;
                const c = (x: any) => (x != null && typeof x === "object" && "citation" in x && typeof (x as any).citation === "string") ? (x as any).citation : undefined;
                const aiPopulated: string[] = [];
                const citations: Record<string, string> = {};
                const rName = v(ext.receiver?.name);
                if (rName) { setValue("receiver.name", rName); aiPopulated.push("receiver.name"); const cit = c(ext.receiver?.name); if (cit) citations["receiver.name"] = cit; }
                const pName = v(ext.details?.proposalName);
                if (pName) { setValue("details.proposalName", pName); aiPopulated.push("details.proposalName"); const cit = c(ext.details?.proposalName); if (cit) citations["details.proposalName"] = cit; }
                const venue = v(ext.details?.venue) ?? v(ext.venue);
                if (venue) { setValue("details.venue", venue); aiPopulated.push("details.venue"); const cit = c(ext.details?.venue) ?? c(ext.venue); if (cit) citations["details.venue"] = cit; }
                const structT = v(ext.rulesDetected?.structuralTonnage);
                if (structT != null) { setValue("details.metadata.structuralTonnage", Number(structT)); aiPopulated.push("details.metadata.structuralTonnage"); const cit = c(ext.rulesDetected?.structuralTonnage); if (cit) citations["details.metadata.structuralTonnage"] = cit; }
                const reinfT = v(ext.rulesDetected?.reinforcingTonnage);
                if (reinfT != null) { setValue("details.metadata.reinforcingTonnage", Number(reinfT)); aiPopulated.push("details.metadata.reinforcingTonnage"); const cit = c(ext.rulesDetected?.reinforcingTonnage); if (cit) citations["details.metadata.reinforcingTonnage"] = cit; }
                if (ext.rulesDetected) setRulesDetected(ext.rulesDetected);

                if (ext.details?.screens && Array.isArray(ext.details.screens)) {
                  const normalized = ext.details.screens.map((s: any, idx: number) => {
                    const prefix = `details.screens[${idx}]`;
                    const name = v(s.name); const widthFt = v(s.widthFt); const heightFt = v(s.heightFt); const pitchMm = v(s.pitchMm);
                    const quantity = v(s.quantity); const pixelsH = v(s.pixelResolutionH ?? s.pixelsH); const pixelsW = v(s.pixelResolutionW ?? s.pixelsW);
                    const brightness = v(s.brightness); const serviceType = v(s.serviceType); const application = v(s.application);
                    if (name) { aiPopulated.push(`${prefix}.name`); const cit = c(s.name); if (cit) citations[`${prefix}.name`] = cit; }
                    if (widthFt != null) { aiPopulated.push(`${prefix}.widthFt`); const cit = c(s.widthFt); if (cit) citations[`${prefix}.widthFt`] = cit; }
                    if (heightFt != null) { aiPopulated.push(`${prefix}.heightFt`); const cit = c(s.heightFt); if (cit) citations[`${prefix}.heightFt`] = cit; }
                    if (pitchMm != null) { aiPopulated.push(`${prefix}.pitchMm`); const cit = c(s.pitchMm); if (cit) citations[`${prefix}.pitchMm`] = cit; }
                    if (pixelsH != null) { aiPopulated.push(`${prefix}.pixelsH`); const cit = c(s.pixelResolutionH ?? s.pixelsH); if (cit) citations[`${prefix}.pixelsH`] = cit; }
                    if (pixelsW != null) { aiPopulated.push(`${prefix}.pixelsW`); const cit = c(s.pixelResolutionW ?? s.pixelsW); if (cit) citations[`${prefix}.pixelsW`] = cit; }
                    if (brightness != null) { aiPopulated.push(`${prefix}.brightness`); const cit = c(s.brightness); if (cit) citations[`${prefix}.brightness`] = cit; }
                    if (s.isReplacement !== undefined) aiPopulated.push(`${prefix}.isReplacement`);

                    return {
                      name: name || "New Screen",
                      externalName: v(s.externalName) || name || "New Screen",
                      widthFt: Number(widthFt ?? 0),
                      heightFt: Number(heightFt ?? 0),
                      quantity: Number(quantity ?? 1),
                      pitchMm: Number(pitchMm ?? 10),
                      pixelsH: Number(pixelsH ?? 0),
                      pixelsW: Number(pixelsW ?? 0),
                      brightness: brightness != null ? String(brightness) : "",
                      serviceType: serviceType || "Front/Rear",
                      application: application || "",
                      isReplacement: !!v(s.isReplacement),
                      useExistingStructure: !!v(s.useExistingStructure),
                      includeSpareParts: v(s.includeSpareParts) !== false,
                    };
                  });
                  setValue("details.screens", normalized);
                  if (rName) setValue("receiver.name", rName);
                  if (pName) setValue("details.proposalName", pName);
                  setAiFields(aiPopulated);
                  setAiCitations(prev => ({ ...prev, ...citations }));

                  try {
                    const { clientSummary, internalAudit } = calculateProposalAudit(normalized, {
                      taxRate: getValues("details.taxRateOverride"),
                      bondPct: getValues("details.bondRateOverride"),
                      structuralTonnage: structT != null ? Number(structT) : undefined,
                      reinforcingTonnage: reinfT != null ? Number(reinfT) : undefined,
                      projectAddress: `${getValues("receiver.address") ?? ""} ${getValues("receiver.city") ?? ""} ${getValues("receiver.zipCode") ?? ""} ${getValues("details.location") ?? ""}`.trim(),
                      venue: venue ?? getValues("details.venue"),
                    });
                    setValue("details.internalAudit", internalAudit);
                    setValue("details.clientSummary", clientSummary);
                  } catch (e) { }
                } else {
                  setAiCitations(prev => ({ ...prev, ...citations }));
                }
              }
              // Let the user know the magic happened!
              aiExtractionSuccess();
              return data;
            }
          } catch (e) {
            console.error("RFP upload error", e);
          }
        },
        reExtractRfp: async () => {
          const proposalId = getValues().details?.proposalId;
          const slug = getValues().details?.aiWorkspaceSlug;
          if (!proposalId && !slug) return null;
          try {
            const res = await fetch("/api/rfp/extract", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ proposalId: proposalId || undefined, workspaceSlug: slug || undefined }),
            });
            const data = await res.json();
            if (!data.ok || !data.extractedData) return data.extractedData ?? null;
            const ext = data.extractedData;
            const v = (x: any) => (x != null && typeof x === "object" && "value" in x) ? x.value : x;
            const c = (x: any) => (x != null && typeof x === "object" && "citation" in x && typeof (x as any).citation === "string") ? (x as any).citation : undefined;
            const aiPopulated: string[] = [];
            const citations: Record<string, string> = {};

            // REQ-126: Track AI-filled fields for Blue Glow persistence
            const rName = v(ext.receiver?.name); if (rName) { setValue("receiver.name", rName); aiPopulated.push("receiver.name"); const cit = c(ext.receiver?.name); if (cit) citations["receiver.name"] = cit; }
            const pName = v(ext.details?.proposalName); if (pName) { setValue("details.proposalName", pName); aiPopulated.push("details.proposalName"); const cit = c(ext.details?.proposalName); if (cit) citations["details.proposalName"] = cit; }
            const venue = v(ext.details?.venue) ?? v(ext.venue); if (venue) { setValue("details.venue", venue); aiPopulated.push("details.venue"); const cit = c(ext.details?.venue) ?? c(ext.venue); if (cit) citations["details.venue"] = cit; }
            const structT = v(ext.rulesDetected?.structuralTonnage); if (structT != null) { setValue("details.metadata.structuralTonnage", Number(structT)); aiPopulated.push("details.metadata.structuralTonnage"); const cit = c(ext.rulesDetected?.structuralTonnage); if (cit) citations["details.metadata.structuralTonnage"] = cit; }
            const reinfT = v(ext.rulesDetected?.reinforcingTonnage); if (reinfT != null) { setValue("details.metadata.reinforcingTonnage", Number(reinfT)); aiPopulated.push("details.metadata.reinforcingTonnage"); const cit = c(ext.rulesDetected?.reinforcingTonnage); if (cit) citations["details.metadata.reinforcingTonnage"] = cit; }
            if (ext.rulesDetected) setRulesDetected(ext.rulesDetected);

            // REQ-126: Persist AI-filled fields to database for Blue Glow tracking
            if (proposalId && aiPopulated.length > 0) {
              try {
                await fetch(`/api/projects/${proposalId}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    aiFilledFields: aiPopulated,
                  }),
                });
              } catch (error) {
                console.error("Failed to persist AI-filled fields:", error);
              }
            }
            if (ext.details?.screens && Array.isArray(ext.details.screens)) {
              const normalized = ext.details.screens.map((s: any, idx: number) => {
                const prefix = `details.screens[${idx}]`;
                const name = v(s.name); const widthFt = v(s.widthFt); const heightFt = v(s.heightFt); const pitchMm = v(s.pitchMm);
                const quantity = v(s.quantity); const pixelsH = v(s.pixelResolutionH ?? s.pixelsH); const pixelsW = v(s.pixelResolutionW ?? s.pixelsW);
                const brightness = v(s.brightness); const serviceType = v(s.serviceType); const application = v(s.application);
                if (name) { aiPopulated.push(`${prefix}.name`); const cit = c(s.name); if (cit) citations[`${prefix}.name`] = cit; }
                if (widthFt != null) { aiPopulated.push(`${prefix}.widthFt`); const cit = c(s.widthFt); if (cit) citations[`${prefix}.widthFt`] = cit; }
                if (heightFt != null) { aiPopulated.push(`${prefix}.heightFt`); const cit = c(s.heightFt); if (cit) citations[`${prefix}.heightFt`] = cit; }
                if (pitchMm != null) { aiPopulated.push(`${prefix}.pitchMm`); const cit = c(s.pitchMm); if (cit) citations[`${prefix}.pitchMm`] = cit; }
                if (brightness != null) { aiPopulated.push(`${prefix}.brightness`); const cit = c(s.brightness); if (cit) citations[`${prefix}.brightness`] = cit; }
                return {
                  name: name || "New Screen",
                  externalName: v(s.externalName) || name || "New Screen",
                  widthFt: Number(widthFt ?? 0), heightFt: Number(heightFt ?? 0), quantity: Number(quantity ?? 1), pitchMm: Number(pitchMm ?? 10),
                  pixelsH: Number(pixelsH ?? 0), pixelsW: Number(pixelsW ?? 0), brightness: brightness != null ? String(brightness) : "",
                  serviceType: serviceType || "Front/Rear", application: application || "", isReplacement: !!v(s.isReplacement), useExistingStructure: !!v(s.useExistingStructure), includeSpareParts: v(s.includeSpareParts) !== false,
                };
              });
              setValue("details.screens", normalized);
              if (rName) setValue("receiver.name", rName); if (pName) setValue("details.proposalName", pName);
              setAiFields(aiPopulated);
              setAiCitations(prev => ({ ...prev, ...citations }));

              // REQ-126: Persist AI-filled fields to database for Blue Glow tracking
              if (proposalId && aiPopulated.length > 0) {
                try {
                  await fetch(`/api/projects/${proposalId}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      aiFilledFields: aiPopulated,
                    }),
                  });
                } catch (error) {
                  console.error("Failed to persist AI-filled fields:", error);
                }
              }

              try {
                const { clientSummary, internalAudit } = calculateProposalAudit(normalized, {
                  taxRate: getValues("details.taxRateOverride"), bondPct: getValues("details.bondRateOverride"),
                  structuralTonnage: structT != null ? Number(structT) : undefined, reinforcingTonnage: reinfT != null ? Number(reinfT) : undefined,
                  projectAddress: `${getValues("receiver.address") ?? ""} ${getValues("receiver.city") ?? ""} ${getValues("receiver.zipCode") ?? ""}`.trim(), venue: venue ?? getValues("details.venue"),
                });
                setValue("details.internalAudit", internalAudit); setValue("details.clientSummary", clientSummary);
              } catch (e) { /* ignore */ }
            } else {
              setAiCitations(prev => ({ ...prev, ...citations }));

              // REQ-126: Persist AI-filled fields even if no screens extracted
              if (proposalId && aiPopulated.length > 0) {
                try {
                  await fetch(`/api/projects/${proposalId}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      aiFilledFields: aiPopulated,
                    }),
                  });
                } catch (error) {
                  console.error("Failed to persist AI-filled fields:", error);
                }
              }
            }
            aiExtractionSuccess();
            return data.extractedData;
          } catch (e) {
            console.error("Re-extract error", e);
            return null;
          }
        },
        answerRfpQuestion: async (questionId: string, answer: string) => {
          const proposalId = getValues().details?.proposalId;
          try {
            const res = await fetch("/api/rfp/answer", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ proposalId, questionId, answer }),
            });
            const data = await res.json();
            if (data.ok) {
              setRfpQuestions((prev) =>
                prev.map((q) => (q.id === questionId ? { ...q, answer, answered: true } : q))
              );
            }
          } catch (e) {
            console.error("RFP answer error", e);
          }
        },
        // command execution
        applyCommand,
        executeAiCommand,
        aiMessages,
        aiLoading,
        duplicateScreen,
        proposal: watch(),
        headerType,
        setHeaderType,
        // Calculation Mode
        calculationMode,
        setCalculationMode,
        // Excel Editing
        updateExcelCell,
        filterStats,
        sidebarMode,
        setSidebarMode,
      }}
    >
      {children}

      {/* Diagnostic overlay placed in provider so it can block the whole app */}
      {typeof window !== "undefined" ? (
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore - dynamic require to avoid SSR issues
        require("@/app/components/DiagnosticOverlay").default()
      ) : null}
    </ProposalContext.Provider>
  );
};
