-- CreateTable
CREATE TABLE "ProjectConversionConfig" (
    "projectId" TEXT NOT NULL,
    "registrationSheet" JSONB,
    "ogxCampaignId" TEXT,
    "countSuspicious" BOOLEAN NOT NULL DEFAULT true,
    "manual" JSONB NOT NULL DEFAULT '{}',
    "registrationMeta" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectConversionConfig_pkey" PRIMARY KEY ("projectId")
);

-- CreateTable
CREATE TABLE "ConversionSnapshot" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "asOfDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,
    "note" TEXT,
    "projectRegs" INTEGER,
    "showUp" INTEGER,
    "regOgx" INTEGER,
    "aiesecOrgSignup" INTEGER,
    "regMxp" INTEGER,
    "sources" JSONB NOT NULL,
    "quality" JSONB NOT NULL,

    CONSTRAINT "ConversionSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RowReview" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "rowKey" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "flags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "riskScore" INTEGER NOT NULL DEFAULT 0,
    "decision" TEXT,
    "decidedBy" TEXT,
    "decidedAt" TIMESTAMP(3),
    "present" BOOLEAN NOT NULL DEFAULT true,
    "label" TEXT,
    "rowRef" TEXT,
    "seenAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RowReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversionAudit" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "detail" JSONB NOT NULL,
    "actor" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversionAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectConversionConfig_ogxCampaignId_idx" ON "ProjectConversionConfig"("ogxCampaignId");

-- CreateIndex
CREATE INDEX "ConversionSnapshot_projectId_asOfDate_idx" ON "ConversionSnapshot"("projectId", "asOfDate");

-- CreateIndex
CREATE INDEX "RowReview_projectId_source_status_idx" ON "RowReview"("projectId", "source", "status");

-- CreateIndex
CREATE UNIQUE INDEX "RowReview_projectId_source_rowKey_key" ON "RowReview"("projectId", "source", "rowKey");

-- CreateIndex
CREATE INDEX "ConversionAudit_projectId_createdAt_idx" ON "ConversionAudit"("projectId", "createdAt");

-- AddForeignKey
ALTER TABLE "ProjectConversionConfig" ADD CONSTRAINT "ProjectConversionConfig_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectConversionConfig" ADD CONSTRAINT "ProjectConversionConfig_ogxCampaignId_fkey" FOREIGN KEY ("ogxCampaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversionSnapshot" ADD CONSTRAINT "ConversionSnapshot_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

