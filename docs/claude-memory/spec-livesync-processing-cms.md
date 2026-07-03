# Spec: Live Sync + Processing + CMS pricing (Natalia #5/#6/#7 — ONE surface)

## 🔑 Headline finding: Live Sync = Control System = the already-shipped CMS module
The "Live Sync" pricing tool Natalia described (service equipment, user station, interconnect, scalar, router, rack, integration, shipping, training, licenses) is **the same thing as the CMS module already built** (shipped 2026-05-13, behind `FEATURES.CMS_PRICING: false`).

Proof:
- `prisma/seed-cms-catalog.ts` header: *"Seed CMS (Control System) catalog from Natalia's CMS_BASE_BOM file"*, sourced from `CMS_BASE_BOM (1).xlsx`, tabs **"Livesync CMS Laptop"** and **"Livesync License"**.
- SKUs literally named `LIVESYNC-LICENSE`, `LIVESYNC-CLOUD`.
- `CmsCategory` enum = SERVER_EQUIPMENT, SERVER_ADDON, USER_STATION, INTERCONNECT, TRIGGER_HARDWARE, SCALER, ROUTER, KVM, BROADCAST_DA, RACK, TRAINING, INTEGRATION, SHIPPING, LICENSE, SUPPORT_TIER — exactly the Live Sync equipment list.

**So we do NOT build a parallel "Livesync" module from scratch (that would duplicate ~7-10 days of existing code).** The CMS module already is: catalog (`CmsCatalogItem`/`Version`), per-project BOM (`CmsProjectBom`/`CmsBomLineItem`), admin (`/admin/cms-catalog`), estimator picker (`/estimator/[projectId]/cms` → `CmsBomStudio`), API (`/api/cms/**`), service (`lib/cms/bomService.ts`), summary banner, Excel export, version-pinned pricing.

## Why it's hidden / what's "wrong" (matches her complaints)
- The flag is OFF (`CMS_PRICING: false`) — it was built but never trusted/turned on.
- Natalia: the CMS number is a wrong placeholder; **processing is 70-80% too low** and everyone ignores it. The likely culprit is the **smart-defaults % auto-estimate** (`apply-smart-defaults`, `CMS_PRICING_STRATEGIC`), not the detailed BOM. The detailed pick-equipment-and-quantities path is the accurate one.

## Jackson's two pricing modes map onto what exists
- **(a) %/multiplier for simple jobs** (e.g. ~4.4× off total pixel count) → this is the *auto-estimate* path. It's the part that's inaccurate today and needs Jackson's real formula.
- **(b) detailed equipment BOM for complex jobs** → this is the existing `CmsBomStudio` picker. Largely already works; needs verified costs.

## The actual build (once Jackson is on the call)
1. **Confirm the overlap with Jackson** — is Live Sync exactly this CMS/control-system BOM, or is there genuinely separate gear? (Near-certain it's the same, given the seed source.)
2. **Get the accurate pricing logic from Jackson:**
   - The correct %/multiplier formula for the simple mode (pixel-count → multiplier).
   - Correct per-unit costs to refresh the catalog (the rate-card update).
   - How Processing is priced (likely a category or a parallel small calc — currently produces the 70-80%-low number).
3. **Fix the auto-estimate** so the simple-mode number stops being a wrong placeholder. Add the explicit two-mode UX (quick % vs detailed BOM).
4. **Refresh catalog costs** via the existing admin (versioned, no data loss).
5. **Rename UI "CMS" → the term ANC uses (Control System / Live Sync)** so it's recognizable.
6. **Turn on the flag** once the numbers are trusted.

## Frozen-zone check
- 100% additive/estimator-side. The CMS module and any extension live outside `services/rfp/**`, `app/tools/rfp-analyzer/**`, `app/api/rfp/**`. No frozen-code edits. Good.

## What's needed (Jackson, via Natalia's intro call next month)
- Confirmation Live Sync == CMS/control-system BOM.
- The real %/multiplier formula (simple mode) + correct costs (detailed mode).
- How Processing is priced.

## Status & the big save
Architecture already exists and is sound (version-pinned pricing, BOM picker, export). The job is **accuracy + the two-mode UX + turning it on**, not a ground-up build. This is the thing to confirm on the Jackson call — and it means the "rebuild Live Sync" scope is far smaller than feared (or, if pitched as a rebuild, it's mostly already done). Waiting on the Jackson/Eric call (after FIFA) for the real pricing logic.

## Jackson call capture — 2026-07-02

### What the tool is solving
When Matt/Jeremy price a job and mark **Live Sync** as the required CMS/control system, the proposal engine should price the Live Sync CMS package the same way LED, install, and other sections are priced. The estimator should not be expected to know which server/add-on lines to select manually.

Current pricing exists in Jackson's working rate-card/BOM spreadsheet. The missing layer is the selection intelligence: which components belong in which system layout, and in what quantities, based on screen count, screen pixel dimensions, and venue requirements.

### Core sizing rules captured
- Each server output can physically support up to **3840 x 2160** pixels.
- Server/output count is driven by the pixel size of each display.
- Example: a display around **7680 x 1000** needs **2 outputs**.
- ANC tries not to exceed **2 outputs per server** when possible.
- For a display requiring 2 outputs, the typical deployment is **4 servers total**:
  - 2 user-interface servers: primary + backup.
  - 2 render/output servers: primary + backup.
- Every deployment has at least **2 UI servers**.
- UI servers usually need larger storage. Typical UI server is **8 TB**; larger/more-screen systems may need higher-storage UI options.
- Render servers are commonly **4 TB** for normal render/output duty.
- Some server SKUs include dual video cards. Use these only when a large screen must stay on one piece of hardware because of software/hardware constraints; costs rise quickly.
- Server lines with **CC** or **12G** are for systems with live video requirements, such as a center-hung display, arena display, or end-zone board. These apply when live video is specified.

### Add-on and accessory rules captured
- Every server gets an audio component. If the BOM has 6 render/UI servers, it should also carry 6 audio elements.
- RS-232 over IP/control pieces are usually included for sports complexes because the system needs data from scoring controllers.
- User-interface workstations with power conditioning are used in every deployment.
- Quantity for workstation/power-conditioning items depends mainly on the number of screens/control positions in the system.

### Inputs the engine needs
- Screen list from estimation: display names, pixel dimensions, and count.
- Whether each display/system needs live video.
- Whether the venue is a sports complex needing scoring-controller data.
- Drawings/system diagrams from Jackson, because new estimators learn by reading the system wiring and component layout. These drawings show how screens, servers, control points, and connected hardware relate.
- Current rate-card/BOM spreadsheet from Jackson, narrowed if possible to remove obsolete or rarely used options.

### Product direction
Do not make the user pick dozens of hardware lines like a spreadsheet. The platform should:
- Read the screen sizes/counts already known by the estimate.
- Infer required outputs from pixel dimensions.
- Generate the baseline server package with primary/backup redundancy.
- Attach required per-server accessories.
- Flag live-video-specific server options when live video is specified.
- Let Jackson/Natalia override quantities where the system design is unusual.
- Keep the visual workflow first: build the outer workflow/UI, then wire the selection rules behind it.

### Open confirmations for Jackson
- Exact rule for when 4 TB, 8 TB, and larger storage options are selected.
- Exact rule for when a dual-video-card server is required versus splitting outputs across standard servers.
- Exact rule for how many UI workstations/power-conditioning lines are needed per screen/control position.
- Whether every sports-complex job always gets RS-232, or whether there are exceptions.
- How live-video requirements are represented in incoming estimate/RFP data.
- Which drawing examples should become the first AI training/reference set.

## Processor pricing call capture — 2026-07-02

### Jackson's processor decision tree
Processor pricing is similar to CMS in that it starts from the screen's pixel requirements, but it has fewer product options. The current system issue is not just bad rate-card values; it is missing field-layout rules such as distance to processing, fiber conversion, closet/IDF layout, and outdoor rack placement.

### Core processor rules captured
- First input for processor selection is the **total pixel count of each screen**.
- Processor output capacity: each processor output handles up to **650,000 pixels**.
- Pixel count determines how many ports/data lines are needed.
- Once port/data-line count is known, select the processor that can handle the required ports.
- Prefer **one processor that can handle all ports** instead of splitting across multiple smaller processors when possible.
- 660 Pro processors are limited to **6 ports**.
- 4K processors have **16 ports**.
- Larger 8-series processors support more ports depending on installed cards.

### Fiber conversion and closet/layout rules
- A screen needs fiber conversion when it is more than **200 ft** from processing; Jackson said this is effectively most screens.
- Use **one pair of fiber converters per 6 data lines**.
- Use the **150 ft** distance rule for physical routing/closet planning.
- Closet count is driven by total screen width:
  - If a screen is around **300 ft wide**, expect **2 closets/IDFs** because of the 150 ft planning rule.
- Current processor logic likely underprices because it calculates pixels/ports but does not understand that data lines may not all return to the same closet.

### Outdoor rack rules
- Waterproof/outdoor racks are used for outdoor screens.
- Never quote a nonsense high rack line such as a **$284,000 waterproof rack**; that indicates a bad mapping/rate-card issue.
- Outdoor rack quantity follows the same 150 ft logic:
  - Outdoor screen around **250 ft wide** -> **2 outdoor racks**.

### Debug/validation path
- Send Jackson one exported Excel plus the system's current processor logic.
- He can mark incorrect lines one by one.
- Compare the processor rate card against current valid products/prices.
- Use jobs where the LED estimate already exists, then ask the system to estimate the CMS/processor package and compare against Jackson's expected BOM.

### Seed examples Jackson offered
- MetLife.
- Portland Trail Blazers.
- Westfield.
- A handful of additional Live Sync BOMs selected by Jackson.
- Start with BOMs only; drawings are useful but slower and can come later if needed.

### Licensing note
Jackson is unsure whether licensing is superseded. Most RFP jobs require a non-license base and ANC has not typically been putting license cost into the RFP quote. Sometimes license is charged after the fact. Treat licensing as a flag/review item, not an automatic default, until clarified.

## Build status — 2026-07-03

Shipped: `/admin/livesync-calculator` (FEATURES.LIVESYNC_AUTO_BOM, independent of CMS_PRICING) + `/api/cms/livesync-auto-bom` + pure engine `lib/cms/livesyncAutoBom.ts` (20 vitest tests pinned to Jackson's worked examples). Verified live: 7680×1000 → 2 render 4TB + 2 UI 8TB, 4 audio, 16×16 matrix, 1 rack, 1 week labor, $128,117.55 from the live 80-SKU catalog.

Still waiting on Jackson (flagged in-app, not guessed): storage-tier thresholds, dual-card exact rule, CC vs 12G capture choice, RS-232 qty, sample BOMs (MetLife, Portland Trail Blazers, Westfield), system drawings, refreshed rate-card prices (15-day fluctuation), licensing policy, processor/fiber-converter rate card.
