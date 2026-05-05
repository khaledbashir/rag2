# UX Learnings & Ahmad's Communication Preferences

## Ahmad's Messaging Style (for drafting Slack messages)
- **Chill, not eager** — never sound like an excited kid. Sound like a professional who's calm and appreciative.
- **Speak plain English** — skip the technical jargon, code-speak, or git textbook definitions unless specifically asked. Be direct, conversational, and easy to understand.
- **Short > long** — one or two sentences max for simple replies
- **No exclamation marks** — standing rule, sounds weird
- **"got it" > "that's amazing, thank you so much"** — understated appreciation
- **Don't overexplain** — if something's clear, just acknowledge it
- **No credential lectures** — if Ahmad gives login details in-thread, use them when needed and do not derail into API key / password / secret handling lectures unless there is a real blocker
- **Real talk** — Ahmad is honest and direct with stakeholders. He tells them the truth.
- Example good: "got it, i'll stick to 2024-2026 and grab the freshest cost analysis from each. appreciate it"
- Example bad: "perfect, that's exactly what i need. i'll focus on 2024-2026, grab the freshest cost analysis sheets, and cross-check the LED specs and margin analysis against what the system produces. thank you for this"

## Deployment and Verification Workflow
- Ahmad usually does not check changes locally unless there is a real need.
- Preferred flow for app changes: implement, push to GitHub, let Easypanel build/deploy, then verify in production.
- After making a code change for Ahmad, default to committing and pushing it to GitHub so Easypanel starts a build automatically, unless he explicitly says to hold it locally.
- For CRM-only work, do not push or deploy. Work directly in the live Twenty CRM/API/metadata surface and verify the CRM result there.
- For code/app changes, push the current branch, make sure EasyPanel builds and the affected service is up, then verify the production URL before calling it done.
- When a pushed route 404s after deploy, check the EasyPanel/GitHub branch target immediately. Do not assume the current local branch is the deployment branch; make sure the commit lands where EasyPanel is building from.
- Do not default to starting local dev servers or asking Ahmad to inspect localhost for routine ANC web changes.
- Local checks are still useful for fast compile/type sanity or when a production-only deploy loop would be wasteful, but the user-facing QA path should be production after Easypanel deploy.
- After each meaningful build slice, status updates should use this simple format: "What we did" and "What users can now do." Keep it short, clear, and non-technical unless detail is needed.
- Ahmad likes the Claude-style post-task handoff structure: brief "Done" opener, "What we did", "What users can now do", a short note on scope/open items if needed, and a ready-to-send "Message for [Stakeholder]" when the work came from a stakeholder ask. Codex should keep the same usefulness but default shorter and less technical than Claude's version. Put IDs/cache/table names only when Ahmad needs audit detail or asks for it.

## CRM Long-Term Build Principles
- The ANC CRM is a long-run system, not a disposable prototype. Build decisions should assume future maintenance, real operators, and compounding consequences.
- Do not hide problems under the rug, ship band-aids, or optimize for "make it work now" when that creates debt Ahmad will have to pay for later.
- From minute one, prefer the fix that can last: clear data model, honest architecture, explicit tradeoffs, and no shortcuts that make life harder later.
- When Ahmad asks Codex to "learn what Claude knows," treat it as a durable skill/memory update, not a summary. Import the useful Claude-side project context into Codex skills, fix stale skill paths, and preserve how ANC CRM, Scout/OpenClaw, AnythingLLM, Copilot, and stakeholder context connect.
- When importing ANC memory, scan adjacent projects too, especially `/root/anc-services`, `/root/.openclaw`, `/root/anc-knowledge`, `/root/anc-codegen`, and `/root/anc-crm-work`. The real system context is spread across separate apps, not just `rag2`.
- For ANC memory, Slack is the source of truth. Local docs and Codex skills are caches. When a stakeholder decision, current acceptance criteria, or "what is true now" matters, search Slack first and reconcile the local memory afterward.

## Product Selection and UI Polish
- When Ahmad says "Airtable," do not reinterpret that as "find an Airtable alternative." Start from actual Airtable unless he explicitly asks for alternatives.
- For ANC operator-facing tools, enterprise polish is a hard requirement, not a nice-to-have. A technically capable tool with an ugly or dated admin UI is usually the wrong answer.
- Do not deploy or migrate to OSS database/admin tools based only on specs like Postgres, plugins, or self-hosting. First evaluate whether the daily user experience looks credible for Nick, techs, and enterprise stakeholders.
- If a tool's UI is questionable, show real screenshots or a live demo before investing implementation time. The decision should be eye-tested early.
- Prefer integrating the polished system Ahmad already asked for, then filling gaps with ANC custom layers, over replacing it with a rough tool that needs heavy cosmetic rescue.

## Scope Discussion Learnings
- When Natalia pushes back on something being "new scope," listen — she often knows the product better than we do
- Alt pitch was called "big scope" initially but turned out to be simple: only LED hardware cost changes per pitch variant
- Ahmad wants to be generous but needs to protect himself from scope creep snowball
- Natalia gave good business advice: set hourly rate at month 3, formalize the relationship
- Ahmad's approach: be easy to work with on small stuff, flag genuinely heavy lifts

## Bug Pattern: JavaScript || vs ?? for Financial Params
- `(value || default)` treats `0` as falsy — catastrophic for financial fields where 0 is a valid input
- ALWAYS use `??` (nullish coalescing) for any financial parameter that could legitimately be 0
- This bit us on: bondRate (0 → 1.5%), salesTaxRate (0 → 9.5%), margins, and more
- ~15 instances had to be fixed across EstimatorBridge.ts

## Bug Pattern: Blended vs Category-Specific Margins
- `marginPct` was the BLENDED margin (1 - totalCost/sellPrice), used everywhere as if it were LED-specific
- LED hardware needs its own `ledMarginPct`, services needs `svcMarginPct`
- Using blended margin for individual category sell prices inflates them

## Estimator Testing
- Natalia offering 30+ real RFPs with actual estimates — gold for validation
- Pick 2024-2026 only, freshest cost analysis per venue
- LED sheet should match what the display engine produces
- Cost should be "in ballpark" for margin analysis
