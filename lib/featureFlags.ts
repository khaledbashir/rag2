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
  /**
   * CMS / Control System pricing module (Natalia/Jireh ask 2026-05-13).
   * Adds /estimator/[projectId]/cms picker + /admin/cms-catalog admin +
   * /api/cms/* endpoints. CMS subtotal flows into the LED estimate as a
   * single "Control System" line.
   * Hidden 2026-05-18 while CMS approval is pending.
   */
  CMS_PRICING: false,
  /**
   * CMS Pricing — Option 3 "strategic" extras on top of the base picker.
   * When OFF, the picker shows only the equipment list, quantities, line
   * totals, subtotal → LED line (matches Natalia's actual ask).
   * When ON, surfaces the smart-defaults button, soft-cost warnings,
   * heat/AC panel, CRM sanity check panel, prior-client prefill, and
   * margin column. Flip ON when Option 3 scope is approved/billed.
   */
  CMS_PRICING_STRATEGIC: false,
  RESPONSIBILITY_MATRIX: true,
} as const;
