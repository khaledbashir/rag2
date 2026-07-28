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
import PdfManualServiceFeeTable, { normalizeManualServiceFeeRows } from "./sections/PdfManualServiceFeeTable";
import { getDefaultTemplate, resolveExhibits, applyTemplateTokens } from "@/lib/serviceContracts/registry";
import type { ServicePricingDocument } from "@/types/servicePricing";

type ServiceSectionId = "intro" | "ancResponsibilities" | "purchaserResponsibilities" | "term" | "compensation" | "signature";

type ServiceSectionOverrides = Record<ServiceSectionId, { enabled?: boolean; bodyText?: string }>;

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
  const sectionOverrides = (details?.serviceSectionOverrides ?? {}) as Record<string, { enabled?: boolean; bodyText?: string }>;
  const getSectionOverride = (id: ServiceSectionId) =>
    sectionOverrides[`SERVICE_CONTRACT:${id}`] || sectionOverrides[id] || {};

  // Imported service-sheet fee schedule (Mirror rule: Excel values verbatim).
  // When present it replaces the template's default compensation fee rows.
  const svcDoc = (details?.servicePricingDocument ?? null) as ServicePricingDocument | null;
  const manualFeeRows = normalizeManualServiceFeeRows(details?.serviceManualFeeRows);
  const isRavensTemplatePurchaser = /ravens/i.test(c.purchaserName);
  const fallbackFeeRows: ServiceAgreementFeeRow[] = manualFeeRows.length > 0
    ? manualFeeRows
    : (isRavensTemplatePurchaser ? c.feeRows : []);

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
  const signatureOverride = ((getSectionOverride("signature").bodyText || details?.serviceContractSignatureText || "").trim());
  const signatureText = signatureOverride || template.signatureBlockText;

  const isSectionEnabled = (id: ServiceSectionId) => getSectionOverride(id).enabled ?? true;
  const getBodyOverride = (id: ServiceSectionId) => (getSectionOverride(id).bodyText || "").trim();

  const SignatureBlock = () => {
    // Signature text shape: optional sign-here preamble paragraphs, then the
    // "AGREED TO AND ACCEPTED:" heading, then the ANC party lines. BY/TITLE/DATE
    // fields are structural (never parsed from text). Legacy per-instance
    // overrides that start at the heading (or carry "By:/Date:" lines) still
    // parse: no preamble, By/Date lines dropped in favor of the field rows.
    const rawLines = signatureText.split(/\r?\n/);
    const headingIdx = rawLines.findIndex((line: string) => /agreed to and accepted/i.test(line));
    const heading = headingIdx >= 0 ? rawLines[headingIdx].trim() : "AGREED TO AND ACCEPTED:";
    const preambleParagraphs = (headingIdx > 0 ? rawLines.slice(0, headingIdx).join("\n") : "")
      .split(/\n\s*\n/)
      .map((p: string) => p.replace(/\s*\n\s*/g, " ").trim())
      .filter(Boolean);
    const ancLines = (headingIdx >= 0 ? rawLines.slice(headingIdx + 1) : rawLines)
      .map((line: string) => line.trim())
      .filter(Boolean)
      .filter((line: string) => !(/^By:/i.test(line) || /^Title:/i.test(line) || /^Date:/i.test(line)));
    const resolvedAncLines = ancLines.length > 0 ? ancLines : [
      'ANC Sports Enterprises, LLC ("ANC")',
      "2 Manhattanville Road, Suite 402",
      "Purchase, NY 10577",
    ];

    const SignField = ({ label }: { label: string }) => (
      <div style={{ marginTop: "20px" }}>
        <div className="text-[11px] font-semibold" style={{ color: colors.textMuted, letterSpacing: "0.5px" }}>{label}</div>
        <div style={{ borderBottom: `1px solid ${colors.text}`, height: "20px" }} />
      </div>
    );

    const PartyColumn = ({ lines }: { lines: string[] }) => (
      <div>
        <div className="font-bold" style={{ color: colors.text }}>{lines[0]}</div>
        {lines.slice(1).map((line: string) => (
          <div key={line}>{line}</div>
        ))}
        <SignField label="BY:" />
        <SignField label="TITLE:" />
        <SignField label="DATE:" />
      </div>
    );

    const purchaserLines = [
      `${c.purchaserName} ("Purchaser")`,
      ...(c.purchaserAddress ? c.purchaserAddress.split(/\s*\n\s*/).filter(Boolean) : []),
    ];

    return (
      <div data-preview-section="service-contract-signature" className="break-inside-avoid" style={{ margin: "14px 0 16px", breakInside: "avoid", pageBreakInside: "avoid" }}>
        {preambleParagraphs.map((p: string, i: number) => (
          <p key={i} className="mb-3 text-justify" style={{ color: colors.textMuted }}>{p}</p>
        ))}
        <div
          className="font-bold"
          style={{ color: colors.text, borderBottom: `2px solid ${colors.text}`, paddingBottom: "4px", margin: "14px 0 12px" }}
        >
          {heading}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "42px", alignItems: "start" }}>
          <PartyColumn lines={resolvedAncLines} />
          <PartyColumn lines={purchaserLines} />
        </div>
      </div>
    );
  };

  const Header = ({ children }: { children: React.ReactNode }) => (
    <div style={{ display: "flex", alignItems: "center", gap: "6px", margin: "14px 0 8px", breakAfter: "avoid", pageBreakAfter: "avoid", breakInside: "avoid" }}>
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
    <div data-preview-section="service-contract" className="px-6 text-[12px] leading-relaxed" style={{ color: colors.text }}>
      <div className="text-[16px] font-bold" style={{ color: colors.primaryDark, marginBottom: "10px" }}>
        {c.venueName} Service Contract
      </div>

      {isSectionEnabled("intro") && (
        <section data-preview-section="service-section-intro">
          <Header>Intro / Whereas</Header>
          {getBodyOverride("intro") ? <EditedBody text={getBodyOverride("intro")} /> : (
            <>
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
            </>
          )}
        </section>
      )}

      {isSectionEnabled("ancResponsibilities") && (
        <section data-preview-section="service-section-anc-responsibilities">
          <Header>ANC&rsquo;s Responsibilities</Header>
          {getBodyOverride("ancResponsibilities") ? <EditedBody text={getBodyOverride("ancResponsibilities")} /> : (
            <>
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
            </>
          )}
        </section>
      )}

      {isSectionEnabled("purchaserResponsibilities") && (
        <section data-preview-section="service-section-purchaser-responsibilities">
          <Header>Purchaser&rsquo;s Responsibilities</Header>
          {getBodyOverride("purchaserResponsibilities") ? <EditedBody text={getBodyOverride("purchaserResponsibilities")} /> : (
            <ul className="list-disc pl-5 space-y-1 mb-3">
              <li>Purchaser shall supply, at its expense, the electricity required for the operation of the LED System.</li>
              <li>Purchaser will provide at its cost the raw unencoded data feed from any sports information service for display on the LED Modules.</li>
              <li>Purchaser shall provide at no cost to ANC or its technicians full access credentials and complimentary parking at The Stadium parking lot (as needed) for each NFL Game for the purposes of carrying out ANC&rsquo;s obligations hereunder. Such ANC personnel shall comply with all applicable Stadium rules and regulations in connection with their activities hereunder. The Purchaser shall use best efforts to ensure that ANC&rsquo;s technicians have easy physical access to the LED Modules. If lifts, cranes or other equipment are required to access any portion of the ANC LED displays, the Purchaser will be responsible for providing.</li>
            </ul>
          )}
        </section>
      )}

      {isSectionEnabled("term") && (
        <section data-preview-section="service-section-term">
          <Header>Term</Header>
          {getBodyOverride("term") ? <EditedBody text={getBodyOverride("term")} /> : (
            <p className="mb-3">The term or this agreement (&ldquo;Term&rdquo;) shall begin on {c.termStart}, and end on {c.termEnd}</p>
          )}
        </section>
      )}

      {isSectionEnabled("compensation") && (
        <section data-preview-section="service-section-compensation">
          <Header>Compensation</Header>
          {getBodyOverride("compensation") ? <EditedBody text={getBodyOverride("compensation")} /> : (
            <>
              <p className="mb-2">
                As compensation for the services described in Section 1, the Company shall pay ANC an annual service fee as follows:
              </p>
              <p className="mb-2">
                Payment Schedule. The annual service fee for each Contract Year shall be payable in six (6) equal monthly installments.
                The first installment shall be due on {c.firstInstallmentDue} of the applicable Contract Year, with subsequent installments
                due on the first (1st) day of each month thereafter, and the final installment due on {c.finalInstallmentDue}.
              </p>
            </>
          )}
          {svcDoc ? (
            <div style={{ margin: "6px 0 12px" }}>
              <PdfServicePricingTable colors={colors} document={svcDoc} />
            </div>
          ) : (
            <PdfManualServiceFeeTable colors={colors} rows={fallbackFeeRows} />
          )}
          {!getBodyOverride("compensation") && (
            <>
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
              {/* Sign-here preamble moved into the signature block (Natalia
                  2026-07-27: "signature block text in wrong spot"). */}
              <p className="mb-3 uppercase text-[11px]">
                Unless otherwise noted in the following space, all terms and conditions on the general terms of this order are fully
                accepted by purchaser.
              </p>
            </>
          )}
        </section>
      )}

      {/* Free-form pricing tables (Priority 1-tied) — user-built "from scratch"
          pricing. Renders before the signature block so the flow is pricing →
          signature → exhibits. Shown when present and toggled on. */}
      {((details?.showFreeformTables ?? true) && (details?.freeformTables?.length > 0)) && (
        <div className="mt-4">
          <PdfFreeformTables colors={colors} tables={details.freeformTables} padded={false} />
        </div>
      )}

      {isSectionEnabled("signature") && (
        <section data-preview-section="service-section-signature">
          <SignatureBlock />
        </section>
      )}

      {/* Toggleable term exhibits, in template order, filtered by enabled.
          Every exhibit — General Terms included — starts on its own page
          (Natalia 2026-07-27: "general terms need to start from its own page"). */}
      {resolved.map((ex) => (
        <div
          key={ex.id}
          style={{ breakBefore: "page", pageBreakBefore: "always" }}
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
