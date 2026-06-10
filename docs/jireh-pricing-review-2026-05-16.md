# Jireh Pricing Review — Living Working Document
> **Created:** 2026-05-16 | **Context:** Jireh's May 14 email reviewing Ahmad's full CO/proposal stack
> **This doc is working context for Ahmad's reply — not stakeholder-facing.**

---

## The Situation

Jireh emailed May 14 at 8:32 PM (CC'd Charlie, Natalia) reviewing 5 proposals/COs Ahmad sent. Natalia forwarded them to Jireh that morning at 11:03 AM. Ahmad sent a holding reply May 15: "gathering everything together to properly respond."

**Recipients on thread:** Jireh, Jeremy Riley, Jackson Hart, Jesse Vellucci, Grant Howard, Krissy Carter. CC: Charlie Dinh, Natalia Kovaleva.

**Jireh's tone:** Not hostile, but cost-conscious. Flagged M&S ($6K) and Submittal ($5K) as "seems high / expensive." Approved Short Form ($1.5K). Wants Matrix updated + explained. Wants LiveSync formalized.

---

## Slack / Ledger Grounding Pass — 2026-05-16

**Access note:** Live Slack API access from this VPS can read `#external--ai-services2` and `#external--ai-services-no-claw`, but the bot is not currently a member of `#crm-talk`, `#crm-ai`, `#natalia-and-claude`, or the Jireh/Natalia/Grant DM surfaces. For those, this doc is grounded through the ingested Slack/KB conversation logs and the live service ledger, not fresh live-DM reads.

**Confirmed from Slack-derived ANC KB:**
- Grant's M&S ask originated in a Slack DM with Ahmad + Jireh on 2026-05-07/08. Grant sent 7 structured questions around game-level placements, contracted-vs-actual inventory, Nielsen monthly verification, team dashboard, Excel sync, and future Nielsen/Sponsor United integrations.
- M&S Bundle A shipped on 2026-05-08 as a CRM operating layer: `mediaPlacement`, `nielsenVerification`, and `sponsorTeamContract`, with 1,114 records loaded.
- Grant's 2026-05-13 follow-up expanded the vision into team/sponsor/open-inventory views; the 2026-05-14 M&S proposal is the larger vision after Bundle A, not the same thing as the original Bundle A.
- Jireh's established pattern is terse governance, not emotional rejection. He trims scope and asks for owner validation; he does not need a defensive essay.

**Confirmed from local Slack mirror / service ledger:**
- CMS/LiveSync came up in Slack on 2026-02-24/26: Natalia asked how to budget CMS, Jireh suggested server/pixel logic and OES/Ross references, and Jireh later asked to add a LiveSync CMS quick-start option.
- Matrix was already a known scope thread before Jireh's May 14 email. Ledger row `77f80b39` tracks the estimator/RFP guided matrix walkthrough + admin layer as NEW, quote range $1,600-$2,200, stored high at $2,200 pending the final matrix. Separate ledger row `3263a2bd` tracks the mirror-parser update as FIX / retainer-covered.
- CO#4 is shipped in the service ledger as three shipped rows on 2026-05-15: New Document Types, spec gap fixes, and audit fixes. The shipped commits are `de0bfdbc`, `a3e638aa`, and `ff2b5e06`.
- CMS pricing is shipped in the ledger as three shipped rows on 2026-05-13, including Option 3 hidden behind `FEATURES.CMS_PRICING` / `FEATURES.CMS_PRICING_STRATEGIC`.

**Needs reconciliation before sending anything money-specific:**
- M&S Bundle A has conflicting local records. The KB delivery manifest says "$3,000 paid-in-full," but the live service ledger row `0f7d120a` currently shows `status=in_progress`, `quote_amount=3000.00`, `paid_at=NULL`, `paid_amount=NULL`, and no `shipped_at`. Do **not** tell Jireh "paid" or "invoice-ready" until Ahmad confirms the real payment state.
- The matrix public-facing proposal says $2,000, while the service ledger carries the earlier high-end quote at $2,200. For Jireh, answer against the $2,000 he saw; internally, remember the range history.

---

## The 5 Items Jireh Named (+ 1 Related)

### 1. Estimation Matrix Revamp — $2,000
**Ref:** ANC-MATRIX-CO-001 | **PDF:** `proposals/ANC-Matrix-Revamp-Proposal-2026-05-14.pdf`
**Prepared for:** Natalia Kovaleva
**Scope:** 6 items — matrix-needed gate, guided walkthrough, estimator lock, real-time admin layer, conditional logic, audit trail per deal. Mirror parser update = NO CHARGE (retainer).
**Out of scope:** Historical re-pricing, external matrix sync (future COs)
**Delivery:** 5 business days, 30-min walkthrough with Natalia, 30-day warranty

**Jireh says:** Update matrix to latest from Jeremy/Jackson. Why is automation $2K for "simple scope"? Jeremy to confirm post-export editing.

**Build status:** NOT YET BUILT. The Responsibility Matrix was cleaned up (commit 05e85bac) but the full revamp (admin layer, guided walkthrough, conditional logic, estimator lock) is unbuilt.

**Grounded nuance:** The service ledger has the estimator/RFP matrix work as a quoted NEW item at a $1,600-$2,200 range, stored at $2,200 until Natalia sends the final matrix. The mirror-parser alignment is separately logged as retainer-covered. Jireh is reacting to the $2,000 proposal version, so the response should explain the $2,000 scope without mentioning the internal $2,200 ledger high-water mark.

**What's actually in the $2K:**
- Matrix-needed gate (branching logic in estimator + RFP)
- Line-by-line guided walkthrough with best-guess pre-fill
- Estimator lock (confirm each line before commit)
- Real-time admin layer (add/rename/retire lines without engineering)
- Conditional logic support (lines triggered by other answers)
- Audit trail per deal (which lines asked, which answers locked, who reviewed)

This is NOT "update a spreadsheet." This is workflow logic, admin UI, and audit persistence.

---

### 2. Short Form Contract — $1,500 (APPROVED)
**Ref:** CO#4, ANC_Change_Order_04_New_Document_Types | **PDF:** `proposals/ANC_Change_Order_04_New_Document_Types.pdf`
**Prepared for:** Jireh Billings | **Date:** March 26, 2026
**Scope:** Short Form Agreement ($500, 3-4 hrs) + Change Order Document Type ($1,500, 6-8 hrs) - $500 discount = **$1,500**

**Jireh says:** $1,500 approved. Proceed with Krissy Carter.

**Build status:** ALREADY BUILT AND SHIPPED. Per CLAUDE.md "What's Live":
- CO#4 shipped: Short Form Agreement rename, Change Order doc type, header, Description of Work table, Change Order # in header, PDF filename parity, jsreport intro
- Commits: de0bfdbc, a3e638aa, ff2b5e06

**CRITICAL:** This is $1,500 of DELIVERED work. Invoice-ready NOW. Jireh approved it. Krissy coordination is the only remaining step.

---

### 3. Media & Sponsorship CRM Module — $6,000
**Ref:** ANC-MS-CO-001 | **PDF:** `proposals/ANC-MS-CRM-Proposal-2026-05-14.pdf`
**Prepared for:** Jireh Billings + Grant Howard
**Scope:** 10 items — team view, sponsor view, open inventory, live counters, monthly Nielsen workflow, placement pipeline board, executive dashboard, plain-English assistant, inventory data loaded, Excel round-trip sync
**Out of scope:** Nielsen credential auto-pull, Sponsor United whitespace, deal valuation layer

**Jireh says:** "$6,000 quote seems high." Set up meeting with Grant to review.

**Build status:** BUNDLE A ALREADY DELIVERED for $3,000 (2026-05-08). See KB: m-and-s-bundle-a-delivery.md
What's shipped:
- 3 custom CRM objects (mediaPlacement, nielsenVerification, sponsorTeamContract)
- 1,114 real records loaded from Grant's actual Excel files
- Navigation folder "Media & Sponsorships" in CRM
- Excel export endpoint (live at proposals.anc.com/api/render/m-and-s-inventory-xlsx)
- Monthly Nielsen recurring task generator (cron)
- Kill-switch script

What the $6K proposal adds BEYOND Bundle A:
- Live counters (top-of-page totals)
- Placement pipeline board (drag-to-update kanban)
- Executive dashboard (slots sold, open slots, oversold, behind-pace)
- Plain-English assistant ("what's open at the Nationals")
- Excel round-trip sync (import, not just export)

**KEY INSIGHT:** The $6K proposal was written AFTER Bundle A shipped. Bundle A was $3K. The $6K proposal is the FULL vision — some of it is already delivered. The delta between what exists and what the $6K covers is ~$3K of additional work (dashboards, kanban, AI, import).

**Grounded nuance:** Do not assume the $3K is collectible without checking with Ahmad. The KB delivery page calls Bundle A "$3,000 paid-in-full," but the live service ledger still has the row as `in_progress` with no paid/shipped timestamps. The safe reply frame is "we already stood up the base operating layer; the Grant meeting should separate what is live from what is next."

**Strategy options:**
a) Show Jireh what's already live ($3K delivered), quote the remaining pieces as $3K add-on
b) Re-scope to just the dashboard + kanban for $3-4K (drop the AI assistant to Bundle B)
c) Meet with Grant first (Jireh's suggestion) — let Grant's enthusiasm drive scope up

---

### 4. Submittal Compiler — $5,000
**Ref:** Submittal Compiler Proposal | **PDF:** `proposals/ANC-Submittal-Compiler-Proposal.pdf`
**Prepared for:** Jesse Vellucci (SVP, Project Management) | CC: Natalia | **Date:** April 18, 2026
**Scope:** 7-step workflow (new submittal → pick project → upload signed contract with auto SKU extraction → engine pulls vendor datasheets → add content → fill transmittal → generate combined PDF). Plus revision support + ANC datasheet library (LG, Yaham, supporting hardware).

**Jireh says:** "Seems expensive of $5,000." Will review with Jesse.

**Build status:** NOT BUILT. An admin page exists at `/app/admin/submittal-compiler` but the full workflow is unbuilt.

**What justifies $5K:**
- Contract PDF parsing (auto-extract SKUs from Exhibit A)
- Vendor datasheet library with SKU tagging
- Visual highlighting on datasheets (coordinate mapping for LG LCD/LED)
- Cover letter generation (branded Letter of Transmittal)
- PDF assembly (cover + datasheets + drawings → single combined PDF)
- Revision management (pre-filled from prior submittals)
- This replaces Jesse's multi-HOUR manual process per submittal

**The worked example in the proposal (49ers Mesh LED)** demonstrates concrete value — manual pick-through replaced by engine extraction.

**Strategy:** Don't defend price. Let Jireh review with Jesse. Jesse will articulate the pain (he lives it). If they want cheaper, offer a "lite" version without datasheet highlighting or revision management for $3K.

---

### 5. LiveSync — $5,000 (needs formal proposal)
**Ref:** No formal proposal yet | Jireh wants one with options
**What exists:** OpenClaw workspace doc (`04-livesync-platform.md`) — deep technical writeup of LiveSync as ANC's proprietary venue control platform. This is background research, not a proposal.

**Jireh says:** Need formal proposal for $5K options. Revisit processing with Ahmad, Jeremy & Jackson.

**Build status:** NOTHING BUILT. No proposal written.

**What LiveSync is:** ANC's proprietary venue software control platform — NDI/SMPTE 2110 IP infrastructure, unified display management, scheduling, broadcasting, live-event control. Partnered with The Famous Group (Vixi Suite integration, Nov 2024).

**What "processing" likely means:** How LiveSync integrates with the estimator/proposal workflow — pricing a LiveSync component in a deal, configuring it, generating the spec. This is Jeremy/Jackson territory.

**Next step:** Prepare a formal proposal with tiered options (~$3K / $5K / $7K). The processing-workflow call with Jeremy/Jackson should define what the tiers cover. Don't quote blind.

---

### 6. CMS / Control System Pricing — $2K / $4K / $5K (NOT in Jireh's email)
**Ref:** ANC-CMS-CO-001 | **PDF:** `proposals/ANC-CMS-Pricing-Proposal-2026-05-14.pdf`
**Prepared for:** Natalia Kovaleva + CMS Team

**Three tiers:**
- Starter ($2K): Picker only, Excel-equivalent inside the engine
- Smart ($4K): + auto-filled soft costs, heat/power rollup, margin per line, software support tier
- Strategic ($5K, recommended): + catalog versioning, CRM sanity-check vs 193 deals, project memory

**Build status:** ALREADY SHIPPED behind `FEATURES.CMS_PRICING` flag. Per CLAUDE.md:
- `/admin/cms-catalog` + `/estimator/[projectId]/cms` picker + CMS summary banner
- 80 SKUs seeded from Natalia's CMS_BASE_BOM
- Smart-defaults engine for soft costs
- Heat/power AC-capacity flag
- CRM sanity check vs 193 historical CMS/LiveSync deals
- Prior-client prefill
- BOM Excel export matching Natalia's layout
- Migration: `20260513210000_add_cms_pricing_module`

**CRITICAL:** This is ALREADY BUILT. The Strategic tier ($5K) is essentially live but hidden behind a feature flag. Natalia hasn't been shown it yet (the flag is OFF by default, and Option 3 extras are hidden per commit 81044f1b).

**Status:** Not in Jireh's review — Natalia-facing. But it's revenue sitting on the shelf.

---

## Financial Summary

| Item | Quoted | Built? | Jireh's Take | Invoice-Ready? |
|---|---|---|---|---|
| Matrix Revamp | $2,000 | No | Wants explanation | No |
| Short Form / CO#4 | $1,500 | YES (shipped) | Approved | YES — now |
| M&S CRM Module | $6,000 | Partial ($3K Bundle A shipped) | "Seems high" | Reconcile first — ledger not marked paid/shipped |
| Submittal Compiler | $5,000 | No | "Seems expensive" | No |
| LiveSync | $5,000 | No proposal yet | Wants formal proposal | No |
| CMS Pricing | $2K-$5K | YES (shipped, flag OFF) | Not reviewed | Pending — show Natalia first |

**Total quoted across all 5 Jireh items:** $19,500
**Already delivered + invoice-ready:** CO#4 $1.5K confirmed shipped. M&S Bundle A is delivered, but payment/invoice state conflicts between KB and live ledger.
**Already built but not invoiced:** CMS $2-5K (behind flag)
**Unbuilt:** Matrix $2K + Submittal $5K + LiveSync $5K = $12K

---

## What Ahmad Already Told Jireh

Holding reply only (May 15): "Thanks for this, I am just gathering everything together to properly respond to this. Will respond asap thanks"

No substance committed yet. Clean slate for the real reply.

---

## Claude-Captured Slack Timeline (not live re-verified this pass)

**Current grounding status:** The lines below were already in this working doc from the prior Claude pass. I did **not** re-read the underlying `#natalia-and-claude` / DM messages live because the Slack bot is not a member of those surfaces in this session, and the exact quoted phrases below are not present in the local mirrored Slack markdown/KB files. Treat this as useful context, not source-of-truth evidence, until live Slack DM access or the exported transcript is available.

**May 13 (the day before Jireh's email):**
- Natalia asked Ahmad: "Was 'contracts' scope ever stated?" and "What about 'projects', that linked page for Jesse?"
- Ahmad pulled the CO#4 history: scoped March 26, Natalia said "Please prepare CO to your scope for those 2 items" — but **formal approval never came after that**
- Natalia: "I am meeting Jireh tomorrow — can you share all proposals for all scopes — Jesse, contracts, matrix"
- Natalia: "He wants another one to calculate CMS"
- Natalia: "It's a big one it's hard to explain with no visual. He has a way to calculate exact CMS cost by picking products from various categories."
- Ahmad/Natalia call at 2:30 PM. Ahmad shared the **transparency page** (services.ancsports.net/transparency) before the call
- After call: Ahmad sent Natalia the full CMS analysis + 3 options ($2K/$4K/$5K)

**May 14 (Jireh review day):**
- Natalia: "so we have Jesse, Contracts, Matrix and now LiveSync (CMS)?"
- Ahmad: "you have also media and sponsor grant"
- Natalia: "whats that?" — **she didn't know about M&S**
- Ahmad explained Grant's M&S layer
- Natalia: "was that approved and paid for?"
- Ahmad: "not officially approved, id rather if jireh told you everything"
- Natalia: **"can you send the CO/Proposal for it? Jireh sits right here said to get invoice"** — Jireh was physically present and said "get invoice"
- Ahmad quoted: "M&S Operating Layer + Vision Expansion — $6,000 fixed, paid on delivery"
- Natalia: "ok i am just missing matrix PO PDF please share"
- Natalia: **"i should have contracts approved today and potentially matrix"**
- Ahmad: "did you also want one for the CMS?" → Natalia: "yes, put all options there please"
- Natalia: "but that one we review with CM guys next week" (CMS = separate track)
- 8:32 PM: **Jireh sent the email** (the one Ahmad is responding to)

**May 15:**
- Ahmad sent holding reply to Jireh
- Ahmad shipped CO#4 (Short Form + Change Order + Matrix cleanup) and sent Natalia the delivery message in Slack

**Key intelligence if Claude's captured Slack timeline is accurate:**
1. **"Jireh sits right here said to get invoice"** — would mean Jireh was more positive in person than his email reads. Do not cite this externally unless the actual Slack line is re-opened.
2. **Natalia didn't know about M&S** — so the $6K was news to her when she forwarded it to Jireh. Jireh's "seems high" may be a first-look reaction without context on what Bundle A already delivered.
3. **CO#4 was never formally approved** before being built — scoped March 26, Natalia said "prepare CO", but no sign-off landed. Now Jireh has approved $1.5K for it. Invoice it.
4. **CMS is a separate review track** — "review with CM guys next week." Don't mix it into the Jireh reply.
5. **Natalia expected contracts + matrix approved that day (May 14)** but Jireh's email deferred matrix to "update first, explain $2K."

**April 16 — Submittal Compiler original scoping (Slack #external-ai-automation):**
- Ahmad sent Jesse + Natalia a detailed direction: Change Orders + Submittal Compiler as two pieces
- Ahmad's scoping asked 5 specific questions about Jesse's workflow (revisions, Exhibit A formats, non-display items, manufacturers, datasheets)
- This proves the $5K is scoped from a real call + real workflow analysis, not made up

---

## The AI's Draft Reply (from Ahmad's earlier paste)

The AI suggested a structured reply addressing each of the 5 items, with the key positioning line: "If the desired scope is narrower than what I priced, I'm fine resizing it." This frames cheaper = smaller, not same-for-less.

The draft was solid but didn't account for:
- CO#4 is ALREADY BUILT (should be invoiced, not "proceeded with")
- M&S Bundle A already shipped for $3K (the $6K is incremental on top)
- CMS is already built (separate conversation, but revenue context)
- Claude-captured "Jireh sits right here said get invoice" context — useful if re-verified, but do not cite externally yet

---

## Stakeholder Dynamics at Play

**Jireh** (President, Venue Partnerships):
- Cost-conscious but fair — "seems high" is not "no"
- Wants reports, not tech. Account-centric thesis.
- Decision-maker alongside Joe. His sign-off moves money.
- Respectful, not effusive. "Fix strong, fast."

**The CC list matters:**
- **Charlie** (CC'd) — sees everything, Tier 1.5 ally, Ahmad's strongest internal partner
- **Natalia** (CC'd) — proposal lead, daily user, will advocate for Matrix + CMS
- **Jeremy/Jackson** (TO'd) — technical leads, own Matrix + LiveSync processing
- **Jesse** (TO'd) — SVP PM, owns submittal pain, will advocate for Compiler
- **Grant** (TO'd) — M&S division, already received Bundle A delivery
- **Krissy** (TO'd) — Short Form coordination

**The political read:**
Jireh isn't killing anything. He's doing price governance. He's asking the domain owners (Grant, Jesse, Jeremy/Jackson) to validate before he signs. This is GOOD — it means the domain owners will articulate the pain themselves, which is stronger than Ahmad defending from outside.

---

## Service Contract Terms (for Ahmad's reference)

Per reference_service_contract.md:
- Standard tier: $1,500/mo, 12 hrs/mo, $90/hr overage
- 30-day warranty included on delivered features
- NEW work = fixed-price per scope (no hourly exposed to stakeholders)
- The $1.5K-$2.5K Phase 4.x pattern is established

---

## Open Questions for Ahmad

1. **CO#4 ($1.5K) is shipped — invoice now?** Jireh said "proceed as is and work with Krissy." He may not realize it's already done. Should the reply say "already delivered, coordinating with Krissy on final sign-off"?

2. **M&S — how to frame the $6K vs $3K already delivered?** First reconcile the payment state: KB says paid-in-full, live service ledger says not marked paid/shipped. Then options: (a) credit the $3K and show $3K remaining, (b) treat them as separate scopes, (c) let the Grant meeting define what's next.

3. **CMS — bring it up now or keep it separate?** It's built and hidden. Natalia is the audience, not Jireh. But it's $2-5K of unrecognized revenue.

4. **LiveSync — write the formal proposal now, or wait for the Jeremy/Jackson/Ahmad call?** Jireh explicitly asked for one.

5. **Reply tone — the AI's draft vs Ahmad's voice?** The AI draft is good but verbose. Ahmad's stakeholder voice is terser. Which register for this reply?

---

## Relevant Files on VPS

**Proposals:**
- `/root/rag2/proposals/ANC-Matrix-Revamp-Proposal-2026-05-14.pdf`
- `/root/rag2/proposals/ANC-MS-CRM-Proposal-2026-05-14.pdf`
- `/root/rag2/proposals/ANC_Change_Order_04_New_Document_Types.pdf`
- `/root/rag2/proposals/ANC-Submittal-Compiler-Proposal.pdf`
- `/root/rag2/proposals/ANC-CMS-Pricing-Proposal-2026-05-14.pdf`

**KB entries:**
- `/root/anc-kb/content/docs/projects/m-and-s-bundle-a-delivery.md`
- `/root/anc-kb/content/docs/people/jireh-billings.md`
- `/root/anc-kb/content/docs/drama/pricing-posture.md`
- `/root/anc-kb/content/docs/requests/open.md`

**Scope tracker:** `/root/rag2/docs/claude-memory/scope-tracker.md`
**Service contract:** `/root/.claude/projects/-root-rag2/memory/reference_service_contract.md`
**Slack/KB grounding:** `/root/anc-kb/content/docs/conversations/jireh-billings.md`, `/root/anc-kb/content/docs/people/grant-howard.md`, `/root/anc-kb/content/docs/projects/m-and-s-bundle-a-delivery.md`, `/root/rag2/docs/slack/external-ai-automation.md`, `/root/rag2/docs/slack/natalia-dm.md`
**Service ledger checks:** `public.service_requests` rows `0f7d120a` (M&S Bundle A), `77f80b39` + `3263a2bd` (Matrix), CO#4 shipped rows, CMS shipped rows

---

*Last updated: 2026-05-16 — Slack/KB/ledger grounding pass added after initial creation.*
