# Natalia Kovaleva — CRM AI Persona

## Snapshot

- **Name:** Natalia Kovaleva
- **Email:** natalia.kovaleva@ancsports.net (validate with directory)
- **Role / title:** Proposal Lead
- **Team / function:** Estimation & Proposals
- **Confidence:** **High** for role + workflow + report needs (direct quotes captured on the 2026-04-17 CRM kickoff call). **Medium** for day-to-day cadence outside that call.
- **Sources:**
  - `crm-knowledge` skill — direct call-quote section "Natalia Kovaleva — Proposal Lead (on same call)" with her four named reports and "Reports are my biggest pain" verbatim.
  - `anc-natalia-state` skill — chronological record of acceptance-criteria changes through 2026-03-13.
  - `mirror-mode-rules.md` — six golden rules she signs off on for proposal/Excel fidelity.
  - Live CRM views: "Estimation & Proposals" (her daily) and "Proposal Pipeline" (the 2026-04-17 build).

## Work-Relevant Persona

Natalia owns proposals end-to-end at ANC. She is the daily user of the **Estimation & Proposals** view in the CRM and the named owner of the four standing reports the project leadership reads (Backlog, Win/Loss by League per FY, Company Performance by Department, Forecast by Account). Her time is mostly spent moving opportunities through the pricing → proposal → negotiation funnel, pulling case studies for similar past work by league, generating SOWs/one-pagers, and chasing missing inputs (rate cards, product specs, due dates).

Her own framing: *"reports are my biggest pain"* — she has been operating without first-class reporting for a long time and a meaningful share of her week is spent assembling data that the CRM should produce on demand. The CRM AI is the highest-leverage tool we can hand her: every minute she does not spend reformatting an export is a minute back to actually winning deals.

## Likely CRM Touchpoints

- **Views:** `Estimation & Proposals` (daily), `Proposal Pipeline` (kanban: design → pricing → proposal → negotiation), `All Opportunities` filtered by stage.
- **Objects:** `Opportunity`, `Company`, `Person`, `Estimate` / `EstimateLine`, `designRequest`, `serviceTicket` (linked context only).
- **Key Opportunity fields she touches or relies on:** `proposalDueDate`, `pricingComplete`, `pricingCompleteDate`, `proposalStage`, `priority`, `probability`, `accountExecutive`, `substantialCompletionDate` (renamed "Contract Completion Date"), `revenue2025…revenue2036`, `margin`, `league`, `serviceType`, `primaryDecisionMaker`, `oneDriveLink`.
- **Reports she has named as her own:**
  1. **Backlog** — won opps + Contract Completion Date + total contract + % unpaid.
  2. **Win / Loss by League per FY** — RFP win rate, sortable by league.
  3. **Company Performance by Department** — Jireh's daily, but Natalia consumes it too.
  4. **Forecast by Account** — pipeline forward-look.
- **Automations that already exist or are owed to her:**
  - Auto-move opp to "pricing complete" when one-pager generated (asked for, partially built).
  - Email → Opportunity auto-creation with Company-existence dedupe.
  - "Estimation & Proposals" daily reminder of what is due this week.
- **Scout skills most aligned to her workflow:** `sow-generator`, `quick-estimator`, `estimator-excel`, `rfp-analyzer`, `rfp-to-deal-pipeline`, `pipeline-tracker`, `similar-design-finder`, `account-ltv-report`, `email-closed-won-digest`, `upcoming-renewals`, `learn`.

## Pain Points To Validate

These are hypotheses — confirm with Natalia directly before treating any as fact.

- **Hypothesis:** her Monday morning hour is mostly spent rebuilding "what's due this week" by eye from the Estimation & Proposals view because the proposal-due-date column is not yet a sortable, sliced report. **Validate:** ask her how she starts her week.
- **Hypothesis:** "find me three similar past wins for [league/category]" is a recurring ask she serves to AEs and Jireh, and she does it manually by scrolling through closed-won opps. **Validate:** ask her how often she gets that ask and what she returns it as.
- **Hypothesis:** estimate / SOW / one-pager generation costs her real time every week, and the bottleneck is gathering inputs (product list, rate card, dimensions, team), not writing prose. **Validate:** ask her to walk through one proposal start-to-finish.
- **Hypothesis:** rate-card and pricing-complete handoffs to AE / Jireh involve Slack pings she would rather automate ("ping me when AE has filled in the rate card"). **Validate:** ask what she copies into Slack on average per day.
- **Hypothesis:** she is the de-facto QA on proposal numbers and would benefit from an AI second-pair-of-eyes on margin / line-item math before she sends. **Validate:** ask whether margin errors get caught upstream or downstream of her.

## High-Value CRM AI Opportunities

- **"What's due this week?" daily digest** — every Monday 8 ET, fire `pipeline-tracker` for opps with `proposalDueDate` in next 7 days, return as a triaged list (overdue / due today / due this week / blocked-by-missing-inputs).
- **One-pager generator** — Scout skill that takes an opportunity record, drafts the SOW one-pager from the rate card + product catalog, and on accept flips `pricingComplete = true` + sets `pricingCompleteDate`.
- **"Find me three similar past wins for [league] / [category]"** — `similar-design-finder` already exists; surface it as a one-click button on the opportunity page.
- **Pre-send proposal QA** — paste the draft, get back a structured pass/fail on margin, completeness of fields, and consistency with similar past wins.
- **Email → Opportunity auto-create** — inbound email with attached scope creates a draft opp, dedupes against Company, surfaces it for Natalia to confirm.
- **Backlog report on demand** — won opps + Contract Completion Date + total contract + % unpaid, ranked by unpaid balance.
- **Win/Loss debrief** — when an opp goes Closed Lost, fire a quick prompt for the loss reason + the three closest analogous prior wins, save as a note.

## Copy-Paste AI Prompts

> Paste any of these into the CRM AI chat (Scout) or `@ANC` in Slack. Replace `[PLACEHOLDERS]` with your actual data. Each prompt asks for a structured response.

### 1. Monday morning triage

```
Pull every opportunity I am the proposal owner on, where proposalDueDate falls in the next 7 days
or is overdue. Group into four buckets:

  • OVERDUE (proposalDueDate < today)
  • DUE TODAY
  • DUE THIS WEEK (next 7 days)
  • BLOCKED — missing rate card, missing product list, missing AE assignment, or pricingComplete=false past pricingCompleteDate.

For each opp return as a markdown table: Opp # · Account · League · Stage · Due Date · $Revenue ·
Missing Inputs · One-line action.

Sort each bucket by due date ascending.
```

### 2. Generate a one-pager from the opportunity

```
Generate a one-page proposal SOW for opportunity [PASTE OPPORTUNITY NUMBER OR NAME].

Use:
  • Opportunity fields: scope, league, serviceType, total revenue, contract dates, primary decision maker.
  • Linked Company fields: venue address, league, prior project history.
  • Rate card from /docs/ANC_Rate_Card_Template_for_Matt.csv style schema.
  • Product list from the linked EstimateLines.

Return as a clean markdown document with these sections:
  Executive Summary · Scope of Work · Equipment & Quantities · Schedule · Investment · Assumptions ·
  Acceptance Criteria · ANC Past Work in [LEAGUE].

When I confirm "approve", flip pricingComplete=true and set pricingCompleteDate=today on the opp.
```

### 3. Find me three similar past wins

```
Find the three closest analogous closed-won opportunities to [PASTE OPPORTUNITY NAME OR NUMBER].

Match on: league, serviceType, scope of work, deal size within ±25%. Closed-won within last 36 months
preferred. Exclude opportunities flagged pre-2021 or marked junk.

For each match return: Opp # · Account · League · Closed-Won Date · Total Revenue · Margin% ·
2-sentence "why it's similar" · OneDrive link if present.

Then summarise in three sentences what these three deals have in common that I should highlight in the
new proposal.
```

### 4. Pre-send proposal sanity check

```
Here is the SOW I am about to send for [PASTE OPPORTUNITY]:

[PASTE PROPOSAL TEXT or attach the file]

Run a structured QA pass and return a pass/fail block on each of:

  • Total revenue matches sum of revenue lines (yes/no, with the math)
  • Total margin within ANC's standard range (15% LED, 20% services / install / structural / electrical)
  • All required Opportunity fields populated: substantialCompletionDate, accountExecutive, league,
    primaryDecisionMaker, proposalStage, oneDriveLink
  • Equipment list line items match an active product in the catalog (flag mismatches)
  • Pricing language consistent with the three closest prior wins
  • Spelling / numeric typos / unit consistency

Return as a markdown checklist with ✅ / 🔴 markers and a one-line recommendation at the bottom.
```

### 5. Backlog report — what is signed but not finished

```
Build the Backlog report.

Filter: opportunities with stage = Closed Won AND substantialCompletionDate >= today AND
percentPaid < 100.

Return as markdown table sorted by unpaid balance descending:
  Opp # · Account · League · Total Contract · Paid · % Paid · Unpaid Balance · Contract Completion Date ·
  Days Until Completion · Account Executive.

Below the table, summarise:
  • Top 5 unpaid balances and which AE owns them.
  • Any opp where Contract Completion Date is within 30 days AND percentPaid < 80% (escalation list).
```

### 6. Win/Loss by league for fiscal year

```
Build a Win/Loss report for fiscal year [YEAR — fiscal year = calendar year per Jireh].

Group rows by league (MLB / NBA / NFL / NCAA / MLS / NHL / Other).

For each league, return: Total RFPs · Wins · Losses · Pending · Win Rate% · Total Won Revenue ·
Avg Won Margin% · Top 3 winning accounts · Top 3 losing accounts with loss reason if recorded.

Below the table, give a 3-bullet narrative on which league is over- and under-performing vs prior FY,
and where margin compressed or expanded the most.
```

### 7. Forecast by account

```
For account [PASTE COMPANY NAME], list every open opportunity with probability >= 50% (Jireh's filter
convention), grouped by fiscal year (revenue2026 → revenue2036 fields).

Return as a markdown table:
  FY · Opp # · Stage · Probability · Forecast Revenue · Forecast Margin · Proposal Due Date · AE.

Below the table:
  • Total forecasted revenue per FY
  • Total forecasted margin per FY
  • One-paragraph summary of the account's forward pipeline shape and any risk concentration
    (e.g. one mega-deal carrying the year).
```

### 8. Email → Opportunity intake

```
Here is an inbound email and an attached scope:

[PASTE EMAIL BODY]
[PASTE OR LINK THE ATTACHED SCOPE]

Do the following:
  1. Identify the requesting Company. If the Company already exists in the CRM, return its record id.
     If not, propose a new Company record with name, domain (from email), HQ if inferable.
  2. Identify the people on the email and check People matches.
  3. Draft a new Opportunity:
     name · league · serviceType · scope summary (3 sentences) · proposalDueDate (from email or +14 days
     if absent) · accountExecutive (assign to me unless email names someone else).
  4. Stop and confirm before creating anything. Output the proposed Company / People / Opportunity as a
     markdown block.
```

### 9. Stalled-deal sweep

```
Find every opportunity I am proposal-owner on where stage hasn't changed in 14+ days AND
proposalDueDate is in the past OR absent.

Return as markdown table sorted by days-stalled descending:
  Opp # · Account · Current Stage · Days In Stage · Last Activity Date · Last Activity Type · AE ·
  Most Likely Block (one of: missing pricing input, awaiting AE, awaiting client, post-send silence,
  unknown).

Below the table:
  • Top 5 by deal size — recommend the next-best-action per opp in one line.
```

### 10. Meeting brief — account I'm walking into

```
I have a call with [PASTE COMPANY NAME] in [HOURS] hours.

Pull together a 1-page brief with these sections:

  • Account snapshot — record, league, primary venues, primary decision maker, total open pipeline,
    total closed-won lifetime, last interaction date.
  • Open opportunities — table of every open opp with stage, due date, $rev, $margin, AE.
  • Recent activity — last 10 activities (notes, tasks, emails) across all opps in the account.
  • Past wins — three most relevant closed-won opps with one-line "what we did" each.
  • Open service tickets and design requests linked to the account.
  • Three smart questions I should walk in ready to ask, grounded in what's actually in the data.
```

### 11. Pricing-complete tripwire

```
List every opportunity where pricingComplete = true was set in the past 30 days but no proposal
document has been generated yet (no oneDriveLink populated AND no SOW asset on the record).

Return as markdown table:
  Opp # · Account · pricingCompleteDate · AE · Days since pricingComplete · Quick action.

Below the table, write one Slack-ready ping to each AE listing their stuck opps.
```

### 12. Lifetime view of an account

```
Generate a lifetime report for account [PASTE COMPANY NAME].

Use the account-ltv-report Scout skill output style:
  • Summary header: total lifetime revenue · total lifetime margin · # closed-won deals ·
    first-deal date · most-recent-deal date · # active opps · open pipeline value.
  • Year-by-year revenue + margin chart (markdown table).
  • Per-team revenue split (use opportunityTeamAllocation rollup if present).
  • Top 5 deals by revenue with brief description.
  • Trend narrative — 3 sentences on whether the account is growing, flat, or declining vs prior 36mo.

Return as a single markdown document I can paste straight into the proposal appendix.
```

## CRM Feature Ideas

Each of these is a productisation candidate — a prompt above that has earned its way to a one-click action.

- **"Due this week" widget** on the Estimation & Proposals view — fires prompt #1 silently every morning, surfaces as an inbox-style panel.
- **"Generate one-pager"** button on every Opportunity record — fires prompt #2, drops the markdown into a confirm-before-send modal, on accept flips `pricingComplete` + `pricingCompleteDate`.
- **"Find similar past wins"** button on every Opportunity — fires prompt #3, returns a 3-card carousel.
- **"Pre-send QA"** button on every proposal asset attachment — fires prompt #4 against the file content.
- **Backlog / Win-Loss / Forecast** as named saved reports on the Reports page (one click, no prompt needed) — backed by the same logic as prompts 5/6/7.
- **Email → Opportunity** as an inbox plug-in or a `@ANC` Slack flow — fires prompt #8 against the forwarded email.
- **Stalled-deal sweep** as a Monday-morning Slack DM to Natalia from `@ANC` (and to AEs for their respective stalled opps).
- **Pricing-complete tripwire** as a daily silent automation that pings AEs in Slack rather than waiting for Natalia to chase.

## Questions To Ask This Person

1. Walk me through the first 30 minutes of your Monday — what do you actually open and in what order?
2. When Jireh or an AE asks for "similar past wins by league," how do you assemble that today, and how often does the ask come in?
3. From idea to sent proposal, where is the bottleneck — gathering inputs, writing, getting approvals, or formatting?
4. Of your four named reports (Backlog, Win/Loss by League, Company Performance, Forecast), which one would save you the most time per week if it became a one-click report?
5. How often do margin or line-item errors get caught downstream of you, and would a pre-send AI QA make you faster or slower?
6. What do you wish the AE was doing in the CRM that they currently send you over Slack instead?
7. If I gave you one Scout/Slack-AI button to put on the Opportunity page, which prompt above (or one not listed) would it run?
8. Is there a recurring proposal template / type where the AI should draft the whole thing on its own, and one where it should never try?

## Slack Seed Message

Drop this into `#crm-ai`:

```
Hi Natalia — I built a starter prompt library tailored to the proposal workflow:
docs/crm-ai-personas/natalia-kovaleva.md

12 prompts you can paste into the CRM AI or @ANC in Slack. Each one returns a structured output —
Monday triage, one-pager generation, similar-past-wins, pre-send QA, the four named reports, and a few
others.

If any prompt returns something useful, that's a candidate to become a one-click button on the
relevant CRM page. If any prompt returns garbage, tell me and I'll refine it.

Two specific calls — would these save you real time:
  1. "Due this week" widget on the Estimation & Proposals view (prompt #1).
  2. Pre-send proposal QA (prompt #4) as a button next to the SOW attachment.
```

## Citations & confidence notes

- Role + four named reports + "reports are my biggest pain" — direct quotes from the 2026-04-17 CRM kickoff call, captured in the `crm-knowledge` skill, **high confidence**.
- Mirror-mode / Excel-fidelity discipline — captured across `mirror-mode-rules.md` and `anc-natalia-state` timeline through 2026-03-13, **high confidence**.
- Email-address format — inferred from `accountExecutiveEmail` convention seen elsewhere in the CRM. **Validate** before sending external messages.
- Daily cadence and pain-point hypotheses (Pain Points To Validate section) — **medium confidence**, marked as hypotheses, must be confirmed in person before being treated as fact.
- Productisation suggestions in CRM Feature Ideas — **proposals**, not commitments. Subject to scope and feature-flag review.
