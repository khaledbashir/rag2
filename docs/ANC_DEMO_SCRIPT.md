# ANC Demo Script

**Second screen only. Copy-paste blocks into AnythingLLM.**
**App:** https://basheer-therag2.prd42b.easypanel.host
**AI:** https://basheer-anything-llm.prd42b.easypanel.host

---

## SCENE 1: "Just Got Off a Client Call" (3 min)

**Set the scene:** "Imagine Alex just left a meeting with a new client. He recorded it on his phone. He gets back to his car, opens the AI workspace, and dumps in his call notes."

### Paste this:

```
@agent I just got off a call with the Atlanta Falcons facilities team. Here's what we discussed:

- They want LED displays for the Mercedes-Benz Stadium concourse
- 6 screens total, around 15ft wide by 8ft tall each
- Indoor install, needs good brightness for the concourse area
- They liked what they saw at the Jaguars stadium
- Budget somewhere around $800K-$1M total
- They want Yaham panels like Jacksonville
- Need the full package — structural, electrical, installation
- Timeline: before the 2026 NFL season
- Contact: David Chen, Facilities Director

Look up what Yaham indoor panels fit, estimate a budget, and create a draft proposal I can send to David.
```

**What they'll see:** AI searches products, calculates a real budget, creates an actual proposal in the system, and returns a live URL.

**Click the URL on screen.** Show them it's a real document — editable, exportable to PDF. Tell them: "Alex can text this link to David before he's back at the office. No spreadsheet. No waiting for the estimating team."

---

## SCENE 2: "Trade Show Quick Quote" (2 min)

**Set the scene:** "Matt's at a trade show. Someone walks up and asks 'how much for a scoreboard?' Matt pulls out his phone."

### Paste this:

```
@agent Quick quote — client at the booth wants a price for a basketball arena center-hung scoreboard. About 25x15 feet, outdoor-rated, single screen, high brightness. What Yaham product fits and what's the ballpark?
```

**What they'll see:** Product match + full budget breakdown from a single casual sentence.

**Tell them:** "That's a budget estimate in 10 seconds. Matt can show the number on his phone while the client is still standing at the booth."

---

## SCENE 3: "The Napkin Notes" (3 min)

**Set the scene:** "You just finished a site visit. You've got messy scribbled notes. Doesn't matter how rough they are."

### Paste this:

```
@agent Site visit notes from the Minnesota Timberwolves arena:

Main scoreboard - replace existing, 30x18ft, center hung, needs outdoor rating because of their AC situation, yaham
4 ribbon boards - 40ft x 3ft each, upper deck, indoor
2 tunnel displays - 8x5ft each, fine pitch for player entrance area, LG
Full package on all - structural, electrical, install
Client: Sarah Martinez, VP Operations
Need a proposal by end of week

Put together a proposal I can send Sarah.
```

**What they'll see:** AI parses 7 different displays from messy notes, creates a real proposal with a live URL.

**Click the URL.** Show the branded proposal with all 7 line items. Tell them: "Jeremy would spend a full day entering these screens into Excel. This took 30 seconds."

---

## SCENE 4: "The Product Expert" (2 min)

**Set the scene:** "Client meeting. They ask: 'What's the difference between a 4mm and a 10mm? What do you recommend for our lobby?' Instead of 'let me get back to you'..."

### Paste this:

```
@agent Client wants LED panels for a corporate headquarters lobby. 12ft by 6ft, indoor, close viewing distance — people will be standing 5 feet away. What are our best options and why?
```

**What they'll see:** AI recommends fine-pitch panels (1.9mm, 2.7mm), explains viewing distance, pulls real specs from the catalog.

### Then follow up:

```
@agent They like the LG 2.7mm. Give me a budget for that 12x6 display with full installation.
```

**Tell them:** "That's a consultative sales conversation — product recommendation, technical specs, and a budget number — without leaving the chat. Alex can do this. Jack can do this."

---

## SCENE 5: "Excel to Branded PDF" (3 min)

**Set the scene:** "Now the bread and butter — 75% of the work. Jeremy builds a cost analysis in Excel. Natalia turns it into a branded PDF. Used to take 30 minutes of copy-paste."

### In the web app:

1. Open **Production App** → New Project
2. Upload the **Indiana Fever** Excel
3. Point at the screen: "Mirror Mode — your numbers, untouched. Not a single digit changed."
4. Show the pricing table populated
5. Hit **Generate PDF**
6. Open the PDF — branded, professional

**Tell them:** "That Excel had complex pricing tables, multiple sections, margin calculations. Parsed in seconds. And the golden rule — we never recalculate. What Jeremy put in is exactly what the client sees."

### Or via the AI chat:

```
@agent Convert this estimator Excel into a budget PDF: https://basheer-therag2.prd42b.easypanel.host/api/agent-skill/demo-files?file=indiana-fever
```

---

## SCENE 6: "The Platform" (3 min)

**Walk through the web app:**

1. **Projects list** — show the proposals you just created
2. **Open one** — editor with client info, pricing tables, SOW, signature block
3. **Generate PDF** — branded output
4. **Spec Sheet Generator** — product spec sheets from the catalog
5. **Product Catalog** (Admin) — the full LED database

**Key lines:**
- "Mirror Mode = your numbers, untouched."
- "Intelligence Mode = build from scratch, the system does the math."
- "One template. Budgets, proposals, LOIs. Consistent every time."

---

## THE CLOSE (2 min)

"Here's what this means for the team:

- **Jeremy** spends a full day entering 32 screens for Jacksonville. The AI does it in seconds.
- **Natalia** spends 30 minutes per Excel-to-PDF. Mirror Mode — under a minute.
- **Matt** gets a vague call — 'I want a cool screen.' He gives the client a budget and a link before the call ends.
- **Alex** doesn't need to be technical. He pastes his notes, gets a professional proposal.
- Every document looks the same. Professional. Branded. No inconsistency.

This isn't a tool you have to learn. You just talk to it like a colleague."

**What's next:**
- Salesforce integration — opportunity triggers a proposal automatically
- RFP auto-extraction — upload a 2,500-page RFP, AI finds the LED specs
- Mobile access — estimates from the field

---

## COPY-PASTE CHEAT SHEET

**Product search:**
```
@agent What Yaham outdoor panels do we have for stadiums?
```

**Budget:**
```
@agent Budget for a 20x12ft outdoor Yaham 10mm display, full install package
```

**Create proposal:**
```
@agent Create a budget for "Miami Dolphins - Scoreboard Upgrade":
- LED Display System (Yaham 10mm, 40x25ft): $285,000
- Structural Steel & Mounting: $42,000
- Electrical Infrastructure: $38,000
- Installation Labor: $52,000
- Project Management: $18,000
- Permits: $8,500
```

**Excel to PDF:**
```
@agent Convert this Excel to a budget PDF: https://basheer-therag2.prd42b.easypanel.host/api/agent-skill/demo-files?file=indiana-fever
```

**Product recommendation:**
```
@agent Best indoor panels for a corporate lobby, close viewing, 12x6ft?
```
