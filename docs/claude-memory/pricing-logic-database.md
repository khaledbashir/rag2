# Pricing Logic Database — I2 Decision Tree

## Purpose

The Pricing Logic Database is the foundation for **Intelligence Mode**. It stores the decision tree that both human estimators and AI will use to generate proposals.

## Schema (5 Models)

### Category
Top-level buckets for pricing logic.

| Field | Type | Description |
|-------|------|-------------|
| id | String | Primary key |
| name | String (unique) | "LED", "Electrical", "Structural", "CMS" |
| description | String? | Optional description |
| nodes | DecisionNode[] | Related decision nodes |

### DecisionNode
Questions in the decision tree (parent-child hierarchy).

| Field | Type | Description |
|-------|------|-------------|
| id | String | Primary key |
| categoryId | String | FK to Category |
| parentNodeId | String? | Parent question (NULL = root) |
| question | String | "Indoor or Outdoor?", "What pixel pitch?" |
| order | Int | Display order in the tree |
| options | DecisionOption[] | Possible answers |
| parentOptions | DecisionOption[] | Options pointing to this node |

### DecisionOption
Answers to questions with links to next questions or formulas.

| Field | Type | Description |
|-------|------|-------------|
| id | String | Primary key |
| nodeId | String | FK to DecisionNode |
| optionText | String | "Indoor", "Outdoor", "1.5mm", "LG", "Yaham" |
| nextNodeId | String? | Next question (NULL if final) |
| isFinal | Boolean | true = leaf node with formula |
| formula | PricingFormula? | Formula for final nodes |

### PricingFormula
Calculations for final leaf nodes.

| Field | Type | Description |
|-------|------|-------------|
| id | String | Primary key |
| optionId | String (unique) | FK to DecisionOption |
| formula | String | "base_cost * square_footage + 50" |
| unit | String | USD |
| notes | String? | Notes on the formula |

### FormulaVariable
Variables that can be used in formulas.

| Field | Type | Description |
|-------|------|-------------|
| id | String | Primary key |
| variableName | String (unique) | "base_cost", "square_footage", "labor_hours" |
| defaultValue | Decimal? | Default value |
| source | String | "Product catalog", "User input", "Estimator input", "Company policy" |
| notes | String? | Notes on the variable |

## Example Seeded Tree: LED

```
LED (Category)
├── Indoor/Outdoor? (DecisionNode #1)
│   ├── Indoor → Pixel Pitch? (#2)
│   │   ├── 1.5mm → Manufacturer? (#3)
│   │   │   ├── LG → Formula: base_cost * square_footage + 50 (USD)
│   │   │   └── Yaham → Formula: base_cost * square_footage + 30 (USD)
│   │   └── 3.9mm → Manufacturer? (#3)
│   │       ├── LG → Formula: ...
│   │       └── Yaham → Formula: ...
│   └── Outdoor → Pixel Pitch? (#2)
│       └── (same as above)
└── (Future categories: Electrical, Structural, CMS)
```

## API Route

### GET /api/pricing-logic/tree

Query parameter: `categoryId` (required)

Returns full decision tree for a category as JSON:

```json
{
  "category": {
    "id": "cmlcmmjvs0000nrwne2bnfyby",
    "name": "LED",
    "description": "LED display systems"
  },
  "nodes": [
    {
      "id": "...",
      "categoryId": "...",
      "parentNodeId": null,
      "question": "Indoor or Outdoor?",
      "order": 1,
      "options": [
        {
          "id": "...",
          "optionText": "Indoor",
          "nextNodeId": "...",
          "isFinal": false,
          "formula": null
        }
      ]
    }
  ]
}
```

## Usage

### For Estimators (Natalia, Matt, Jeremy)
Future UI will allow them to:
- Add decision nodes (questions)
- Add decision options (answers)
- Attach pricing formulas to final options
- Define formula variables
- Visual tree editor (flowchart builder)

### For AI (Intelligence Mode)
The AI will:
1. Read RFP text (e.g., "indoor LED display, 1.5mm, 100 sq ft")
2. Query decision tree: walk through questions → find matching option path
3. Fetch formula at final leaf node
4. Plug in variable values → compute price
5. Generate proposal line item

## Example AI Workflow

**RFP**: "We need an indoor LED display, 1.5mm pixel pitch, 100 sq ft"

**AI Walks Tree**:
1. Category: LED
2. Node 1: "Indoor or Outdoor?" → "Indoor" (from RFP)
3. Node 2: "What pixel pitch?" → "1.5mm" (from RFP text)
4. Node 3: "Which manufacturer?" → Query product catalog → "LG" (cheapest/available)
5. Final Option: LG (isFinal=true)
6. Fetch Formula: `base_cost * square_footage + 50`
7. Fetch Variables: `base_cost=200`, `square_footage=100`
8. Compute: `200 * 100 + 50 = $20,050`
9. Generate Line Item: "LED Display (LG 1.5mm Indoor, 100 sq ft): $20,050"

## Seeding

```bash
# Run seed script
npx tsx prisma/seed-pricing-logic.ts

# Result:
# - 1 Category: LED
# - 3 Decision Nodes
# - 6 Decision Options (2 with formulas)
# - 4 Formula Variables: base_cost, square_footage, labor_hours, hourly_rate
```

## Status

✅ **Complete (Feb 7, 2026)**
- Prisma schema: 5 new models with full relations
- Seed script: LED example tree populated
- API route: `/api/pricing-logic/tree` returning JSON structure
- Auth config: Added to public routes

**Next Steps**:
- Build UI for Natalia to edit the tree (Phase B)
- Connect AI agent to walk the tree (Phase C)