# CRM AI Persona Prompt Library

A per-person playbook of copy-paste prompts the ANC team can fire at the CRM AI assistant ("Scout" inside the CRM, `@ANC` in Slack) to get role-relevant value out of the live data — pipeline, accounts, design requests, tickets, proposals, reports.

Each file is the **shareable, work-only** companion to a person's CRM workflow. No psychology, no politics, no personal traits — that material lives elsewhere and is not for circulation.

## Purpose

Most ANC users will not browse the CRM looking for the "AI button." They will keep doing whatever they were doing, until somebody hands them five prompts that solve their actual job that week. These files are those five prompts (per person), in writing, under their name.

Use them to:

- Onboard a teammate to the CRM AI in 10 minutes.
- Seed `#crm-ai` with feedback-driving examples ("paste this, tell us what was useful, what wasn't").
- Surface productisation candidates — when the same prompt shows up in 3+ files, that prompt becomes a one-click button on the relevant CRM page.

## Hard boundaries

These files **must**:

- Stay work-relevant. Role, workflow, CRM touchpoints, business outcomes only.
- Use `confidence: high | medium | low` and cite the source (memory file, Slack thread date, code reference, public bio).
- Mark unverified claims with "likely / hypothesis / validate."
- Frame every prompt around real CRM objects, fields, views, or reports that exist today.
- Reference Scout skills by their actual skill names where applicable (see `crm-knowledge` skill for the full list).

These files **must not**:

- Infer or describe private traits, family, health, finances, politics, religion, conflicts, or personal life.
- Quote private Slack threads verbatim. Summarise the work intent, never the social dynamics.
- Name underlying tech vendors when the prompt itself will be shared with stakeholders. ("the CRM AI" / "the Slack assistant" — not "Twenty Scout" / "AnythingLLM" / etc.)
- Treat memory files as fact-sources for personal claims. Memory captures what the person *said about the work*, not who they are as a person.

## File format

```
# [Name] — CRM AI Persona

## Snapshot
- Name / email / role / team / confidence / sources

## Work-Relevant Persona
What they do in relation to the CRM. Evidence-grounded.

## Likely CRM Touchpoints
Objects, views, fields, reports, dashboards, automations.

## Pain Points To Validate
Hypothesis-framed. To be confirmed in person.

## High-Value CRM AI Opportunities
Specific AI features for this role.

## Copy-Paste AI Prompts
At least 10. Each prompt: specific, concrete output, structured format, advanced enough to be useful, includes [PLACEHOLDERS] for the user to fill in.

## CRM Feature Ideas
Each prompt that proves popular becomes a UI button or quick-action.

## Questions To Ask This Person
5-8 validation questions.

## Slack Seed Message
Ready-to-paste message for #crm-ai.
```

## How to add a new persona

1. Pick the next person on the team list.
2. Read what we already know about their work:
   - `crm-knowledge` skill for stakeholder asks captured in CRM project meetings.
   - `anc-psyche` skill for internal-only context — **read for your own grounding, do not copy text into the persona file**.
   - Any per-person memory file (`/root/.claude/projects/-root-rag2/memory/project_*` or `feedback_*`).
   - Public bio if the person is externally identifiable (LinkedIn role, company directory).
3. Copy `natalia-kovaleva.md` (the canonical example) to `firstname-lastname.md`, then strip and rewrite — keep the section headings and prompt-shape conventions.
4. Write **at least 10** prompts. Every prompt must:
   - Map to a real CRM object, view, report, or Scout skill.
   - Specify the output structure ("return as a 4-column markdown table with…").
   - Include `[PLACEHOLDERS]` so the user can swap in their own opportunity / account / export.
   - Be advanced enough that a copy-paste produces something the person could not have written in 30 seconds themselves.
5. Cite sources at the bottom.
6. Open a PR labelled `crm-ai-persona`.
7. Drop the Slack Seed Message into `#crm-ai` when the file is merged.

## Where to drop feedback

- `#crm-ai` Slack channel — primary.
- Open an issue against the file in this repo if a prompt failed to produce a useful answer; we will refine and re-test.

## Productisation rule of thumb

When a prompt shows up in three or more persona files, propose it as a one-click action on the relevant CRM page in the next sprint. The library exists to surface those repeats.
