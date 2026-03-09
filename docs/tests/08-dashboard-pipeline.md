# Test Guide: Dashboard & Pipeline

**URL:** https://proposals.anc.com
**Login:** natalia.kovaleva@anc.com / admin123
**Purpose:** Project management hub — all proposals, pipeline status, activity

---

## Test 1: Dashboard Load

1. Login
2. Land on Dashboard

**PASS criteria:**
- [ ] All projects load (not blank)
- [ ] Each project card shows: client name, project name, value, status
- [ ] No console errors

---

## Test 2: Project Cards

1. On dashboard, look at project cards

**PASS criteria:**
- [ ] Sparkle icon (Brief Me) visible on each card
- [ ] Click sparkle → AI summary generates in <10 seconds
- [ ] Status badge visible (Draft / Active / Won / Lost)
- [ ] Project value displayed

---

## Test 3: Pipeline Kanban

1. Click **"Pipeline"** in navbar

**PASS criteria:**
- [ ] Kanban columns load: e.g. Prospecting, Proposal, Negotiation, Won, Lost
- [ ] Projects appear in correct columns
- [ ] Drag & drop works (move project between stages)
- [ ] Value totals per column update after drag

---

## Test 4: New Project Creation

1. Click **"New Project"** on dashboard
2. Select Mirror Mode
3. Fill in project name and client
4. Upload Excel

**PASS criteria:**
- [ ] Project saves to database
- [ ] Appears on dashboard immediately
- [ ] Auto-save works (change something, reload — changes persist)

---

## Test 5: User Management (Admin)

1. Go to **Admin → Users**
2. Verify team accounts exist

**Expected accounts:**

| Name | Email | Role |
|------|-------|------|
| Natalia Kovaleva | natalia.kovaleva@anc.com | Admin |
| Jireh Billings | jbillings@anc.com | Admin |
| Jeremy Riley | jeremy.riley@anc.com | Admin |
| Matthew Hobbs | matthew.hobbs@anc.com | Admin |
| Eric Gruner | eric@ctenmedia.com | Admin |
| Charlie Dinh | cdinh@anc.com | Admin |
| Jack McCrossin | jack.mccrossin@anc.com | Admin |

**PASS criteria:**
- [ ] All accounts exist and are active
- [ ] Role-based access works (admin vs regular user)

---

## Test 6: Analytics

1. Navigate to: https://basheer-umami.prd42b.easypanel.host/share/WLq3EcEadXh0occV

**PASS criteria:**
- [ ] Dashboard loads
- [ ] Shows page views, sessions, user activity

---

## Notes
- Auto-save debounce is 2000ms — wait 2 seconds after change before refreshing to verify
- Pipeline is separate from dashboard but shares same project data
