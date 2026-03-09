# Phase 2 Roadmap — Prompt Playbook

Source: `i18n/ANC_Phase2_Prompt_Playbook.docx.md`

## Phase Structure (60 prompts, #40-78+ across 5 phases)

### Phase A: Mirror Polish (Prompts 40-48)
**Status**: Mostly complete
- Natalia's golden rules enforcement
- Section/row ordering fidelity
- Alternate item handling
- Tax/bond display even at $0
- Grand total trust logic
- PDF template refinements

### Phase B: Product Catalog Database (Prompts 49-55)
**Status**: In progress (current branch: phase2/product-database)
- Master product table (Prisma model + CRUD)
- Product import from Excel/CSV
- Product search + autocomplete in Intelligence Mode
- Category/subcategory taxonomy
- Margin presets per product category
- Bulk operations (update prices, apply margin changes)
- MasterTableSelector component wired into Step2Intelligence

### Phase C: Intelligence Mode Core (Prompts 56-62)
**Status**: Planned
- Build quotes from scratch (no Excel upload)
- Product catalog integration
- Line item add/remove/reorder
- Margin calculator with live preview
- Section management (add/rename/reorder sections)
- Template quotes (save/load quote templates)
- Multi-table support for large projects

### Phase D: AI Copilot Chat (Prompts 63-70)
**Status**: Planned
- **Engine**: Kimi K2.5 via Puter.js (FREE inference)
  - Model string: `moonshotai/kimi-k2.5`
  - No API key needed, runs client-side via Puter.js SDK
- Chat panel in wizard sidebar
- Context-aware: knows current proposal, pricing, client
- Suggests optimizations, catches errors
- Natural language to proposal actions ("add 10% margin to all LED items")
- RAG integration with AnythingLLM for company knowledge

### Phase E: RFP Extraction (Prompts 71-78)
**Status**: Planned
- Upload RFP PDF → extract scope/requirements
- Map RFP items to product catalog
- Auto-generate quote skeleton from RFP
- Compliance checklist generation
- Jeremy's primary workflow

## Priority Order
1. Phase A (done) → 2. Phase B (now) → 3. Phase C → 4. Phase D → 5. Phase E

## Key Dates (from Feb 7 Status Update)
- **Live now**: Mirror Mode, Share links, PDF gen, Document modes
- **This week**: Product catalog DB, Browserless internal routing
- **Coming**: Intelligence Mode, AI Chat, RFP extraction
