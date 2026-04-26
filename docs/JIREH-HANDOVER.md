# Handover — Jireh's Account-Based Reports

**Picking up from a previous Claude session that under-delivered.** Read this end-to-end before touching anything. Ahmad's frustration in the prior session was real: too many partial-success declarations, format mismatches, and deploy-cycle waste. Don't repeat any of it.

---

## 1. What Jireh actually asked for

Jireh Billings (President, Venue Partnerships at ANC) is moving the business toward an **account-based** model. He wants the CRM to surface lifetime account value automatically. He sent **two example Excel templates** in Slack on 2026-04-26:

### Template A — Repeat Technology Clients tracker
**File on disk:** `/root/rag2/ANC - Technology Repeat Clients 2026 2027 2028 (April 2026) (1).xlsx`

His exact words:
> *"10 repeat technology partners using this chart but you can ignore the names and fill in the right accounts."*

Format (bare-bones, no decorations):
- Sheet: `2026 Clients`
- Cols A–B: blank
- Row 3 cols C–F: header row → `Client | Client First-Year of Engagement | Lifetime Client Revenue ($) | Lifetime Client Margin (%)`
- Row 4: blank spacer
- Rows 5+: one row per client, just the four data columns
- **No title row, no subtitle, no rank column.** Jireh's eye is trained on this exact bare layout.

### Template B — Hankook Lifetime Value (account deep dive)
**File on disk:** `/root/rag2/Hankook_Lifetime_Value_ANC_Final.xlsx`

His exact words:
> *"this attached one is another example, using one of our media and sponsorship clients, Hankook. again, the goal is to really dive into account management and how to extract real value (revenue) on each account."*

Multi-sheet structure:
1. **Summary** — title row 2 (merged A1:E1, A2:E2), centered headline LTV number row 6 (merged B6:D6) with caption row 7, then a 5-question Q&A grid starting row 9 (cols B/C/D = QUESTION/ANSWER/CONTEXT)
2. **Deal History** — title rows 1–3, header row 5 (`YEAR | DEAL(S) | TOTAL SPEND | NOTES`), one row per year reverse-chronological, `TOTAL (yr–yr)` row at end
3. **MLB Teams** *(only when the account funded multiple sub-teams, like Hankook funding 16 MLB teams)* — title rows 1–3, header row 5 (`# | TEAM | AVG. ANNUAL VALUE | DEAL TYPE | NOTES`), one row per team, `AVERAGE` row at end

The vibe Jireh wants: *"Jireh talks to the AI and it just does it."* No clicks, no menus. Type a phrase in Scout chat, get the file.

## 2. What was built (and the verified state of each piece)

### 2.1 Repeat Clients Report — ✅ PRODUCTION VERIFIED AGAINST TEMPLATE

| Layer | Where | State |
|---|---|---|
| rag2 endpoint | `app/api/jireh-reports/repeat-clients/route.ts` | ✅ deployed. GET with `?vertical=TECHNOLOGY&top=10` returns Excel binary. Pages all companies in vertical, pages all WON opps, aggregates per-company lifetime revenue/margin/first-year, filters dealCount>=2, sorts desc, takes top N. Styling fix shipped in `c6a1be32` so the workbook matches Jireh's actual source layout, not just the columns. |
| Auth bypass | `auth.config.ts` + `middleware.ts` | ✅ both layers added the `/api/jireh-reports` path to public allowlist |
| Twenty logic function | `generate-repeat-clients-report` (UUID `8acf4271-f0a6-46fa-9b0c-cceb55cb9b6a`) | ✅ created, isTool=true. Thin shim — HEAD's the rag2 endpoint, returns `{url, markdownToEmbed}` pointing at the public rag2 URL directly. |
| Scout skill | `repeat-clients-report` (UUID `54288e81-63d5-4b4d-9cb6-a0bf0d5b08e8`) | ✅ activated. Content tells Scout to call the tool, embed `markdownToEmbed` verbatim, add a 1–2 sentence summary. |
| Format match against Jireh's template | production artifact saved at `output/spreadsheet/ANC-Technology-Repeat-Clients-2026-production-patched.xlsx` | ✅ Verified 2026-04-26 19:59 UTC by opening/diffing against `/root/rag2/ANC - Technology Repeat Clients 2026 2027 2028 (April 2026) (1).xlsx`: sheet name, C3:F3 headers, blank rows/cols, no merges, hidden gridlines, header fill/font, row heights, and column widths all pass. |

**Test in Scout (NEW chat):** *"top 10 repeat technology clients"* → Scout fires the tool → drops a clickable Excel link.

**Live data right now:** 273 tech companies / 580 WON opps / 12 repeat clients (>=2 wins). Top 10 starts with Notre Dame ($28.7M, 14% margin, since 2016) and ends with Bergen Catholic HS ($380K, since 2021).

### 2.2 Account LTV Report — ✅ PRODUCTION VERIFIED FOR CRM-TRUTH SUMMARY + DEAL HISTORY

| Layer | Where | State |
|---|---|---|
| rag2 endpoint | `app/api/jireh-reports/account-ltv/route.ts` | ✅ Deployed. `GET ?company=Hankook` now works. Fixes shipped in `71c17b6b` and `5dbf552f`: fuzzy company lookups aggregate matching Hankook legal entities with WON opps, use account-revenue `amount` before `dealValue`, and skip zero-amount rows. |
| Twenty logic function | `generate-account-ltv-report` (UUID `a1d07377-2080-425b-b7a2-056eaa57dd26`) | ✅ Recreated via `/tmp/build-ltv-tool-fn.py` after production verification. isTool=true. Returns direct public rag2 URL + `markdownToEmbed`. |
| Scout skill | `account-ltv-report` (UUID `4b932931-a798-4ea1-921e-a6f7367ec596`) | ✅ Active. Updated to call `generate-account-ltv-report`. |
| Format/data verification | production artifact saved at `output/spreadsheet/Hankook-LTV-production-patched.xlsx` | ✅ Verified 2026-04-26 19:59 UTC. Production headers: `x-won-opps: 32`, `x-company-name: Hankook Tire America Corp., Hankook Tire Canada Corp.`. Opened workbook and diffed Summary against `/root/rag2/Hankook_Lifetime_Value_ANC_Final.xlsx`: title/merge structure, gridlines, row heights, column widths, key fills/fonts all pass. Output: `$33.4M`, `2016–2024`, `32 deals`, no zero-dollar Deal History rows. |

**What is intentionally not matched:** Jireh's template headline is `$35M+` and includes a third `MLB Teams` tab. Current CRM data supports `$33.4M` from revenue-bearing WON opps in 2016–2024. The missing `$35M+` delta and MLB Teams tab require source fields that are not present in CRM today: pre-2016 history, future TGL/2025–2028 commitments with amounts, hospitality/tickets, and team-level sub-breakdowns inside opportunities. This is a data coverage limitation, not a broken endpoint.

### 2.3 Other working CRM connections (verified earlier in session)

These are stable and not part of the Jireh-handover scope, but flag if you accidentally regress them:

- **Workflow #1**: PDF/SOW exported → `Opportunity.bidStatus = BID_SUBMITTED`. Hooked via `app/api/projects/[id]/activities/route.ts` POST. Verified end-to-end on MetLife Stadium proposal `cmodf2dn300q4dsuidkngommb` → Opp `87045aa3-bd73-43d0-bebd-c05bc78cb3b2`. Code: `services/integrations/twenty/crmAutomation.ts:applyOpportunityWorkflowAction()`.
- **View-in-CRM pill** on every linked proposal page (`StudioHeader.tsx`).
- **Product catalog mirror** rag2 → Twenty.LedProduct on every save (158 products in sync).
- **Proposal backfill** complete: 829 / 855 proposals have `twentyOpportunityId` set (24 junk-named skipped, 2 transient failures left).

## 3. Where everything lives

### Live data
- Twenty CRM: `https://crm.ancsports.net` (alt: `https://abc-twenty.izcgmb.easypanel.host`)
- Workspace ID: `d3fbc29a-a635-48b7-9d6e-250941677fd0`
- API key (workspace-scoped JWT, hardcoded fallback in code): see `services/integrations/twenty/crmAutomation.ts` top
- rag2 production: `https://proposals.anc.com`

### Reference files (templates Jireh sent)
- `/root/rag2/ANC - Technology Repeat Clients 2026 2027 2028 (April 2026) (1).xlsx`
- `/root/rag2/Hankook_Lifetime_Value_ANC_Final.xlsx`

### Build scripts (re-run as needed)
- `/tmp/build-jireh-tool-fn.py` — recreates `generate-repeat-clients-report` logic fn + skill content
- `/tmp/build-ltv-tool-fn.py` — recreates `generate-account-ltv-report` logic fn + skill content (queued to run when handover started)
- `/tmp/sync-products-once.py` — one-shot rag2 → Twenty product mirror (already done, idempotent)
- `/tmp/backfill-proposals-to-crm.py` — proposal backfill (already done, idempotent)

### Live status checklist (project ground truth)
**`/root/rag2/docs/CRM-CONNECTIONS-CHECKLIST.md`** — single source of truth for what's wired vs broken. Always update as you ship + verify.

### Memory rules to respect (in `/root/.claude/projects/-root-rag2/memory/`)
- `feedback_dont_touch_visible_rag2.md` — additive only; don't modify existing working code paths
- `feedback_no_broken_state.md` — fix 🔴 before adding new
- `feedback_workflows_not_fixes.md` — stay on the workflow path; don't drift into infra fixes
- `feedback_compress_when_stressed.md` — short responses when Ahmad's tense (cursing, all-caps)
- `feedback_no_obvious_troubleshooting.md` — never suggest hard refresh / clear cache / incognito; he's done it
- `feedback_test_data_gated_paths.md` — exercise gated paths before push
- `feedback_systematic_no_loose_ends.md` — close every loop before pivot/break

## 4. What the next agent should do — first 30 minutes

1. **Optional UI-only final test:** In a fresh Scout/Boyka chat, type *"top 10 repeat technology clients"* and *"lifetime value of Hankook"*. The deterministic endpoints and Twenty metadata are already verified; this only checks the chat UX chooses the right skills.
2. **Do not regress the artifact verification rule.** If either workbook changes later, open the generated XLSX and diff it against Jireh's template before saying ready.
3. **If Ahmad wants the Hankook file to show `$35M+` and MLB Teams:** add explicit CRM fields or per-account config for future commitments, hospitality, and team-level sub-breakdowns. Do not invent those rows from code.

## 5. What the previous agent did wrong (so you don't)

- Declared "ready" on partial wins (endpoint 200 ≠ format match ≠ user click works)
- Found auth layers serially across multiple deploy cycles instead of grep'ing all auth/middleware paths in one pass before pushing
- Built the original "skill that tells Scout to do it by hand" pattern, watched Scout flail through 3,130 opps with code-interpreter, only THEN switched to the deterministic-tool architecture
- Shipped a polished version of Jireh's report with title/subtitle/rank-column extras Jireh didn't ask for; Ahmad sent that version to Jireh before the format-match fix landed
- Got pulled into infra firefights (hermes port collision, EasyPanel routing, Docker swarm overlay) instead of staying on the workflow build

**Bottom-line guidance**: open the artifact yourself before saying it's ready. Compare to the template Jireh sent. Only then ping Ahmad.
