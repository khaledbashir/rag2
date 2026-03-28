# RFP Analyzer Test Checklist — Natalia's 5 Issues (March 28, 2026)

## FILE 1: Carolina Panthers - Indoor LED Videoboards.pdf

- **Expected:** 25 displays
- All 3.9mm pitch
- All 8,000 nits
- Default product: indoor solid panel (LG GSQA or similar), NOT mesh
- 7x Panthers Den (all different sizes)
- 4x Elev Lobby (all 6'x4')
- 2x S.E Corridor, 2x N.E Corridor, 2x North Club, 2x South Club
- Zero equipment junk (no clocks, racks, spare parts)

## FILE 2: Carolina Panthers - Outdoor LED Videoboards.pdf

- **Expected:** 18 displays
- All 10mm pitch
- All 7,000 nits
- Default product: outdoor 10mm (Yaham A10 or R10), NOT indoor 3.9mm
- 2 scoreboards (East + West, 252'x70')
- 7 ribbon boards (4 NW + 3 SW)
- 4 East Entry (A, B, C, D)
- 1 NE Entry
- 3 North C
- 1 SE Entry

## FILE 3: Pages from 2026.02.12 - BofA SM 100% DD - AV Schedules.pdf

- **Expected:** 44-47 displays
- 26 active interior (29 minus 3 struck-through field ribbons)
- 18 outdoor
- Interior: 3.9mm pitch, brightness 4000 nits ON THE DRAWING (not 8000 from spec)
- Outdoor: 10mm pitch, 7000-8000 nits
- Same dedup rules as above — Panthers Den x7, Elev Lobby x4, etc.
- Struck-through field ribbons either excluded (44) or flagged (47) — both acceptable per Natalia

## FEATURE CHECKS (on any file)

- [ ] **F4:** Select product → RFP W and H columns stay locked (don't change)
- [ ] **F5:** Cabinet count + module count + 80/20 pricing shows up after product selection
- [ ] **F8:** Qty editable via dropdown (1-20)
- [ ] **F9:** Default product is indoor for indoor screens, outdoor for outdoor screens
- [ ] **F10:** Display count matches between UI header and Excel export

## Natalia's Acceptance Criteria (her exact words, March 28 12:28 AM)

> "It detects these specs and puts somewhat normal product, not mesh outdoor for indoor screens.
> When I change to correct product these specs stay. I can change qty. Product selects super
> close to rfp size with cabinets and modules used to fill in gap. Mix of 80% sq ft for cabinets
> and 20% for sq ft prices is module pricing."

## What "Pass" Looks Like

1. Display count matches expected for each file
2. No equipment items (clocks, controllers, racks, spare parts) in the display list
3. Display names are actual locations (Panthers Den, Elev Lobby), not generic "LED Display"
4. Indoor files get indoor products, outdoor files get outdoor products
5. RFP dimensions stay locked when changing products
6. Qty dropdown works and persists
7. Cabinet/module sizing calculates on product selection
