-- CreateEnum
CREATE TYPE "AnalyticsOutcome" AS ENUM ('open', 'success', 'abandoned');

-- CreateTable
CREATE TABLE "AnalyticsForm" (
    "id" TEXT NOT NULL,
    "projectSlug" TEXT,
    "fields" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnalyticsForm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsSession" (
    "id" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "projectSlug" TEXT,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "utmContent" TEXT,
    "utmTerm" TEXT,
    "clickId" TEXT,
    "referrer" TEXT,
    "landingUrl" TEXT,
    "device" TEXT,
    "screenW" INTEGER,
    "lang" TEXT,
    "country" TEXT,
    "ipHash" TEXT,
    "answers" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "outcome" "AnalyticsOutcome" NOT NULL DEFAULT 'open',
    "lastField" TEXT,
    "isTest" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "AnalyticsSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsEvent" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "fieldId" TEXT,
    "ts" TIMESTAMP(3) NOT NULL,
    "offsetMs" INTEGER NOT NULL,
    "meta" JSONB,

    CONSTRAINT "AnalyticsEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AnalyticsSession_formId_startedAt_idx" ON "AnalyticsSession"("formId", "startedAt");

-- CreateIndex
CREATE INDEX "AnalyticsSession_visitorId_idx" ON "AnalyticsSession"("visitorId");

-- CreateIndex
CREATE INDEX "AnalyticsSession_utmCampaign_idx" ON "AnalyticsSession"("utmCampaign");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_sessionId_ts_idx" ON "AnalyticsEvent"("sessionId", "ts");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_type_fieldId_idx" ON "AnalyticsEvent"("type", "fieldId");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_ts_idx" ON "AnalyticsEvent"("ts");

-- AddForeignKey
ALTER TABLE "AnalyticsSession" ADD CONSTRAINT "AnalyticsSession_formId_fkey" FOREIGN KEY ("formId") REFERENCES "AnalyticsForm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyticsEvent" ADD CONSTRAINT "AnalyticsEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AnalyticsSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

