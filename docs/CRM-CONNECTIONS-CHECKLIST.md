# CRM ↔ Proposal Engine — Live Connections Checklist

Single source of truth for what is wired between **rag2** (proposal engine) and **Twenty CRM** (`crm.ancsports.net`). Update after every ship + verify pass. This file is the contract: nothing tells Jireh "it works" unless it has a ✅ here with a verification reference.

---

## Status legend
| Symbol | Meaning |
|---|---|
| ✅ | Verified working in production (proof in "Verification" column) |
| 🟡 | Wired in code, not yet end-to-end verified |
| 🔴 | Wired but verified broken / failing silently |
| 🚧 | In progress this session |
| ⬜ | Not started |

## How to use
- Don't claim ✅ without a verification artifact (record ID, log line, screenshot path, query result).
- When marking ✅, paste the proof in the "Verification" column.
- When something flips 🟡 → 🔴, leave it 🔴 with the failure mode noted; don't quietly delete.
- The "Build verification first" rule: status starts at ⬜ → 🚧 → 🟡 (code in) → ✅ (proof landed).

---

## A. Foundation (must be ✅ before anything else)

| # | Connection | Status | Verification |
|---|---|---|---|
| A1 | **rag2 product catalog → Twenty.LedProduct** (mirror by modelNumber on every save) | ✅ | Backfill 2026-04-26 17:25 UTC — Summary: total=158 created=31 updated=127 failed=0 (`/tmp/sync-results.log`). Twenty `ledProducts.totalCount`=160 (158 active rag2 + 2 stale). Code: `services/integrations/twenty/productSync.ts`, hooks at `app/api/products/{,[id]/,import/}route.ts` |
| A2 | **`universalCrmPush` actually lands Notes** (PDF/Excel/SOW/audit) — fix shipped 2026-04-26: `ensureOpportunityForProposal` was hardcoding `stage: "PROPOSAL"` which Twenty's OpportunityStageEnum no longer accepts; changed to `SALES_LEAD_FORMAL_PROPOSAL`. | ✅ | Commit `4761205c`. E2E verified via Python (Company `0d7b3fd5` + Opp `87045aa3` for MetLife Stadium). **Deployed 2026-04-26 18:17 UTC** to container `p7mo5oj5yps9p05ywtivgbooo` — `SALES_LEAD_FORMAL_PROPOSAL` confirmed in `/app/.next/server/chunks/2521.js`. |
| A3 | **`postRfpAnalyzedNote`** lands Note + ProposalEngineActivity on Opportunity | 🟡 | 3 Notes landed historically (`a6747424`, `dbdb4fbe`, `84eed684`); no fresh test |
| A4 | **`/api/twenty-bridge/export-proposal-pdf?estimateId=…`** returns valid ANC-branded PDF | 🟡 | Endpoint exists; not yet hit with a real Twenty Estimate id |
| A5 | **`/api/twenty-bridge/export-excel?estimateId=…`** returns valid scoping workbook | 🟡 | Same as above |
| A6 | Reconcile 31 Twenty-only LedProducts (LG-GSQA-039 used in 5 EstimateLines but rag2 has no GSQA family) | ⬜ | — |

## B. Auto-fields written to Opportunity (rag2 → CRM)

| # | Connection | Status | Verification |
|---|---|---|---|
| B1 | **Total contract value** auto-pushed to `Opportunity.dealValue` on Excel export (read from cost sheet grand total) | ⬜ | — |
| B2 | **Margin** auto-pushed to `Opportunity.margin` on Excel export | ⬜ | — |
| B3 | **Per-FY revenue split** rows written to `opportunityRevenueSplit` from Excel project schedule | ⬜ | — |
| B4 | **Currency** + **exchangeRate** fields on Opportunity, pushed on every export | ⬜ | — |
| B5 | **`Opportunity.accountExecutive` + `accountExecutiveEmail`** auto-set on proposal create from logged-in user | ⬜ | — |
| B6 | **bidStatus auto-progression**: RFP uploaded → SCOPING; PDF exported → BID_SUBMITTED; SIGNED → WON | ✅ | **Workflow #1 verified end-to-end** 2026-04-26 18:27 UTC. PDF export on MetLife Stadium → `bidStatus` flipped `SCOPING → BID_SUBMITTED`, Note "Proposal Engine: Exported Proposal PDF" landed on Opp `87045aa3`, server log: `[universalCrmPush] workflow: pdf_exported → Opp 87045aa3 bidStatus=BID_SUBMITTED`. Hooked at `app/api/projects/[id]/activities/route.ts` (the endpoint the UI actually hits). Same path fires for `sow_generated`. |
| B14 | **Repeat Clients Report skill** — Scout fires on "top 10 repeat technology clients" / "lifetime revenue by [vertical]" → produces single-sheet Excel matching Jireh's `ANC - Technology Repeat Clients` template (Client · First-Year · Lifetime Revenue · Lifetime Margin %). | 🟡 | Skill `repeat-clients-report` (`54288e81-63d5-4b4d-9cb6-a0bf0d5b08e8`) created + activated 2026-04-26. Scout prompt updated. Awaits live test in Scout chat. |
| B15 | **Account LTV Report skill** — Scout fires on "lifetime value of [Company]" / "Hankook-style report on [Company]" → produces multi-sheet Excel (Summary + Deal History + Teams Funded). | 🟡 | Skill `account-ltv-report` (`4b932931-a798-4ea1-921e-a6f7367ec596`) created + activated 2026-04-26. Awaits live test in Scout chat. |
| B7 | **Mirror Mode flag** on Opportunity (boolean: was this proposal Excel-parity?) | ⬜ | — |
| B8 | **Premium/Installation SOW type** SELECT field | ⬜ | — |
| B9 | **Rate card version** TEXT field ("NX Yaham 2026-Q2", "LG 2026-Q1") | ⬜ | — |
| B10 | **AnythingLLM workspace slug** as Opportunity field; "Open AI workspace" deep-link | ⬜ | — |
| B11 | **Proposal share-hash URL** as Opportunity field (client-facing share link copy-able from CRM) | ⬜ | — |
| B12 | **Last touched** timestamp + **artifact counter** ("3 PDFs · 2 SOWs · 1 RFP") on Opportunity | ⬜ | — |
| B13 | **RFP extracted-specs summary** widget on Opp ("12 displays · 4mm pitch · 2,400 sqft · indoor") | ⬜ | — |

## C. Notes / Activity timeline (rag2 → CRM)

| # | Connection | Status | Verification |
|---|---|---|---|
| C1 | PDF export → Note + ProposalEngineActivity | 🔴 | depends on A2 fix |
| C2 | Excel export → Note + Activity | 🔴 | depends on A2 fix |
| C3 | Premium SOW DOCX → Note + Activity | 🔴 | depends on A2 fix |
| C4 | Installation SOW DOCX → Note + Activity | 🔴 | depends on A2 fix |
| C5 | Audit Excel export → Note + Activity | 🔴 | depends on A2 fix |
| C6 | Proposal status SIGNED/CLOSED → Note + Activity | 🟡 | wired at `app/api/projects/[id]/route.ts:375` (untested live) |
| C7 | RFP analyzed → Note + Activity | 🟡 | A3 — 3 historical, no fresh test |
| C8 | Proposal auto-created from RFP → Note | 🟡 | wired at `app/api/rfp/pipeline/create-proposal/route.ts:252` (untested) |
| C9 | Client change request via share link → Note | 🟡 | wired at `app/api/share/[hash]/request/route.ts:144,194` (untested) |

## D. Files / Attachments (rag2 → CRM)

| # | Connection | Status | Verification |
|---|---|---|---|
| D1 | PDF artifact uploaded to Twenty file storage on Opportunity (instead of `/tmp/anc-exports/`) | ⬜ | — |
| D2 | Excel scoping workbook attached to Opportunity | ⬜ | — |
| D3 | SOW DOCX attached to Opportunity | ⬜ | — |
| D4 | RFP source PDF attached to Opportunity | ⬜ | — |

## E. Round-trip UI (CRM ↔ rag2)

| # | Connection | Status | Verification |
|---|---|---|---|
| E1 | **"View in CRM"** button on every rag2 proposal page (deep-link to opportunity record) | 🟡 | Wired 2026-04-26 — `app/projects/[id]/page.tsx` reads `project.twentyOpportunityId`, threads through `ProposalPage` → `StudioHeader` (renders pill with `ExternalLink` icon, hidden when null). Needs production visual verify after deploy. |
| E2 | **`/proposals/new?opportunityId=…` prefill** — opportunity → new-proposal form pre-populated | ⬜ | — |
| E3 | **"Your open opportunities"** panel on rag2 landing — filtered by accountExecutiveEmail = current user | ⬜ | — |
| E4 | **Live stage badge** on rag2 proposal page ("Negotiation" / "Won" pulled from CRM) | ⬜ | — |
| E5 | Twenty Quick Estimate AI skill → rag2 generates ANC-branded PDF (A4) | 🟡 | endpoint exists |
| E6 | Twenty Quick Estimate AI skill → rag2 generates scoping Excel (A5) | 🟡 | endpoint exists |

## F. Cross-system links (CRM → other systems)

| # | Connection | Status | Verification |
|---|---|---|---|
| F1 | ServiceTicket → Opportunity auto-link when ticket's venue has active WON opps | ⬜ | relation field `193c5f7a` exists, never populated |
| F2 | Auto-create RfpAnalysis record in rag2 when Twenty Opp.bidStatus flips to RFP_RECEIVED | ⬜ | — |
| F3 | Slack ping on a Tier-1 priority Opp when proposal is exported | ⬜ | — |
| F4 | Auto-pull venue domain from Twenty Venue → rag2 Proposal on creation | ⬜ | — |

## G. Drift / safety / observability

| # | Connection | Status | Verification |
|---|---|---|---|
| G1 | Daily cron: rag2 product count vs Twenty product count, alert on divergence | ⬜ | — |
| G2 | "CRM Sync ✅" badge on rag2 admin products page | ⬜ | — |
| G3 | Per-row sync log persisted (so we can replay failures, not just grep stdout) | ⬜ | — |
| G4 | rag2 → CRM push **error surfaces in the API response** (already done for products via `twentySync` field; do same for proposal exports) | 🟡 | products: ✅ via `twentySync` in response; proposals: still fire-and-forget |

## Z. Backfill state (idempotent — re-runnable)

| Thread | State | Notes |
|---|---|---|
| **Proposal → Twenty Opportunity backfill** | 🚧 in-flight | `/tmp/backfill-proposals-to-crm.py` running PID-tracked. As of last snapshot: **61 / 855 proposals linked.** ETA ~25 min. Skips 24 junk-named proposals (test/dd/h/etc). On completion, every real proposal page will render the View-in-CRM pill. |
| **First-export auto-link** | 🟡 awaiting A2-deploy | Once A2 fix is in production, every new PDF / Excel / SOW export auto-creates Company + Opp + saves `twentyOpportunityId` on first push. No manual backfill needed for future proposals. |

## H. Users + access (separate from connection plumbing)

| # | Item | Status | Notes |
|---|---|---|---|
| H1 | Add Alex as proposal engine user | ⬜ | Need full name + email + role + initial password |
| H2 | Add Alexis as proposal engine user | ⬜ | Same |
| H3 | Add Kirsten as proposal engine user | ⬜ | Same |
| H4 | Real Jireh SSO invite (replace "Jireh Temp" workspaceMember; re-create favorites) | ⬜ | crm-knowledge skill flagged this 2026-04-17 |

---

## Build order (proposed)

1. **A1** — finish product catalog backfill + verify 158 rows landed [running now]
2. **A6** — decide what to do with the 31 Twenty-only orphans
3. **A2** — fix the silent-fail `universalCrmPush` so C1–C5 flip green
4. **B5, E1, E2** — AE auto-assign + "View in CRM" + opp prefill (smallest set that makes Jireh see the round-trip)
5. **B1, B2, B4** — total/margin/currency auto-push (light up the dashboards)
6. **B6** — auto-bid-status progression (Bid Tracker kanban becomes alive)
7. **A4, A5** — verify Quick Estimate bridge end-to-end with a real Estimate
8. **D1–D4** — files attached to Opp (replaces `/tmp/anc-exports/` reliance)
9. **G1, G2** — drift cron + sync badge (so this stays clean)
10. **H1–H3** — add three users when Ahmad sends names + emails
11. **B7–B13, F1–F4** — depth fields, smart auto-links, tiny touches
12. **A3, C6–C9** — fresh verification on the historically-wired but untested paths
13. Draft the Jireh message **only** when ≥80% of A/B/C/E are ✅
