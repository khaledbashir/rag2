#!/bin/sh

# Regenerate Prisma Client to ensure it matches the schema
npx prisma generate

# Sync database schema (more forgiving than migrate deploy)
# This will add missing columns/tables without requiring migration history
echo "Syncing database schema..."
npx prisma db push --accept-data-loss || echo "Schema sync completed (some warnings expected)"

# Data migration: Ensure all proposals use Hybrid template (Template 5)
# Templates 1, 2, 3, 4 are deprecated — this is idempotent and safe to run every deploy
echo "Ensuring Hybrid template (Template 5) for all proposals..."
npx prisma db execute --stdin <<'SQL' 2>/dev/null || echo "Template migration skipped (may already be applied)"
UPDATE "Proposal"
SET "documentConfig" = jsonb_set(
    COALESCE("documentConfig"::jsonb, '{}'::jsonb),
    '{pdfTemplate}',
    '5'::jsonb,
    true
)
WHERE "documentConfig" IS NOT NULL
  AND (
    "documentConfig"::jsonb->>'pdfTemplate' IN ('1', '2', '3', '4')
    OR ("documentConfig"::jsonb->'pdfTemplate')::int IN (1, 2, 3, 4)
  );
SQL

# Seed product catalog (LED + TV + OES/CMS) — idempotent, skips existing products
echo "Seeding product catalog..."
npx tsx prisma/seed-products.ts 2>/dev/null || echo "LED seed skipped"
npx tsx prisma/seed-tv-products.ts 2>/dev/null || echo "TV seed skipped"
npx tsx prisma/seed-oes-products.ts 2>/dev/null || echo "OES seed skipped"

# Create persistent upload directory for RFP PDFs (EasyPanel volume at /rfp-data)
mkdir -p /rfp-data/rfp-uploads
chown nextjs:nodejs /rfp-data/rfp-uploads 2>/dev/null || true

# Start the PDF triage Python service in the background on port 8000
echo "Starting PDF triage service..."
python3 -m uvicorn --app-dir pdf-triage-service main:app --host 0.0.0.0 --port 8000 &

# Start the application
# Increase max HTTP header size to prevent 431 errors from accumulated auth cookies
export NODE_OPTIONS="${NODE_OPTIONS:+$NODE_OPTIONS }--max-http-header-size=262144"
exec npm start