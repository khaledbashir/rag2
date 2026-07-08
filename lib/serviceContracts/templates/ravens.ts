/**
 * Baltimore Ravens Service Contract template.
 *
 * Source of truth: docs/service-agreements/ravens-service-agreement-source.md
 * (and the verbatim rendering in
 * app/components/templates/proposal-pdf/sections/PdfServiceAgreement.tsx).
 *
 * HARD RULE: every clause is reproduced VERBATIM — wording-for-word, preserving
 * capitalization and all-caps. Do NOT rewrite or paraphrase. Only the
 * party/venue/date/fee-table values are configurable fields (handled by the
 * renderer); fixed clause text lives in the exhibit bodies below.
 *
 * Task 3 of the implementation plan fills the verbatim exhibit bodies. This
 * stub provides the shape the registry + tests rely on.
 */
import type { ServiceContractTemplate } from "../types";
import { SERVICE_CONTRACT_PRESETS } from "../presets";

export const RAVENS_TEMPLATE: ServiceContractTemplate = {
  id: "ravens",
  name: "Baltimore Ravens Service",
  sourceDoc: "docs/service-agreements/ravens-service-agreement-source.md",
  exhibits: [
    {
      id: "general-terms",
      exhibitLetter: "",
      title: "General Terms",
      bodyMarkdown: "",
      defaultOn: true,
      category: "general",
    },
    {
      id: "parts",
      exhibitLetter: "C",
      title: "Parts Replacement Procedures",
      bodyMarkdown: "",
      defaultOn: true,
      category: "optional",
    },
    {
      id: "live-sync",
      exhibitLetter: "",
      title: "Live Sync",
      bodyMarkdown: "",
      defaultOn: false,
      category: "optional",
    },
    {
      id: "software",
      exhibitLetter: "",
      title: "Software",
      bodyMarkdown: "",
      defaultOn: false,
      category: "optional",
    },
    {
      id: "labor",
      exhibitLetter: "",
      title: "Labor",
      bodyMarkdown: "",
      defaultOn: false,
      category: "optional",
    },
    {
      id: "exhibit-a-stub",
      exhibitLetter: "A",
      title: "Exhibit A",
      bodyMarkdown: "",
      defaultOn: true,
      category: "optional",
    },
    {
      id: "exhibit-b-stub",
      exhibitLetter: "B",
      title: "Exhibit B",
      bodyMarkdown: "",
      defaultOn: true,
      category: "optional",
    },
  ],
  signatureBlockText: "",
  projectTypePresets: SERVICE_CONTRACT_PRESETS,
};