/**
 * PdfServiceContract — ANC Service Contract document (Priority 1).
 *
 * Renders the verbatim contract body (intro, responsibilities, term,
 * compensation, fee table, signature) — reproduced word-for-word from
 * docs/service-agreements/ravens-service-agreement-source.md — then renders
 * the toggleable term exhibits from the template registry (General Terms,
 * Parts/Exhibit C, optional Live Sync / Software / Labor, Exhibit A/B), applying
 * per-instance overrides from Proposal.documentConfig.
 *
 * HARD RULE: clause text is verbatim. Only party/venue/date/fee-table values are
 * configurable; signature block language comes verbatim from the template
 * (overridable per-instance), never AI-generated.
 */
import React from "react";

import type { PdfColors } from "./sections/shared";
import PdfTermExhibit from "./sections/PdfTermExhibit";
import PdfFreeformTables from "./sections/PdfFreeformTables";
import type { ServiceAgreementConfig, ServiceAgreementFeeRow } from "./sections/PdfServiceAgreement";
import { RAVENS_SERVICE_AGREEMENT_DEFAULTS } from "./sections/PdfServiceAgreement";
import PdfServicePricingTable from "./sections/PdfServicePricingTable";
import { getDefaultTemplate, resolveExhibits, applyTemplateTokens } from "@/lib/serviceContracts/registry";
import { renderMarkdown } from "@/lib/serviceContracts/renderMarkdown";
import type { ServicePricingDocument } from "@/types/servicePricing";

interface PdfServiceContractProps {
  colors: PdfColors;
  /** Party/venue/date/fee-table config (same shape as PdfServiceAgreement). */
  config?: Partial<ServiceAgreementConfig>;
  /** Proposal details — carries per-instance term-exhibit overrides + signature. */
  details?: any;
}

export default function PdfServiceContract({ colors, config, details }: PdfServiceContractProps) {
  const c: ServiceAgreementConfig = { ...RAVENS_SERVICE_AGREEMENT_DEFAULTS, ...config };
  const template = getDefaultTemplate();

  const overrides = (details?.termExhibitOverrides ?? {}) as Record<string, { enabled?: boolean; bodyMarkdown?: string }>;
  const resolved = resolveExhibits(template, overrides).filter((e) => e.enabled);

  // Imported service-sheet fee schedule (Mirror rule: Excel values verbatim).
  // When present it replaces the template's default compensation fee rows.
  const svcDoc = (details?.servicePricingDocument ?? null) as ServicePricingDocument | null;

  // Token values for exhibit-body substitution (Software EULA preamble etc.)
  const tokenValues = {
    purchaserName: c.purchaserName,
    purchaserAddress: c.purchaserAddress,
    venueName: c.venueName,
    agreementDate: c.agreementDate,
    termStart: c.termStart,
    termEnd: c.termEnd,
  };

  // Signature block: per-instance verbatim override wins; else template default.
  const signatureOverride = ((details?.serviceContractSignatureText || "").trim());
  const signatureText = signatureOverride || template.signatureBlockText;

  const Header = ({ children }: { children: React.ReactNode }) => (
    <div style={{ display: "flex", alignItems: "center", gap: "6px", margin: "14px 0 8px" }}>
      <div style={{ width: "3px", height: "14px", borderRadius: "1px", background: colors.primary, flexShrink: 0 }} />
      <span className="text-[14px] font-bold uppercase tracking-wider" style={{ color: colors.primaryDark }}>
        {children}
      </span>
    </div>
  );

  return (
    <div data-preview-section="service-contract" className="px-6 text-[12px] leading-relaxed" style={{ color: colors.text }}>
      <div className="text-[16px] font-bold" style={{ color: colors.primaryDark, marginBottom: "10px" }}>
        {c.venueName} Service Contract
      </div>

      <p className="mb-3">
        AGREEMENT (&ldquo;Agreement&rdquo;) dated {c.agreementDate} between ANC SPORTS ENTERPRISES, LLC, a Delaware
        limited liability company located at 2 Manhattanville Road, Purchase, NY 10577 (&ldquo;ANC&rdquo;) and {c.purchaserName} with
        office at {c.purchaserAddress}.
      </p>
      <p className="mb-3">
        WHEREAS, ANC has expertise in the maintenance of video-based light-emitting diode (&ldquo;LED&rdquo;) modules (the &ldquo;LED Modules&rdquo;).
      </p>
      <p className="mb-3">
        WHEREAS, Purchaser plays in the sports and entertainment facility currently known as {c.venueName} (the &ldquo;Stadium&rdquo;),
        in which LED Modules and the necessary hardware, software, equipment and connections required to operate the Stadium
        LED Modules (collectively, the &ldquo;LED System&rdquo;) have been installed for use at NFL Games and other events; and which
        Purchaser wishes to have ANC maintain such LED System;
      </p>
      <p className="mb-3">NOW, THEREFORE, the parties hereto hereby agree as follows:</p>

      <Header>ANC&rsquo;s Responsibilities</Header>
      <p className="mb-2">
        WHEREAS, ANC has expertise in the maintenance of video-based light-emitting diode (&ldquo;LED&rdquo;) modules (the &ldquo;LED Modules&rdquo;); and
      </p>
      <p className="mb-2">
        WHEREAS, Purchaser operates the sports and entertainment facility currently known as {c.venueName} (the &quot;Stadium&quot;),
        in which LED Modules and the necessary hardware, parts, equipment and connections required to service and maintain the
        Stadium&rsquo;s LED Modules (collectively, the &ldquo;LED System&rdquo;) are provided by the Purchaser for their use in NFL games,
        and additional events at the Stadium, and Purchaser wishes to have ANC service and maintain such LED System.
      </p>
      <ul className="list-disc pl-5 space-y-1 mb-3">
        <li>ANC shall provide Maintenance Staff as defined in Exhibit A &ndash; Service Overview.</li>
        <li>ANC shall provide service as defined in Exhibit A for Display List as defined in Exhibit B</li>
        <li>ANC will also provide a trained and capable representative or representatives to work with Purchaser throughout the Term to service and maintain the LED System for the duration of the term.</li>
        <li>ANC will provide 24/7 365 tech support at no additional cost to assist with any hardware issues that occur.</li>
      </ul>

      <Header>Purchaser&rsquo;s Responsibilities</Header>
      <ul className="list-disc pl-5 space-y-1 mb-3">
        <li>Purchaser shall supply, at its expense, the electricity required for the operation of the LED System.</li>
        <li>Purchaser will provide at its cost the raw unencoded data feed from any sports information service for display on the LED Modules.</li>
        <li>Purchaser shall provide at no cost to ANC or its technicians full access credentials and complimentary parking at The Stadium parking lot (as needed) for each NFL Game for the purposes of carrying out ANC&rsquo;s obligations hereunder. Such ANC personnel shall comply with all applicable Stadium rules and regulations in connection with their activities hereunder. The Purchaser shall use best efforts to ensure that ANC&rsquo;s technicians have easy physical access to the LED Modules. If lifts, cranes or other equipment are required to access any portion of the ANC LED displays, the Purchaser will be responsible for providing.</li>
      </ul>

      <Header>Term</Header>
      <p className="mb-3">The term or this agreement (&ldquo;Term&rdquo;) shall begin on {c.termStart}, and end on {c.termEnd}</p>

      <Header>Compensation</Header>
      <p className="mb-2">
        As compensation for the services described in Section 1, the Company shall pay ANC an annual service fee as follows:
      </p>
      <p className="mb-2">
        Payment Schedule. The annual service fee for each Contract Year shall be payable in six (6) equal monthly installments.
        The first installment shall be due on {c.firstInstallmentDue} of the applicable Contract Year, with subsequent installments
        due on the first (1st) day of each month thereafter, and the final installment due on {c.finalInstallmentDue}.
      </p>
      {svcDoc ? (
        // Mirrored fee schedule from the imported service sheet (per-year fee
        // lines + yearly total) — the client's real numbers, never the
        // template's default fee rows for a different venue.
        <div style={{ margin: "6px 0 12px" }}>
          <PdfServicePricingTable colors={colors} document={svcDoc} />
        </div>
      ) : (
        <table style={{ borderCollapse: "collapse", fontSize: "11px", margin: "6px 0 12px" }}>
          <thead>
            <tr><th style={{ textAlign: "left", padding: "3px 18px 3px 0", fontWeight: 700 }}>Contract Year</th><th style={{ textAlign: "left", padding: "3px 0", fontWeight: 700 }}>Monthly Service Fee</th></tr>
          </thead>
          <tbody>
            {c.feeRows.map((r: ServiceAgreementFeeRow) => (
              <tr key={r.contractYear}><td style={{ padding: "2px 18px 2px 0" }}>{r.contractYear}</td><td style={{ padding: "2px 0" }}>{r.monthlyFee}</td></tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="mb-2">
        The fees described herein do not include any {c.taxJurisdiction} sales or use tax that may be due. ANC shall determine
        whether any such tax is payable on the fees, and, if such tax is due, ANC will bill Company for such tax and will be
        responsible for remitting the tax, as paid by Company, to the appropriate taxing authorities.
      </p>
      <p className="mb-3">
        Time is of the essence with regard to all payments. If Company is thirty (30) days late in any non-disputed payment due
        hereunder, ANC shall 1) provide written notice of such delinquency to Company in accordance with paragraph 7(a) of the
        General Terms. Provided that ANC has fully complied with its obligations hereunder as of the date of written notice, ANC
        will have the right to terminate this Agreement immediately upon written notice to Company if Company has not cured such
        payment default within thirty (30) days after Company&rsquo;s receipt of such delinquency notice.
      </p>
      <p className="mb-3">
        Please sign to indicate Purchaser&rsquo;s agreement to purchase the Work as described herein and to authorize ANC to commence
        production of the Work. If, for any reason, Purchaser terminates this Agreement prior to the completion of the Work, ANC
        will immediately cease all work and Purchaser will pay ANC for any work performed, work in progress, and materials
        purchased, if any. Tax is not included. Applicable sales tax will be included in ANC&rsquo;s invoice. Payment is due within
        thirty (30) days of ANC&rsquo;s invoice(s).
      </p>
      <p className="mb-3 uppercase text-[11px]">
        Unless otherwise noted in the following space, all terms and conditions on the general terms of this order are fully
        accepted by purchaser.
      </p>

      {/* Free-form pricing tables (Priority 1-tied) — user-built "from scratch"
          pricing. Renders before the signature block so the flow is pricing →
          signature → exhibits. Shown when present and toggled on. */}
      {((details?.showFreeformTables ?? true) && (details?.freeformTables?.length > 0)) && (
        <div className="mt-4">
          <PdfFreeformTables colors={colors} tables={details.freeformTables} />
        </div>
      )}

      {/* Signature block — verbatim from template (or per-instance override). */}
      {renderMarkdown(signatureText)}

      {/* Toggleable term exhibits, in template order, filtered by enabled. */}
      {resolved.map((ex) => (
        <div
          key={ex.id}
          style={ex.exhibitLetter ? { breakBefore: "page", pageBreakBefore: "always" } : { marginTop: "16px" }}
        >
          <PdfTermExhibit
            colors={colors}
            exhibitLetter={ex.exhibitLetter}
            title={ex.title}
            bodyMarkdown={applyTemplateTokens(ex.bodyMarkdown, tokenValues)}
          />
        </div>
      ))}
    </div>
  );
}