-- /t.js named a form after the page a visitor first loaded, not the page the form is on:
-- on businesscup.zimran.io people land on /en (QR codes) and move to /en/apply without a
-- reload, so the apply form was also recorded as "…_en:form0". /en has no form of its own:
-- move those sessions into the apply form and drop the copy. Does nothing if there is none.
INSERT INTO "AnalyticsForm" ("id", "projectSlug", "projectSetByHand", "title", "pageUrl", "fields", "createdAt", "updatedAt")
SELECT 'businesscup.zimran.io_en_apply:form0', "projectSlug", "projectSetByHand", "title",
       'https://businesscup.zimran.io/en/apply', "fields", "createdAt", CURRENT_TIMESTAMP
FROM "AnalyticsForm" WHERE "id" = 'businesscup.zimran.io_en:form0'
ON CONFLICT ("id") DO NOTHING;

UPDATE "AnalyticsSession" SET "formId" = 'businesscup.zimran.io_en_apply:form0'
WHERE "formId" = 'businesscup.zimran.io_en:form0';

DELETE FROM "AnalyticsForm" WHERE "id" = 'businesscup.zimran.io_en:form0';
