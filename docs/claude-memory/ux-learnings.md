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
- **No self-congratulatory implementation lines** — in stakeholder updates, do not add lines like "I preserved the reporting/filter logic so nothing breaks" unless the stakeholder specifically needs that assurance. It can make Ahmad sound like he is showing homework. Prefer normal, adult phrasing: what changed, what stayed the same, done.
- Example good: "got it, i'll stick to 2024-2026 and grab the freshest cost analysis from each. appreciate it"
- Example bad: "perfect, that's exactly what i need. i'll focus on 2024-2026, grab the freshest cost analysis sheets, and cross-check the LED specs and margin analysis against what the system produces. thank you for this"

## Deployment and Verification Workflow
- For this presentation app, do not use Ahmad's Mac as the working copy or build/test machine. Keep the project source on the VPS, edit/build from the VPS, push to GitHub, and let EasyPanel deploy from GitHub; local work should be limited to tiny notes or emergency file transfer because Ahmad has limited Egypt internet data.
- Ahmad usually does not check changes locally unless there is a real need.
- Preferred flow for app changes: implement, push to GitHub, let Easypanel build/deploy, then verify in production.
- After making a code change for Ahmad, default to committing and pushing it to GitHub so Easypanel starts a build automatically, unless he explicitly says to hold it locally.
- For CRM-only work, do not push or deploy. Work directly in the live Twenty CRM/API/metadata surface and verify the CRM result there.
- For code/app changes, push the current branch, make sure EasyPanel builds and the affected service is up, then verify the production URL before calling it done.
- When a pushed route 404s after deploy, check the EasyPanel/GitHub branch target immediately. Do not assume the current local branch is the deployment branch; make sure the commit lands where EasyPanel is building from.
- Do not default to starting local dev servers or asking Ahmad to inspect localhost for routine ANC web changes.
- During live CRM/app work, avoid broad/noisy commands that can make Ahmad's VS Code flash or kick him out of the current chat. Prefer small, targeted reads/checks with capped output; never scan or print huge folders such as `node_modules`, build output, or SDK bundles unless there is no narrower option.
- Local checks are still useful for fast compile/type sanity or when a production-only deploy loop would be wasteful, but the user-facing QA path should be production after Easypanel deploy.
- After each meaningful build slice, status updates should use this simple format: "What we did" and "What users can now do." Keep it short, clear, and non-technical unless detail is needed.
- Ahmad likes the Claude-style post-task handoff structure: brief "Done" opener, "What we did", "What users can now do", a short note on scope/open items if needed, and a ready-to-send "Message for [Stakeholder]" when the work came from a stakeholder ask. Codex should keep the same usefulness but default shorter and less technical than Claude's version. Put IDs/cache/table names only when Ahmad needs audit detail or asks for it.
- For very non-technical stakeholders like Krissy, the ready-to-send message should be ultra-simple and confidence-based, not explanatory: "Krissy, I fixed the CRM search issue. Try searching the opportunity number or name again and let me know please." Avoid mentioning database indexes, GraphQL, permissions, or what caused it unless Ahmad asks.

## CRM Long-Term Build Principles
- The ANC CRM is a long-run system, not a disposable prototype. Build decisions should assume future maintenance, real operators, and compounding consequences.
- Do not hide problems under the rug, ship band-aids, or optimize for "make it work now" when that creates debt Ahmad will have to pay for later.
- From minute one, prefer the fix that can last: clear data model, honest architecture, explicit tradeoffs, and no shortcuts that make life harder later.
- When Ahmad asks Codex to "learn what Claude knows," treat it as a durable skill/memory update, not a summary. Import the useful Claude-side project context into Codex skills, fix stale skill paths, and preserve how ANC CRM, Scout/OpenClaw, AnythingLLM, Copilot, and stakeholder context connect.
- When importing ANC memory, scan adjacent projects too, especially `/root/anc-services`, `/root/.openclaw`, `/root/anc-knowledge`, `/root/anc-codegen`, and `/root/anc-crm-work`. The real system context is spread across separate apps, not just `rag2`.
- For ANC memory, Slack is the source of truth. Local docs and Codex skills are caches. When a stakeholder decision, current acceptance criteria, or "what is true now" matters, search Slack first and reconcile the local memory afterward.
- Twenty Apps are now the sanctioned path for CRM UI asks that previously got "not possible without coding," but a working widget is not enough. Before stakeholder handoff, the screenshot must look native, polished, and useful: correct theme colors, sortable columns where users expect sorting, no clipped important columns, sensible empty/loading/error states, and a direct deep link to the record/page being tested.
- For CRM UI apps, stakeholder-ready is the default from the first real build. Unless Ahmad explicitly asks for a throwaway spike, do not treat colors, sorting, layout fit, and native UX as a later polish pass.
- For "on the house" revisit messages, do not draft or send until the live CRM screenshot gate passes. The message is a goodwill move only after Ahmad can show the ask is actually solved, not merely technically mounted.
- Every Twenty app build/fix should update reusable skills as part of the work. Capture practical lessons immediately in both Codex and Claude skill copies: SDK/runtime gotchas, UI behavior traps, app ids/versions, verification paths, and what Ahmad confirmed in-browser. The goal is that the next app is always easier.
- Ahmad needs guided navigation after CRM app work. Handoffs should be short and visual when possible: direct CRM URL, exact tab/button to click, what changed, what screenshot proves it, and what backend read confirms it. Avoid technical walls unless he asks for audit detail.
- When Ahmad pastes a status update from another agent, immediately convert it into the next coordination step: summarize what changed, identify blockers/collisions, decide the next non-conflicting work lane, and provide copy-paste prompts for every active agent so nobody is idle. Do not wait for him to ask "what next" unless the status is genuinely ambiguous.
- Multi-agent prompts should start with a quick brief on what the team is doing, then give bossy, direct instructions that make Claude/Grok useful immediately. Ahmad's loop is: Codex gives prompts, Ahmad relays them, Codex keeps working, Ahmad returns their updates, Codex turns those updates into the next prompts while continuing its own lane.
- When Ahmad says "go" or "continue systematically" on a platform-retirement/migration job, keep moving in phases: secure a full backup, normalize the data, import only safe live slices, preserve provenance, document what changed, then turn the flow into reusable memory/skills. Do not stop at a Slack reply or a partial export.
- For tool retirement work, keep raw exports, normalized import files, crosswalks, audit summaries, and pre-import DB backups as first-class deliverables. Ahmad wants the migration to be inspectable later, not just "done."
- For marketing/newsletter migrations, protect against accidental bulk sends. Imported historical newsletters should use a non-send status, and the live-send audience should exclude unsubscribed, bounced, do-not-market, and non-marketing contacts before anyone demos or schedules a campaign.
- When Ahmad points at a huge VS Code Source Control badge, treat it as inventory hygiene first. Separate generated data, nested untracked projects, screenshots, and real code changes before deleting, committing, or cleaning anything.
- Avoid broad environment dumps while debugging live services. Target specific env keys and redact nested token-like values; Ahmad does not want a security lecture, but he does need us not to splash secrets into logs or chat.
- When Ahmad says "check skills" or "check the skills," first inspect the installed local skill files already available to the agent. Do not interpret that as an internet search for new skills unless he explicitly asks for external skill discovery.
- For unfamiliar VPS/EasyPanel/product workflows, check `skills.basheer.app` or the indexed skill inventory before improvising API payloads or deployment mechanics. Ahmad expects GitHub-first, EasyPanel-owned deploys for `.basheer.app` apps: push the repo, let EasyPanel build, attach the domain through EasyPanel/Traefik, then verify the live URL.
- For framework/platform patterns, verify against official docs and current ecosystem references before building from memory. Skill files and project memory are caches, not the sole source of truth.
- Wire new features into the actual user path, not only a parallel route. If users enter through an existing shell like Frappe Desk, bridge that flow into the custom UI so the feature is discoverable from where they naturally click.
- Ahmad created and installed "Ahmad Skill Pack v1" / "Ahmad OS" as a reusable vocabulary for collaboration modes. Treat these as intentional mode-switch phrases and route to the local `ahmad-os` skill when available: `read the lines`, `clean this`, `war room`, `moonshot`, `operator mode`, `debug mode`, `reply builder`, `learn filter`, `scope boundary`, `system map`, `Mac / HQ setup`, and `client parity / audit layer`.

## Product Selection and UI Polish
- For ANC work, Ahmad does not want this Codex thread to behave differently from the VS Code/Codex agent. Before substantial ANC implementation or strategy, load from the same VPS memory surface where possible: `/root/rag2/docs/claude-memory`, `/root/anc-services` skills/docs, and `/root/.codex/skills`. Treat those as the shared operating memory so answers, build choices, terminology, and verification style stay consistent across agents.
- Prefer VPS-side builds and verification for live ANC apps. Local editing or small file transfer is acceptable, but avoid local browser smoke tests or heavy asset-loading checks unless Ahmad explicitly asks; those can burn his local internet data. Run production checks from the VPS/container/EasyPanel side whenever possible.
- When Ahmad says "Airtable," do not reinterpret that as "find an Airtable alternative." Start from actual Airtable unless he explicitly asks for alternatives.
- For ANC operator-facing tools, enterprise polish is a hard requirement, not a nice-to-have. A technically capable tool with an ugly or dated admin UI is usually the wrong answer.
- Do not deploy or migrate to OSS database/admin tools based only on specs like Postgres, plugins, or self-hosting. First evaluate whether the daily user experience looks credible for Nick, techs, and enterprise stakeholders.
- If a tool's UI is questionable, show real screenshots or a live demo before investing implementation time. The decision should be eye-tested early.
- Prefer integrating the polished system Ahmad already asked for, then filling gaps with ANC custom layers, over replacing it with a rough tool that needs heavy cosmetic rescue.
- For ANC AI / MagicAI work, Ahmad's product direction is not "make every purchased AI feature work as-is." Reframe the platform into an ANC operating hub. First make it usable, coherent, and ANC-labeled; then connect real ANC systems underneath.
- Do not customize MagicAI feature-by-feature as isolated toys. Group, rename, hide, and route features into ANC modules: Core Workspace, ANC Assistants, Marketing Command Center, Creative Studio, Sales & Proposals, and Admin Console.
- Hide generic SaaS/marketplace/pricing/affiliate/noisy admin tools from normal ANC users, but do not delete underlying routes unless there is a safe architectural reason. MagicAI updates and extension assumptions can break if routes/features are ripped out.
- For ANC AI media generation, prefer routing visible image/video/audio surfaces through the working Pollinations/provider gateway when Stability/Fal/OpenAI media keys are missing or unreliable. The UI should expose ANC-friendly provider labels, not raw provider confusion.
- Treat Pollinations as a strategic ANC AI provider layer, not a one-off fallback. It has usable routes for text, images, video, audio, and likely music-style workflows, with a broad and changing model catalog. When a MagicAI generator is broken because native keys/models are missing, first check whether that surface should route through Pollinations and expose ANC-friendly labels/prompts instead of leaving the vendor feature half-connected.
- For rag2 inside ANC AI, do not duplicate the Proposal Engine logic in MagicAI. Bridge to the real rag2 flows and previews: RFP Analyzer, Mirror Mode, estimator tables, PDFs, and Excel outputs should be launched/embedded from ANC AI while preserving rag2 as the source of truth.
- When Ahmad says a tool/link should be "like a second thing" or "fit in the hub," do not make it a plain external link or visible redirect. Preserve the new URL as its own sibling entry and serve the proven underlying workflow through a same-page alias/bridge.
- For ANC AI Hub, related systems are reference material, not default destinations. Learn from the CRM, Proposal Engine, services dashboard, Composio, and other tools, but build the Hub's own native route, layout, wording, and action flow unless Ahmad explicitly asks for a direct link. "Same end result" means recreate the outcome in this platform's UX, not send users to the old surface.
- Ahmad will often send a rapid stack of screenshots across MagicAI surfaces. Keep a visible queue, batch by surface when possible, ship durable images after live container fixes, and verify production routes before moving to the next broken item.
- When Ahmad gives several ANC AI issues in a row, it is okay to reorder them after the list is visible if the new order fixes shared root causes or clears a module faster. Surface the reorder plainly and keep the queued items visible so nothing disappears.
- For ANC AI route audits, never imply "everything will work" after sampling. Ahmad will test exact URLs immediately; report a checked list with green/red/untested buckets and keep working module-by-module until the current module is production-verified.
- If an ANC AI page goes down because an agent's admin/kernel checks dirtied the live cache, treat it as the active fire and fix it before continuing any queued polish or feature work. Short answer, own it, verify the homepage and current route, then resume.
- In ANC AI, the visible user dashboard may be served by a theme-specific overlay such as `marketing-bot-dashboard`, not `default`; verify the rendered strings or active theme before adding discoverability UI.
- When using artisan/tinker as root inside the ANC AI container, reset `storage/framework`, `storage/logs`, and `bootstrap/cache` ownership back to `www-data:www-data`; root-owned compiled Blade views can break `/login` and `/`.
- For protected Proposal Engine routes, an unauthenticated `302` only proves middleware is alive. Verify the callback preserves the requested path and inspect the live container route manifest/rewrite map when the expected behavior depends on an alias.
- Ahmad wants ANC AI to feel like an AI-native operating hub, not a pile of generic forms. Long required fields should have magic-wand/draft helpers, company/brand prompts should default to ANC knowledge where appropriate, and generators should show visual previews/themes/readiness instead of vague errors.
- In ANC AI, missing provider keys or missing theme/model assets should be presented as setup/configuration states with disabled or guided actions, not as user mistakes or silent 500s.
- When Ahmad worries that KB, Alison content, templates, newsletters, or migrated material disappeared, verify persistence in the database/files before rebuilding. Treat visible emptiness as a possible view/configuration problem until records, exports, and backups prove otherwise.

## Scope Discussion Learnings
- When Natalia pushes back on something being "new scope," listen — she often knows the product better than we do
- Alt pitch was called "big scope" initially but turned out to be simple: only LED hardware cost changes per pitch variant
- Ahmad wants to be generous but needs to protect himself from scope creep snowball
- Natalia gave good business advice: set hourly rate at month 3, formalize the relationship
- Ahmad's approach: be easy to work with on small stuff, flag genuinely heavy lifts
- Ahmad wants Otter's "reading between the lines" ANC analyses treated as a strategic psychology/relationship layer, not just summaries. When he shares Otter prompts or answers about ANC, Joe, Charlie, contracts, money, events, or dashboards, evaluate whether the insight should become durable memory or a repeatable skill for negotiation, scoping, stakeholder communication, or protecting Ahmad from unpaid over-delivery.

## ANC Commercial Boundaries
- Ahmad can say the right principle about payment/scope, then leak leverage behaviorally by staying highly available, brainstorming future work, softening money, or giving relationship-maintenance energy while payment/paper is still unresolved. When this pattern appears, flag the contradiction gently and suggest a firmer sequence.
- Ahmad's current ANC risk is less "losing ANC" and more becoming under-priced and over-committed while ANC becomes dependent on his CRM, Service Dashboard, proposal/AI, docs, events, and cross-functional integration knowledge.
- For ANC, distinguish long-term leverage (Ahmad's tech/IP/system knowledge/switching cost) from short-term leverage (ANC's payment timing, signatures, approvals, and internal politics). Drafts should help Ahmad act in line with his long-term leverage without sounding combative.
- Do not let casual Charlie conversations become the place where pricing, discounts, bundles, or payment timing get decided. Charlie is valuable context and rapport, but buyer-level commercial decisions should move into written proposals for Joe/Jireh.
- Do not lead ANC with discounts or cost-saving strategy. Lead with outcomes and operational risk reduction; discounts should be conditional on something that helps Ahmad, such as longer term, upfront payment, narrower scope, or a larger committed retainer.
- Treat strategy/savings/tool-consolidation conversations as consulting value, not free filler inside build/support. Consider a separate Systems & Strategy engagement when ANC asks for roadmap, AI/process design, or tool replacement business cases.
- Slack intelligence adds a stricter rule: strategic analysis itself is billable. Do not fully give away CMS margin/revenue-gap analysis, Procore/QuickBooks/HubSpot replacement architecture, accounting-module design, or AI/platform roadmap in Slack before proposal acceptance.
- Charlie DMs should pass the "Joe is on speaker" test: no pricing regrets, financial vulnerability, exact receivable breakdowns, API keys, build prompts, or methodology sharing.
- When ANC has an old balance and a future service contract in discussion, separate them. The delivered balance should be formally invoiced and not softened into or held hostage by the next contract conversation.
- Avoid multiple simultaneous commercial offers unless the tradeoff is explicit. A low retainer and high flat operating agreement in the same negotiation lets ANC choose the cheap anchor.
- Every Slack scope list with `[NEW]` items should have line-item pricing, a budget bucket, or a formal change-order path before work starts.

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
