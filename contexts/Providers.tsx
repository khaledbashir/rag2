"use client";

import React, { useEffect } from "react";
import { SessionProvider } from "next-auth/react";

// RHF
import { FormProvider, useForm } from "react-hook-form";

// Zod
import { zodResolver } from "@hookform/resolvers/zod";

// Schema
import { ProposalSchema } from "@/lib/schemas";

// Context
import { ThemeProvider } from "@/contexts/ThemeProvider";
import { TranslationProvider } from "@/contexts/TranslationContext";
import { ProposalContextProvider } from "@/contexts/ProposalContext";
import { ChargesContextProvider } from "@/contexts/ChargesContext";
import { ConfirmProvider } from "@/hooks/useConfirm";

// Types
import { ProposalType } from "@/types";

// Variables
import {
  FORM_DEFAULT_VALUES,
  LOCAL_STORAGE_PROPOSAL_DRAFT_KEY,
} from "@/lib/variables";

import UmamiIdentify from "@/components/UmamiIdentify";

// Helpers
const readDraftFromLocalStorage = (): ProposalType | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LOCAL_STORAGE_PROPOSAL_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // revive dates
    if (parsed?.details) {
      if (parsed.details.proposalDate)
        parsed.details.proposalDate = new Date(parsed.details.proposalDate);
      if (parsed.details.dueDate)
        parsed.details.dueDate = new Date(parsed.details.dueDate);
    }
    return parsed;
  } catch {
    return null;
  }
};

type ProvidersProps = {
  children: React.ReactNode;
};

const Providers = ({ children }: ProvidersProps) => {
  const form = useForm<ProposalType>({
    resolver: zodResolver(ProposalSchema),
    defaultValues: FORM_DEFAULT_VALUES,
  });

  // PROMPT 56: Skip localStorage draft hydration for existing projects
  // Database is source of truth - only use localStorage for truly new/unsaved projects
  useEffect(() => {
    if (typeof window === "undefined") return;
    
    // Skip for /projects/new (must start clean)
    if (window.location.pathname === "/projects/new") return;
    
    // PROMPT 56: Skip for existing projects (they have projectId in URL)
    // Only hydrate from localStorage for unsaved drafts (no projectId in URL)
    const pathMatch = window.location.pathname.match(/\/projects\/([^\/]+)/);
    const projectIdFromUrl = pathMatch?.[1];
    
    if (projectIdFromUrl && projectIdFromUrl !== "new") {
      // Existing project - database is source of truth, skip localStorage
      return;
    }
    
    // Only for unsaved drafts (no projectId in URL)
    const draft = readDraftFromLocalStorage();
    if (draft) {
      form.reset(draft, { keepDefaultValues: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <SessionProvider>
      <UmamiIdentify />
      <ThemeProvider
        attribute="class"
        defaultTheme="light"
        disableTransitionOnChange
      >
        <TranslationProvider>
          <FormProvider {...form}>
            <ProposalContextProvider>
              <ChargesContextProvider>
                <ConfirmProvider>{children}</ConfirmProvider>
              </ChargesContextProvider>
            </ProposalContextProvider>
          </FormProvider>
        </TranslationProvider>
      </ThemeProvider>
    </SessionProvider>
  );
};

export default Providers;
