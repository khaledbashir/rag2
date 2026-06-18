-- CreateTable (idempotent: table was applied directly to prod abc_ancdb on 2026-06-18)
CREATE TABLE IF NOT EXISTS "TrainingProfile" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "name" TEXT,
    "role" TEXT,
    "team" TEXT,
    "usageLevel" TEXT,
    "techComfort" INTEGER,
    "aiExposure" TEXT,
    "learningStyle" TEXT,
    "recommendedTrack" TEXT,
    "preferredTime" TEXT,
    "painPoints" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "interests" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "transcript" JSONB,
    "rawProfile" TEXT,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "TrainingProfile_sessionId_key" ON "TrainingProfile"("sessionId");
