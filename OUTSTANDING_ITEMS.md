# ANC Studio - Outstanding Items

**Last Updated:** 2026-02-24
**Status:** 9 Items (3 P0, 2 P1, 4 P2)

---

## 🔴 P0 - CRITICAL (Must Fix Immediately)

### 1. Mirror Mode State Reset
**Issue:** Project name resets to "New Project" when importing Excel
**Impact:** Data loss, user frustration
**Root Cause:** Excel import overwrites state without local persistence
**Files:** `services/proposal/server/excelImportService.ts`
**Action:** Persist project name before import OR merge smarter
**Owner:** Ahmad
**Status:** ⏳ Not Started

### 2. Share Link Validation
**Issue:** `proposalId` may not be correctly populated for public viewing
**Impact:** Broken share links, client can't access proposals
**Root Cause:** Snapshotting implemented but sanitization needs verification
**Files:** `app/api/projects/[id]/share/route.ts`, `app/share/[hash]/page.tsx`
**Action:** Test the public-facing sanitized snapshot end-to-end
**Owner:** Ahmad
**Status:** ⚠️ Partial - Needs Verification

### 3. AnythingLLM Workspace Initialization
**Issue:** Workspace slugs not always correctly initialized
**Impact:** Breaks chat and RFP upload functionality
**Root Cause:** RFP upload doesn't correctly create/use AnythingLLM workspaces
**Files:** `app/api/rfp/upload/route.ts`, `lib/rag-sync.ts`
**Action:** Ensure RFP upload correctly creates/uses AnythingLLM workspaces
**Owner:** Ahmad
**Status:** ⏳ Not Started

---

## 🟡 P1 - HIGH PRIORITY (Should Fix This Week)

### 4. AI Enrichment API (Missing Implementation)
**Issue:** `/api/agent/enrich` route is missing implementation
**Impact:** AI wand button exists in frontend but does nothing
**Root Cause:** Backend API route pending
**Files:** Need to create `/app/api/agent/enrich/route.ts`
**Action:** Connect AI wand to AnythingLLM @agent search
**Owner:** Ahmad
**Status:** ❌ Missing
**Effort:** 1-2 days

### 5. Vision Drawing Selection (Smart Ranking)
**Issue:** Currently uses first 10 drawings, not most relevant ones
**Impact:** Misses critical structural drawings, includes low-value pages
**Root Cause:** No prioritization logic
**Files:** Need to create smart ranking service
**Action:** Rank drawing pages by keywords ("structural attachment", "elevation", "section" = high; "legend", "notes" = low)
**Owner:** Kimi
**Status:** ⏳ Ready to Build
**Effort:** 2 days
**Options:**
- **Option A:** Smart ranking + client picks 10 (2 days, no blockers) ← **Recommended**
- **Option B:** Progressive on-demand (3 days, needs Jeremy chat pattern confirmation)
- **Option C:** Increase to 20 pages (1 day, 2x API cost)

---

## 🔵 P2 - MEDIUM PRIORITY (Nice to Have)

### 6. Header Cleanup
**Issue:** Messy layout with redundant elements
**Impact:** Poor UX, looks unprofessional
**Action:** Move global exports, remove redundant import button
**Owner:** Ahmad
**Status:** ❌ Pending
**Effort:** 0.5 days

### 7. UI Crowding / Responsive Scaling
**Issue:** Elements are too big, interface feels cramped
**Impact:** Reduces screen real estate, harder to work with
**Action:** Reduce size of UI elements for higher density
**Owner:** Ahmad
**Status:** ❌ Pending
**Effort:** 1 day

### 8. Ingestion Box Accordion
**Issue:** Ingestion box stays visible after successful import
**Impact:** Cluttered interface
**Action:** Implement accordion/collapsing to hide ingestion box after import
**Owner:** Ahmad
**Status:** ❌ Pending
**Effort:** 0.5 days

### 9. Per-Screen Verify Button
**Issue:** 850 clicks needed to verify 50 screens × 17 fields
**Impact:** Tedious workflow, reduces adoption
**Action:** Add "Verify Screen" button to verify all 17 fields for one screen with one click
**Owner:** Kimi
**Status:** 🚫 **BLOCKED** - Needs Natalia approval (may violate "no bulk verify" PRD policy)
**Effort:** 0.5 days
**Risk:** May conflict with PRD requirement for individual field verification

---

## ✅ RECENTLY COMPLETED (2026-02-04)

### Smart Filter Streaming Parser
✅ Tournament-style parser for 2,500+ page PDFs
✅ Auto-detects when to use streaming (>300 pages)
**File:** `services/ingest/smart-filter-streaming.ts`

### TTE Tonnage Extractor
✅ Pattern-based extraction from Thornton Tomasetti reports
✅ Tested on WVU sample: 34 tons → $102,000
**File:** `services/ingest/tonnage-extractor.ts`

### Regional Labor Multipliers
✅ Added `regionalLaborMultiplier` option to estimator
✅ Stacks with curved screen multiplier
**File:** `lib/estimator.ts`

### Yaham Pixel Pitch Auto-Detection
✅ R10 now shows 10.417mm, HO6T shows 6mm
✅ Auto-fills blank pixel pitch cells from catalog

### Wizard Validation Fix
✅ Next Step button unblocked by Project/Client name

### Nomenclature Sync
✅ "Nits" changed to "Brightness" everywhere

---

## 📋 DECISION QUEUE

Items awaiting stakeholder input before implementation:

| Decision Needed | Ask Who | Blocking Item | Priority |
|----------------|---------|---------------|----------|
| Is "Verify Screen" button allowed? | Natalia | #9 Per-Screen Verify | P2 |
| Which vision option to implement? | Ahmad | #5 Vision Drawing Selection | P1 |
| Drawing priority keywords? | Jeremy | #5 Vision Drawing Selection | P1 |

---

## 📊 PROGRESS SUMMARY

**Total Items:** 9 outstanding
**Critical (P0):** 3 items - All unstarted
**High Priority (P1):** 2 items - Ready to build
**Medium Priority (P2):** 4 items - 1 blocked, 3 pending

**Completed This Month:** 6 items
**Estimated Total Effort (Remaining):** ~6-7 days

---

## 🎯 RECOMMENDED IMMEDIATE ACTIONS

1. **Fix Mirror Mode State Reset** (P0) - Prevents data loss
2. **Verify Share Link End-to-End** (P0) - Critical for client delivery
3. **Fix AnythingLLM Workspace Init** (P0) - Breaks core RAG functionality
4. **Implement AI Enrichment API** (P1) - Frontend button exists, needs backend
5. **Get Decision on Vision Option** (P1) - Blocking smart drawing selection

---

## 🚨 BLOCKERS & DEPENDENCIES

**No Active Blockers for P0 Items** - Can start immediately
**P2 Item #9 Blocked** - Awaiting Natalia policy clarification
**P1 Item #5** - Awaiting Ahmad decision on approach

---

**Next Review:** After P0 items are resolved
**Slack Channel:** [Outstanding Items Canvas](https://anc-p2u9166.slack.com/archives/C0AE71KGDV5)
**Related Docs:** PROJECT_STATUS.md, PHASE_2_ACTION_CHECKLIST.md
