/**
 * Service Contract template registry.
 *
 * Templates are repo-seeded (see ./templates/). Per-instance overrides live in
 * Proposal.documentConfig. Resolution rule (matches the existing engine pattern
 * used for signatureBlockText / tableHeaderOverrides): an explicit per-instance
 * override always wins; otherwise the template default applies.
 */
import type {
  ServiceContractTemplate,
  TermExhibitOverride,
  ResolvedTermExhibit,
} from "./types";
import { RAVENS_TEMPLATE } from "./templates/ravens";

const TEMPLATES: Record<string, ServiceContractTemplate> = {
  ravens: RAVENS_TEMPLATE,
};

export function getTemplate(id: string): ServiceContractTemplate | undefined {
  return TEMPLATES[id];
}

export function getDefaultTemplate(): ServiceContractTemplate {
  return RAVENS_TEMPLATE;
}

export function listTemplates(): ServiceContractTemplate[] {
  return Object.values(TEMPLATES);
}

/**
 * Merge a template's exhibits with per-instance overrides. Returns exhibits in
 * template order, each with its resolved enabled flag and body. An exhibit is
 * enabled when `override.enabled` is set; otherwise `exhibit.defaultOn`.
 */
export function resolveExhibits(
  template: ServiceContractTemplate,
  overrides: Record<string, TermExhibitOverride> = {},
): ResolvedTermExhibit[] {
  return template.exhibits.map((ex) => {
    const ov = overrides?.[ex.id];
    const enabled = ov?.enabled !== undefined ? ov.enabled : ex.defaultOn;
    const bodyMarkdown = ov?.bodyMarkdown ?? ex.bodyMarkdown;
    return {
      id: ex.id,
      exhibitLetter: ex.exhibitLetter,
      title: ex.title,
      bodyMarkdown,
      enabled,
    };
  });
}