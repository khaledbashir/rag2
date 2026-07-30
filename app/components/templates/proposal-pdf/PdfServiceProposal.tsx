/**
 * PdfServiceProposal — ANC Service Proposal document (Natalia 2026-07-14).
 *
 * The client-facing service offer that precedes a Service Contract — the same
 * family relationship as budget → proposal → LOI on the LED side. Renders:
 *
 *   1. The three-paragraph service-proposal intro (Ravens/M&T Bank model),
 *      prefilled from the recognized workbook + team lookup; per-instance
 *      override wins (details.serviceProposalIntro).
 *   2. The mirrored service fee table (ITEM × contract years + YEARLY TOTAL)
 *      from the imported service sheet — values exactly as Excel displays.
 *
 * Section toggles/body overrides are mode-scoped to Service Proposal and keep
 * the ANC section chrome in the template instead of inside user-entered text.
 */
import React from "react";

import type { PdfColors } from "./sections/shared";
import PdfFreeformTables from "./sections/PdfFreeformTables";
import PdfServicePricingTable from "./sections/PdfServicePricingTable";
import PdfManualServiceFeeTable, { normalizeManualServiceFeeRows } from "./sections/PdfManualServiceFeeTable";
import {
  buildServiceProposalIntro,
  type ServiceProposalIntroValues,
} from "@/lib/serviceContracts/serviceProposalIntro";
import { buildServiceScopeOfWork } from "@/lib/serviceContracts/serviceScopeOfWork";
import type { ServicePricingDocument } from "@/types/servicePricing";

type ServiceProposalSectionId = "intro" | "sow" | "compensation" | "notes";

type ServiceProposalSectionOverrides = Record<ServiceProposalSectionId, { enabled?: boolean; bodyText?: string }>;

interface PdfServiceProposalProps {
  colors: PdfColors;
  /** Resolved identity/term values for the intro paragraphs. */
  intro: ServiceProposalIntroValues;
  /** Proposal details — carries the intro override + service pricing document. */
  details?: any;
}

export default function PdfServiceProposal({ colors, intro, details }: PdfServiceProposalProps) {
  const svcDoc = (details?.servicePricingDocument ?? null) as ServicePricingDocument | null;
  const manualFeeRows = normalizeManualServiceFeeRows(details?.serviceManualFeeRows);
  const sectionOverrides = (details?.serviceSectionOverrides ?? {}) as Record<string, { enabled?: boolean; bodyText?: string }>;
  const getSectionOverride = (id: ServiceProposalSectionId) =>
    sectionOverrides[`SERVICE_PROPOSAL:${id}`] || sectionOverrides[id] || {};
  const isSectionEnabled = (id: ServiceProposalSectionId) => getSectionOverride(id).enabled ?? true;
  const getBodyOverride = (id: ServiceProposalSectionId) => (getSectionOverride(id).bodyText || "").trim();

  const introOverride = (getBodyOverride("intro") || (details?.serviceProposalIntro || "") as string).trim();
  const paragraphs = introOverride ? null : buildServiceProposalIntro(intro);

  const venueName = (intro.venueName || "").trim();

  // Scope of services — derived from the priced service lines (Alexis: "scope
  // of work is just based on what these line items are"). A hand-built fee
  // schedule carries contract years, not services, so there is nothing to
  // derive there: the author types the scope and their text wins.
  const sowOverride = getBodyOverride("sow");
  const scopeLineLabels = svcDoc ? svcDoc.rows.filter((r) => r.kind === "line").map((r) => r.label) : [];
  const scope = sowOverride ? null : buildServiceScopeOfWork({ venueName, lineLabels: scopeLineLabels });

  // Notes — ANC-authored, shared with the LED proposal's notes field so an
  // author does not keep two lists. Hidden entirely when there is nothing.
  const notesOverride = getBodyOverride("notes");
  const notesBody = (notesOverride || details?.customProposalNotes || details?.additionalNotes || "").toString().trim();
  const Header = ({ children }: { children: React.ReactNode }) => (
    <div style={{ display: "flex", alignItems: "center", gap: "6px", margin: "14px 0 8px" }}>
      <div style={{ width: "3px", height: "14px", borderRadius: "1px", background: colors.primary, flexShrink: 0 }} />
      <span className="text-[14px] font-bold uppercase tracking-wider" style={{ color: colors.primaryDark }}>
        {children}
      </span>
    </div>
  );

  const EditedBody = ({ text }: { text: string }) => (
    <div className="mb-3 whitespace-pre-wrap text-justify">{text}</div>
  );

  return (
    <div data-preview-section="service-proposal" className="px-6 text-[12px] leading-relaxed" style={{ color: colors.text }}>
      <div className="text-[16px] font-bold" style={{ color: colors.primaryDark, marginBottom: "10px" }}>
        {venueName ? `${venueName} Service Proposal` : "Service Proposal"}
      </div>

      {isSectionEnabled("intro") && (
        <section data-preview-section="service-section-intro">
          <Header>Intro / Whereas</Header>
          {introOverride ? (
            <EditedBody text={introOverride} />
          ) : (
            paragraphs!.map((p, i) => (
              <p key={i} className="mb-3 text-justify">
                {p}
              </p>
            ))
          )}
        </section>
      )}

      {isSectionEnabled("sow") && (sowOverride || scope) && (
        <section
          data-preview-section="service-section-sow"
          className="mt-4 break-inside-avoid"
          style={{ breakInside: "avoid", pageBreakInside: "avoid" }}
        >
          <Header>Scope of Services</Header>
          {sowOverride ? (
            <EditedBody text={sowOverride} />
          ) : (
            <>
              <p className="mb-2">{scope!.lead}</p>
              <ul className="list-disc pl-5 space-y-1 mb-3">
                {scope!.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {isSectionEnabled("compensation") && (
        <section data-preview-section="service-section-compensation" className="mt-4">
          <Header>Compensation</Header>
          {getBodyOverride("compensation") && <EditedBody text={getBodyOverride("compensation")} />}
          {svcDoc ? (
            <PdfServicePricingTable colors={colors} document={svcDoc} />
          ) : (
            <PdfManualServiceFeeTable colors={colors} rows={manualFeeRows} />
          )}
        </section>
      )}

      {isSectionEnabled("notes") && notesBody && (
        <section
          data-preview-section="service-section-notes"
          className="mt-4 break-inside-avoid"
          style={{ breakInside: "avoid", pageBreakInside: "avoid" }}
        >
          <Header>Notes</Header>
          <EditedBody text={notesBody} />
        </section>
      )}

      {/* Manual (Build from Scratch) tables — same recognition rule as the
          Service Contract branch, so tables composed in the manual path render
          in a Service Proposal too (Natalia 2026-07-27: "no manual table is
          recognized in Service proposal"). */}
      {((details?.showFreeformTables ?? true) && (details?.freeformTables?.length > 0)) && (
        <div className="mt-4">
          <PdfFreeformTables colors={colors} tables={details.freeformTables} padded={false} />
        </div>
      )}

    </div>
  );
}
