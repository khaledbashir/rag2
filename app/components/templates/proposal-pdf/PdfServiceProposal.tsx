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
 * No legal exhibits, no signatures — those arrive when the proposal finalizes
 * into a SERVICE_CONTRACT.
 */
import React from "react";

import type { PdfColors } from "./sections/shared";
import PdfServicePricingTable from "./sections/PdfServicePricingTable";
import {
  buildServiceProposalIntro,
  type ServiceProposalIntroValues,
} from "@/lib/serviceContracts/serviceProposalIntro";
import type { ServicePricingDocument } from "@/types/servicePricing";

interface PdfServiceProposalProps {
  colors: PdfColors;
  /** Resolved identity/term values for the intro paragraphs. */
  intro: ServiceProposalIntroValues;
  /** Proposal details — carries the intro override + service pricing document. */
  details?: any;
}

export default function PdfServiceProposal({ colors, intro, details }: PdfServiceProposalProps) {
  const svcDoc = (details?.servicePricingDocument ?? null) as ServicePricingDocument | null;

  const introOverride = ((details?.serviceProposalIntro || "") as string).trim();
  const paragraphs = introOverride ? null : buildServiceProposalIntro(intro);

  const venueName = (intro.venueName || "").trim();

  return (
    <div data-preview-section="service-proposal" className="px-6 text-[12px] leading-relaxed" style={{ color: colors.text }}>
      <div className="text-[16px] font-bold" style={{ color: colors.primaryDark, marginBottom: "10px" }}>
        {venueName ? `${venueName} Service Proposal` : "Service Proposal"}
      </div>

      {introOverride ? (
        <p className="mb-3 text-justify whitespace-pre-wrap">{introOverride}</p>
      ) : (
        paragraphs!.map((p, i) => (
          <p key={i} className="mb-3 text-justify">
            {p}
          </p>
        ))
      )}

      {svcDoc && (
        <div className="mt-4">
          <PdfServicePricingTable colors={colors} document={svcDoc} />
        </div>
      )}
    </div>
  );
}
