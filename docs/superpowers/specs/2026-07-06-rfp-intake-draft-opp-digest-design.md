# RFP intake — draft opportunities + Monday digest

**Status:** specced 2026-07-06, building behind flags. Live email→CRM intake stays unchanged (review-mode, no auto-create) until flags are on.
**Owner:** Ahmad. **Project:** rag2 (ANC Proposal Engine) + Twenty CRM.

## Origin (Slack, 2026-07-06)

Ahmad proposed three next steps on the live email→CRM intake; Jireh + Natalia refined:
- #1 New-business emails → auto-open a **draft opportunity** (pre-filled, ready to confirm) so nothing slips through untracked.
- #2 **Monday digest** replacing the manual "active pricing Priority list" report — every opp with `proposalDueDate` in the next 14 days, plus an **"Unassigned" section** of draft opps from #1, reviewed at the Monday meeting.
- #3 The **Curie LED-request thread** (CC'd) → same treatment, LED specs land on the same opportunity next to the broadcast piece (Camping World).

**Stakeholder refinements folded in:**
- Recipients start small: Ahmad, Jireh, Jeremy (Jireh 3:26 PM). Expand later.
- The digest **replaces** the manual "active pricing Priority list."
- New draft opps appear in an **"Unassigned" section**, reviewed Monday to decide.
- Timing: Natalia wants post-call (Mon PM/Tue AM) so "due" isn't stale; Jireh wants it for the Monday-meeting review. **Decision: send Monday AM before the meeting, stamped "as of [timestamp]"** — meeting reviews the unassigned; anything added on the call rolls to next week's digest (or a live pipeline view). Post-call Mon PM is the fallback if Ahmad prefers.

## Investigation findings (grounded in code)

- The Graph poller (`services/intake/emailCrmGraphSource.ts`) reads **all unread inbox messages** (`/mailFolders/inbox/messages?$filter=isRead eq false`) — **no To-line filter**. A CC'd email lands in the `deals@` inbox automatically, so **#3 is mostly operational** (CC `deals@` on the Curie thread) + a verify that the venue-token matcher still finds the Camping World opp from the LED-spec email. The Jeremy test fixture (`emailToCrmSync.test.ts`) already contains the "I copied you on the LED request… to Curie" line — the broadcast side works; the LED side needs a real sample to verify (don't build blind).
- The orchestrator (`services/intake/emailToCrmProcess.ts`) today: matched → `applyEmailCrmToOpportunity` (update due date + note); unmatched/ambiguous → `status: "pending_review"`. **No create path exists.** `TWENTY_SYNC_CREATE_MODE` defaults to `review` and `syncToExistingOpportunityOnly()` refuses to create.
- A heavier `createEmailIntakeCrmHandoff` (`crmAutomation.ts:663`) exists but is human-gated (review → convert to a quote draft; needs a `proposalId`). #1 is a **lighter, automatic draft-create** for unmatched RFP emails, scoped to intake only.

## Slice 1 — draft opportunity for unmatched RFP emails (#1)

**Goal:** when an inbound email looks like a new RFP and no existing opportunity matches, auto-create a *draft* opportunity pre-filled with project + due date + source, flagged "Unassigned," surfaced in the digest. Human confirms/assigns at the Monday meeting.

**Feature flag:** `FEATURES.EMAIL_TO_CRM_DRAFT_OPP` (default **false**). While off, behavior is identical to today (unmatched → pending_review). No global create-mode flip.

**New units (each independently testable):**

1. `looksLikeNewRfp(extraction: EmailCrmExtraction, input: EmailCrmInput): boolean` — pure classifier in `emailToCrmSync.ts`. True when: a real `clientOrVenue` + `projectName` present, at least one verified `proposal_due` or `internal_deadline` date, and the subject/body carries RFP/bid/proposal intent language. Excludes obvious addenda on existing deals (those match an opp and never reach this branch anyway). Unit-tested.

2. `createDraftOpportunityForRfpIntake(extraction, input): Promise<{ opportunityId: string }>` in `crmAutomation.ts` (exported). Creates/finds the **Company** (reuse `findExactCompany` / `createCompanyForHandoff`), then creates an **Opportunity** with:
   - `name` = `{clientOrVenue} - {projectName}` (truncated)
   - `bidStatus = "RFP_RECEIVED"` (enum id `ad436148`)
   - `proposalStage = "RFP"` (enum id `0c4f3e5a`)
   - `proposalDueDate` = the verified proposal-due date (if any)
   - owner/`inCharge` = the ANC "Unassigned" workspace member (resolved once, cached) — so the Monday meeting can filter "Unassigned."
   - a timeline **note** with the source email subject/from/received + filed-docs reference + `source: email-intake-draft`.
   **Field names verified against the Twenty `OpportunityCreateInput` schema before writing the mutation** (introspection) — no guessing.

3. Orchestrator wiring (`emailToCrmProcess.ts`): in the `!shouldAutoApply` branch, when `decision.top == null` AND flag on AND `looksLikeNewRfp` → call `createDraftOpportunityForRfpIntake`, set `EmailCrmIntake.status = "draft_created"` + `matchedOpportunityId = <new>`. Intake row already persists `extraction`/`candidates`. Add `draft_created` to the intake status enum (Prisma migration if needed; else reuse a string status).

4. **Test:** a no-match new-RFP fixture ( Camping World-style but with no existing opp in the mock) → `looksLikeNewRfp` true → `createDraftOpportunityForRfpIntake` called with the right fields (CRM create mocked). Existing 14 intake tests unchanged (flag off by default).

**Out of scope for Slice 1:** the digest rendering (#2), the Curie LED verify (#3), Building Connected ingestion.

## Slice 2 — Monday digest (#2)

**Goal:** replace the manual "active pricing Priority list." Two sections, emailed Monday AM (cron) to Ahmad/Jireh/Jeremy, "as of [timestamp]" stamped.

- **Section A — Active pricing priority:** every opportunity with `proposalDueDate` in the next 14 days, pulled from the live CRM (Twenty `rest/opportunities` filter on `proposalDueDate`), ordered by due date. Columns: deal, venue/client, due date, owner, stage.
- **Section B — Unassigned (for review):** every opportunity with owner = "Unassigned" (the draft opps from Slice 1) OR `bidStatus = RFP_RECEIVED` with no owner — the new drafts the Monday meeting decides on.
- **Render:** plain-text + light HTML email (house style), one email per week. "As of [UTC timestamp]" header so the cut is honest.
- **Delivery:** Graph send-mail (the intake app already has `Mail.SendWrite`) OR the existing email-sending path used elsewhere in rag2. Recipients configurable (start: Ahmad/Jireh/Jeremy).
- **Cron:** Monday 06:00 local (pre-meeting). Post-call Mon PM as the flagged alternative.

**Out of scope for Slice 2:** live in-portal widget of the same data (future), per-person customization.

## Slice 3 — Curie LED verify (#3)

- **Operational:** CC `deals@anc.com` on the Curie LED-request thread (Jeremy/owner does this). The poller ingests it.
- **Verify:** forward one real Curie LED-request email as a fixture; confirm `extractEmailCrmFacts` yields `clientOrVenue = Camping World Stadium` (or the right venue) and `findOpportunityCandidates` matches the existing opp. If it misses, add a small robustness tweak (fall back to subject tokens, or thread-association). Do not build speculatively without the sample.

## Risks / open items

- **CRM create field names:** `proposalStage`, `bidStatus` enum values, owner/`inCharge` field, `proposalDueDate` on create — all verified via Twenty GraphQL introspection before the create mutation is written. No guessed fields.
- **"Unassigned" owner:** needs a real workspace member (or a sentinel) in Twenty to filter on. Confirm the workspace has (or create) an "Unassigned" system member, or use a dedicated `bidStatus`/tag as the "unassigned" signal instead of owner. Decide during Slice 1.
- **Prisma migration:** adding `draft_created` to the `EmailCrmIntake.status` enum (if it's an enum) — additive migration, no existing rows changed.
- **No auto-apply expansion:** Slice 1 only creates when there is NO match. It never creates a duplicate opp for an email that does match an existing deal. The existing `decideMatch` threshold (≥0.75 + 0.15 gap) stays.