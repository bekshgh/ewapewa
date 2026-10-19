-- The domain a short link is handed out with (extra domains point at the same tracker).
ALTER TABLE "TrackingLink" ADD COLUMN "shortDomain" TEXT;
