-- AlterTable: Add soft delete column
ALTER TABLE "Proposal" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- CreateIndex: Fast filter for non-deleted proposals
CREATE INDEX "Proposal_deletedAt_idx" ON "Proposal"("deletedAt");
