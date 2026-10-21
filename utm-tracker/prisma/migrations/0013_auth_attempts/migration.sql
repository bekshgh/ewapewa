-- Sign-in / sign-up attempts per hashed IP, for rate limiting.
CREATE TABLE "AuthAttempt" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "ipHash" TEXT NOT NULL,
    "ok" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuthAttempt_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AuthAttempt_kind_ipHash_createdAt_idx" ON "AuthAttempt"("kind", "ipHash", "createdAt");
