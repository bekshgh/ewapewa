-- Short project code used in generated UTM link slugs (e.g. "tts" → tts-tg-rassylka).
ALTER TABLE "Campaign" ADD COLUMN "slugPrefix" TEXT;
CREATE UNIQUE INDEX "Campaign_slugPrefix_key" ON "Campaign"("slugPrefix");
