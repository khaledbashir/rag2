# UX Learnings & Ahmad's Communication Preferences

## Ahmad's Messaging Style (for drafting Slack messages)
- **Chill, not eager** — never sound like an excited kid. Sound like a professional who's calm and appreciative.
- **Short > long** — one or two sentences max for simple replies
- **No exclamation marks** — standing rule, sounds weird
- **"got it" > "that's amazing, thank you so much"** — understated appreciation
- **Don't overexplain** — if something's clear, just acknowledge it
- **Real talk** — Ahmad is honest and direct with stakeholders. He tells them the truth.
- Example good: "got it, i'll stick to 2024-2026 and grab the freshest cost analysis from each. appreciate it"
- Example bad: "perfect, that's exactly what i need. i'll focus on 2024-2026, grab the freshest cost analysis sheets, and cross-check the LED specs and margin analysis against what the system produces. thank you for this"

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
