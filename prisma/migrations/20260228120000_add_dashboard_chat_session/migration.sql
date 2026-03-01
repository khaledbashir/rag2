-- CreateTable
CREATE TABLE "DashboardChatSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "messages" JSONB NOT NULL DEFAULT '[]',
    "title" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DashboardChatSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DashboardChatSession_userId_idx" ON "DashboardChatSession"("userId");

-- CreateIndex
CREATE INDEX "DashboardChatSession_updatedAt_idx" ON "DashboardChatSession"("updatedAt");

-- AddForeignKey
ALTER TABLE "DashboardChatSession" ADD CONSTRAINT "DashboardChatSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
