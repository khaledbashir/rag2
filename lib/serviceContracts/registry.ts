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

/**
 * Token values substituted into exhibit bodies (e.g. the Software EULA preamble
 * references the Licensee name+address). All optional — an unknown token is left
 * as-is so the user sees it and fills it per-instance.
 */
export interface TemplateTokenValues {
  purchaserName?: string;
  purchaserAddress?: string;
  venueName?: string;
  agreementDate?: string;
  termStart?: string;
  termEnd?: string;
  [key: string]: string | undefined;
}

/**
 * Replace `{{token}}` placeholders in a body string with configured values.
 * Case-insensitive on the key. Unknown tokens are left in place (visible so the
 * user knows to fill them). Used for the Software EULA preamble and any exhibit
 * that references party fields.
 */
export function applyTemplateTokens(body: string, values: TemplateTokenValues): string {
  if (!body) return body;
  return body.replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (m, key: string) => {
    const direct = values[key];
    if (direct != null && direct !== "") return direct;
    for (const k of Object.keys(values)) {
      if (k.toLowerCase() === key.toLowerCase() && values[k]) return values[k] as string;
    }
    return m;
  });
}

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