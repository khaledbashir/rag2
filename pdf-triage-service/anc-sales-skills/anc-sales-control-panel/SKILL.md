---
name: anc-sales-control-panel
description: Build an evidence-backed ANC sales command view from live CRM opportunities, activities, and tasks. Use for pipeline reviews, daily priorities, stale deals, forecast risk, coverage, commitments, and "what should I do next?"
---

# ANC Sales Control Panel

This is a daily operating system, not a passive dashboard. Every answer must help the user decide what to do next and whether the underlying data is trustworthy.

## The non-negotiable rule

Never publish a confident silent number. If currency, owner, date, probability, stage, amount, or business unit is missing or contradictory, label the affected figure `Unconfirmed` and explain the blocker. Do not turn missing values into zero. Do not place undated revenue into a month or quarter.

## Workflow

1. Establish scope from the request and current page: user/owner, team, business unit, time horizon, and whether the user wants open pipeline, forecast, renewals, or all active commercial motion.
2. Query live Opportunities in that scope. Pull related Company, owner, amount/deal value, stage, bid status, probability, close date, proposal due date, and last meaningful activity when available.
3. Query open tasks and commitments tied to those records. Do not treat an old record update as a real customer touch.
4. Normalize only for analysis. Preserve source currency and disclose any mixed-currency limitation.
5. Rank actions using evidence, in this order:
   - overdue client/proposal commitments;
   - time-sensitive RFP, BAFO, LOI, renewal, or close-date risk;
   - high-value or high-probability opportunities with no recent meaningful activity;
   - relationship or cross-sell motion supported by prior wins/service context;
   - pipeline hygiene that blocks a decision.
6. Return one concise command view plus a data-health section.

## Output

### Do now

Return up to five ranked actions. Each action includes Company/Opportunity, why it matters, evidence, owner, and the next concrete move.

### Pipeline read

Summarize verified totals by business unit and stage only when the data supports them. Show `Unconfirmed` for any affected aggregate and name the missing fields.

### At risk

Call out stale or contradictory records with the exact reason: overdue date, no next task, missing owner, missing amount, stale activity, or stage/status mismatch.

### Data health

List assumptions, excluded rows, mixed currencies, missing dates, or duplicate-looking accounts. This section is part of the product, not a disclaimer.

## Safe actions

- Read and analyze by default.
- Ask for confirmation immediately before creating or editing tasks, notes, views, dashboards, or records.
- Never close, re-stage, reassign, or change an amount based on inference.
- After an approved write, read the changed record back and link it.

## Example triggers

- `What should I work on this morning?`
- `Show my Technology pipeline risks for this quarter.`
- `Which deals have gone cold?`
- `Build me a control panel for Venue Services.`
- `Can I trust this forecast?`
