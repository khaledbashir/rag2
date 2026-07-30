/**
 * buildDocumentConfig — the ONE list of details fields persisted inside
 * Proposal.documentConfig (a whole-replace Json column).
 *
 * Why this exists: four save paths (useAutoSave heartbeat + three
 * ProposalContext payloads) each used to inline their own partial
 * documentConfig object. The PATCH handler replaces the column wholesale, so
 * whichever path saved LAST silently deleted every key the other paths carried
 * (change-order fields, currency, freeform tables, service-contract state…).
 * Every save path must build the object here; mapDbProposalToForm reads the
 * same keys back out.
 */
export function buildDocumentConfig(d: any) {
  d = d || {};
  return {
    currency: d.currency,
    exchangeRate: d.exchangeRate,
    includePricingBreakdown: d.includePricingBreakdown,
    showPricingTables: d.showPricingTables,
    showIntroText: d.showIntroText,
    showBaseBidTable: d.showBaseBidTable,
    showSpecifications: d.showSpecifications,
    showCompanyFooter: d.showCompanyFooter,
    showPaymentTerms: d.showPaymentTerms,
    showTermsAndConditions: d.showTermsAndConditions,
    showSubstantialCompletionDate: d.showSubstantialCompletionDate,
    showSignatureBlock: d.showSignatureBlock,
    showExhibitA: d.showExhibitA,
    showExhibitB: d.showExhibitB,
    showNotes: d.showNotes,
    showScopeOfWork: d.showScopeOfWork,
    showResponsibilityMatrix: d.showResponsibilityMatrix,
    pageLayout: d.pageLayout,
    manualTableMode: d.manualTableMode,
    // Free-text header label ("Amendment", "Addendum"…) replacing the mode's own.
    documentLabelOverride: d.documentLabelOverride,
    freeformTables: d.freeformTables,
    showFreeformTables: d.showFreeformTables,
    // Change Order fields — no changeOrder* columns on Project; documentConfig
    // is the storage and mapDbProposalToForm reads them back out.
    changeOrderNumber: d.changeOrderNumber,
    changeOrderRequestedBy: d.changeOrderRequestedBy,
    changeOrderDate: d.changeOrderDate,
    changeOrderOriginalContractNumber: d.changeOrderOriginalContractNumber,
    changeOrderOriginalAgreementDate: d.changeOrderOriginalAgreementDate,
    changeOrderOriginalContractAmount: d.changeOrderOriginalContractAmount,
    changeOrderPreviousTotalAmount: d.changeOrderPreviousTotalAmount,
    changeOrderOverheadPct: d.changeOrderOverheadPct,
    changeOrderIntroText: d.changeOrderIntroText,
    showChangeOrderTotals: d.showChangeOrderTotals,
    // Service Contract / Service Proposal per-instance state — same pattern.
    serviceContractTemplateId: d.serviceContractTemplateId,
    serviceContractProjectType: d.serviceContractProjectType,
    serviceContractPurchaserName: d.serviceContractPurchaserName,
    serviceContractVenueName: d.serviceContractVenueName,
    serviceContractPurchaserAddress: d.serviceContractPurchaserAddress,
    serviceContractAgreementDate: d.serviceContractAgreementDate,
    serviceContractTermStart: d.serviceContractTermStart,
    serviceContractTermEnd: d.serviceContractTermEnd,
    serviceContractSignatureText: d.serviceContractSignatureText,
    serviceManualFeeRows: d.serviceManualFeeRows,
    serviceSectionOverrides: d.serviceSectionOverrides,
    termExhibitOverrides: d.termExhibitOverrides,
    serviceProposalIntro: d.serviceProposalIntro,
    servicePricingDocument: d.servicePricingDocument,
  };
}
