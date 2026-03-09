# Test Guide: AI Copilot (Lux / Dual-Brain)

**URL:** https://proposals.anc.com
**Login:** natalia.kovaleva@anc.com / admin123
**Purpose:** AI assistant that understands the proposal context and can take actions in the form

---

## Setup
- Have an active project or estimate open
- Copilot is accessible: Dashboard floating panel + Estimator toolbar → "Lux" button

---

## Test 1: Dashboard Copilot — Basic Chat

1. Go to Dashboard
2. Click the floating chat icon (bottom right)
3. Type: "What's my total pipeline value?"
4. Wait for response

**PASS criteria:**
- [ ] Response is real AI output (not placeholder/fake)
- [ ] Response references actual project data
- [ ] No "thinking animation" that never resolves
- [ ] No error message shown as a fake response

---

## Test 2: Dashboard Copilot — Project Query

1. In dashboard chat, type: "Which projects need attention?"

**PASS criteria:**
- [ ] Lists actual projects from the database
- [ ] Identifies projects with missing data or pending items

---

## Test 3: Estimator Copilot — Form Actions (Intent Parser)

1. Open an active estimate in the Estimator
2. Click **"Lux"** in toolbar
3. Type: "Set the LED margin to 18%"
4. Verify the form updates

**PASS criteria:**
- [ ] Margin field in form changes to 18%
- [ ] Grand total recalculates
- [ ] Copilot confirms the action was taken

---

## Test 4: Estimator Copilot — Spec Lookup

1. In Estimator Lux, type: "What are the specs for Yaham C4?"

**PASS criteria:**
- [ ] Returns pixel pitch, cabinet dimensions, weight, power, IP rating
- [ ] Data is accurate (4mm pitch, 960x960mm cabinet)

---

## Test 5: Brief Me

1. Go to Dashboard
2. Find a project card
3. Click the sparkle icon (Brief Me)
4. Wait for AI summary

**PASS criteria:**
- [ ] Summary generated in under 10 seconds
- [ ] Includes: client, venue, display count, total value, status
- [ ] No hallucinated data

---

## Test 6: Dual-Brain Fallback

The copilot uses Kimi K2.5 as primary, AnythingLLM RAG as fallback.

1. Test a question that requires document knowledge (e.g. "What was Natalia's feedback on alternates?")

**PASS criteria:**
- [ ] Returns relevant answer from RAG knowledge base
- [ ] Does not make up an answer if it doesn't know

---

## Test 7: Vision AI

1. Upload a screenshot of a venue drawing or LED layout
2. Ask copilot to describe what it sees

**PASS criteria:**
- [ ] Correctly identifies LED displays in the image
- [ ] Does not crash

---

## Notes
- NEVER show fake "thinking" animations — if AI is loading, show a real spinner or nothing
- If Kimi fails, AnythingLLM is the fallback — never show a fake response
- Action executor (intent parser) covers: set margin, set qty, set display name, toggle sections
