-- CreateEnum
CREATE TYPE "CmsCategory" AS ENUM ('SERVER_EQUIPMENT', 'SERVER_ADDON', 'USER_STATION', 'INTERCONNECT', 'TRIGGER_HARDWARE', 'SCALER', 'ROUTER', 'KVM', 'BROADCAST_DA', 'RACK', 'TRAINING', 'INTEGRATION', 'SHIPPING', 'LICENSE', 'SUPPORT_TIER');

-- CreateTable
CREATE TABLE "CmsCatalogItem" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "category" "CmsCategory" NOT NULL,
    "unitCost" DECIMAL(65,30) NOT NULL,
    "unitPrice" DECIMAL(65,30),
    "unit" TEXT NOT NULL DEFAULT 'each',
    "heatLoadBtu" DOUBLE PRECISION,
    "maxWatt" DOUBLE PRECISION,
    "internalNotes" TEXT,
    "customerNotes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CmsCatalogItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CmsCatalogVersion" (
    "id" TEXT NOT NULL,
    "catalogItemId" TEXT NOT NULL,
    "unitCost" DECIMAL(65,30) NOT NULL,
    "unitPrice" DECIMAL(65,30),
    "effectiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retiredAt" TIMESTAMP(3),
    "changedBy" TEXT,

    CONSTRAINT "CmsCatalogVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CmsProjectBom" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "smartDefaultsApplied" BOOLEAN NOT NULL DEFAULT false,
    "hardwareSubtotal" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "licenseSubtotal" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "softCostSubtotal" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "grandSubtotal" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalHeatBtu" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalWatt" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "estimatedAcTons" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "acCapacityFlag" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CmsProjectBom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CmsBomLineItem" (
    "id" TEXT NOT NULL,
    "bomId" TEXT NOT NULL,
    "catalogItemId" TEXT NOT NULL,
    "catalogVersionId" TEXT,
    "quantity" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "unitCostSnapshot" DECIMAL(65,30) NOT NULL,
    "unitPriceSnapshot" DECIMAL(65,30),
    "isAutoDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CmsBomLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CmsCatalogItem_sku_key" ON "CmsCatalogItem"("sku");

-- CreateIndex
CREATE INDEX "CmsCatalogItem_category_isActive_idx" ON "CmsCatalogItem"("category", "isActive");

-- CreateIndex
CREATE INDEX "CmsCatalogVersion_catalogItemId_effectiveAt_idx" ON "CmsCatalogVersion"("catalogItemId", "effectiveAt");

-- CreateIndex
CREATE UNIQUE INDEX "CmsProjectBom_proposalId_key" ON "CmsProjectBom"("proposalId");

-- CreateIndex
CREATE INDEX "CmsBomLineItem_bomId_idx" ON "CmsBomLineItem"("bomId");

-- CreateIndex
CREATE INDEX "CmsBomLineItem_catalogItemId_idx" ON "CmsBomLineItem"("catalogItemId");

-- AddForeignKey
ALTER TABLE "CmsCatalogVersion" ADD CONSTRAINT "CmsCatalogVersion_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES "CmsCatalogItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CmsProjectBom" ADD CONSTRAINT "CmsProjectBom_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CmsBomLineItem" ADD CONSTRAINT "CmsBomLineItem_bomId_fkey" FOREIGN KEY ("bomId") REFERENCES "CmsProjectBom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CmsBomLineItem" ADD CONSTRAINT "CmsBomLineItem_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES "CmsCatalogItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CmsBomLineItem" ADD CONSTRAINT "CmsBomLineItem_catalogVersionId_fkey" FOREIGN KEY ("catalogVersionId") REFERENCES "CmsCatalogVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
