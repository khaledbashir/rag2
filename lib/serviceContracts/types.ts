/**
 * Service Contract term-exhibit system — shared types.
 *
 * A Service Contract document is built from a template (repo-seeded, verbatim
 * ANC legal language) plus per-instance overrides stored in Proposal.documentConfig.
 * Term exhibits are Markdown-text blocks that can be toggled on/off and edited
 * per-instance. Bodies are structured data so a future DOCX generator can consume
 * the same model without rework.
 *
 * HARD RULE (Natalia + Ahmad): legal language is 100% verbatim — no AI rewriting,
 * no paraphrasing, preserve capitalization / all-caps / exact wording. Signature
 * block language comes verbatim from the contract, never AI-generated.
 */

export type TermExhibitCategory = "general" | "optional";

export interface TermExhibit {
  /** Stable id, e.g. "general-terms" | "live-sync" | "parts" | "software" | "labor" */
  id: string;
  /** Exhibit letter, e.g. "C". Empty string = no letter (inline section). */
  exhibitLetter: string;
  /** Exhibit title, e.g. "General Terms" */
  title: string;
  /** Verbatim legal text as Markdown. */
  bodyMarkdown: string;
  /** Whether the exhibit is on by default when a contract is created. */
  defaultOn: boolean;
  category?: TermExhibitCategory;
}

export interface ProjectTypePreset {
  /** e.g. "general-only" | "general+live-sync" | "general+parts" | "general+parts&labor" */
  id: string;
  label: string;
  /** exhibitId -> enabled, applied on preset selection. */
  defaultExhibits: Record<string, boolean>;
}

export interface ServiceContractTemplate {
  id: string;
  name: string;
  /** Source-of-truth doc, e.g. "docs/service-agreements/ravens-service-agreement-source.md" */
  sourceDoc: string;
  /** Optional verbatim intro paragraph (Markdown, DOCX-future). */
  intro?: string;
  /** Term exhibits in render order. */
  exhibits: TermExhibit[];
  /** Verbatim signature block language from the contract. */
  signatureBlockText: string;
  projectTypePresets: ProjectTypePreset[];
}

/** Per-instance override of a term exhibit. Any field wins over the template default. */
export interface TermExhibitOverride {
  enabled?: boolean;
  bodyMarkdown?: string;
}

/** A resolved exhibit after applying overrides — what the renderer consumes. */
export interface ResolvedTermExhibit {
  id: string;
  exhibitLetter: string;
  title: string;
  bodyMarkdown: string;
  enabled: boolean;
}