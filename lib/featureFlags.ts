/**
 * Feature flags for Phase 2 / unbuilt features.
 * Set to true when the feature is fully functional.
 */
export const FEATURES = {
  INTELLIGENCE_MODE: false,

  /** Dashboard "Ask the Intelligence Core" search bar */
  DASHBOARD_CHAT: false,
  /** Editor "17/20 Strategic Match" badge (show only when AI audit is real) */
  STRATEGIC_MATCH_BADGE: false,
  /** Review step: Client Requests / share link portal section */
  CLIENT_REQUESTS: false,
  /** Review step: Verification Studio (Excel vs PDF compare) */
  VERIFICATION_STUDIO: false,
  /**
   * Review step: Currency + USD→target exchange rate panel.
   * Math/PDF/Excel plumbing is fully wired (see commits 95ee54bf, e2a5c654).
   * Flip to true once the feature is paid/billable to expose the UI.
   */
  CURRENCY_EXCHANGE_RATE: true,
  /**
   * M&S Operating Layer (Grant Howard / Jireh ask 2026-05-08).
   * Bundle A: mediaPlacement + nielsenVerification + sponsorTeamContract custom
   * objects in CRM, plus rag2-side Excel inventory export endpoint.
   * Flip false to kill-switch the rag2-side surface if the change order isn't
   * approved. CRM-side kill-switch lives in scripts/disable-mns.py.
   */
  M_AND_S_OPERATING_LAYER: true,
} as const;
