/**
 * Feature flags for Phase 2 / unbuilt features.
 * Set to true when the feature is fully functional.
 */
export const FEATURES = {
  INTELLIGENCE_MODE: false,
  RFP_CHAT: false,
  AI_AUDIT: false,
  DOCUMENT_INTELLIGENCE: false,
  /** Dashboard "Ask the Intelligence Core" search bar */
  DASHBOARD_CHAT: false,
  /** Editor "17/20 Strategic Match" badge (show only when AI audit is real) */
  STRATEGIC_MATCH_BADGE: false,
  /** Review step: Client Requests / share link portal section */
  CLIENT_REQUESTS: false,
  /** Review step: Verification Studio (Excel vs PDF compare) */
  VERIFICATION_STUDIO: false,
  /** RFP Intelligence: PDF filter tool, RFP extraction, spec extraction */
  RFP_INTELLIGENCE: false,
  /** Estimator Studio: Typeform questionnaire → Excel preview → export */
  ESTIMATOR: false,
} as const;
