-- Forms found on any page by /t.js: a readable title, the page, and whether the project was picked by hand.
ALTER TABLE "AnalyticsForm" ADD COLUMN "projectSetByHand" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AnalyticsForm" ADD COLUMN "title" TEXT;
ALTER TABLE "AnalyticsForm" ADD COLUMN "pageUrl" TEXT;
