# Test Guide: Client Share Portal

**URL:** https://basheer-therag2.prd42b.easypanel.host
**Login:** natalia.kovaleva@anc.com / admin123
**Purpose:** Share a proposal with client via read-only link — they can annotate and leave voice notes

---

## Test 1: Generate Share Link

1. Open any project
2. Go to Step 4 (Export)
3. Click **"Share"**
4. Copy the generated share link

**PASS criteria:**
- [ ] Link generated instantly
- [ ] Link format: `/share/[hash]`
- [ ] Link is unique per project

---

## Test 2: Open Share Link (Client View)

1. Open the share link in an incognito window (no login)
2. Verify client can see the proposal

**PASS criteria:**
- [ ] Page loads without login required
- [ ] Proposal content visible
- [ ] No admin/edit controls visible to client

---

## Test 3: Annotation

1. In the share view, highlight text or click on a section
2. Add an annotation/comment

**PASS criteria:**
- [ ] Annotation saves
- [ ] Annotation visible in main app to ANC team

---

## Test 4: Voice Note

1. In share view, click voice note button
2. Record a short message
3. Verify it saves

**PASS criteria:**
- [ ] Voice recording works in browser
- [ ] Playback works
- [ ] Voice note tied to correct section

---

## Notes
- Share links are read-only — client cannot edit pricing
- Each project has one share link (not per-version)
