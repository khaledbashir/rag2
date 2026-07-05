-- CreateTable
CREATE TABLE IF NOT EXISTS "EmailCrmIntake" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "fromEmail" TEXT,
    "fromName" TEXT,
    "subject" TEXT,
    "receivedAt" TIMESTAMP(3),
    "rawBody" TEXT NOT NULL,
    "attachments" JSONB,
    "extraction" JSONB,
    "candidates" JSONB,
    "matchedOpportunityId" TEXT,
    "matchedOpportunityName" TEXT,
    "matchReason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending_review',
    "appliedChanges" JSONB,
    "appliedAt" TIMESTAMP(3),
    "appliedBy" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailCrmIntake_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "EmailCrmIntake_status_createdAt_idx" ON "EmailCrmIntake"("status", "createdAt");
