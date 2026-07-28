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
import type { ServicePricingDocument } from "@/types/servicePricing";

type ServiceProposalSectionId = "intro" | "compensation";

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
